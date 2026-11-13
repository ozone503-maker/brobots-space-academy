#!/usr/bin/env python3
"""Build Ozone, Ryan and Jeff skins from Jessie's parts kits.

Kits live in /workspace/new_parts/<name>/. Kit left/right is the fighter's own
side, so kit left maps to screen-right bones (_R) on the shared rig.

All three are 6 ft humans. Height is skull top to feet (Ozone's bun and Jeff's
fez do not count). Pivots for pelvis/torso/arms/legs stay on the shared Gavin
skeleton so fall/getup stay attached. The head pivot sits at each fighter's neck.
"""
from __future__ import annotations
import json, math, os, sys
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
RIG = os.path.abspath(os.path.join(HERE, '..'))
KIT = '/workspace/new_parts'
sys.path.insert(0, HERE)
from harden_part_alpha import harden

ART_W, ART_H, GROUND_Y, SKULL_Y = 534, 1265, 1231, 22
SKULL_TO_FEET = GROUND_Y - SKULL_Y  # 1209

GAVIN = json.load(open(os.path.join(RIG, 'gavin', 'skin.json')))
GAVP = {k: list(v) for k, v in GAVIN['pivots'].items()}
GAVIK = {k: list(v) for k, v in GAVIN['ikTargets'].items()}

# Bone rest directions from Gavin pivots (image space, +Y down).
def v(a, b):
    pa, pb = GAVP[a], GAVP[b]
    return pb[0] - pa[0], pb[1] - pa[1]

UA_L, UA_R = v('upperarm_L', 'forearm_L'), v('upperarm_R', 'forearm_R')
FA_L, FA_R = v('forearm_L', 'fist_L'), v('forearm_R', 'fist_R')
TH_L, TH_R = v('thigh_L', 'shin_L'), v('thigh_R', 'shin_R')
SH_L, SH_R = v('shin_L', 'boot_L'), v('shin_R', 'boot_R')


def angle_down(dx, dy):
    """PIL rotate (CCW) that takes a downward limb to direction (dx, dy)."""
    return math.degrees(math.atan2(dx, dy))


def angle_up(dx, dy):
    """PIL rotate that takes an upward limb (wrist at top) to (dx, dy)."""
    return -math.degrees(math.atan2(dx, -dy))


# Target part heights in art px (bone length + joint overlap).
H_UPPER, H_FORE, H_THIGH, H_SHIN = 245, 195, 420, 260

FIGHTERS = {
    'ozone': {
        'about': (
            'Ozone from Jessie parts kit. Shirtless, palm-tree board shorts, '
            'wrapped fists, bare feet. 6 ft at the skull (top knot does not count).'
        ),
        'skull_src': 120,
        'neck_src': 380,
        'torso_from': 'kit',
        'pelvis_from': 'kit',
        'boot': 'foot',
        'torso_y0': 360, 'torso_y1': 780,
        'pelvis_y0': 700, 'pelvis_y1': 1080,
    },
    'ryan': {
        'about': (
            'Ryan from Jessie parts kit. Red long-sleeve shirt, black shorts, '
            'black sneakers. 6 ft at the skull.'
        ),
        'skull_src': 58,
        'neck_src': 280,
        'torso_from': 'fullbody',
        'pelvis_from': 'fullbody',
        'boot': 'shoe',
        # sleeveless torso band (src px): neck to shirt hem, arms clipped
        'torso_y0': 265, 'torso_y1': 800,
        'torso_hw': [(265, 42), (295, 55), (340, 155), (410, 148), (620, 155), (780, 165), (800, 168)],
        'pelvis_y0': 730, 'pelvis_y1': 1070,
        'pelvis_hw': [(730, 165), (800, 168), (900, 175), (1060, 175), (1070, 170)],
    },
    'jeff': {
        'about': (
            'Jeff from Jessie parts kit. Tan shirt, khaki pants, black dress '
            'shoes, red fez. 6 ft at the skull (fez does not count).'
        ),
        'skull_src': 80,
        'neck_src': 290,
        'torso_from': 'fullbody',
        'pelvis_from': 'fullbody',
        'boot': 'shoe',
        'torso_y0': 250, 'torso_y1': 720,
        'torso_hw': [(250, 48), (285, 70), (330, 160), (410, 152), (600, 165), (700, 175), (720, 178)],
        'pelvis_y0': 650, 'pelvis_y1': 980,
        'pelvis_hw': [(650, 168), (740, 175), (850, 180), (980, 175)],
    },
}

# Kit left = fighter's left = screen right (_R)
PART_FILE = {
    'upperarm_L': 'right-upper-arm',
    'upperarm_R': 'left-upper-arm',
    'forearm_L': 'right-forearm',
    'forearm_R': 'left-forearm',
    'fist_L': 'right-fist',
    'fist_R': 'left-fist',
    'thigh_L': 'right-thigh',
    'thigh_R': 'left-thigh',
    'shin_L': 'right-shin',
    'shin_R': 'left-shin',
    'sole_L': 'right-sole',
    'sole_R': 'left-sole',
}


def kit_path(name, key):
    return os.path.join(KIT, name, f'{name}-{key}.png')


def load_rgba(path):
    return Image.open(path).convert('RGBA')


def crop_thr(im, thr=16):
    a = np.array(im)
    a[..., 3] = np.where(a[..., 3] < thr, 0, a[..., 3])
    im = Image.fromarray(a, 'RGBA')
    b = im.getbbox()
    return im.crop(b) if b else im


def largest(im, thr=20):
    a = np.array(im)
    mask = (a[..., 3] > thr).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(mask, 8)
    if n <= 1:
        return im
    i = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    a[lab != i, 3] = 0
    return crop_thr(Image.fromarray(a, 'RGBA'), thr)


def harden_im(im):
    return Image.fromarray(harden(np.array(im.convert('RGBA'))), 'RGBA')


def save_part(im, path):
    im = crop_thr(harden_im(largest(im)), 16)
    im.save(path, optimize=True, compress_level=9)
    return im


def resize_h(im, h, max_w=None):
    w0, h0 = im.size
    if h0 <= 0:
        return im
    s = h / h0
    w = max(1, int(round(w0 * s)))
    if max_w and w > max_w:
        s = max_w / w0
        w, h = max_w, max(1, int(round(h0 * s)))
    return im.resize((w, max(1, int(round(h if s == h / h0 else h0 * s)))), Image.Resampling.LANCZOS)


def resize_to(im, w, h):
    return im.resize((max(1, int(round(w))), max(1, int(round(h)))), Image.Resampling.LANCZOS)


def rotate_crop(im, deg):
    if abs(deg) < 0.5:
        return im
    im = im.rotate(deg, expand=True, resample=Image.Resampling.BICUBIC)
    return crop_thr(im, 16)


def interp_hw(keys, y):
    keys = sorted(keys)
    if y <= keys[0][0]:
        return keys[0][1]
    if y >= keys[-1][0]:
        return keys[-1][1]
    for (y0, w0), (y1, w1) in zip(keys, keys[1:]):
        if y0 <= y <= y1:
            t = 0 if y1 == y0 else (y - y0) / (y1 - y0)
            return w0 + t * (w1 - w0)
    return keys[-1][1]


def body_center_x(fb, y0, y1):
    a = np.array(fb)
    m = a[y0:y1, :, 3] > 20
    xs = []
    for row in m:
        cols = np.where(row)[0]
        if len(cols):
            xs.append(0.5 * (cols[0] + cols[-1]))
    return float(np.median(xs)) if xs else a.shape[1] / 2.0


def feet_y(fb):
    a = np.array(fb)
    rows = (a[..., 3] > 20).any(1)
    ys = np.where(rows)[0]
    return int(ys[-1])


def cut_band(fb, y0, y1, hw_keys, cx):
    """Keep the central torso/pelvis band, clipping hanging arms."""
    a = np.array(fb)
    h, w = a.shape[:2]
    y0, y1 = max(0, int(y0)), min(h, int(y1))
    out = np.zeros_like(a)
    yy, xx = np.mgrid[y0:y1, 0:w]
    for y in range(y0, y1):
        hw = interp_hw(hw_keys, y)
        x0, x1 = int(round(cx - hw)), int(round(cx + hw))
        x0, x1 = max(0, x0), min(w, x1)
        out[y, x0:x1] = a[y, x0:x1]
    # keep original soft edges inside the band; don't invent pixels
    im = crop_thr(Image.fromarray(out, 'RGBA'), 16)
    return largest(im)


def scale_to_true(im, true_im, src_s):
    """Scale a high-res part so its content matches true-scale * src_s."""
    im, true_im = crop_thr(im, 16), crop_thr(true_im, 16)
    tw, th = true_im.size
    target_h = max(8, int(round(th * src_s)))
    return resize_h(im, target_h)


def ankle_frac(im, toes_left):
    """fy of the ankle in a side-view foot (after outward flip). Heel is opposite the toes."""
    a = np.array(im)
    h, w = a.shape[:2]
    m = a[..., 3] > 20
    # heel is the back 40% (right if toes_left, left otherwise)
    if toes_left:
        region = m[:, int(w * 0.55):]
        xoff = int(w * 0.55)
    else:
        region = m[:, :int(w * 0.45)]
        xoff = 0
    rows = np.where(region.any(1))[0]
    if not len(rows):
        return 0.22
    # top of the heel mass
    return float(rows[0] / h)



def content_fy(im, end='top', width_frac=0.35):
    """Image-fraction at which the limb reaches width_frac of its max width, from end."""
    a = np.array(im)
    widths = (a[..., 3] > 20).sum(1).astype(np.float32)
    if not widths.any():
        return 0.12 if end == 'top' else 0.88
    mx = float(widths.max())
    h = a.shape[0]
    if end == 'top':
        for y, w in enumerate(widths):
            if w >= mx * width_frac:
                return y / h
        return 0.12
    for y in range(h - 1, -1, -1):
        if widths[y] >= mx * width_frac:
            return y / h
    return 0.88


def widen_end(im, end='top', target_w=None, scale=1.0):
    """Scale width so the given end roughly matches target_w, keeping height."""
    if not target_w:
        return im
    a = np.array(im)
    h, w0 = a.shape[:2]
    m = a[..., 3] > 20
    if end == 'top':
        sl = m[:max(1, h // 5)]
    else:
        sl = m[-max(1, h // 5):]
    cur = int(sl.any(0).sum()) if sl.any() else w0
    if cur < 8:
        return im
    sx = max(1.0, (target_w * scale) / cur)
    if abs(sx - 1.0) < 0.05:
        return im
    out = im.resize((max(1, int(round(w0 * sx))), h), Image.Resampling.LANCZOS)
    return crop_thr(out, 16)


def cut_neck(im, depth_frac=0.10, width_frac=0.28):
    """Open a shallow U-shaped neck so the shirt does not climb the jaw."""
    a = np.array(im)
    h, w = a.shape[:2]
    rows = np.where((a[..., 3] > 20).any(1))[0]
    if not len(rows):
        return im
    ytop = int(rows[0])
    # mid-x of the top content
    top = a[ytop:ytop + max(4, h // 20), :, 3] > 20
    cols = np.where(top.any(0))[0]
    cx = 0.5 * (cols[0] + cols[-1]) if len(cols) else w / 2.0
    neck_w = w * width_frac
    neck_d = h * depth_frac
    yy, xx = np.mgrid[0:h, 0:w]
    hole = ((xx - cx) / max(1.0, neck_w / 2.0)) ** 2 + ((yy - (ytop - neck_d * 0.2)) / max(1.0, neck_d)) ** 2 < 1.0
    hole &= yy < ytop + neck_d * 1.15
    a[hole, 3] = 0
    return crop_thr(Image.fromarray(a, 'RGBA'), 16)


def limb_prepare(im, height, rot, flip180=False):
    im = largest(crop_thr(im, 16))
    if flip180:
        im = im.rotate(180, expand=True, resample=Image.Resampling.BICUBIC)
        im = crop_thr(im, 16)
    im = resize_h(im, height, max_w=int(height * 0.85))
    im = rotate_crop(im, rot)
    return im


def fist_prepare(im, target, side):
    """Wrist at the bottom, knuckles toward camera. side is L or R (screen)."""
    im = largest(crop_thr(im, 16))
    # Kit fists have the wrist on the thumb side: left hand (screen R) wrist on the right,
    # right hand (screen L) wrist on the left. Rotate 90 so the wrist lands at the bottom.
    deg = 90 if side == 'L' else -90  # screen L = fighter right: wrist was on the left -> CW
    # Wait: fighter right hand (fist_L, kit right-fist): thumb/wrist on the LEFT.
    # Need left side to go to the bottom = CW = PIL rotate(-90). Yes deg = -90 for L.
    # fighter left hand (fist_R): wrist on the RIGHT. Right side to bottom = CCW = +90.
    # I passed side L/R, so: L: -90, R: +90. The ternary above is WRONG (90 if L). Fix:
    deg = -90 if side == 'L' else 90
    im = rotate_crop(im, deg)
    # scale so the longer side matches the true-scale long side
    tw, th = target
    # after rotation the fist is taller than wide typically
    # true-scale is photo-accurate at the hip, but guard-pose fists face the
    # camera and need to read; 1.85x still uses the kit size as the base.
    long_t = max(max(tw, th) * 1.85, 96)
    w, h = im.size
    s = long_t / max(w, h)
    im = im.resize((max(1, int(round(w * s))), max(1, int(round(h * s)))), Image.Resampling.LANCZOS)
    return crop_thr(im, 16)


def write_skin(name):
    cfg = FIGHTERS[name]
    out_dir = os.path.join(RIG, name)
    parts_dir = os.path.join(out_dir, 'parts')
    os.makedirs(parts_dir, exist_ok=True)
    dbg = f'/tmp/{name}_build'
    os.makedirs(dbg, exist_ok=True)

    fb = load_rgba(kit_path(name, 'full-body'))
    fby = feet_y(fb)
    skull = cfg['skull_src']
    src_s = SKULL_TO_FEET / (fby - skull)
    cx = body_center_x(fb, int((cfg['neck_src'] + fby) * 0.35), int((cfg['neck_src'] + fby) * 0.7))
    print(f'\n======= {name} =======')
    print(f'skull={skull} feet={fby} src_s={src_s:.4f} cx={cx:.1f} fb={fb.size}')

    def to_art(sx, sy):
        return (sx - cx) * src_s + ART_W / 2.0, (sy - skull) * src_s + SKULL_Y

    PIV = dict(GAVP)
    neck_ax, neck_ay = to_art(cx, cfg['neck_src'])
    PIV['head'] = [267, int(round(neck_ay))]
    IK = {k: list(v) for k, v in GAVIK.items()}

    placed = {}
    skin_parts = {}
    meta = {'source': f'{name} parts kit + full-body', 'size': [ART_W, ART_H], 'parts': {}}

    def place_abs(key, im, abs_x, abs_y, pivot_name=None):
        pn = pivot_name or key
        path = os.path.join(parts_dir, f'{key}.png')
        im = save_part(im, path)
        w, h = im.size
        px, py = PIV[pn]
        meta['parts'][key] = {'x': int(round(abs_x)), 'y': int(round(abs_y)), 'w': w, 'h': h}
        skin_parts[key] = {
            'image': f'parts/{key}.png',
            'x': int(round(abs_x - px)),
            'y': int(round(abs_y - py)),
            'w': w, 'h': h,
        }
        placed[key] = (im, int(round(abs_x)), int(round(abs_y)))
        im.save(os.path.join(dbg, f'{key}.png'))
        print(f'  {key:12s} {w:4d}x{h:<4d} abs=({abs_x:.0f},{abs_y:.0f}) rel=({skin_parts[key]["x"]},{skin_parts[key]["y"]})')
        return im

    def place_attach(key, im, fx, fy, pivot_name=None):
        im = crop_thr(im, 16)
        w, h = im.size
        pn = pivot_name or key
        px, py = PIV[pn]
        return place_abs(key, im, px - fx * w, py - fy * h, pn)

    # ----- HEAD -----
    hr = load_rgba(kit_path(name, 'head-neck'))
    ts = load_rgba(kit_path(name, 'head-neck-true-scale'))
    head = scale_to_true(hr, ts, src_s)
    # align top of head with full-body top (bun/fez/hair) in art space
    fb_top = int(np.where(np.array(fb)[..., 3] > 20)[0][0]) if True else 0
    rows = np.where((np.array(fb)[..., 3] > 20).any(1))[0]
    fb_top = int(rows[0])
    art_top_x, art_top_y = to_art(cx, fb_top)
    # center head on the body, use mapped top
    hw, hh = head.size
    # horizontal: center on art mid, with a slight nudge if the full-body head isn't centered
    # use mid-x of the full-body at eye level (~skull + 90 src px)
    eye_y = int(cfg['skull_src'] + 90)
    eye_cx = body_center_x(fb, max(0, eye_y - 20), eye_y + 20)
    art_cx, _ = to_art(eye_cx, eye_y)
    place_abs('head', head, art_cx - hw / 2.0, art_top_y)

    # ----- TORSO -----
    if cfg['torso_from'] == 'kit':
        torso = largest(crop_thr(load_rgba(kit_path(name, 'torso')), 16))
        # scale so width matches chest width in the full-body
        # measure fb width at mid-torso (below shoulders, above waist)
        mid_y = int((cfg['torso_y0'] + cfg['torso_y1']) * 0.45)
        a = np.array(fb)
        cols = np.where(a[mid_y, :, 3] > 20)[0]
        fb_w = (cols[-1] - cols[0] + 1) if len(cols) else torso.size[0]
        # this mid-y may include arms for ozone? ozone mid torso ~ y=520-560 is still
        # shoulders+chest, arms start contributing more lower. Use a slightly higher row.
        # For ozone, y=440 is shoulders without hanging arms (width 406).
        target_w = max(200, int(round(fb_w * src_s * 0.92)))  # 0.92: slight tighten if arms leak
        tw, th = torso.size
        s = target_w / tw
        torso = torso.resize((target_w, max(1, int(round(th * s)))), Image.Resampling.LANCZOS)
    else:
        torso = cut_band(fb, cfg['torso_y0'], cfg['torso_y1'], cfg['torso_hw'], cx)
        tw, th = torso.size
        torso = resize_to(torso, tw * src_s, th * src_s)
    # place: top near the neck, centered, overlapping the pelvis
    if cfg['torso_from'] == 'fullbody':
        depth = 0.055 if name == 'jeff' else 0.10
        width = 0.22 if name == 'jeff' else 0.28
        torso = cut_neck(torso, depth_frac=depth, width_frac=width)
    tw, th = torso.size
    # map mid-torso x; put the visual neck of the torso near the head pivot
    tx = ART_W / 2.0 - tw / 2.0
    # torso top should sit just under the chin/neck. Use mapped torso_y0.
    _, ty = to_art(cx, cfg['torso_y0'])
    # if the isolated torso includes shoulders that start at torso_y0, this is correct.
    # Shift up a little so the neck stump tucks under the head.
    ty = min(ty, PIV['head'][1] - 28)
    if name == 'ozone':
        ty -= 16
    place_abs('torso', torso, tx, ty)

    # ----- PELVIS -----
    if cfg['pelvis_from'] == 'kit':
        pelvis = largest(crop_thr(load_rgba(kit_path(name, 'hips-pelvis')), 16))
        a = np.array(fb)
        mid_y = int((cfg['pelvis_y0'] + cfg['pelvis_y1']) * 0.4)
        cols = np.where(a[mid_y, :, 3] > 20)[0]
        fb_w = (cols[-1] - cols[0] + 1) if len(cols) else pelvis.size[0]
        target_w = max(180, int(round(fb_w * src_s)))
        pw, ph = pelvis.size
        s = target_w / pw
        pelvis = pelvis.resize((target_w, max(1, int(round(ph * s)))), Image.Resampling.LANCZOS)
    else:
        pelvis = cut_band(fb, cfg['pelvis_y0'], cfg['pelvis_y1'], cfg['pelvis_hw'], cx)
        pw, ph = pelvis.size
        pelvis = resize_to(pelvis, pw * src_s, ph * src_s)
    pw, ph = pelvis.size
    px = ART_W / 2.0 - pw / 2.0
    _, py = to_art(cx, cfg['pelvis_y0'])
    # keep a solid overlap with the torso hem
    t_im, t_x, t_y = placed['torso']
    # if the mapped pelvis top is below the torso hem, pull it up to overlap ~40px
    overlap = 58
    py = min(py, t_y + t_im.size[1] - overlap)
    place_abs('pelvis', pelvis, px, py)

    # ----- LEGS -----
    for side, thigh_ang, shin_ang in (
        ('L', angle_down(*TH_L), angle_down(*SH_L)),
        ('R', angle_down(*TH_R), angle_down(*SH_R)),
    ):
        thigh = limb_prepare(load_rgba(kit_path(name, PART_FILE[f'thigh_{side}'])), H_THIGH, thigh_ang)
        shin = limb_prepare(load_rgba(kit_path(name, PART_FILE[f'shin_{side}'])), H_SHIN, shin_ang)
        # match shin knee width to the thigh's knee
        tw, th = thigh.size
        knee_w = int((np.array(thigh)[-max(1, th // 6):, :, 3] > 20).any(0).sum())
        shin = widen_end(shin, 'top', target_w=max(knee_w, 90), scale=1.02)
        # hip cap sits well under the pelvis (use opaque content, not the diagonal bbox tip)
        fx = 0.55 if side == 'L' else 0.45
        place_attach(f'thigh_{side}', thigh, fx, max(0.16, content_fy(thigh, 'top', 0.45)))
        place_attach(f'shin_{side}', shin, fx, max(0.14, content_fy(shin, 'top', 0.40)))

        # boots: side-view shoe/foot, flip so toes point outward
        boot_key = f"{'right' if side == 'L' else 'left'}-{cfg['boot']}"
        boot = largest(crop_thr(load_rgba(kit_path(name, boot_key)), 16))
        # After flip, toes point outward (L: left, R: right)
        boot = boot.transpose(Image.FLIP_LEFT_RIGHT)
        toes_left = (side == 'L')
        fy_ank = max(0.08, min(0.45, ankle_frac(boot, toes_left)))
        py_ank = PIV[f'boot_{side}'][1]
        # scale uniformly so the sole sits on the ground; keep foot length
        target_h = max(90, int(round((GROUND_Y - py_ank) / max(0.45, 1.0 - fy_ank))))
        bw, bh = boot.size
        s = target_h / bh
        nw, nh = max(1, int(round(bw * s))), max(1, int(round(bh * s)))
        if nw > 260:
            s = 260 / bw
            nw, nh = 260, max(1, int(round(bh * s)))
        boot = boot.resize((nw, nh), Image.Resampling.LANCZOS)
        fx_ank = 0.72 if side == 'L' else 0.28
        place_attach(f'boot_{side}', boot, fx_ank, fy_ank)

    # ----- ARMS -----
    for side, ua_ang, fa_ang in (
        ('L', angle_down(*UA_L), angle_up(*FA_L)),
        ('R', angle_down(*UA_R), angle_up(*FA_R)),
    ):
        ua = limb_prepare(load_rgba(kit_path(name, PART_FILE[f'upperarm_{side}'])), H_UPPER, ua_ang)
        fa = limb_prepare(load_rgba(kit_path(name, PART_FILE[f'forearm_{side}'])), H_FORE, fa_ang, flip180=True)
        # shoulder inward
        ufx = 0.66 if side == 'L' else 0.34
        place_attach(f'upperarm_{side}', ua, ufx, max(0.06, content_fy(ua, 'top', 0.40)))
        place_attach(f'forearm_{side}', fa, 0.50, min(0.92, content_fy(fa, 'bot', 0.40)))

        ts_fist = crop_thr(load_rgba(kit_path(name, f"{'right' if side == 'L' else 'left'}-fist-true-scale")), 16)
        fist = fist_prepare(
            load_rgba(kit_path(name, PART_FILE[f'fist_{side}'])),
            (max(1, int(round(ts_fist.size[0] * src_s))), max(1, int(round(ts_fist.size[1] * src_s)))),
            side,
        )
        ffx = 0.50
        place_attach(f'fist_{side}', fist, ffx, 0.82)

    # ----- SOLES (kick overlay) -----
    for side in ('L', 'R'):
        raw = load_rgba(kit_path(name, PART_FILE[f'sole_{side}']))
        ts = load_rgba(kit_path(name, f"{'right' if side == 'L' else 'left'}-sole-true-scale"))
        sole = scale_to_true(raw, ts, src_s)
        # store a bit larger and scale down in the skin, like Gavin
        sw, sh = sole.size
        # target stored size ~ 2x on-screen (scale 0.5)
        on_h = max(sh, 160)
        if sh < on_h:
            sole = resize_h(sole, on_h)
            sw, sh = sole.size
        sole = save_part(sole, os.path.join(parts_dir, f'sole_{side}.png'))
        sw, sh = sole.size
        sc = 0.85  # true-scale already mapped; slight shrink so it doesn't read as a slab
        skin_parts[f'sole_{side}'] = {
            'image': f'parts/sole_{side}.png',
            'bone': f'boot_{side}',
            'scale': sc,
            'x': -sw * sc / 2,
            'y': -sh * sc * 0.80,
            'shadow': False,
            'w': sw, 'h': sh,
        }
        meta['parts'][f'sole_{side}'] = {'x': 0, 'y': 0, 'w': sw, 'h': sh, 'overlay': True}
        print(f'  sole_{side}:     {sw}x{sh} scale={sc}')

    # integer pivots + recompute rel
    PIV_I = {k: [int(round(v[0])), int(round(v[1]))] for k, v in PIV.items()}
    IK_I = {k: [int(round(v[0])), int(round(v[1]))] for k, v in IK.items()}
    for n, p in list(skin_parts.items()):
        if n.startswith('sole'):
            continue
        px, py = PIV_I[n]
        m = meta['parts'][n]
        p['x'] = int(m['x'] - px)
        p['y'] = int(m['y'] - py)

    skin = {
        'fighter': name,
        'skeleton': 'bvh-punchout-front-v1',
        'about': cfg['about'],
        'artSize': [ART_W, ART_H],
        'scale': 1.0,
        'groundY': GROUND_Y,
        'pivots': PIV_I,
        'ikTargets': IK_I,
        'parts': skin_parts,
    }
    json.dump(skin, open(os.path.join(out_dir, 'skin.json'), 'w'), indent=1)
    json.dump(meta, open(os.path.join(out_dir, 'parts_meta.json'), 'w'), indent=1)

    # assemble preview (rest pose, no animation)
    canvas = Image.new('RGBA', (ART_W, ART_H + 140), (26, 24, 32, 255))
    YOFF = 110
    order = ['pelvis', 'thigh_L', 'thigh_R', 'shin_L', 'shin_R', 'boot_L', 'boot_R',
             'torso', 'upperarm_L', 'upperarm_R', 'forearm_L', 'forearm_R',
             'fist_L', 'fist_R', 'head']
    d = ImageDraw.Draw(canvas)
    for n in order:
        if n not in placed:
            continue
        im, x, y = placed[n]
        canvas.alpha_composite(im, (int(x), int(y) + YOFF))
    for n, (px, py) in PIV_I.items():
        d.ellipse((px - 2, py + YOFF - 2, px + 2, py + YOFF + 2), outline=(255, 80, 80, 255))
    d.line((0, SKULL_Y + YOFF, ART_W, SKULL_Y + YOFF), fill=(80, 200, 80, 180))
    d.line((0, GROUND_Y + YOFF, ART_W, GROUND_Y + YOFF), fill=(80, 200, 80, 180))
    canvas.convert('RGB').save(os.path.join(out_dir, 'assemble_preview.jpg'), quality=85, optimize=True)
    canvas.convert('RGB').save(os.path.join(dbg, 'assemble.jpg'), quality=92)

    # overlaps
    for sd in ('L', 'R'):
        if f'thigh_{sd}' in placed and f'shin_{sd}' in placed:
            th, shn = placed[f'thigh_{sd}'], placed[f'shin_{sd}']
            print(f'  overlap thigh/shin_{sd}={(th[2]+th[0].size[1]) - shn[2]}')
        if f'shin_{sd}' in placed and f'boot_{sd}' in placed:
            shn, bt = placed[f'shin_{sd}'], placed[f'boot_{sd}']
            print(f'  overlap shin/boot_{sd}={(shn[2]+shn[0].size[1]) - bt[2]}')
    if 'torso' in placed and 'pelvis' in placed:
        t, p = placed['torso'], placed['pelvis']
        print(f'  overlap torso/pelvis={(t[2]+t[0].size[1]) - p[2]}')

    parts_bytes = sum(os.path.getsize(os.path.join(parts_dir, f)) for f in os.listdir(parts_dir) if f.endswith('.png'))
    folder = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(out_dir) for f in fs)
    notes = [
        f'{name}: kit parts on the shared rig, 6 ft at the skull. Local, $0.',
        f'src_scale={src_s:.4f} skull_src={skull} feet_src={fby} neck_src={cfg["neck_src"]}',
        f'art skull_y={SKULL_Y} groundY={GROUND_Y} scale=1.0 (6 ft)',
        'Pivots: pelvis/torso/arms/legs use the shared Gavin skeleton so fall/getup stay attached.',
        'Head pivot is at the neck. Kit left = fighter left = screen-right bones.',
        f'parts_bytes={parts_bytes}',
        f'folder_bytes={folder} ({folder/1024/1024:.2f} MB)' + (' OVER 2MB' if folder > 2_000_000 else ' ok'),
    ]
    for n, m in meta['parts'].items():
        notes.append(f"{n}: {m['w']}x{m['h']}")
    open(os.path.join(out_dir, 'BUILD_NOTES.txt'), 'w').write('\n'.join(notes) + '\n')
    print(f'parts_bytes={parts_bytes} folder={folder} ({folder/1024/1024:.2f} MB)',
          'OVER 2MB' if folder > 2_000_000 else 'ok')
    return folder


def maybe_downscale(name, budget=1_900_000):
    """If the folder is over budget, uniformly shrink the largest PNGs."""
    root = os.path.join(RIG, name)
    parts = os.path.join(root, 'parts')
    folder = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(root) for f in fs)
    if folder <= budget:
        return folder
    print(f'  shrinking {name} from {folder/1024/1024:.2f} MB')
    # shrink each part to at most 0.92 of current size, recompress, repeat once if needed
    for step, scale in enumerate((0.88, 0.84, 0.80), 1):
        for fn in os.listdir(parts):
            if not fn.endswith('.png'):
                continue
            path = os.path.join(parts, fn)
            im = Image.open(path).convert('RGBA')
            w, h = im.size
            im = im.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.Resampling.LANCZOS)
            im.save(path, optimize=True, compress_level=9)
        # scale skin.json part w/h and offsets proportionally
        skin_path = os.path.join(root, 'skin.json')
        skin = json.load(open(skin_path))
        for p in skin['parts'].values():
            if 'w' in p:
                p['w'] = max(1, int(round(p['w'] * scale)))
                p['h'] = max(1, int(round(p['h'] * scale)))
                p['x'] = int(round(p['x'] * scale))
                p['y'] = int(round(p['y'] * scale))
        json.dump(skin, open(skin_path, 'w'), indent=1)
        folder = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(root) for f in fs)
        print(f'  after pass {step} scale={scale}: {folder/1024/1024:.2f} MB')
        if folder <= budget:
            break
    return folder


if __name__ == '__main__':
    targets = sys.argv[1:] or ['ozone', 'ryan', 'jeff']
    for t in targets:
        write_skin(t)
        maybe_downscale(t)
    print('done')
