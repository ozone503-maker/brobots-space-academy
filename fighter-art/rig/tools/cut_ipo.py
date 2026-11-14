#!/usr/bin/env python3
"""Cut Ipo parts from ipo-full-body-v2.png (Gavin-style ownership + overlap fill).
Local only, $0, no image gen. Output: rig/ipo/parts/*.png + parts_meta.json + skin.json
"""
from __future__ import annotations
import json, os
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

SRC = '/workspace/muse_zip2/ipo-full-body-v2.png'
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'ipo', 'parts')
IPO = os.path.join(HERE, '..', 'ipo')
os.makedirs(OUT, exist_ok=True)

GAVIN = json.load(open(os.path.join(HERE, '..', 'gavin', 'skin.json')))
PIV = dict(GAVIN['pivots'])
PIV['head'] = [267, 230]
ART_W, ART_H = 534, 1265
GROUND_Y = 1231

im0 = Image.open(SRC).convert('RGBA')
im = np.array(im0).astype(np.float32) / 255.0
H, W = im.shape[:2]
A = im[..., 3]
RGB = im[..., :3]
solid = A > 0.05

def poly(pts):
    m = Image.new('L', (W, H), 0)
    ImageDraw.Draw(m).polygon([tuple(p) for p in pts], fill=255)
    return np.array(m) > 127

def soft_poly(pts, blur=1.2):
    m = Image.new('L', (W * 4, H * 4), 0)
    ImageDraw.Draw(m).polygon([(x * 4, y * 4) for x, y in pts], fill=255)
    m = m.resize((W, H), Image.LANCZOS)
    return np.array(m).astype(np.float32) / 255.0

# ---------- region polygons (full-image pixel coords of ipo-full-body-v2) ----------
# Character roughly x=650..1275, y=40..1548. Arms hang at sides; paws ~y850-1000.
R = {}
R['head'] = [
    (820, 35), (980, 30), (1120, 45), (1160, 120), (1165, 220),
    (1120, 310), (1050, 350), (980, 365), (900, 360), (820, 330),
    (780, 270), (770, 180), (790, 80),
]
# Gi sleeves (upper arms) — shoulder to cuff; L = screen left
R['upperarm_L'] = [
    (740, 300), (860, 295), (880, 360), (870, 480), (850, 600),
    (820, 720), (780, 780), (720, 760), (700, 680), (695, 520),
    (700, 400), (720, 330),
]
R['upperarm_R'] = [
    (1060, 295), (1180, 300), (1210, 330), (1230, 400), (1240, 520),
    (1245, 680), (1230, 760), (1170, 780), (1120, 720), (1090, 600),
    (1070, 480), (1060, 360),
]
# Forearm = visible pink fur from cuff toward paw (paw separate as fist)
R['forearm_L'] = [
    (700, 720), (790, 730), (800, 820), (790, 900), (760, 980),
    (720, 1020), (680, 1000), (670, 920), (675, 820), (690, 750),
]
R['forearm_R'] = [
    (1130, 730), (1220, 720), (1240, 750), (1255, 820), (1260, 920),
    (1245, 1000), (1200, 1020), (1160, 980), (1140, 900), (1130, 820),
]
# Paws as fists (from hanging pose)
R['fist_L'] = [
    (675, 960), (760, 955), (780, 990), (770, 1040), (730, 1060),
    (690, 1050), (670, 1010),
]
R['fist_R'] = [
    (1160, 955), (1245, 960), (1260, 1010), (1245, 1050), (1200, 1060),
    (1165, 1040), (1150, 990),
]
# Torso jacket + belt (belt lives here only)
R['torso'] = [
    (860, 300), (1060, 300), (1100, 360), (1120, 500), (1135, 650),
    (1140, 780), (1120, 850), (1050, 880), (960, 900), (870, 880),
    (800, 850), (780, 780), (790, 650), (800, 500), (820, 360),
]
# Pelvis = pants waist under belt (no belt knot)
R['pelvis'] = [
    (800, 850), (1120, 850), (1140, 920), (1145, 1000), (1120, 1060),
    (1050, 1100), (960, 1120), (870, 1100), (800, 1060), (780, 1000),
    (785, 920),
]
R['thigh_L'] = [
    (760, 1050), (950, 1050), (960, 1120), (950, 1220), (930, 1320),
    (880, 1360), (800, 1365), (760, 1320), (745, 1220), (750, 1120),
]
R['thigh_R'] = [
    (970, 1050), (1160, 1050), (1180, 1120), (1185, 1220), (1175, 1320),
    (1130, 1365), (1050, 1360), (1000, 1320), (980, 1220), (970, 1120),
]
R['shin_L'] = [
    (750, 1300), (920, 1300), (925, 1360), (910, 1410), (860, 1425),
    (800, 1425), (760, 1410), (745, 1360),
]
R['shin_R'] = [
    (1000, 1300), (1175, 1300), (1185, 1360), (1175, 1410), (1130, 1425),
    (1060, 1425), (1010, 1410), (995, 1360),
]
R['boot_L'] = [
    (710, 1400), (890, 1400), (900, 1450), (895, 1520), (850, 1545),
    (780, 1545), (720, 1520), (705, 1460),
]
R['boot_R'] = [
    (1050, 1400), (1220, 1400), (1235, 1460), (1230, 1525), (1180, 1545),
    (1100, 1545), (1055, 1520), (1045, 1460),
]

# Hidden fills under overlaps (extend texture into joint regions)
FILL = {
    'forearm_L': [(710, 700), (800, 710), (800, 820), (760, 900), (700, 880), (690, 760)],
    'forearm_R': [(1130, 710), (1220, 700), (1240, 760), (1240, 880), (1180, 900), (1130, 820)],
    'upperarm_L': [(750, 310), (870, 310), (870, 500), (840, 700), (760, 720), (710, 500)],
    'upperarm_R': [(1060, 310), (1180, 310), (1220, 500), (1200, 720), (1120, 700), (1060, 500)],
    'torso': [(860, 320), (1060, 320), (1100, 500), (1110, 750), (1050, 860), (900, 870), (820, 750), (820, 500)],
    'pelvis': [(810, 860), (1110, 860), (1130, 1000), (1080, 1080), (960, 1100), (840, 1080), (790, 1000)],
    'thigh_L': [(770, 1080), (940, 1080), (940, 1280), (860, 1340), (770, 1280)],
    'thigh_R': [(980, 1080), (1150, 1080), (1150, 1280), (1080, 1340), (980, 1280)],
    'shin_L': [(760, 1320), (910, 1320), (900, 1400), (800, 1410), (760, 1380)],
    'shin_R': [(1010, 1320), (1165, 1320), (1160, 1400), (1080, 1410), (1010, 1380)],
    'boot_L': [(740, 1410), (870, 1410), (870, 1480), (780, 1500), (740, 1460)],
    'boot_R': [(1080, 1410), (1200, 1410), (1200, 1480), (1120, 1500), (1080, 1460)],
    'head': [(860, 200), (1080, 200), (1080, 320), (980, 350), (860, 320)],
}

PRIO = [
    'fist_L', 'fist_R', 'forearm_L', 'forearm_R', 'head',
    'upperarm_L', 'upperarm_R', 'torso', 'pelvis',
    'thigh_L', 'thigh_R', 'shin_L', 'shin_R', 'boot_L', 'boot_R',
]
FRONT = {
    'fist_L': [], 'fist_R': [],
    'forearm_L': ['fist_L'], 'forearm_R': ['fist_R'],
    'head': ['fist_L', 'fist_R', 'forearm_L', 'forearm_R'],
    'upperarm_L': ['fist_L', 'forearm_L', 'head'],
    'upperarm_R': ['fist_R', 'forearm_R', 'head'],
    'torso': ['fist_L', 'fist_R', 'forearm_L', 'forearm_R', 'head', 'upperarm_L', 'upperarm_R'],
    'pelvis': ['torso', 'forearm_L', 'forearm_R', 'upperarm_L', 'upperarm_R'],
    'thigh_L': ['pelvis', 'torso'], 'thigh_R': ['pelvis', 'torso'],
    'shin_L': ['thigh_L'], 'shin_R': ['thigh_R'],
    'boot_L': ['shin_L'], 'boot_R': ['shin_R'],
}
FEATHER = {
    'fist_L': 2, 'fist_R': 2, 'forearm_L': 4, 'forearm_R': 4, 'head': 5,
    'upperarm_L': 4, 'upperarm_R': 4, 'torso': 3, 'pelvis': 5,
    'thigh_L': 6, 'thigh_R': 6, 'shin_L': 5, 'shin_R': 5, 'boot_L': 3, 'boot_R': 3,
}
TEXOFF = {
    'torso': [(0, 80), (0, 140), (40, 100), (-40, 100)],
    'pelvis': [(0, 60), (0, 100), (30, 80), (-30, 80)],
    'upperarm_L': [(0, 60), (0, 100), (-20, 80)],
    'upperarm_R': [(0, 60), (0, 100), (20, 80)],
    'forearm_L': [(0, 40), (0, 70)], 'forearm_R': [(0, 40), (0, 70)],
    'thigh_L': [(0, 80), (0, 120), (20, 100)], 'thigh_R': [(0, 80), (0, 120), (-20, 100)],
    'shin_L': [(0, 50), (0, 80)], 'shin_R': [(0, 50), (0, 80)],
    'boot_L': [(0, 30)], 'boot_R': [(0, 30)], 'head': [(0, -30)],
}

own = {}
taken = np.zeros((H, W), bool)
for n in PRIO:
    m = poly(R[n]) & solid & ~taken
    own[n] = m
    taken |= m
left = solid & ~taken
print('unowned solid px:', int(left.sum()))
if left.any():
    best = np.full((H, W), 1e9, np.float32)
    lab = np.full((H, W), -1, np.int32)
    for i, n in enumerate(PRIO):
        if n.startswith('fist'):
            continue
        d = cv2.distanceTransform((~own[n]).astype(np.uint8), cv2.DIST_L2, 3)
        upd = d < best
        best[upd] = d[upd]
        lab[upd] = i
    for i, n in enumerate(PRIO):
        own[n] |= left & (lab == i)

# Round knee: move deep thigh-below-knee into shin
_yy, _xx = np.mgrid[0:H, 0:W]
for sd, kx, ky, kr in [('L', 840, 1340, 70), ('R', 1090, 1340, 70)]:
    outside = (_yy > ky) & (np.hypot(_xx - kx, _yy - ky) > kr)
    mv = own['thigh_' + sd] & outside
    own['thigh_' + sd] &= ~mv
    own['shin_' + sd] |= mv

def sdist(mask):
    m = mask.astype(np.uint8)
    din = cv2.distanceTransform(m, cv2.DIST_L2, 5)
    dout = cv2.distanceTransform(1 - m, cv2.DIST_L2, 5)
    return din - dout

def pushpull(rgb, known):
    w = known.astype(np.float32)
    levels = [(rgb * w[..., None], w)]
    c, ww = levels[0]
    while min(ww.shape) > 2:
        c = cv2.resize(c, (max(1, c.shape[1] // 2), max(1, c.shape[0] // 2)), interpolation=cv2.INTER_AREA)
        ww = cv2.resize(ww, (max(1, ww.shape[1] // 2), max(1, ww.shape[0] // 2)), interpolation=cv2.INTER_AREA)
        levels.append((c, ww))
    c, ww = levels[-1]
    est = c / np.maximum(ww, 1e-6)[..., None]
    for c, ww in reversed(levels[:-1]):
        up = cv2.resize(est, (c.shape[1], c.shape[0]), interpolation=cv2.INTER_LINEAR)
        k = np.clip(ww * 4, 0, 1)[..., None]
        est = (c / np.maximum(ww, 1e-6)[..., None]) * k + up * (1 - k)
    return est

hp = RGB - cv2.GaussianBlur(RGB, (0, 0), 3.0)
_l = RGB.mean(axis=2)
INK = cv2.dilate((_l < 0.12).astype(np.uint8), np.ones((7, 7), np.uint8)).astype(bool)

# Strip pink belt pixels from PELVIS ownership colors (replace with pants sample later)
pink_belt = (RGB[..., 0] > 0.55) & (RGB[..., 0] > RGB[..., 1] + 0.10) & (RGB[..., 1] < 0.65) & (A > 0.1)

meta_src = {'source': os.path.basename(SRC), 'size': [W, H], 'parts': {}}
crops = {}
for n in PRIO:
    f = FEATHER[n]
    sd = sdist(own[n])
    soft = np.clip((sd + f) / (2.0 * f), 0, 1)
    soft[own[n]] = np.maximum(soft[own[n]], 0.5)
    region_ext = (sd > -f - 1) & solid
    fill = np.zeros((H, W), np.float32)
    if n in FILL:
        polys = FILL[n] if isinstance(FILL[n][0], list) else [FILL[n]]
        fill = np.max([soft_poly(p) for p in polys], axis=0) * solid.astype(np.float32)
    hidden = np.zeros((H, W), bool)
    for o in FRONT[n]:
        so = sdist(own[o])
        hidden |= so > FEATHER[o] - 0.5
    known = own[n] & ~hidden
    known_ext = region_ext & ~hidden
    for o in PRIO:
        if o != n:
            known_ext &= ~(own[o] & (sd < -f - 1))
    SRCRGB = RGB.copy()
    # Pelvis: replace pink belt with nearby pants fabric before fill
    if n == 'pelvis':
        belt_zone = pink_belt & ( (_yy > 780) & (_yy < 920) )
        # sample pants below belt
        for dy in (80, 100, 120, 60):
            sy = np.clip(_yy + dy, 0, H - 1)
            ok = belt_zone & own['pelvis']
            # also allow thigh ownership as donor
            donor = (own['pelvis'] | own['thigh_L'] | own['thigh_R']) & ~pink_belt & (A > 0.2)
            sx = _xx; sy2 = sy
            use = ok & donor[sy2, sx]
            # simpler row copy
        ys, xs = np.nonzero(belt_zone & (own['pelvis'] | (fill > 0)))
        for y, x in zip(ys, xs):
            for dy in (90, 110, 70, 130):
                yy = min(H - 1, y + dy)
                if A[yy, x] > 0.2 and not pink_belt[yy, x]:
                    SRCRGB[y, x] = RGB[yy, x]
                    known[y, x] = True
                    break
            else:
                SRCRGB[y, x] = np.array([0.90, 0.88, 0.85])
                known[y, x] = True
    base = pushpull(SRCRGB, known)
    color = RGB.copy()
    need = ~known_ext
    tex = np.zeros_like(RGB)
    got = np.zeros((H, W), bool)
    ys, xs = np.nonzero(need & (fill > 0))
    srcm = own[n] & ~INK
    if n == 'pelvis':
        srcm = srcm & ~pink_belt
    for dx, dy in TEXOFF.get(n, []):
        sx = np.clip(xs + dx, 0, W - 1)
        sy = np.clip(ys + dy, 0, H - 1)
        ok = srcm[sy, sx] & ~got[ys, xs]
        tex[ys[ok], xs[ok]] = hp[sy[ok], sx[ok]]
        got[ys[ok], xs[ok]] = True
    filled = np.clip(base + tex * 0.85, 0, 1)
    color[need] = filled[need]
    alpha = np.maximum(soft * A, fill)
    alpha[~(region_ext | (fill > 0))] = 0
    # Round joint caps: feather rectangular cut corners via distance on fill edges
    a_bin = alpha > 0.4
    if n in ('thigh_L', 'thigh_R', 'shin_L', 'shin_R', 'upperarm_L', 'upperarm_R', 'forearm_L', 'forearm_R', 'pelvis'):
        # smooth silhouette
        a8 = (alpha * 255).astype(np.uint8)
        a8 = cv2.GaussianBlur(a8, (0, 0), 1.2)
        alpha = np.maximum(alpha * 0.15, a8.astype(np.float32) / 255.0)
        alpha[alpha < 0.04] = 0
    # Drop tiny islands
    nl, lab_, st, _ = cv2.connectedComponentsWithStats((alpha > 0.08).astype(np.uint8), connectivity=8)
    if nl > 2:
        bigc = st[1:, 4].max()
        for i in range(1, nl):
            if st[i, 4] < 0.015 * bigc:
                alpha[lab_ == i] = 0
    out = np.dstack([color, alpha])
    ys2, xs2 = np.nonzero(alpha > 0.02)
    if len(xs2) < 10:
        print('EMPTY', n)
        continue
    x0, x1, y0, y1 = int(xs2.min()), int(xs2.max() + 1), int(ys2.min()), int(ys2.max() + 1)
    crop = (np.clip(out[y0:y1, x0:x1], 0, 1) * 255 + 0.5).astype(np.uint8)
    crops[n] = {'img': crop, 'x0': x0, 'y0': y0, 'x1': x1, 'y1': y1}
    meta_src['parts'][n] = {'x': x0, 'y': y0, 'w': x1 - x0, 'h': y1 - y0}
    print(n, meta_src['parts'][n])

json.dump(meta_src, open(os.path.join(IPO, 'parts_meta_src.json'), 'w'), indent=1)

# ---------- Map source → art canvas & write skin ----------
# Source character bbox
SRC_TOP, SRC_BOT = 40, 1545
SRC_CX = 960
scale = (GROUND_Y - 40) / (SRC_BOT - SRC_TOP)  # ~0.80
print('scale', scale)

def src_to_art(sx, sy):
    ax = (sx - SRC_CX) * scale + ART_W / 2
    ay = (sy - SRC_TOP) * scale + 40
    return ax, ay

def upscale_clean(arr, tw, th):
    """Lanczos resize + mild sharpen."""
    im = Image.fromarray(arr, 'RGBA')
    im = im.resize((tw, th), Image.LANCZOS)
    # mild unsharp on RGB only
    rgb = im.convert('RGB')
    rgb = ImageEnhance.Sharpness(rgb).enhance(1.25)
    out = Image.merge('RGBA', (*rgb.split(), im.split()[-1]))
    return np.array(out)

# Target sizes similar to Gavin (keep aspect from source crop)
TARGET = {
    'head': (320, 300),
    'torso': (280, 450),
    'pelvis': (300, 200),
    'upperarm_L': (150, 280), 'upperarm_R': (150, 280),
    'forearm_L': (120, 220), 'forearm_R': (120, 220),
    'fist_L': (100, 110), 'fist_R': (100, 110),
    'thigh_L': (170, 340), 'thigh_R': (170, 340),
    'shin_L': (150, 220), 'shin_R': (150, 220),
    'boot_L': (180, 140), 'boot_R': (180, 140),
}

# Pivot attachment fractions: where on the part the bone pivot sits
# (fx, fy) as fraction of width/height from top-left — Gavin-like
ATTACH = {
    'head': (0.50, 0.78),
    'torso': (0.50, 0.85),
    'pelvis': (0.50, 0.35),
    'upperarm_L': (0.55, 0.10), 'upperarm_R': (0.45, 0.10),
    # forearm: pivot near WRIST (bottom); art elbow→paw top→bottom
    'forearm_L': (0.50, 0.88), 'forearm_R': (0.50, 0.88),
    'fist_L': (0.50, 0.50), 'fist_R': (0.50, 0.50),
    'thigh_L': (0.50, 0.14), 'thigh_R': (0.50, 0.14),
    'shin_L': (0.50, 0.18), 'shin_R': (0.50, 0.18),
    'boot_L': (0.50, 0.38), 'boot_R': (0.50, 0.38),
}

skin_parts = {}
meta = {'parts': {}}
for n, tw_th in TARGET.items():
    if n not in crops:
        continue
    c = crops[n]
    arr = c['img']
    tw, th = tw_th
    # fit preserving aspect inside target box, then pad? Prefer stretch-to-target for rig coverage
    sh, sw = arr.shape[:2]
    # scale to cover target while preferring aspect
    s = min(tw / sw, th / sh)
    # For limbs, allow slight stretch to exact target for joint coverage
    if n.startswith(('upperarm', 'forearm', 'thigh', 'shin', 'boot')):
        out = upscale_clean(arr, tw, th)
    else:
        nw, nh = max(1, int(sw * s)), max(1, int(sh * s))
        scaled = upscale_clean(arr, nw, nh)
        canvas = np.zeros((th, tw, 4), dtype=np.uint8)
        ox, oy = (tw - nw) // 2, (th - nh) // 2
        canvas[oy:oy + nh, ox:ox + nw] = scaled
        out = canvas
    # Round joint ends for limbs (alpha only, no fill boxes)
    if n.startswith(('upperarm', 'forearm', 'thigh', 'shin')):
        a = out.astype(np.float32)
        hh, ww = a.shape[:2]
        xs = np.arange(ww, dtype=np.float32)
        cx = (ww - 1) / 2
        top_n = max(4, int(hh * 0.10))
        bot_n = max(4, int(hh * (0.08 if not n.startswith('shin') else 0.0)))
        for y in range(top_n):
            t = (y + 1) / top_n
            half = ww * (0.40 + 0.60 * t) / 2
            a[y, ..., 3] *= np.clip((half - np.abs(xs - cx)) / max(1, half * 0.22), 0, 1)
        for i in range(bot_n):
            y = hh - 1 - i
            t = (i + 1) / bot_n
            half = ww * (0.42 + 0.58 * t) / 2
            a[y, ..., 3] *= np.clip((half - np.abs(xs - cx)) / max(1, half * 0.22), 0, 1)
        out = np.clip(a, 0, 255).astype(np.uint8)
    Image.fromarray(out, 'RGBA').save(os.path.join(OUT, n + '.png'), optimize=True)
    fx, fy = ATTACH[n]
    px, py = PIV[n]
    # abs top-left so pivot sits at (fx,fy) on part
    abs_x = int(px - fx * out.shape[1])
    abs_y = int(py - fy * out.shape[0])
    # boots: keep sole near ground
    if n.startswith('boot'):
        bot = abs_y + out.shape[0]
        if bot > GROUND_Y + 8:
            abs_y = GROUND_Y + 4 - out.shape[0]
        # do NOT push down (breaks ankle)
    meta['parts'][n] = {'x': abs_x, 'y': abs_y, 'w': int(out.shape[1]), 'h': int(out.shape[0])}
    skin_parts[n] = {
        'image': f'parts/{n}.png',
        'x': int(abs_x - px),
        'y': int(abs_y - py),
        'w': int(out.shape[1]),
        'h': int(out.shape[0]),
    }
    print(f'place {n}: {out.shape[1]}x{out.shape[0]} rel=({skin_parts[n]["x"]},{skin_parts[n]["y"]})')

# Force shin hem tuck over boots
for side in ('L', 'R'):
    shin = Image.open(os.path.join(OUT, f'shin_{side}.png'))
    boot = meta['parts'][f'boot_{side}']
    overlap = 55
    sy = boot['y'] + overlap - shin.height
    sx = PIV[f'shin_{side}'][0] - shin.width // 2
    meta['parts'][f'shin_{side}'] = {'x': sx, 'y': sy, 'w': shin.width, 'h': shin.height}
    skin_parts[f'shin_{side}'] = {
        'image': f'parts/shin_{side}.png',
        'x': int(sx - PIV[f'shin_{side}'][0]),
        'y': int(sy - PIV[f'shin_{side}'][1]),
        'w': shin.width, 'h': shin.height,
    }
    print(f'  shin_{side} tuck={sy + shin.height - boot["y"]}')

# Soles from true-scale Muse (kicks)
for side, srcn in [('L', 'ipo-left-sole-true-scale-v2.png'), ('R', 'ipo-right-sole-true-scale-v2.png')]:
    sole = Image.open(f'/workspace/muse_zip2/{srcn}').convert('RGBA')
    a = np.array(sole)
    a[..., 3] = np.where(a[..., 3] < 40, 0, a[..., 3])
    sole = Image.fromarray(a, 'RGBA')
    b = sole.getbbox()
    if b:
        sole = sole.crop(b)
    sole = sole.resize((170, 360), Image.LANCZOS)
    sole.save(os.path.join(OUT, f'sole_{side}.png'))
    skin_parts[f'sole_{side}'] = {
        'image': f'parts/sole_{side}.png',
        'bone': f'boot_{side}',
        'scale': 0.42,
        'x': -sole.width * 0.42 / 2,
        'y': -sole.height * 0.42 * 0.85,
        'shadow': True,
        'w': sole.width, 'h': sole.height,
    }
    meta['parts'][f'sole_{side}'] = {'x': 0, 'y': 0, 'w': sole.width, 'h': sole.height, 'overlay': True}

skin = {
    'fighter': 'ipo',
    'skeleton': 'bvh-punchout-front-v1',
    'about': 'Ipo v3: parts cut from ipo-full-body-v2.png (Gavin-style). Belt on torso; paws as fists; forearm elbow→wrist.',
    'artSize': [ART_W, ART_H],
    'scale': 1.0,
    'groundY': GROUND_Y,
    'pivots': PIV,
    'ikTargets': GAVIN['ikTargets'],
    'parts': skin_parts,
}
json.dump(skin, open(os.path.join(IPO, 'skin.json'), 'w'), indent=1)
json.dump(meta, open(os.path.join(IPO, 'parts_meta.json'), 'w'), indent=1)

# Assemble preview
canvas = Image.new('RGBA', (ART_W, ART_H), (26, 24, 32, 255))
order = ['pelvis', 'thigh_L', 'thigh_R', 'shin_L', 'shin_R', 'boot_L', 'boot_R',
         'torso', 'upperarm_L', 'upperarm_R', 'forearm_L', 'forearm_R', 'fist_L', 'fist_R', 'head']
for n in order:
    m = meta['parts'][n]
    canvas.alpha_composite(Image.open(os.path.join(OUT, f'{n}.png')), (m['x'], m['y']))
canvas.convert('RGB').save(os.path.join(IPO, 'assemble_preview.png'))
canvas.convert('RGB').save('/tmp/ipo_v3_assemble.png')
bytes_total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT) if f.endswith('.png'))
notes = [
    'Ipo v3: cut from ipo-full-body-v2.png (local, $0)',
    f'scale={scale:.4f}',
    f'parts_bytes={bytes_total}',
]
for n, m in meta['parts'].items():
    notes.append(f"{n}: -> ({m['w']}, {m['h']})")
open(os.path.join(IPO, 'BUILD_NOTES.txt'), 'w').write('\n'.join(notes) + '\n')
print('parts_bytes', bytes_total)
print('done')
