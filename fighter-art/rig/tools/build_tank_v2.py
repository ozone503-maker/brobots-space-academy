#!/usr/bin/env python3
"""Tank v2: keep parts attached in fall/getup, make the leather jacket read,
replace the kick-sole slab, clean arm edges. Local, $0.

Uses Gavin skeleton pivots for pelvis/torso/arms (Ipo v4's attachment fix)
so shared fall/getup rotations don't tear the body. Head pivot stays at
Tank's neck so the skull top (under the fedora) sits at the 7 ft line.
Legs keep Tank's knee caps at the visual knees.
"""
from __future__ import annotations
import json, os, math
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageChops

HERE = os.path.dirname(os.path.abspath(__file__))
TANK = os.path.abspath(os.path.join(HERE, '..', 'tank'))
OUT = os.path.join(TANK, 'parts')
DBG = '/tmp/tank_v2'
os.makedirs(OUT, exist_ok=True)
os.makedirs(DBG, exist_ok=True)

TPOSE_PATH = '/workspace/tank_parts/tank-arms-out.jpg'
PAGE_PATH = '/workspace/tank_parts/tank-parts-page-v1.jpg'
ART_W, ART_H, GROUND_Y = 534, 1265, 1231
SCALE_ONSCREEN = 1.17
CX, SKULL_TOP, FEET_BOTTOM, FEDORA_TOP = 509, 92, 974, 11
SKULL_Y_ART = 22
SRC_S = (GROUND_Y - SKULL_Y_ART) / (FEET_BOTTOM - SKULL_TOP)

GAVIN = json.load(open(os.path.join(HERE, '..', 'gavin', 'skin.json')))
GAVP = {k: list(v) for k, v in GAVIN['pivots'].items()}
GAVIK = {k: list(v) for k, v in GAVIN['ikTargets'].items()}

# Tank-specific: neck sits much higher than Gavin's because the metal head is short.
# Keep skull at y=22 (under the fedora). Source neck ~188.
NECK_Y = int(round(SKULL_Y_ART + (188 - SKULL_TOP) * SRC_S))  # ~154
# Visual knees / ankles from the T-pose (so knee caps stay on the pivot)
KNEE_Y = int(round(SKULL_Y_ART + (725 - SKULL_TOP) * SRC_S))  # ~889
ANKLE_Y = int(round(SKULL_Y_ART + (872 - SKULL_TOP) * SRC_S))  # ~1091
HIP_Y = int(round(SKULL_Y_ART + (600 - SKULL_TOP) * SRC_S))    # ~718

# Final pivots: Gavin for torso/pelvis/arms (close torso-pelvis pair = attached fall).
# Legs: hip x stays a little wide like Tank, y uses Gavin's 715 (≈718). Knees/ankles visual.
PIV = dict(GAVP)
PIV['head'] = [267, NECK_Y]
PIV['thigh_L'] = [185, 715]
PIV['thigh_R'] = [352, 715]
PIV['shin_L'] = [140, KNEE_Y]
PIV['shin_R'] = [395, KNEE_Y]
PIV['boot_L'] = [130, ANKLE_Y]
PIV['boot_R'] = [428, ANKLE_Y]
IK = {'foot_L': list(PIV['boot_L']), 'foot_R': list(PIV['boot_R'])}


def to_art(sx, sy):
    return (sx - CX) * SRC_S + ART_W / 2.0, (sy - SKULL_TOP) * SRC_S + SKULL_Y_ART


def crop_thr(im, thr=18):
    a = np.array(im)
    a[..., 3] = np.where(a[..., 3] < thr, 0, a[..., 3])
    im = Image.fromarray(a, 'RGBA')
    b = im.getbbox()
    return im.crop(b) if b else im


def remove_white_bg(rgb, lo=10, hi=32):
    rgb = rgb.astype(np.float32)
    dist = np.sqrt(((255.0 - rgb) ** 2).sum(2))
    alpha = np.clip((dist - lo) / max(1.0, hi - lo), 0, 1)
    a3 = np.maximum(alpha, 1e-4)[..., None]
    fg = np.clip((rgb - (1.0 - alpha)[..., None] * 255.0) / a3, 0, 255)
    out = np.dstack([fg, alpha * 255.0])
    near = (fg.mean(2) > 248) & ((fg.max(2) - fg.min(2)) < 8)
    out[near, 3] = 0
    return np.clip(out, 0, 255).astype(np.uint8)


def clean_halo(arr, blur=0.35):
    """Kill white fringe, then a 1px anti-alias. No soft grey halo."""
    a = arr.astype(np.float32)
    rgb = a[..., :3]
    lum = rgb.mean(2)
    sat = rgb.max(2) - rgb.min(2)
    # any pale desaturated pixel on a soft edge is leftover JPEG white
    bad = (a[..., 3] > 0) & (a[..., 3] < 250) & (lum > 200) & (sat < 28)
    a[bad, 3] = 0
    alpha = a[..., 3] / 255.0
    m = (alpha > 0.04) & (alpha < 0.97)
    if m.any():
        fg = np.clip((rgb[m] - (1.0 - alpha[m])[..., None] * 255.0)
                     / np.maximum(alpha[m][..., None], 0.08), 0, 255)
        a[m, :3] = fg
        lum2 = fg.mean(1)
        sat2 = fg.max(1) - fg.min(1)
        still = (lum2 > 230) & (sat2 < 18)
        idx = np.where(m)
        a[idx[0][still], idx[1][still], 3] = 0
    a[a[..., 3] < 28, 3] = 0
    # harden mid-alpha so edges aren't a grey smear, then a tiny AA blur
    mid = (a[..., 3] >= 28) & (a[..., 3] < 200)
    a[mid, 3] = np.where(a[mid, 3] < 90, 0, np.maximum(a[mid, 3], 200))
    # defringe: copy inward leather color onto remaining edge pixels
    solid = a[..., 3] >= 200
    if solid.any():
        k = np.ones((5, 5), np.uint8)
        near = cv2.dilate(solid.astype(np.uint8), k, iterations=1).astype(bool) & ~solid & (a[..., 3] > 0)
        if near.any():
            # mean of nearby solid pixels via blur
            rgb_s = rgb.copy()
            rgb_s[~solid] = 0
            cnt = cv2.blur(solid.astype(np.float32), (5, 5))
            acc = np.dstack([cv2.blur(rgb_s[..., i], (5, 5)) for i in range(3)])
            fill = acc / np.maximum(cnt[..., None], 1e-4)
            a[near, :3] = fill[near]
    if blur > 0:
        sm = cv2.GaussianBlur(a[..., 3], (0, 0), blur)
        core = a[..., 3] >= 200
        a[..., 3] = np.where(core, 255, sm)
        a[a[..., 3] < 20, 3] = 0
    return np.clip(a, 0, 255).astype(np.uint8)


def sharpen(im, amt=1.2):
    rgb = ImageEnhance.Sharpness(im.convert('RGB')).enhance(amt)
    return Image.merge('RGBA', (*rgb.split(), im.split()[-1]))


def largest(mask):
    n, lab, st, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), 8)
    if n <= 1:
        return mask
    i = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    return lab == i


def save_png(im, path, scrub=True):
    arr = np.array(im)
    if scrub:
        arr = clean_halo(arr)
    im = crop_thr(Image.fromarray(arr, 'RGBA'), 16)
    im.save(path, optimize=True, compress_level=9)
    return im


def leather_tube_caps(im, top=0.10, bot=0.10):
    """Round the ends of a sleeve using the sleeve's own leather, no black bars."""
    a = np.array(im).astype(np.float32)
    h, w = a.shape[:2]
    # sample a mid-sleeve leather color for any tiny invented edge
    mid = a[int(h * 0.35):int(h * 0.65)]
    solid = mid[..., 3] > 80
    mean = mid[solid, :3].mean(0) if solid.any() else np.array([70, 50, 40])
    xs = np.arange(w, dtype=np.float32)
    cx = (w - 1) / 2.0
    for end, frac in (('top', top), ('bot', bot)):
        n = max(4, int(h * frac))
        for i in range(n):
            y = i if end == 'top' else (h - 1 - i)
            t = (i + 1) / n
            half = w * (0.34 + 0.16 * t)
            fall = np.clip((half - np.abs(xs - cx)) / max(1.0, half * 0.28), 0, 1)
            # only fade alpha, never introduce a dark fill
            a[y, ..., 3] *= fall
            # if a pixel became almost empty, leave it empty (no black fill-in)
    a[a[..., 3] < 14, 3] = 0
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA')


# =====================================================================
# Recut jacket sleeves from the T-pose (leather shoulder→elbow, elbow→wrist)
# =====================================================================
tpose = np.array(Image.open(TPOSE_PATH).convert('RGB'))

# Tight boxes: (x0,y0,x1,y1). Generous joint overlap, no jacket body, no fists.
# y band hugs the sleeve (about 215-315).
ARM_BOX = {
    # Hug the leather tube; leave elbow overlap; stop before the jacket zipper panel.
    'upperarm_L': (232, 222, 368, 308, 90),
    'forearm_L':  (126, 224, 250, 310, -90),
    'upperarm_R': (656, 222, 792, 308, -90),
    'forearm_R':  (775, 224, 899, 310, 90),
}


def cut_sleeve(box_rot, kind):
    x0, y0, x1, y1, rot = box_rot
    tile = tpose[y0:y1, x0:x1]
    rgba = remove_white_bg(tile, lo=11, hi=30)
    # drop any leftover fist metal from the forearm inner edge
    if kind == 'fore':
        # metal fists are lighter / less brown than the leather
        rgb = rgba[..., :3].astype(np.float32)
        a = rgba[..., 3] > 20
        brown = (rgb[..., 0] > rgb[..., 2] + 8) & (rgb[..., 0] < 160) & (rgb.mean(2) < 140)
        # keep leather + the ribbed cuff (also brown/dark). Drop bright metal.
        metal = a & (rgb.mean(2) > 130) & ((rgb.max(2) - rgb.min(2)) < 40)
        # only strip metal at the wrist-most 18% of the un-rotated tile
        H, W = rgba.shape[:2]
        # left forearm: wrist is on the left of the tile; right forearm: wrist on the right
        # handled after rotate instead — keep the cuff
        pass
    rgba = clean_halo(rgba, blur=0.6)
    im = crop_thr(Image.fromarray(rgba, 'RGBA'), 16)
    im = im.rotate(rot, expand=True, resample=Image.Resampling.BICUBIC)
    im = crop_thr(im, 16)
    # After rotation, drop a jagged one-pixel fringe
    im = Image.fromarray(clean_halo(np.array(im), blur=0.8), 'RGBA')
    im = crop_thr(im, 18)
    # Keep the main sleeve blob only
    a = np.array(im)
    mask = largest(a[..., 3] > 20)
    a[~mask, 3] = 0
    im = crop_thr(Image.fromarray(a, 'RGBA'), 16)
    im = leather_tube_caps(im, 0.03, 0.03)
    return crop_thr(im, 16)


sleeves = {}
for name, box in ARM_BOX.items():
    kind = 'upper' if name.startswith('upper') else 'fore'
    im = cut_sleeve(box, kind)
    # scale uniformly to art px
    sw, sh = im.size
    tw, th = max(1, int(round(sw * SRC_S))), max(1, int(round(sh * SRC_S)))
    # Make sure the sleeve covers the bone with overlap:
    # upper arm bone ~177, forearm ~130. Add ~22% overlap each end.
    if kind == 'upper':
        target_h = 220  # 177 + overlap
        s = target_h / th
        # keep width scale close to uniform so leather isn't stretched sideways
        im = im.resize((max(1, int(tw * s)), target_h), Image.Resampling.LANCZOS)
    else:
        target_h = 175  # 130 + cuff + overlap
        s = target_h / th
        im = im.resize((max(1, int(tw * s)), target_h), Image.Resampling.LANCZOS)
    im = sharpen(im, 1.25)
    im = Image.fromarray(clean_halo(np.array(im), blur=0.7), 'RGBA')
    im = leather_tube_caps(im, 0.03, 0.03)
    sleeves[name] = crop_thr(im, 16)
    sleeves[name].save(os.path.join(DBG, f'{name}.png'))
    print('sleeve', name, sleeves[name].size)


# Fists: keep the v1 riveted panel-9 pair (already on disk), just re-place later.
# Optionally re-extract to be safe if files exist.
def extract_fist():
    page = np.array(Image.open(PAGE_PATH).convert('RGB'))
    PW = 256
    r, c = divmod(8, 4)  # panel 9, 0-index 8
    tile = page[r * PW:(r + 1) * PW, c * PW:(c + 1) * PW]
    rgba = clean_halo(remove_white_bg(tile, lo=12, hi=28), blur=0.5)
    a = rgba[..., 3] > 20
    rgba[~largest(a), 3] = 0
    return crop_thr(Image.fromarray(rgba, 'RGBA'), 20)

fist_L = extract_fist()
fist_R = fist_L.transpose(Image.FLIP_LEFT_RIGHT)
# orient wrist-at-bottom
fist_L = crop_thr(fist_L.rotate(-50, expand=True, resample=Image.Resampling.BICUBIC), 18)
fist_R = crop_thr(fist_R.rotate(50, expand=True, resample=Image.Resampling.BICUBIC), 18)
# color-match toward T-pose metal
def color_shift(im, target, strength=0.25):
    a = np.array(im).astype(np.float32)
    use = a[..., 3] > 40
    if not use.any():
        return im
    cur = a[use, :3].mean(0)
    a[..., :3] = np.clip(a[..., :3] + (np.array(target) - cur) * strength, 0, 255)
    return Image.fromarray(a.astype(np.uint8), 'RGBA')

# sample metal from existing torso
torso_a = np.array(Image.open(os.path.join(OUT, 'torso.png')))
m = (torso_a[..., 3] > 80) & (torso_a[..., :3].mean(2) > 120)
METAL = torso_a[m, :3].mean(0) if m.any() else np.array([160, 140, 125])
fist_L = sharpen(color_shift(fist_L, METAL, 0.22), 1.15)
fist_R = sharpen(color_shift(fist_R, METAL, 0.22), 1.15)
# same size, bigger than a human fist
def fit_h(im, th=168):
    sw, sh = im.size
    s = th / sh
    return im.resize((max(1, int(sw * s)), th), Image.Resampling.LANCZOS)
fist_L, fist_R = fit_h(fist_L), fit_h(fist_R)
fist_L.save(os.path.join(DBG, 'fist_L.png'))
fist_R.save(os.path.join(DBG, 'fist_R.png'))
print('fists', fist_L.size, fist_R.size)


# =====================================================================
# Torso: drop leftover chin in the collar opening, keep all the leather
# =====================================================================
def clean_torso(im):
    a = np.array(im).copy()
    h, w = a.shape[:2]
    # collar opening is the top-center metal (face leftover). Keep jacket brown
    # and the chest plate below the collar ring; punch face-like metal at the
    # very top center, leave a short neck overlap.
    yy, xx = np.mgrid[0:h, 0:w]
    cx = w / 2.0
    lum = a[..., :3].mean(2)
    sat = a[..., :3].max(2) - a[..., :3].min(2)
    # face leftover: light-ish metal in the top ~16% center, not dark leather
    collar = (yy < h * 0.18) & (np.abs(xx - cx) < w * 0.20)
    leather = (a[..., 0] > a[..., 2] + 10) & (lum < 115) & (a[..., 3] > 20)
    face = collar & (lum > 110) & (sat < 70) & (a[..., 3] > 20) & ~leather
    a[face, 3] = 0
    # very light fringe cleanup only (don't eat the jacket edge)
    a[a[..., 3] < 16, 3] = 0
    return crop_thr(Image.fromarray(a, 'RGBA'), 16)

torso = clean_torso(Image.open(os.path.join(OUT, 'torso.png')).convert('RGBA'))
torso.save(os.path.join(DBG, 'torso.png'))
print('torso', torso.size)


# =====================================================================
# Sole: underside of Tank's chunky metal boot, painted from boot pixels
# =====================================================================
def make_boot_sole(boot_im, side):
    boot = np.array(boot_im)
    ba = boot[..., 3] > 40
    px = boot[ba, :3].astype(np.float32)
    # light metal / rust like the visible boot (not a dark slab)
    light = px[px.mean(1) >= np.median(px.mean(1))]
    dark = px[px.mean(1) < np.median(px.mean(1))]
    mean = light.mean(0) if len(light) else px.mean(0)
    shade = dark.mean(0) if len(dark) else mean * 0.7
    rust = np.clip(mean * np.array([1.08, 0.82, 0.62]), 0, 255)
    ink = np.array([28, 22, 18], dtype=np.float32)
    W, H = 220, 340  # a bit smaller than v1's 240x403
    # Build a boot-footprint: wide rounded toe at top, slightly narrower heel
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    toe = [
        (W * 0.16, 10), (W * 0.84, 10),
        (W * 0.94, H * 0.18), (W * 0.93, H * 0.58),
        (W * 0.84, H - 12), (W * 0.16, H - 12),
        (W * 0.07, H * 0.58), (W * 0.06, H * 0.18),
    ]
    fill = tuple(int(c) for c in mean) + (255,)
    shade_c = tuple(int(c) for c in shade) + (255,)
    rust_c = tuple(int(c) for c in rust) + (255,)
    ink_c = tuple(int(c) for c in ink) + (255,)
    d.polygon(toe, fill=fill, outline=ink_c)
    # inner plate (slightly darker, like the boot's underside recess)
    inner = [(x + (W / 2 - x) * 0.18, y + (H / 2 - y) * 0.10) for x, y in toe]
    d.polygon(inner, outline=ink_c)
    # toe bumper (matches the thick front lip of his boot)
    d.rounded_rectangle((int(W * 0.18), 16, int(W * 0.82), int(H * 0.26)),
                        radius=18, outline=ink_c, width=3)
    # heel plate
    d.rectangle((int(W * 0.22), int(H * 0.68), int(W * 0.78), H - 22), outline=ink_c, width=2)
    # panel rivets around the edge, painted like his boot rivets
    for t in np.linspace(0, 1, 16, endpoint=False):
        ang = t * 2 * math.pi
        x = W / 2 + (W * 0.36) * math.cos(ang)
        y = H / 2 + (H * 0.42) * math.sin(ang)
        r = 5
        d.ellipse((x - r, y - r, x + r, y + r), fill=(55, 48, 40, 255), outline=ink_c)
        d.ellipse((x - r + 2, y - r + 1, x + r - 2, y + r - 2), fill=(130, 110, 90, 255))
    # stamp real boot rust/metal texture into the sole
    a = np.array(img).astype(np.float32)
    bh, bw = boot.shape[:2]
    # tile a scaled patch of the boot into the opaque region
    patch = cv2.resize(boot[..., :3], (W, H), interpolation=cv2.INTER_AREA).astype(np.float32)
    solid = a[..., 3] > 40
    # blend 45% of real boot texture so it matches his painted metal, not a flat icon
    a[solid, :3] = a[solid, :3] * 0.55 + patch[solid] * 0.45
    # rust blotches from a simple noise field
    rng = np.random.RandomState(11 + (0 if side == 'L' else 19))
    blot = np.zeros((H, W), np.float32)
    for _ in range(10):
        cx, cy = rng.randint(24, W - 24), rng.randint(24, H - 24)
        rad = rng.randint(14, 36)
        yy, xx = np.ogrid[:H, :W]
        blot += np.exp(-((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * rad * rad)) * rng.uniform(0.15, 0.4)
    use = solid & (blot > 0.16)
    a[use, :3] = a[use, :3] * (1 - np.clip(blot[use], 0, 0.4))[..., None] + rust * np.clip(blot[use], 0, 0.4)[..., None]
    im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA')
    # thin ink ring
    mask = im.split()[-1]
    ring = ImageChops.subtract(mask.filter(ImageFilter.MaxFilter(3)), mask)
    ov = np.zeros((H, W, 4), np.uint8)
    ov[..., :3] = ink.astype(np.uint8)
    ov[..., 3] = np.array(ring)
    im = Image.alpha_composite(im, Image.fromarray(ov, 'RGBA'))
    return crop_thr(im, 16)

boot_L_im = Image.open(os.path.join(OUT, 'boot_L.png')).convert('RGBA')
boot_R_im = Image.open(os.path.join(OUT, 'boot_R.png')).convert('RGBA')
sole_L = make_boot_sole(boot_L_im, 'L')
sole_R = make_boot_sole(boot_R_im, 'R')
print('soles', sole_L.size, sole_R.size)
sole_L.save(os.path.join(DBG, 'sole_L.png'))
sole_R.save(os.path.join(DBG, 'sole_R.png'))


# =====================================================================
# Place parts onto pivots. Body art stays on the skull-to-feet mapping
# so height is unchanged; only the PELVIS/ROOT rotation point moves up
# next to the torso pivot (the fall-attachment fix).
# =====================================================================
# Existing body parts already live at art-space positions from v1 (skull 22 / feet 1231).
# Recompute abs positions: if we only change the pivot, keep abs the same.

meta = json.load(open(os.path.join(TANK, 'parts_meta.json')))
# v1 abs from current files + old skin
old_skin = json.load(open(os.path.join(TANK, 'skin.json')))

def abs_of(name, im=None):
    """Current art-space top-left of a v1 part (pivot + rel)."""
    p = old_skin['parts'][name]
    # old pivots
    op = old_skin['pivots'].get(name)
    if op is None:
        return 0, 0
    return op[0] + p['x'], op[1] + p['y']


placed = {}  # name -> (im, abs_x, abs_y)
skin_parts = {}
new_meta = {'source': 'tank-arms-out.jpg + page fist 9 (v2)', 'size': [ART_W, ART_H], 'parts': {}}


def place_abs(name, im, abs_x, abs_y, pivot_name=None, scrub=True):
    pn = pivot_name or name
    im = save_png(im, os.path.join(OUT, f'{name}.png'), scrub=scrub)
    w, h = im.size
    px, py = PIV[pn]
    new_meta['parts'][name] = {'x': int(round(abs_x)), 'y': int(round(abs_y)), 'w': w, 'h': h}
    skin_parts[name] = {
        'image': f'parts/{name}.png',
        'x': int(round(abs_x - px)),
        'y': int(round(abs_y - py)),
        'w': w, 'h': h,
    }
    placed[name] = (im, int(round(abs_x)), int(round(abs_y)))
    print(f'place {name}: {w}x{h} abs=({abs_x:.0f},{abs_y:.0f}) rel=({skin_parts[name]["x"]},{skin_parts[name]["y"]}) pivot={PIV[pn]}')
    return im


def place_attach(name, im, fx, fy):
    im = crop_thr(im, 16)
    w, h = im.size
    px, py = PIV[name]
    return place_abs(name, im, px - fx * w, py - fy * h)


# Body parts: keep art-space positions from parts_meta (skull y=22, feet 1231).
# Re-runs must not drift the torso after the first chin clean.
body_abs = {}
if os.path.exists(os.path.join(TANK, 'parts_meta.json')):
    pm = json.load(open(os.path.join(TANK, 'parts_meta.json')))
    for n, m in pm.get('parts', {}).items():
        if 'x' in m and 'y' in m and not m.get('overlay'):
            body_abs[n] = (m['x'], m['y'])

def body_xy(n):
    if n in body_abs:
        return body_abs[n]
    return abs_of(n)

# Body abs from the v1 cut (skull 22 / feet 1231). Do not re-scrub these PNGs.
V1_ABS = {
    'head': (119, -95), 'pelvis': (38, 561),
    'thigh_L': (48, 691), 'thigh_R': (322, 669),
    'shin_L': (15, 868), 'shin_R': (338, 858),
    'boot_L': (-26, 1065), 'boot_R': (340, 1075),
    'torso': (35, 147),
}
for n in ('head', 'pelvis', 'thigh_L', 'thigh_R', 'shin_L', 'shin_R', 'boot_L', 'boot_R'):
    im = Image.open(os.path.join(OUT, f'{n}.png')).convert('RGBA')
    ax, ay = V1_ABS[n]
    place_abs(n, im, ax, ay, scrub=False)

# Torso: chin leftover stripped; keep the v1 hem / center. Don't run the
# aggressive sleeve halo scrub (it eats jacket edge).
# v1 torso was 463x550 at (35,147) after the first mild clean; use that.
# Re-clean is applied to the v1 file we just restored.
tw, th = torso.size
# v1 original torso before any v2 clean was whatever is on HEAD; after mild
# clean_torso it should stay ~463x550. Keep hem lined up with (35,147)+(0,550).
V1_TORSO = (35, 147, 463, 550)
dx = (V1_TORSO[2] - tw) / 2.0
dy = max(0, V1_TORSO[3] - th)
place_abs('torso', torso, V1_TORSO[0] + dx, V1_TORSO[1] + dy, scrub=False)

# Arms: attach to GAVIN arm pivots so punch/fall rotations stay on the skeleton.
# Upper: shoulder at top (fy ~ 0.10). Forearm: elbow at bottom (fy ~ 0.88), wrist at top.
place_attach('upperarm_L', sleeves['upperarm_L'], 0.55, 0.10)
place_attach('upperarm_R', sleeves['upperarm_R'], 0.45, 0.10)
place_attach('forearm_L', sleeves['forearm_L'], 0.50, 0.88)
place_attach('forearm_R', sleeves['forearm_R'], 0.50, 0.88)
place_attach('fist_L', fist_L, 0.48, 0.80)
place_attach('fist_R', fist_R, 0.52, 0.80)

# Soles: proper robot-foot underside, no heavy drop shadow (that was the dark slab).
for sd, im in (('L', sole_L), ('R', sole_R)):
    im = save_png(im, os.path.join(OUT, f'sole_{sd}.png'))
    w, h = im.size
    sc = 0.34  # smaller than 0.42 so it reads as a foot, not a pelvis shield
    skin_parts[f'sole_{sd}'] = {
        'image': f'parts/sole_{sd}.png',
        'bone': f'boot_{sd}',
        'scale': sc,
        'x': -w * sc / 2,
        'y': -h * sc * 0.80,
        'shadow': False,
        'w': w, 'h': h,
    }
    new_meta['parts'][f'sole_{sd}'] = {'x': 0, 'y': 0, 'w': w, 'h': h, 'overlay': True}
    print(f'sole_{sd}: {w}x{h} scale={sc} shadow=False')

# Overlap reports
for sd in ('L', 'R'):
    th = placed[f'thigh_{sd}']
    sh = placed[f'shin_{sd}']
    bt = placed[f'boot_{sd}']
    print(f"  overlap thigh/shin_{sd}={(th[2]+th[0].size[1]) - sh[2]}  shin/boot={ (sh[2]+sh[0].size[1]) - bt[2] }")
torso_im, tx, ty = placed['torso']
pel_im, px, py = placed['pelvis']
print(f'  overlap torso/pelvis={(ty + torso_im.size[1]) - py}')


# Write skin
PIV_I = {k: [int(round(v[0])), int(round(v[1]))] for k, v in PIV.items()}
IK_I = {k: [int(round(v[0])), int(round(v[1]))] for k, v in IK.items()}
# recompute rel against int pivots
for n, p in list(skin_parts.items()):
    if n.startswith('sole'):
        continue
    px, py = PIV_I[n]
    m = new_meta['parts'][n]
    p['x'] = int(m['x'] - px)
    p['y'] = int(m['y'] - py)

skin = {
    'fighter': 'tank',
    'skeleton': 'bvh-punchout-front-v1',
    'about': (
        'Tank v2: T-pose cut, leather jacket sleeves shoulder-to-wrist, pelvis/torso '
        'pivots match the shared skeleton so fall/getup stay attached. Riveted fists. '
        'Boot-sole from his foot metal (no dark slab). scale 1.17 = 7 ft at the skull.'
    ),
    'artSize': [ART_W, ART_H],
    'scale': SCALE_ONSCREEN,
    'groundY': GROUND_Y,
    'pivots': PIV_I,
    'ikTargets': IK_I,
    'parts': skin_parts,
}
json.dump(skin, open(os.path.join(TANK, 'skin.json'), 'w'), indent=1)
json.dump(new_meta, open(os.path.join(TANK, 'parts_meta.json'), 'w'), indent=1)

# Assemble (rest pose, no animation)
canvas = Image.new('RGBA', (ART_W, ART_H + 120), (26, 24, 32, 255))
YOFF = 100
order = ['pelvis', 'thigh_L', 'thigh_R', 'shin_L', 'shin_R', 'boot_L', 'boot_R',
         'torso', 'upperarm_L', 'upperarm_R', 'forearm_L', 'forearm_R', 'fist_L', 'fist_R', 'head']
d = ImageDraw.Draw(canvas)
for n in order:
    im, x, y = placed[n]
    canvas.alpha_composite(im, (x, y + YOFF))
for n, (px, py) in PIV_I.items():
    d.ellipse((px - 2, py + YOFF - 2, px + 2, py + YOFF + 2), outline=(255, 80, 80, 255))
d.line((0, int(SKULL_Y_ART) + YOFF, ART_W, int(SKULL_Y_ART) + YOFF), fill=(80, 200, 80, 180))
d.line((0, GROUND_Y + YOFF, ART_W, GROUND_Y + YOFF), fill=(80, 200, 80, 180))
canvas.convert('RGB').save(os.path.join(TANK, 'assemble_preview.jpg'), quality=85, optimize=True)
canvas.convert('RGB').save(os.path.join(DBG, 'assemble.png'), quality=92)

bytes_total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT) if f.endswith('.png'))
folder = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(TANK) for f in fs)
notes = [
    'Tank v2: leather jacket reads, fall/getup stay attached, kick sole is his boot underside. Local, $0.',
    f'src_scale={SRC_S:.4f}  skull_src={SKULL_TOP} feet_src={FEET_BOTTOM} fedora_src={FEDORA_TOP}',
    f'art skull_y={SKULL_Y_ART} groundY={GROUND_Y} skull_to_feet={GROUND_Y-SKULL_Y_ART} on-screen scale={SCALE_ONSCREEN} (7 ft)',
    'Pivots: pelvis/torso/arms use the shared Gavin skeleton (torso-pelvis 30 px apart) so',
    'shared fall/getup rotations do not tear the body. Head pivot is at Tank\'s neck so the',
    'skull top (under the fedora, not the hat) stays on the 7 ft line.',
    'Sleeves recut from the T-pose as leather tubes, shoulder-to-elbow and elbow-to-wrist cuff,',
    'smooth alpha (no black end-caps). Fists are riveted panel 9, mirrored for the right hand.',
    'Front-kick sole is painted from his boot metal (smaller, no drop shadow) so it reads as a foot.',
    f'parts_bytes={bytes_total}',
    f'folder_bytes={folder} ({folder/1024/1024:.2f} MB)',
]
for n, m in new_meta['parts'].items():
    notes.append(f"{n}: -> ({m['w']}, {m['h']})")
open(os.path.join(TANK, 'BUILD_NOTES.txt'), 'w').write('\n'.join(notes) + '\n')
print('parts_bytes', bytes_total, 'folder', folder, 'over2MB' if folder > 2_000_000 else 'ok')
print('pivots', PIV_I)
print('done')
