#!/usr/bin/env python3
"""Jeff v2: every body part cut from ONE source (jeff-full-body.png) with
silhouette masks, so shirt color, sleeve width and lighting all match.

Method (reuse for Ozone/Ryan):
  * Base map: art = (src - (CX, SKULL)) * S + (267, 22), S = 1209 / (feet - skull).
  * Torso, pelvis, head are placed with the base map unchanged, so at rest
    the figure is pixel-identical to the source (no seams, no boxes).
  * Each limb segment is cut with a capsule mask (band along the bone plus a
    disk at each joint, the "ball joint") clipped to the real silhouette and
    to hand-placed arm/torso split lines, then mapped by a per-segment
    similarity transform that sends its source joints onto the rig pivots.
  * Forearms use a reflection (flip along the bone) so they point up into
    the guard with the outer sleeve edge still outside.
  * Hidden under-arm / collar areas are inpainted so motion shows fabric,
    not holes. harden() makes every interior fully opaque.
Local only, $0.
"""
from __future__ import annotations
import json, math, os, sys
import numpy as np, cv2
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
RIG = os.path.abspath(os.path.join(HERE, '..'))
sys.path.insert(0, HERE)
from harden_part_alpha import harden

KIT = '/workspace/new_parts/jeff'
OUT = os.path.join(RIG, 'jeff')
PARTS = os.path.join(OUT, 'parts')
DBG = '/tmp/jeff2'
os.makedirs(DBG, exist_ok=True)
ART_W, ART_H, GROUND_Y, SKULL_Y = 534, 1265, 1231, 22
FIST_MUL = float(os.environ.get('FIST_MUL', '1.15'))

fb = np.array(Image.open(f'{KIT}/jeff-full-body.png').convert('RGBA')).astype(np.float32)
H, W = fb.shape[:2]
A = fb[..., 3] / 255.0
SIL = A > 0.04
_solid = cv2.erode((fb[..., 3] > 230).astype(np.uint8), np.ones((3, 3), np.uint8), iterations=3)
_band = (SIL & (_solid == 0)).astype(np.uint8) * 255
_rgb = cv2.inpaint(np.ascontiguousarray(fb[..., :3].astype(np.uint8)), _band, 4, cv2.INPAINT_TELEA)
fb[..., :3] = np.where(_band[..., None] > 0, _rgb, fb[..., :3]).astype(np.float32)
SKULL, FEET = 80, 1554
S = (GROUND_Y - SKULL_Y) / (FEET - SKULL)
CX = 405.0
YY, XX = np.mgrid[0:H, 0:W].astype(np.float32)


def base(p):
    return ((p[0] - CX) * S + ART_W / 2.0, (p[1] - SKULL) * S + SKULL_Y)


def polyx(pts, y):
    ys = np.array([p[0] for p in pts], np.float32); xs = np.array([p[1] for p in pts], np.float32)
    return np.interp(y, ys, xs)

# arm / torso split lines (src): (y, x)
LLINE = [(300, 0), (344, 0), (346, 215), (380, 218), (420, 231), (475, 245), (540, 254), (580, 256),
         (600, 255), (630, 250), (645, 246), (675, 244), (690, 246), (705, 242), (720, 234), (735, 225),
         (750, 219), (765, 213), (780, 211), (810, 216), (840, 220), (880, 220), (900, 223), (1000, 223)]
RLINE = [(300, 9999), (344, 9999), (346, 604), (400, 590), (450, 573), (500, 567), (560, 569), (600, 567),
         (615, 569), (630, 578), (660, 578), (690, 577), (720, 580), (750, 588), (780, 589), (810, 580),
         (840, 575), (870, 577), (900, 579), (1000, 579)]
LX = polyx(LLINE, YY[:, 0])[:, None]  # per-row x
RX = polyx(RLINE, YY[:, 0])[:, None]

lum = fb[..., :3].mean(2)
r, g, b = fb[..., 0], fb[..., 1], fb[..., 2]
SKIN = ((r - g) >= 32) & (b < r * 0.62) & SIL
DARK = (lum < 80) & SIL


def soft(mask, blur=1.2):
    m = mask.astype(np.float32)
    if blur > 0:
        m = cv2.GaussianBlur(m, (0, 0), blur)
    return m


def disk(c, rad):
    return (XX - c[0]) ** 2 + (YY - c[1]) ** 2 <= rad * rad


def band(p, d, t0, t1):
    u = np.array(d, np.float32) - np.array(p, np.float32); L = np.linalg.norm(u); u /= L
    t = (XX - p[0]) * u[0] + (YY - p[1]) * u[1]
    return (t >= t0) & (t <= t1)


def seg_affine(p, d, P, D, reflect=False):
    """2x3 src->art matrix sending p->P, d->D (stretch only along the bone)."""
    p, d, P, D = (np.array(v, np.float64) for v in (p, d, P, D))
    us = d - p; Ls = np.linalg.norm(us) * S; us /= np.linalg.norm(us)
    ns = np.array([-us[1], us[0]])
    ua = D - P; La = np.linalg.norm(ua); ua /= La
    na = np.array([-ua[1], ua[0]]) * (-1 if reflect else 1)
    k = La / Ls
    # art = P + ((q-p).us * S*k) ua + ((q-p).ns * S) na
    M = np.outer(ua, us) * S * k + np.outer(na, ns) * S
    t = P - M @ p
    return np.hstack([M, t[:, None]]), k


def base_affine():
    M = np.array([[S, 0], [0, S]], np.float64)
    t = np.array([ART_W / 2.0 - CX * S, SKULL_Y - SKULL * S])
    return np.hstack([M, t[:, None]])

PAD = 400


def render(mask_f, M, rgba=None, fill=None):
    """Warp src * mask into art space. Returns (im RGBA uint8 cropped, abs_x, abs_y)."""
    src = (fb if rgba is None else rgba).copy()
    a = src[..., 3] / 255.0 * mask_f
    pre = np.dstack([src[..., :3] * a[..., None], a * 255.0]).astype(np.float32)
    M2 = M.copy(); M2[:, 2] += PAD
    out = cv2.warpAffine(pre, M2, (ART_W + 2 * PAD, ART_H + 2 * PAD), flags=cv2.INTER_LINEAR,
                         borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    al = out[..., 3] / 255.0
    rgb = np.where(al[..., None] > 1e-4, out[..., :3] / np.maximum(al[..., None], 1e-4), 0)
    im = np.dstack([np.clip(rgb, 0, 255), np.clip(out[..., 3], 0, 255)]).astype(np.uint8)
    ys, xs = np.where(im[..., 3] > 6)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    return im[y0:y1, x0:x1], x0 - PAD, y0 - PAD


def inpaint_fill(src_rgba, region):
    """Fill RGB inside region from surrounding opaque pixels and make it solid."""
    out = src_rgba.copy()
    rgb = out[..., :3].astype(np.uint8)
    need = (region & (out[..., 3] < 250)).astype(np.uint8) * 255
    rgb2 = cv2.inpaint(rgb, need, 9, cv2.INPAINT_TELEA)
    out[..., :3] = np.where(need[..., None] > 0, rgb2, out[..., :3])
    out[..., 3] = np.where(region, 255, out[..., 3])
    return out

# ---------------- joints (src) ----------------
J = {
    'neck': (405, 300),
    'waist': (405, 690),
    'sh_L': (240, 392), 'el_L': (196, 625), 'wr_L': (162, 782),
    'sh_R': (575, 392), 'el_R': (633, 625), 'wr_R': (641, 782),
    'hip_L': (314, 925), 'kn_L': (300, 1170), 'an_L': (287, 1438),
    'hip_R': (490, 925), 'kn_R': (521, 1170), 'an_R': (541, 1462),
}
SHOE_BOT = {'L': 1525, 'R': 1554}
CROTCH_X = 402

PIV = {}
PIV['root'] = [268, 640]; PIV['pelvis'] = [268, 640]
PIV['torso'] = list(base(J['waist']))
PIV['head'] = list(base(J['neck']))

GAV = json.load(open(os.path.join(RIG, 'gavin', 'skin.json')))['pivots']
gdir = {}
for sd in 'LR':
    v = np.array(GAV[f'forearm_{sd}'], float) - np.array(GAV[f'upperarm_{sd}'], float)
    gdir[sd] = v / np.linalg.norm(v)

UA_LEN = float(os.environ.get('UA_LEN', '172'))
WRIST_Y = float(os.environ.get('WRIST_Y', '292'))
WRIST_IN = float(os.environ.get('WRIST_IN', '4'))
for sd, sgn in (('L', 1), ('R', -1)):
    shA = np.array(base(J[f'sh_{sd}']))
    elA = shA + gdir[sd] * UA_LEN
    wrA = np.array([shA[0] + sgn * WRIST_IN, WRIST_Y])
    PIV[f'upperarm_{sd}'] = list(shA); PIV[f'forearm_{sd}'] = list(elA); PIV[f'fist_{sd}'] = list(wrA)

STANCE = {'L': float(os.environ.get('ANK_L', '142')), 'R': float(os.environ.get('ANK_R', '410'))}
LEGROT = {}
for sd in 'LR':
    hipA = np.array(base(J[f'hip_{sd}'])); hip = np.array(J[f'hip_{sd}'], float)
    ank_rel = (np.array(J[f'an_{sd}'], float) - hip) * S
    a0 = math.atan2(ank_rel[0], ank_rel[1]); a1 = math.atan2(STANCE[sd] - hipA[0], ank_rel[1])
    th = (a1 - a0) if os.environ.get('LEG_TURN') else 0.0  # v3: no outward leg turn (natural stance)
    LEGROT[sd] = th
    Rm = np.array([[math.cos(th), math.sin(th)], [-math.sin(th), math.cos(th)]])
    knA = hipA + Rm @ ((np.array(J[f'kn_{sd}'], float) - hip) * S)
    anA = hipA + Rm @ ank_rel
    # shoe bottom on the ground: ankle sits (shoe_bot - ankle_src) * S above it
    anA[1] = GROUND_Y - (SHOE_BOT[sd] - J[f'an_{sd}'][1]) * S
    PIV[f'thigh_{sd}'] = list(hipA); PIV[f'shin_{sd}'] = list(knA); PIV[f'boot_{sd}'] = list(anA)

placed, skin_parts, meta = {}, {}, {'source': 'jeff-full-body.png (all body parts) + kit fists/soles', 'size': [ART_W, ART_H], 'parts': {}}


def save(name, im, ax, ay, pivot=None, harden_it=True):
    arr = np.array(im) if not isinstance(im, np.ndarray) else im
    if harden_it:
        arr = harden(arr)
    pim = Image.fromarray(arr, 'RGBA')
    bb = pim.getbbox(); pim = pim.crop(bb); ax += bb[0]; ay += bb[1]
    pim.save(os.path.join(PARTS, f'{name}.png'), optimize=True, compress_level=9)
    pv = PIV[pivot or name]
    w, h = pim.size
    skin_parts[name] = {'image': f'parts/{name}.png', 'x': int(round(ax - pv[0])), 'y': int(round(ay - pv[1])), 'w': w, 'h': h}
    meta['parts'][name] = {'x': int(round(ax)), 'y': int(round(ay)), 'w': w, 'h': h}
    placed[name] = (pim, int(round(ax)), int(round(ay)))
    print(f'  {name:11s} {w:4d}x{h:<4d} abs=({ax:.0f},{ay:.0f})')

os.makedirs(PARTS, exist_ok=True)
# keep the existing kit soles (kick overlay) before clearing parts
old_skin = json.load(open(os.path.join(OUT, 'skin.json')))
sole_keep = {k: old_skin['parts'][k] for k in ('sole_L', 'sole_R')}
for fn in os.listdir(PARTS):
    if fn.endswith('.png') and not fn.startswith('sole_'):
        os.remove(os.path.join(PARTS, fn))
MB = base_affine()

# ---------------- HEAD ----------------
V = np.zeros((H, W), np.uint8)
cv2.fillPoly(V, [np.array([(348, 296), (460, 296), (447, 322), (399, 358), (388, 358), (356, 322)], np.int32)], 1)
head_m = SIL & ((YY < 286) | ((YY < 300) & (XX > 340) & (XX < 466)) | (V > 0))
im, ax, ay = render(soft(head_m, 0.8), MB)
save('head', im, ax, ay)

# ---------------- TORSO ----------------
TB = 694  # shirt tuck line (belt top)
neck_ok = np.where((XX > 346) & (XX < 460), YY >= 300, YY >= 284)
arm_split = (XX >= LX) & (XX <= RX)
torso_m = SIL & neck_ok & arm_split & (YY <= TB)
# under-arm fill: only where the split line is an artificial cut (arm merged
# with torso in the source). Mirror the shirt just inside the cut outward.
tsrc = fb.copy()
under = np.zeros_like(torso_m)
CLEAN = 7
for sd, y0, y1 in (('L', 400, 668), ('R', 400, 590)):
    for y in range(y0, y1):
        t = (y - y0) / float(y1 - y0)
        padw = int(round(16 * math.sin(math.pi * min(1.0, t * 1.15)) ** 0.7)) if t < 0.95 else 0
        if padw <= 0:
            continue
        # mirror about a line CLEAN px inside the cut so the dark armpit crease
        # right at the cut is replaced by clean shirt
        if sd == 'L':
            xl = int(LX[y, 0]); c0 = xl + CLEAN
            for x in range(xl - padw, c0):
                tsrc[y, x] = fb[y, min(W - 1, 2 * c0 - x)]
            under[y, xl - padw:xl] = True
        else:
            xr = int(RX[y, 0]); c0 = xr - CLEAN
            for x in range(c0 + 1, xr + padw + 1):
                tsrc[y, x] = fb[y, max(0, 2 * c0 - x)]
            under[y, xr + 1:xr + padw + 1] = True
under &= ~torso_m
tm = torso_m | under
tsrc[..., 3] = np.where(torso_m, fb[..., 3], np.where(under, 255, 0))
# rounded bottom corners of the shirt so no square tips peek out
im, ax, ay = render(soft(tm, 0.8), MB, rgba=tsrc)
save('torso', im, ax, ay)

# ---------------- PELVIS ----------------
PB = 952
pel_top = 662
pel_m = SIL & (YY >= pel_top) & (YY <= PB + 4) & (XX >= np.minimum(LX, 224)) & (XX <= np.maximum(RX, 580))
pel_m &= ~((YY > 860) & ((XX < 223) | (XX > 580)))  # hands
pel_m &= ~((YY < 880) & ((XX < LX) | (XX > RX)))
pel_m &= ~(SKIN & (YY > 800))
pel_m &= ~((YY < TB - 4) & ((XX < LX + 34) | (XX > RX - 34)))
# briefs-shaped bottom: high at the outer hips, low at the crotch
dx = np.clip(np.abs(XX - CROTCH_X) / 176.0, 0, 1.2)
PBY = PB + 6 - 66 * dx ** 1.7
pel_m &= YY <= PBY + 3
pel_m &= ~((YY > 840) & (XX > 573))
# soft bottom edge
pm = soft(pel_m, 0.8) * np.clip((PBY + 3 - YY) / 5.0, 0, 1)
im, ax, ay = render(pm, MB)
save('pelvis', im, ax, ay)

# ---------------- LEGS ----------------
for sd in 'LR':
    hip, kn, an = (np.array(J[f'{k}_{sd}'], float) for k in ('hip', 'kn', 'an'))
    side = (XX <= CROTCH_X + 2) if sd == 'L' else (XX >= CROTCH_X - 2)
    side &= (XX >= 223) & (XX <= 581)
    hip_half = 88 if sd == 'L' else 90
    kn_half = (364 - 235) / 2 if sd == 'L' else (588 - 454) / 2
    # thigh: ball top at the hip, rounded end past the knee
    ext = 12
    kd = kn + (kn - hip) / np.linalg.norm(kn - hip) * ext
    th_m = SIL & side & ((band(hip, kn, 0, np.linalg.norm(kn - hip) + ext)) | disk(hip, hip_half + 6) | disk(kd, kn_half * 0.86))
    th_m &= YY > hip[1] - hip_half - 6
    Mth, _ = seg_affine(hip, kn, PIV[f'thigh_{sd}'], PIV[f'shin_{sd}'])
    im, ax, ay = render(soft(th_m, 0.9), Mth)
    save(f'thigh_{sd}', im, ax, ay)
    # shin: ball top at the knee, hem at the bottom (no shoe pixels)
    shoe_side = (XX <= CROTCH_X) if sd == 'L' else (XX >= CROTCH_X)
    shoe_m = SIL & shoe_side & (YY > an[1] - 14) & (lum < 95)
    shoe_m = cv2.morphologyEx(shoe_m.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8)) > 0
    n, lab, st, _ = cv2.connectedComponentsWithStats(shoe_m.astype(np.uint8), 8)
    i = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA])); shoe_m = (lab == i) & SIL
    shoe_m = cv2.morphologyEx(shoe_m.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8)) > 0
    sh_m = SIL & side & (band(kn, an, 0, np.linalg.norm(an - kn) + 40) | disk(kn, kn_half * 0.98))
    sh_m &= ~(cv2.dilate(shoe_m.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0)
    sh_m = cv2.morphologyEx(sh_m.astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8)) > 0
    n, lab, st, _ = cv2.connectedComponentsWithStats(sh_m.astype(np.uint8), 8)
    i = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA])); sh_m = lab == i
    Msh, k = seg_affine(kn, an, PIV[f'shin_{sd}'], PIV[f'boot_{sd}'])
    print(f'  shin_{sd} stretch {k:.3f}  leg rot {math.degrees(LEGROT[sd]):.1f}')
    im, ax, ay = render(soft(sh_m, 0.9), Msh)
    save(f'shin_{sd}', im, ax, ay)
    # shoe: dark pixels below the hem, plus a hidden black sock up under the hem
    sh_src = fb.copy()
    hem_w = (342 - 232) if sd == 'L' else (594 - 492)
    sock = np.zeros((H, W), np.uint8)
    cv2.ellipse(sock, (int(an[0]), int(an[1] + 14)), (int(hem_w * 0.36), 36), 0, 0, 360, 1, -1)
    sock = (sock > 0) & (YY < an[1] + 40) & ~shoe_m
    sh_src[sock] = [30, 26, 24, 255]
    boot_m = shoe_m | sock
    # translate: shoe follows the ankle target, bottom on the ground
    anA = np.array(PIV[f'boot_{sd}'])
    M = base_affine(); a_base = np.array(base(an)); M[:, 2] += anA - a_base
    im, ax, ay = render(soft(boot_m, 0.7), M, rgba=sh_src)
    save(f'boot_{sd}', im, ax, ay)

# ---------------- ARMS ----------------
hand_c = []
for sd in 'LR':
    sh, el, wr = (np.array(J[f'{k}_{sd}'], float) for k in ('sh', 'el', 'wr'))
    armside = (XX < LX + 3) if sd == 'L' else (XX > RX - 3)
    top_cover = ((XX < LX + 12) if sd == 'L' else (XX > RX - 12)) & (YY < 480)
    el_half = 50
    ua_len = np.linalg.norm(el - sh)
    ua_m = SIL & (armside | top_cover) & (YY < 800) & (
        band(sh, el, -60, ua_len + 10) | disk(el + (el - sh) / ua_len * 10, el_half * 0.92))
    ua_m &= ~SKIN
    Mua, k = seg_affine(sh, el, PIV[f'upperarm_{sd}'], PIV[f'forearm_{sd}'])
    print(f'  upperarm_{sd} stretch {k:.3f}')
    im, ax, ay = render(soft(ua_m, 0.9), Mua)
    save(f'upperarm_{sd}', im, ax, ay)
    fa_len = np.linalg.norm(wr - el)
    fa_m = SIL & armside & (YY < 800) & (band(el, wr, -8, fa_len + 30) | disk(el, el_half * 0.95)) & ~SKIN
    # drop stray skin specks below the cuff
    n, lab, st, _ = cv2.connectedComponentsWithStats(fa_m.astype(np.uint8), 8)
    if n > 1:
        i = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA])); fa_m = lab == i
    Mfa, k = seg_affine(el, wr, PIV[f'forearm_{sd}'], PIV[f'fist_{sd}'], reflect=True)
    print(f'  forearm_{sd} stretch {k:.3f}')
    im, ax, ay = render(soft(fa_m, 0.9), Mfa)
    save(f'forearm_{sd}', im, ax, ay)
    hm = SKIN & (YY > 785) & (YY < 905) & (((XX < 230) if sd == 'L' else (XX > 578)))
    hand_c.append(fb[hm][:, :3])

# ---------------- FISTS (kit, color matched to the full-body hands) ----------------
hand = np.concatenate(hand_c).astype(np.uint8)
hlab = cv2.cvtColor(hand[None], cv2.COLOR_RGB2LAB)[0].astype(np.float32)
hm_, hs_ = hlab.mean(0), hlab.std(0)
for sd in 'LR':
    kit_side = 'right' if sd == 'L' else 'left'
    im = Image.open(f'{KIT}/jeff-{kit_side}-fist.png').convert('RGBA')
    im = im.crop(im.getbbox())
    im = im.rotate(-90 if sd == 'L' else 90, expand=True, resample=Image.Resampling.BICUBIC)
    im = im.crop(im.getbbox())
    ts = Image.open(f'{KIT}/jeff-{kit_side}-fist-true-scale.png').convert('RGBA'); ts = ts.crop(ts.getbbox())
    long_t = max(ts.size) * S * FIST_MUL
    sc = long_t / max(im.size)
    im = im.resize((max(1, round(im.width * sc)), max(1, round(im.height * sc))), Image.Resampling.LANCZOS)
    arr = np.array(im)
    m = arr[..., 3] > 40
    lab = cv2.cvtColor(arr[..., :3], cv2.COLOR_RGB2LAB).astype(np.float32)
    fm, fs = lab[m].mean(0), lab[m].std(0)
    lab2 = (lab - fm) / np.maximum(fs, 1e-3) * hs_ * np.array([0.9, 1, 1]) + hm_
    arr[..., :3] = cv2.cvtColor(np.clip(lab2, 0, 255).astype(np.uint8), cv2.COLOR_LAB2RGB)
    w, h = im.size
    pv = PIV[f'fist_{sd}']
    save(f'fist_{sd}', arr, pv[0] - 0.5 * w, pv[1] - 0.80 * h)

# ---------------- skin.json ----------------
PIV_I = {k: [int(round(v[0])), int(round(v[1]))] for k, v in PIV.items()}
for n, p in skin_parts.items():
    m = meta['parts'][n]; pv = PIV_I[n]
    p['x'] = int(m['x'] - pv[0]); p['y'] = int(m['y'] - pv[1])
skin_parts.update(sole_keep)
for k in sole_keep:
    meta['parts'][k] = {'x': 0, 'y': 0, 'w': sole_keep[k]['w'], 'h': sole_keep[k]['h'], 'overlay': True}
skin = {
    'fighter': 'jeff', 'skeleton': 'bvh-punchout-front-v1',
    'about': 'Jeff v2: tan shirt, khaki pants, black dress shoes, red fez. Every body part cut from one '
             'full-body source with silhouette masks and ball joints. 6 ft at the skull (fez does not count).',
    'artSize': [ART_W, ART_H], 'scale': 1.0, 'groundY': GROUND_Y,
    'legStraight': float(os.environ.get('LEG_STRAIGHT', '0.85')),
    'pivots': PIV_I,
    'ikTargets': {'foot_L': PIV_I['boot_L'], 'foot_R': PIV_I['boot_R']},
    'parts': skin_parts,
}
from jeff_kicks import overrides as _kick_overrides
skin['animOverrides'] = _kick_overrides()
json.dump(skin, open(os.path.join(OUT, 'skin.json'), 'w'), indent=1)
json.dump(meta, open(os.path.join(OUT, 'parts_meta.json'), 'w'), indent=1)

# rest-pose preview
canvas = Image.new('RGBA', (ART_W, ART_H + 40), (26, 24, 32, 255))
order = ['boot_L', 'boot_R', 'shin_L', 'shin_R', 'thigh_L', 'thigh_R', 'pelvis', 'torso', 'upperarm_L', 'upperarm_R',
         'head', 'forearm_L', 'forearm_R', 'fist_L', 'fist_R']
for n in order:
    im, x, y = placed[n]; canvas.alpha_composite(im, (x, y + 20))
d = ImageDraw.Draw(canvas)
for n, (px, py) in PIV_I.items():
    d.ellipse((px - 3, py + 17, px + 3, py + 23), outline=(255, 70, 70, 255))
canvas.convert('RGB').save(os.path.join(OUT, 'assemble_preview.jpg'), quality=85, optimize=True)
folder = sum(os.path.getsize(os.path.join(rr, f)) for rr, _, fs in os.walk(OUT) for f in fs)
notes = ['jeff v2: all body parts cut from jeff-full-body.png with silhouette masks + ball joints. Local, $0.',
         f'S={S:.4f} skull_src={SKULL} feet_src={FEET} CX={CX}',
         f'fists: kit fists color-matched to the full-body hands, {FIST_MUL}x true scale',
         'pivots: Jeff own joints (shoulders, waist, hips, knees, ankles); arms bound on the Gavin guard diagonal',
         f'folder_bytes={folder} ({folder/1024/1024:.2f} MB)']
notes += [f"{n}: {m['w']}x{m['h']}" for n, m in meta['parts'].items()]
open(os.path.join(OUT, 'BUILD_NOTES.txt'), 'w').write('\n'.join(notes) + '\n')
print('pivots', PIV_I)
print(f'folder {folder/1024/1024:.2f} MB')
