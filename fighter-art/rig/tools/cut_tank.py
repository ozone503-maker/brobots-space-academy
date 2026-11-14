#!/usr/bin/env python3
"""Cut Tank's rig skin from the T-pose drawing (plus page fists).

Local only, $0, no image gen.

Sources:
  /workspace/tank_parts/tank-arms-out.jpg   primary (T-pose, consistent lighting)
  /workspace/tank_parts/tank-parts-page-v1.jpg  panels 9-10 riveted fists only

Output: fighter-art/rig/tank/parts/*.png + parts_meta.json + skin.json
        + assemble_preview.jpg + BUILD_NOTES.txt

Height: skull top (under the fedora) to feet maps to 1209 art-px, the same
human reference as Gavin. skin.scale = 1.17 makes him 7 ft on screen.
"""
from __future__ import annotations
import json, os, math
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageChops

HERE = os.path.dirname(os.path.abspath(__file__))
TANK = os.path.abspath(os.path.join(HERE, '..', 'tank'))
OUT = os.path.join(TANK, 'parts')
os.makedirs(OUT, exist_ok=True)
DBG = '/tmp/tank_build'
os.makedirs(DBG, exist_ok=True)

TPOSE_PATH = '/workspace/tank_parts/tank-arms-out.jpg'
PAGE_PATH = '/workspace/tank_parts/tank-parts-page-v1.jpg'
FULL_PATH = os.path.join(HERE, '..', '..', 'tank', 'tank_full.png')

ART_W, ART_H = 534, 1265
GROUND_Y = 1231
SKULL_TO_FEET_ART = 1209
SKULL_Y_ART = GROUND_Y - SKULL_TO_FEET_ART  # 22
SCALE_ONSCREEN = 1.17  # 7 ft vs 6 ft human

# --- T-pose landmarks (source px) ---
CX = 509
SKULL_TOP = 92          # top of metal skull under the fedora band
FEDORA_TOP = 11
FEET_BOTTOM = 974
SRC_S = SKULL_TO_FEET_ART / (FEET_BOTTOM - SKULL_TOP)  # ~1.3707

# Joints in source
SHOULDER = {'L': (385, 250), 'R': (633, 250)}  # armhole joints, not outer jacket corners
ELBOW    = {'L': (238, 262), 'R': (780, 262)}
WRIST    = {'L': (130, 262), 'R': (895, 262)}
HIP      = {'L': (415, 600), 'R': (600, 600)}
KNEE     = {'L': (410, 725), 'R': (610, 725)}
ANKLE    = {'L': (390, 872), 'R': (625, 872)}
PELVIS_SRC = (509, 590)
WAIST_SRC  = (509, 520)  # jacket hem / torso-pelvis
NECK_SRC   = (509, 188)
CHIN_SRC   = (509, 180)

GAVIN = json.load(open(os.path.join(HERE, '..', 'gavin', 'skin.json')))


def to_art(sx, sy):
    ax = (sx - CX) * SRC_S + ART_W / 2
    ay = (sy - SKULL_TOP) * SRC_S + SKULL_Y_ART
    return float(ax), float(ay)


def remove_white_bg(rgb, lo=10, hi=34):
    """Soft alpha from a white background + color decontamination."""
    rgb = rgb.astype(np.float32)
    dist = np.sqrt(((255.0 - rgb) ** 2).sum(2))
    alpha = np.clip((dist - lo) / max(1.0, hi - lo), 0, 1)
    a3 = np.maximum(alpha, 1e-4)[..., None]
    fg = np.clip((rgb - (1.0 - alpha)[..., None] * 255.0) / a3, 0, 255)
    out = np.dstack([fg, alpha * 255.0])
    near = (fg.mean(2) > 248) & ((fg.max(2) - fg.min(2)) < 8)
    out[near, 3] = 0
    return np.clip(out, 0, 255).astype(np.uint8)


def crop_thr(im, thr=20):
    a = np.array(im)
    a[..., 3] = np.where(a[..., 3] < thr, 0, a[..., 3])
    im = Image.fromarray(a, 'RGBA')
    b = im.getbbox()
    return im.crop(b) if b else im


def sharpen(im, amt=1.25):
    rgb = ImageEnhance.Sharpness(im.convert('RGB')).enhance(amt)
    return Image.merge('RGBA', (*rgb.split(), im.split()[-1]))


def poly_mask(pts, W, H):
    m = Image.new('L', (W, H), 0)
    ImageDraw.Draw(m).polygon([tuple(map(int, p)) for p in pts], fill=255)
    return np.array(m) > 127


def soft_poly(pts, W, H):
    m = Image.new('L', (W * 4, H * 4), 0)
    ImageDraw.Draw(m).polygon([(int(x * 4), int(y * 4)) for x, y in pts], fill=255)
    m = m.resize((W, H), Image.LANCZOS)
    return np.array(m).astype(np.float32) / 255.0


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


def largest(mask):
    n, lab, st, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), 8)
    if n <= 1:
        return mask
    i = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    return lab == i


def drop_islands(alpha, min_frac=0.012):
    n, lab, st, _ = cv2.connectedComponentsWithStats((alpha > 0.08).astype(np.uint8), 8)
    if n > 2:
        big = st[1:, 4].max()
        for i in range(1, n):
            if st[i, 4] < min_frac * big:
                alpha[lab == i] = 0
    return alpha


def clean_halo(arr, fringe=2.0):
    """Kill white fringes and un-premultiply leftover white at the edge."""
    a = arr.astype(np.float32)
    alpha = a[..., 3] / 255.0
    rgb = a[..., :3]
    lum = rgb.mean(2)
    sat = rgb.max(2) - rgb.min(2)
    # drop almost-white, low-sat, weak-alpha pixels
    bad = (alpha > 0) & (alpha < 0.92) & (lum > 220) & (sat < 22)
    a[bad, 3] = 0
    alpha = a[..., 3] / 255.0
    # decontaminate remaining partial-alpha edges (remove white bleed)
    m = (alpha > 0.02) & (alpha < 0.97)
    if m.any():
        # estimate bg white contribution
        fg = np.clip((rgb[m] - (1.0 - alpha[m])[..., None] * 255.0) / np.maximum(alpha[m][..., None], 0.05), 0, 255)
        a[m, :3] = fg
        # if the decontaminated pixel is still almost white and not a real highlight
        lum2 = fg.mean(1)
        sat2 = fg.max(1) - fg.min(1)
        still = (lum2 > 240) & (sat2 < 12)
        idx = np.where(m)
        a[idx[0][still], idx[1][still], 3] = 0
    # erode a hair of ultra-weak alpha
    a[a[..., 3] < 18, 3] = 0
    return np.clip(a, 0, 255).astype(np.uint8)


def round_ends(im, top=0.12, bot=0.10, min_half=0.36):
    a = np.array(im).astype(np.float32)
    h, w = a.shape[:2]
    xs = np.arange(w, dtype=np.float32)
    cx = (w - 1) / 2
    n = max(6, int(h * top))
    for y in range(n):
        t = (y + 1) / n
        half = w * (min_half + (0.50 - min_half) * t)
        a[y, ..., 3] *= np.clip((half - np.abs(xs - cx)) / max(1, half * 0.22), 0, 1)
    n = max(6, int(h * bot))
    for i in range(n):
        y = h - 1 - i
        t = (i + 1) / n
        half = w * (min_half + (0.50 - min_half) * t)
        a[y, ..., 3] *= np.clip((half - np.abs(xs - cx)) / max(1, half * 0.22), 0, 1)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA')


def extend_end(im, px, side='both', min_half=0.32):
    """Clone-extend along the long axis for joint overlap, rounded caps."""
    a = np.array(im)
    if side in ('top', 'both') and px > 0:
        h, w = a.shape[:2]
        cap = np.zeros((px, w, 4), np.uint8)
        src = a[: min(20, h)]
        for i in range(px):
            cap[px - 1 - i] = src[min(i, src.shape[0] - 1)]
        xs = np.arange(w)
        cx = (w - 1) / 2.0
        for i in range(px):
            t = (i + 1) / px
            half = w * (min_half + 0.18 * t)
            mask = np.clip((half - np.abs(xs - cx)) / max(1, half * 0.25), 0, 1)
            cap[i, ..., 3] = (cap[i, ..., 3].astype(np.float32) * mask * t).astype(np.uint8)
        a = np.vstack([cap, a])
    if side in ('bot', 'both') and px > 0:
        h, w = a.shape[:2]
        cap = np.zeros((px, w, 4), np.uint8)
        src = a[max(0, h - 20):]
        for i in range(px):
            cap[i] = src[max(0, src.shape[0] - 1 - i)]
        xs = np.arange(w)
        cx = (w - 1) / 2.0
        for i in range(px):
            t = (i + 1) / px
            half = w * (min_half + 0.18 * t)
            mask = np.clip((half - np.abs(xs - cx)) / max(1, half * 0.25), 0, 1)
            cap[px - 1 - i, ..., 3] = (cap[px - 1 - i, ..., 3].astype(np.float32) * mask * t).astype(np.uint8)
        a = np.vstack([a, cap])
    return Image.fromarray(a, 'RGBA')


def disk_cap(im, y, r, side='top'):
    """Ensure a circular cap of existing pixels around (cx, y). Used at knees."""
    a = np.array(im).astype(np.float32)
    h, w = a.shape[:2]
    cx = (w - 1) / 2.0
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.hypot(xx - cx, yy - y)
    # keep pixels already present; boost alpha inside the disc near the joint
    inside = d <= r
    # don't invent color; just don't cut the disc off
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA')


def color_shift(im, target_mean, strength=0.40, pred=None):
    a = np.array(im).astype(np.float32)
    solid = a[..., 3] > 40
    use = solid if pred is None else (solid & pred(a))
    if not use.any():
        return im
    cur = a[use, :3].mean(0)
    shift = (np.array(target_mean, dtype=np.float32) - cur) * strength
    a[..., :3] = np.clip(a[..., :3] + shift, 0, 255)
    return Image.fromarray(a.astype(np.uint8), 'RGBA')


def save_png(im, path):
    im = crop_thr(Image.fromarray(clean_halo(np.array(im)), 'RGBA'), 16)
    im.save(path, optimize=True, compress_level=9)
    return im


# =====================================================================
# Load T-pose and build RGBA
# =====================================================================
tpose_rgb = np.array(Image.open(TPOSE_PATH).convert('RGB'))
H, W = tpose_rgb.shape[:2]
rgba0 = remove_white_bg(tpose_rgb, lo=9, hi=32)
# keep a slightly tighter silhouette for ownership, softer for composite
A = rgba0[..., 3].astype(np.float32) / 255.0
RGB = rgba0[..., :3].astype(np.float32) / 255.0
solid = A > 0.08
yy, xx = np.mgrid[0:H, 0:W]

Image.fromarray(rgba0, 'RGBA').save(os.path.join(DBG, 'tpose_rgba.png'))
print('T-pose', W, H, 'solid', int(solid.sum()), 'SRC_S', round(SRC_S, 4))
print('art map skull', to_art(CX, SKULL_TOP), 'feet', to_art(CX, FEET_BOTTOM),
      'fedora', to_art(CX, FEDORA_TOP))


# =====================================================================
# Region polygons (source px)
# =====================================================================
R = {}
# Head + fedora + ear caps, cut just under the jaw (overlap the collar)
R['head'] = [
    (500, 6), (545, 10), (575, 30), (590, 55), (605, 80), (615, 95),
    (610, 115), (620, 135), (625, 155), (615, 175), (590, 195),
    (560, 205), (520, 210), (480, 205), (445, 195), (425, 175),
    (415, 155), (418, 130), (430, 110), (405, 100), (400, 80),
    (415, 55), (440, 25), (470, 10),
]
# Sleeveless torso: jacket body + visible chest/belly, armholes, hem + straps
R['torso'] = [
    # collar / neck
    (460, 185), (509, 175), (555, 185), (575, 200), (590, 215),
    # right shoulder / armhole (stay on the jacket body, not the sleeve)
    (655, 215), (675, 230), (680, 255), (665, 290), (650, 330),
    (640, 400), (635, 470), (630, 510),
    # right hem + hanging strap
    (655, 525), (660, 560), (648, 575), (635, 555), (625, 525),
    # hem center
    (560, 530), (509, 535), (460, 530),
    # left hem + hanging strap
    (400, 525), (390, 555), (375, 575), (365, 560), (370, 525),
    # left side up to armhole
    (390, 510), (385, 470), (380, 400), (375, 330), (360, 290),
    (345, 255), (350, 230), (370, 215),
    # left shoulder back to collar
    (410, 210), (440, 195),
]
# Pelvis: metal pelvic armor under the jacket, down to crotch, hip caps
R['pelvis'] = [
    (390, 500), (509, 495), (630, 500), (650, 530), (655, 570),
    (640, 610), (600, 640), (560, 655), (509, 662), (458, 655),
    (415, 640), (375, 610), (365, 570), (370, 530),
]
# Thighs hip-to-knee (overlap pelvis and knee disc)
R['thigh_L'] = [
    (370, 560), (500, 555), (505, 600), (500, 650), (490, 700),
    (475, 760), (450, 800), (400, 805), (355, 790), (340, 740),
    (345, 680), (355, 620),
]
R['thigh_R'] = [
    (515, 555), (650, 560), (665, 620), (675, 680), (680, 740),
    (670, 790), (620, 805), (570, 800), (545, 760), (530, 700),
    (520, 650), (515, 600),
]
# Shins knee-to-ankle (overlap knee disc and boot)
R['shin_L'] = [
    (350, 700), (470, 700), (475, 760), (470, 820), (465, 870),
    (450, 910), (400, 920), (350, 910), (335, 860), (335, 800),
    (340, 740),
]
R['shin_R'] = [
    (550, 700), (670, 700), (680, 740), (685, 800), (685, 860),
    (670, 910), (620, 920), (570, 910), (550, 870), (545, 820),
    (545, 760),
]
# Boots, pivot at ankle, include sole and heel
R['boot_L'] = [
    (295, 850), (455, 850), (465, 880), (460, 930), (450, 965),
    (400, 978), (330, 978), (298, 960), (295, 910),
]
R['boot_R'] = [
    (560, 850), (720, 850), (725, 910), (722, 960), (690, 978),
    (620, 978), (570, 965), (555, 930), (555, 880),
]
# Upper arms in T-pose (horizontal). Will be rotated later.
# L: shoulder (right) to elbow (left). Generous vertical band + overlap.
R['upperarm_L'] = [
    # elbow (left) to armhole (right); stay on the sleeve, not the jacket body
    (220, 215), (250, 210), (330, 212), (360, 220), (372, 240),
    (372, 280), (360, 305), (330, 318), (250, 315), (220, 300),
    (212, 260),
]
R['upperarm_R'] = [
    (652, 220), (670, 212), (750, 210), (800, 215), (808, 260),
    (800, 300), (770, 315), (690, 318), (660, 305), (648, 280),
    (648, 240),
]
# Forearms: elbow to wrist/cuff (no fist)
R['forearm_L'] = [
    (125, 220), (160, 215), (220, 212), (250, 220), (255, 255),
    (248, 300), (220, 318), (160, 320), (130, 310), (118, 270),
    (120, 235),
]
R['forearm_R'] = [
    (770, 220), (800, 212), (860, 215), (895, 220), (905, 235),
    (908, 270), (895, 310), (860, 320), (800, 318), (772, 300),
    (765, 255),
]

# We do NOT own T-pose fists (page fists replace them).
PRIO = [
    'head',
    'upperarm_L', 'upperarm_R', 'forearm_L', 'forearm_R',
    'torso', 'pelvis',
    'thigh_L', 'thigh_R', 'shin_L', 'shin_R', 'boot_L', 'boot_R',
]
FRONT = {
    'head': [],
    'forearm_L': [], 'forearm_R': [],
    'upperarm_L': ['forearm_L'], 'upperarm_R': ['forearm_R'],
    'torso': ['head', 'upperarm_L', 'upperarm_R'],
    'pelvis': ['torso'],
    'thigh_L': ['pelvis', 'torso'], 'thigh_R': ['pelvis', 'torso'],
    'shin_L': ['thigh_L'], 'shin_R': ['thigh_R'],
    'boot_L': ['shin_L'], 'boot_R': ['shin_R'],
}
FEATHER = {
    'head': 4,
    'upperarm_L': 3, 'upperarm_R': 3, 'forearm_L': 3, 'forearm_R': 3,
    'torso': 3, 'pelvis': 5,
    'thigh_L': 5, 'thigh_R': 5, 'shin_L': 4, 'shin_R': 4,
    'boot_L': 3, 'boot_R': 3,
}
# Invented pixels (only where the T-pose cannot provide texture):
# torso armholes (sleeves were cut away) and small hip/knee caps already
# covered by dilation of original pixels. Keep these tiny and inside the body.
FILL = {
    'torso': [
        # left armhole, inside the jacket (do not invent an outward sleeve)
        [(368, 228), (400, 228), (408, 255), (402, 300), (378, 312), (368, 275)],
        # right armhole, inside the jacket
        [(616, 228), (648, 228), (648, 275), (638, 312), (614, 300), (608, 255)],
    ],
}
TEXOFF = {
    'torso': [(0, 80), (0, 140), (40, 100), (-40, 100), (0, 40)],
    'pelvis': [(0, 50), (0, 80), (30, 60), (-30, 60)],
    'upperarm_L': [(40, 0), (70, 0), (20, 0)],
    'upperarm_R': [(-40, 0), (-70, 0), (-20, 0)],
    'forearm_L': [(40, 0), (60, 0)],
    'forearm_R': [(-40, 0), (-60, 0)],
    'thigh_L': [(0, 70), (0, 110), (15, 90)],
    'thigh_R': [(0, 70), (0, 110), (-15, 90)],
    'shin_L': [(0, 50), (0, 80)],
    'shin_R': [(0, 50), (0, 80)],
    'boot_L': [(0, 30), (0, 50)],
    'boot_R': [(0, 30), (0, 50)],
    'head': [(0, -20), (0, 20)],
}

# Ownership
own = {}
taken = np.zeros((H, W), bool)
for n in PRIO:
    m = poly_mask(R[n], W, H) & solid & ~taken
    own[n] = m
    taken |= m
left = solid & ~taken
# Don't give leftover fist pixels to a body part (they'd smear onto sleeves)
# Fist boxes:
fist_box = ((xx < 135) | (xx > 890)) & (yy > 200) & (yy < 330) & solid
left = left & ~fist_box
print('unowned solid px (excl fists):', int(left.sum()), 'fist leftovers', int((solid & ~taken & fist_box).sum()))
if left.any():
    best = np.full((H, W), 1e9, np.float32)
    lab = np.full((H, W), -1, np.int32)
    for i, n in enumerate(PRIO):
        d = cv2.distanceTransform((~own[n]).astype(np.uint8), cv2.DIST_L2, 3)
        upd = d < best
        best[upd] = d[upd]
        lab[upd] = i
    for i, n in enumerate(PRIO):
        own[n] |= left & (lab == i)

# Round knees: thigh keeps only a disc around the knee below the knee line
KR = 55
for sd in ('L', 'R'):
    kx, ky = KNEE[sd]
    outside = (yy > ky) & (np.hypot(xx - kx, yy - ky) > KR)
    mv = own['thigh_' + sd] & outside
    own['thigh_' + sd] &= ~mv
    own['shin_' + sd] |= mv

# Keep the torso sleeveless: no sleeve stubs, no face on the jacket
# 1) jacket-body pixels that leaked onto the upper arms go back to the torso
jkt_L = own['upperarm_L'] & (xx > 378)
jkt_R = own['upperarm_R'] & (xx < 642)
own['upperarm_L'] &= ~jkt_L
own['upperarm_R'] &= ~jkt_R
own['torso'] |= jkt_L | jkt_R
# 2) sleeve pixels that leaked onto the torso go back to the upper arms
arm_band = (yy >= 200) & (yy <= 330)
sleeve_L = own['torso'] & arm_band & (xx < 368)
sleeve_R = own['torso'] & arm_band & (xx > 652)
own['torso'] &= ~(sleeve_L | sleeve_R)
own['upperarm_L'] |= sleeve_L
own['upperarm_R'] |= sleeve_R
# 3) face / brim on the torso belongs to the head; keep a short neck overlap
face_on_torso = own['torso'] & (yy < 176)
own['torso'] &= ~face_on_torso
own['head'] |= face_on_torso & solid
# 4) metal chin/neck showing through the open collar belongs to the head
collar = own['torso'] & (yy < 210) & (np.abs(xx - CX) < 80)
metal_face = collar & (RGB.mean(2) > 0.30)
own['torso'] &= ~metal_face
own['head'] |= metal_face

# Debug ownership map
cmap = {
    'head': (220, 80, 80), 'torso': (80, 80, 200), 'pelvis': (180, 80, 200),
    'upperarm_L': (200, 140, 40), 'upperarm_R': (200, 140, 40),
    'forearm_L': (220, 180, 60), 'forearm_R': (220, 180, 60),
    'thigh_L': (40, 160, 80), 'thigh_R': (40, 160, 80),
    'shin_L': (40, 200, 160), 'shin_R': (40, 200, 160),
    'boot_L': (80, 80, 80), 'boot_R': (80, 80, 80),
}
vis = tpose_rgb.copy()
for n, c in cmap.items():
    vis[own[n]] = (vis[own[n]] * 0.45 + np.array(c) * 0.55).astype(np.uint8)
Image.fromarray(vis).save(os.path.join(DBG, 'ownership.png'))

# High-pass for texture clone
hp = RGB - cv2.GaussianBlur(RGB, (0, 0), 3.0)
_l = RGB.mean(axis=2)
INK = cv2.dilate((_l < 0.10).astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)

crops = {}
# Overlap dilation (px) into neighboring parts — keep ORIGINAL T-pose pixels.
# This is how joints stay seamless when bones rotate, without inventing white.
OVERLAP = {
    'head': 10, 'torso': 8, 'pelvis': 14,
    'upperarm_L': 12, 'upperarm_R': 12, 'forearm_L': 12, 'forearm_R': 12,
    'thigh_L': 16, 'thigh_R': 16, 'shin_L': 16, 'shin_R': 16,
    'boot_L': 12, 'boot_R': 12,
}

def extract_part(n):
    core = own[n]
    # Dilate into other solid pixels (other parts) for joint overlap, keep src color
    k = OVERLAP.get(n, 8)
    dil = cv2.dilate(core.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k * 2 + 1, k * 2 + 1))).astype(bool)
    overlap = dil & solid & ~core
    # Don't let the torso grow sleeves or a second face; don't let pelvis grow jacket straps
    if n == 'torso':
        overlap &= ~(own.get('upperarm_L', False) | own.get('upperarm_R', False)
                     | own.get('forearm_L', False) | own.get('forearm_R', False))
        overlap &= ~(yy < 176)
    if n == 'pelvis':
        # keep overlap up into the jacket hem (center), not the hanging straps
        overlap &= ~((xx < 390) | (xx > 630))
    if n == 'head':
        # a little neck only, not a slab of jacket
        overlap &= (yy < 210) & (np.abs(xx - CX) < 70)
    # Invented pixels: FILL polygons, but only where we do not already have source
    fill = np.zeros((H, W), np.float32)
    if n in FILL:
        raw = FILL[n]
        # list of polygons or a single polygon
        if raw and isinstance(raw[0], list) and raw[0] and isinstance(raw[0][0], (list, tuple)):
            polys = raw
        else:
            polys = [raw]
        fill = np.max([soft_poly(p, W, H) for p in polys], axis=0)
    invent = (fill > 0.4) & ~core & ~overlap
    # Colors: original everywhere we have source
    color = RGB.copy()
    known = (core | overlap) & (A > 0.25)
    # Invent: clone from known core of this part, fallback median color
    if invent.any() and core.any():
        srcm = core & (A > 0.5) & ~INK
        if not srcm.any():
            srcm = core & (A > 0.5)
        med = RGB[srcm].mean(0) if srcm.any() else RGB[core].mean(0)
        ys, xs = np.nonzero(invent)
        got = np.zeros(len(xs), bool)
        # try texture offsets first, then nearest known
        for dx, dy in TEXOFF.get(n, [(0, 40), (0, -40), (30, 0), (-30, 0)]):
            sx = np.clip(xs + dx, 0, W - 1)
            sy = np.clip(ys + dy, 0, H - 1)
            ok = srcm[sy, sx] & ~got
            color[ys[ok], xs[ok]] = RGB[sy[ok], sx[ok]]
            got[ok] = True
        # leftover: inpaint from known via push-pull, then reject white
        if (~got).any():
            base = pushpull(RGB, known)
            rest = ~got
            cand = base[ys[rest], xs[rest]]
            # if inpaint went white/pale, use median part color
            lum = cand.mean(1)
            sat = cand.max(1) - cand.min(1)
            bad = (lum > 0.82) & (sat < 0.12)
            cand[bad] = med
            color[ys[rest], xs[rest]] = cand
        # never leave invented pixels near-white
        inv_rgb = color[invent]
        lum = inv_rgb.mean(1)
        sat = inv_rgb.max(1) - inv_rgb.min(1)
        bad = (lum > 0.82) & (sat < 0.12)
        if bad.any():
            tmp = color[invent]
            tmp[bad] = med
            color[invent] = tmp
    # Alpha: full on core+overlap+invent, feather only into the background
    sd = sdist(core | overlap | invent)
    f = max(1.5, FEATHER[n] * 0.7)
    alpha = np.clip((sd + f) / (2.0 * f), 0, 1)
    alpha[core | overlap] = 1.0
    alpha[invent] = np.maximum(alpha[invent], fill[invent] if n in FILL else 1.0)
    alpha[alpha < 0.06] = 0
    # do not keep alpha on empty white background far from the part
    alpha[~(core | overlap | invent) & (A < 0.08) & (sd < -f)] = 0
    alpha = drop_islands(alpha)
    out = np.dstack([color, alpha])
    out = (np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8)
    out = clean_halo(out)
    ys2, xs2 = np.nonzero(out[..., 3] > 16)
    if len(xs2) < 10:
        print('EMPTY', n)
        return None
    x0, x1 = int(xs2.min()), int(xs2.max() + 1)
    y0, y1 = int(ys2.min()), int(ys2.max() + 1)
    x0, y0 = max(0, x0 - 1), max(0, y0 - 1)
    x1, y1 = min(W, x1 + 1), min(H, y1 + 1)
    crop = out[y0:y1, x0:x1]
    # final halo clean on the tight crop
    crop = clean_halo(crop)
    # trim again
    ys3, xs3 = np.nonzero(crop[..., 3] > 16)
    if len(xs3) >= 10:
        x0b, x1b = int(xs3.min()), int(xs3.max() + 1)
        y0b, y1b = int(ys3.min()), int(ys3.max() + 1)
        crop = crop[y0b:y1b, x0b:x1b]
        x0, y0 = x0 + x0b, y0 + y0b
        x1, y1 = x0 + crop.shape[1], y0 + crop.shape[0]
    return {'img': crop, 'x0': x0, 'y0': y0, 'x1': x1, 'y1': y1}

for n in PRIO:
    c = extract_part(n)
    if c is None:
        continue
    crops[n] = c
    Image.fromarray(c['img'], 'RGBA').save(os.path.join(DBG, f'crop_{n}.png'))
    print(n, 'src', c['x0'], c['y0'], c['x1'] - c['x0'], c['y1'] - c['y0'])


# =====================================================================
# Rotate arm parts from T-pose (horizontal) to guard orientation
# Upper: shoulder at TOP, elbow at BOTTOM
# Forearm: elbow at BOTTOM, wrist at TOP  (fists sit above the elbow)
# L (points left):  upper +90 CCW, forearm -90 CW
# R (points right): upper -90 CW,  forearm +90 CCW
# =====================================================================
ARM_ROT = {
    'upperarm_L': 90,
    'upperarm_R': -90,
    'forearm_L': -90,
    'forearm_R': 90,
}


def rotate_arm(arr, deg):
    im = Image.fromarray(arr, 'RGBA')
    im = im.rotate(deg, expand=True, resample=Image.Resampling.BICUBIC)
    return crop_thr(im, 16)


def trim_shoulder_flap(im, top_frac=0.28):
    """Clip jacket-body wings at the shoulder end of a rotated upper arm."""
    a = np.array(im)
    h, w = a.shape[:2]
    mid = a[int(h * 0.38):int(h * 0.88), :, 3] > 40
    cols = np.where(mid.any(0))[0]
    if len(cols) < 4:
        return im
    x0, x1 = max(0, int(cols[0]) - 3), min(w, int(cols[-1]) + 4)
    top = int(h * top_frac)
    a[:top, :x0, 3] = 0
    a[:top, x1:, 3] = 0
    return crop_thr(Image.fromarray(a, 'RGBA'), 16)


rotated = {}
for n, deg in ARM_ROT.items():
    if n not in crops:
        continue
    im = rotate_arm(crops[n]['img'], deg)
    if n.startswith('upperarm'):
        im = trim_shoulder_flap(im)
    rotated[n] = im
    im.save(os.path.join(DBG, f'rot_{n}.png'))
    print('rotated', n, im.size, 'deg', deg)


# =====================================================================
# Page fists (panels 9 and 10), color-matched, wrist at bottom
# Panel grid is 4x4 of 256 px on a 1024 sheet.
# =====================================================================
page = np.array(Image.open(PAGE_PATH).convert('RGB'))
# P9 = row 2, col 0; P10 = row 2, col 1  (0-indexed)
PW = 256


def extract_panel(page, idx):  # 1-based panel index
    r, c = divmod(idx - 1, 4)
    tile = page[r * PW:(r + 1) * PW, c * PW:(c + 1) * PW]
    rgba = clean_halo(remove_white_bg(tile, lo=12, hi=28))
    a = rgba[..., 3] > 20
    a = largest(a)
    rgba[~a, 3] = 0
    return crop_thr(Image.fromarray(clean_halo(rgba), 'RGBA'), 20)


fist_src = {
    'L': extract_panel(page, 9),
    # P10 is a 3/4 view that doesn't sit in the guard; mirror P9 so both
    # fists show the riveted knuckles toward the camera like the official art.
    'R': extract_panel(page, 9).transpose(Image.FLIP_LEFT_RIGHT),
}
# Orient: wrist at bottom, knuckles generally toward the camera.
# P9: knuckles on the left, wrist toward lower-right — rotate ~ -50 deg; R is mirrored so +50.
FIST_ROT = {'L': -50, 'R': 50}
fists = {}
# metal target from T-pose body (chest)
body_px = RGB[own['torso'] & (A > 0.5)]
# prefer lighter metal (not dark jacket)
lum = body_px.mean(1)
metal_px = body_px[lum > 0.35]
METAL_MEAN = (metal_px.mean(0) * 255) if len(metal_px) else np.array([160, 140, 120])
print('METAL_MEAN', METAL_MEAN)

for sd, rot in FIST_ROT.items():
    im = fist_src[sd].rotate(rot, expand=True, resample=Image.Resampling.BICUBIC)
    im = crop_thr(im, 18)
    # mild color match toward T-pose metal
    im = color_shift(im, METAL_MEAN, 0.28)
    im = sharpen(im, 1.2)
    fists[sd] = im
    im.save(os.path.join(DBG, f'fist_{sd}_orient.png'))
    print('fist', sd, im.size)


# =====================================================================
# Build metal sole from boot colors (local paint, no gen)
# =====================================================================
def make_sole(boot_arr, side):
    """Chunky industrial metal sole, rust sampled from the boot."""
    boot = boot_arr[..., :3].astype(np.float32)
    ba = boot_arr[..., 3] > 40
    if ba.any():
        mean = boot[ba].mean(0)
        dark = boot[ba][boot[ba].mean(1) < np.median(boot[ba].mean(1))].mean(0) if ba.sum() > 20 else mean * 0.7
        rust = mean * np.array([1.05, 0.85, 0.7])
    else:
        mean, dark, rust = np.array([150, 130, 110]), np.array([80, 60, 50]), np.array([140, 90, 60])
    W, H = 280, 430
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # outline shape: wide rounded rectangle (Tank's blocky boots), toe at top
    margin_x, margin_y = 18, 16
    # slightly wider toe, narrower heel
    toe = [(W * 0.18, margin_y), (W * 0.82, margin_y),
           (W * 0.92, H * 0.18), (W * 0.90, H * 0.62),
           (W * 0.82, H - margin_y), (W * 0.18, H - margin_y),
           (W * 0.10, H * 0.62), (W * 0.08, H * 0.18)]
    fill = tuple(int(np.clip(c, 0, 255)) for c in mean) + (255,)
    ink = (20, 16, 14, 255)
    rust_c = tuple(int(np.clip(c, 0, 255)) for c in rust) + (255,)
    dark_c = tuple(int(np.clip(c, 0, 255)) for c in dark) + (255,)
    d.polygon(toe, fill=fill, outline=ink)
    # inner plate
    inner = [(x + (W / 2 - x) * 0.16, y + (H / 2 - y) * 0.10) for x, y in toe]
    d.polygon(inner, fill=dark_c, outline=ink)
    # tread: chevron ribs in the toe half, bars in the heel
    for i, y in enumerate(range(40, int(H * 0.58), 22)):
        y2 = y + 10
        pts = [(W * 0.28, y), (W * 0.50, y + 12), (W * 0.72, y),
               (W * 0.72, y2), (W * 0.50, y2 + 12), (W * 0.28, y2)]
        col = rust_c if i % 2 == 0 else fill
        d.polygon(pts, fill=col)
    for i, y in enumerate(range(int(H * 0.64), H - 30, 16)):
        d.rectangle((int(W * 0.24), y, int(W * 0.76), y + 8), fill=rust_c if i % 3 == 0 else fill)
    # rivets around the perimeter
    # sample points along a shrink of the outline
    rng = np.random.RandomState(7 + (0 if side == 'L' else 13))
    for t in np.linspace(0, 1, 18, endpoint=False):
        # ellipse-ish
        ang = t * 2 * math.pi
        rx, ry = W * 0.38, H * 0.44
        x = W / 2 + rx * math.cos(ang)
        y = H / 2 + ry * math.sin(ang)
        r = 6
        d.ellipse((x - r, y - r, x + r, y + r), fill=(40, 36, 32, 255), outline=ink)
        d.ellipse((x - r + 2, y - r + 2, x + r - 3, y + r - 3), fill=(90, 80, 70, 255))
    # rust blotches
    a = np.array(im)
    blot = np.zeros((H, W), np.float32)
    for _ in range(14):
        cx, cy = rng.randint(30, W - 30), rng.randint(30, H - 30)
        rad = rng.randint(12, 34)
        yy2, xx2 = np.ogrid[:H, :W]
        blot += np.exp(-((xx2 - cx) ** 2 + (yy2 - cy) ** 2) / (2 * rad * rad)) * rng.uniform(0.15, 0.4)
    rust_rgb = np.clip(rust, 0, 255)
    m = (a[..., 3] > 40) & (blot > 0.15)
    a[m, :3] = (a[m, :3].astype(np.float32) * (1 - np.clip(blot[m], 0, 0.45))[..., None]
                + rust_rgb * np.clip(blot[m], 0, 0.45)[..., None])
    # ink outline thicken slightly via alpha edge
    im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA')
    # add a 3px dark ring
    mask = im.split()[-1]
    ring = mask.filter(ImageFilter.MaxFilter(5))
    ring = ImageChops.subtract(ring, mask)
    overlay = Image.new('RGBA', (W, H), (22, 18, 16, 0))
    ov = np.array(overlay)
    ov[..., 3] = np.array(ring)
    overlay = Image.fromarray(ov, 'RGBA')
    im = Image.alpha_composite(im, overlay)
    return im


# =====================================================================
# Scale body parts into art space (uniform SRC_S) and place
# =====================================================================
# Compute Tank pivots in art space from source joints
def ja(pt):
    return list(to_art(*pt))

PIV = {
    'root': ja(PELVIS_SRC),
    'pelvis': ja(PELVIS_SRC),
    'torso': ja(WAIST_SRC),
    'head': ja(NECK_SRC),
    'upperarm_L': ja(SHOULDER['L']),
    'upperarm_R': ja(SHOULDER['R']),
    'thigh_L': ja(HIP['L']),
    'thigh_R': ja(HIP['R']),
    'shin_L': ja(KNEE['L']),
    'shin_R': ja(KNEE['R']),
    'boot_L': ja(ANKLE['L']),
    'boot_R': ja(ANKLE['R']),
}
# Forearm + fist pivots: arrange a boxing guard using Tank limb lengths
# and Gavin's rest-pose directions (upper hangs down, forearm shoots up to fist).


def vlen(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


# Tank limb lengths in art px
UA_LEN = vlen(ja(SHOULDER['L']), ja(ELBOW['L']))  # same L/R roughly
FA_LEN = vlen(ja(ELBOW['L']), ja(WRIST['L']))

# Gavin rest-pose direction (unit) for L, then mirror for R
g_sh = GAVIN['pivots']['upperarm_L']
g_el = GAVIN['pivots']['forearm_L']
g_fi = GAVIN['pivots']['fist_L']
d_ua = (g_el[0] - g_sh[0], g_el[1] - g_sh[1])
n_ua = math.hypot(*d_ua) or 1
d_ua = (d_ua[0] / n_ua, d_ua[1] / n_ua)
d_fa = (g_fi[0] - g_el[0], g_fi[1] - g_el[1])
n_fa = math.hypot(*d_fa) or 1
d_fa = (d_fa[0] / n_fa, d_fa[1] / n_fa)

for sd, mx in (('L', 1), ('R', -1)):
    sh = PIV[f'upperarm_{sd}']
    el = [sh[0] + mx * d_ua[0] * UA_LEN, sh[1] + d_ua[1] * UA_LEN]
    fi = [el[0] + mx * d_fa[0] * FA_LEN, el[1] + d_fa[1] * FA_LEN]
    PIV[f'forearm_{sd}'] = el
    PIV[f'fist_{sd}'] = fi

print('PIVOTS')
for k, v in PIV.items():
    print(f'  {k}: ({v[0]:.1f}, {v[1]:.1f})')

ikTargets = {
    'foot_L': list(PIV['boot_L']),
    'foot_R': list(PIV['boot_R']),
}


def scale_src_crop(crop, sx0, sy0):
    """Scale a source-space crop by SRC_S, return PIL and the art-space top-left
    of that crop if placed at the mapped (sx0,sy0) origin (crop's x0,y0)."""
    arr = crop['img']
    sh, sw = arr.shape[:2]
    tw, th = max(1, int(round(sw * SRC_S))), max(1, int(round(sh * SRC_S)))
    im = Image.fromarray(arr, 'RGBA').resize((tw, th), Image.Resampling.LANCZOS)
    im = sharpen(im, 1.2)
    art_x, art_y = to_art(crop['x0'], crop['y0'])
    return im, art_x, art_y


meta = {'source': 'tank-arms-out.jpg + page fists 9/10', 'size': [ART_W, ART_H], 'parts': {}}
skin_parts = {}
placed = {}  # name -> (PIL, abs_x, abs_y)


def place_abs(name, im, abs_x, abs_y):
    im = crop_thr(im, 16)
    # After crop, abs coords may need a shrink if we trimmed transparent
    # crop_thr already cropped; we assume im is already tight and abs is its top-left
    path = os.path.join(OUT, f'{name}.png')
    im = save_png(im, path)
    w, h = im.size
    px, py = PIV[name] if name in PIV else (0, 0)
    # If crop_thr changed size we already saved the cropped image; abs is for the
    # tight image.
    meta['parts'][name] = {'x': int(round(abs_x)), 'y': int(round(abs_y)), 'w': w, 'h': h}
    skin_parts[name] = {
        'image': f'parts/{name}.png',
        'x': int(round(abs_x - px)),
        'y': int(round(abs_y - py)),
        'w': w, 'h': h,
    }
    placed[name] = (im, int(round(abs_x)), int(round(abs_y)))
    print(f'place {name}: {w}x{h} abs=({abs_x:.0f},{abs_y:.0f}) rel=({skin_parts[name]["x"]},{skin_parts[name]["y"]})')
    return im


def place_by_attach(name, im, fx, fy):
    """Place so the bone pivot sits at fraction (fx, fy) of the image."""
    im = crop_thr(im, 16)
    w, h = im.size
    px, py = PIV[name]
    abs_x = px - fx * w
    abs_y = py - fy * h
    return place_abs(name, im, abs_x, abs_y)


# ---- body parts: uniform scale, keep source relative placement ----
for n in ('head', 'torso', 'pelvis', 'thigh_L', 'thigh_R', 'shin_L', 'shin_R', 'boot_L', 'boot_R'):
    if n not in crops:
        continue
    im, ax, ay = scale_src_crop(crops[n], crops[n]['x0'], crops[n]['y0'])
    # For legs, add a bit of joint overlap by extending before place? We'll
    # extend after first place if seams show. Place true-scale first so the
    # character assembles like the T-pose (legs) / head / torso.
    if n.startswith('thigh'):
        im = extend_end(im, int(10), 'top', min_half=0.34)
        im = round_ends(im, 0.08, 0.12, min_half=0.36)
        ax, ay = ax, ay - 10
    elif n.startswith('shin'):
        im = extend_end(im, int(12), 'top', min_half=0.34)
        im = round_ends(im, 0.12, 0.04, min_half=0.36)
        ax, ay = ax, ay - 12
    place_abs(n, im, ax, ay)

# Recenter head / torso / pelvis? They were placed by source mapping, which
# already puts them on the character. Pivots were computed from joints, so
# rel offsets should be correct. Good.

# ---- arms: rotated, scaled by SRC_S, attached at pivots ----
# After rotation, "top" of upper arm is the shoulder; attach fy ~ 0.10
# After rotation, "bottom" of forearm is the elbow (pivot); fy ~ 0.88
# Width: source arm thickness ~ 70-90 px * SRC_S ≈ 100-125
for n, im0 in rotated.items():
    sw, sh = im0.size
    tw, th = max(1, int(round(sw * SRC_S))), max(1, int(round(sh * SRC_S)))
    im = im0.resize((tw, th), Image.Resampling.LANCZOS)
    im = sharpen(im, 1.3)
    if n.startswith('upperarm'):
        im = extend_end(im, 22, 'both', min_half=0.34)
        im = round_ends(im, 0.14, 0.12, min_half=0.36)
        fx = 0.58 if n.endswith('_L') else 0.42
        place_by_attach(n, im, fx, 0.10)
    else:
        im = extend_end(im, 20, 'both', min_half=0.34)
        im = round_ends(im, 0.12, 0.12, min_half=0.36)
        place_by_attach(n, im, 0.50, 0.88)

# ---- fists: bigger than Gavin (111x137). Target ~ 165 tall ----
for sd in ('L', 'R'):
    im = fists[sd]
    sw, sh = im.size
    # bigger fists: ~1.35x Gavin, plus Tank's 1.17 on-screen scale
    target_h = 170
    s = target_h / sh
    im = im.resize((max(1, int(sw * s)), max(1, int(sh * s))), Image.Resampling.LANCZOS)
    im = sharpen(im, 1.2)
    # wrist is near the bottom after our rotation; fy high
    fx = 0.48 if sd == 'L' else 0.52
    place_by_attach(f'fist_{sd}', im, fx, 0.82)

# ---- soles ----
for sd in ('L', 'R'):
    boot_arr = np.array(placed[f'boot_{sd}'][0])
    sole = make_sole(boot_arr, sd)
    sole = save_png(sole, os.path.join(OUT, f'sole_{sd}.png'))
    w, h = sole.size
    sc = 0.42
    skin_parts[f'sole_{sd}'] = {
        'image': f'parts/sole_{sd}.png',
        'bone': f'boot_{sd}',
        'scale': sc,
        'x': -w * sc / 2,
        'y': -h * sc * 0.85,
        'shadow': True,
        'w': w, 'h': h,
    }
    meta['parts'][f'sole_{sd}'] = {'x': 0, 'y': 0, 'w': w, 'h': h, 'overlay': True}
    sole.save(os.path.join(DBG, f'sole_{sd}.png'))
    print(f'sole_{sd}: {w}x{h}')

# Tuck shins over boots (ensure overlap) if needed
for sd in ('L', 'R'):
    shin = placed[f'shin_{sd}']
    boot = placed[f'boot_{sd}']
    # shin bottom should overlap boot top by >= 40 art px
    shin_im, sx, sy = shin
    boot_im, bx, by = boot
    overlap = (sy + shin_im.size[1]) - by
    print(f'  shin_{sd}/boot overlap={overlap}')
    if overlap < 50:
        # shift shin down? better extend already done. Shift boot? keep ankle pivot.
        # Move shin down so overlap is 60, keeping width centered on shin pivot
        new_sy = by + 60 - shin_im.size[1]
        place_abs(f'shin_{sd}', shin_im, sx, new_sy)
        print(f'    adjusted shin_{sd} y {sy} -> {new_sy}')

# Knee overlap check
for sd in ('L', 'R'):
    th = placed[f'thigh_{sd}']
    shn = placed[f'shin_{sd}']
    ov = (th[2] + th[0].size[1]) - shn[2]
    print(f'  thigh/shin_{sd} knee overlap={ov}')

# =====================================================================
# Write skin + notes + assemble
# =====================================================================
# Integer-ize pivots
PIV_I = {k: [int(round(v[0])), int(round(v[1]))] for k, v in PIV.items()}
ik_I = {k: [int(round(v[0])), int(round(v[1]))] for k, v in ikTargets.items()}
# Recompute rel against integer pivots so they stay consistent
for n, p in list(skin_parts.items()):
    if n.startswith('sole'):
        continue
    px, py = PIV_I[n]
    m = meta['parts'][n]
    p['x'] = int(m['x'] - px)
    p['y'] = int(m['y'] - py)

skin = {
    'fighter': 'tank',
    'skeleton': 'bvh-punchout-front-v1',
    'about': (
        'Tank v1: body/limbs cut from tank-arms-out T-pose (uniform scale, white-bg decontaminated). '
        'Arms rotated to boxing-guard bone orientation. Riveted fists from parts-page panels 9-10, '
        'color-matched and sized larger than a human. scale 1.17 = 7 ft (skull to feet).'
    ),
    'artSize': [ART_W, ART_H],
    'scale': SCALE_ONSCREEN,
    'groundY': GROUND_Y,
    'pivots': PIV_I,
    'ikTargets': ik_I,
    'parts': skin_parts,
}
json.dump(skin, open(os.path.join(TANK, 'skin.json'), 'w'), indent=1)
json.dump(meta, open(os.path.join(TANK, 'parts_meta.json'), 'w'), indent=1)

# Assemble preview (rest pose, no animation — body like T-pose, arms in guard)
canvas = Image.new('RGBA', (ART_W, ART_H + 120), (26, 24, 32, 255))
# allow fedora to draw above y=0
YOFF = 100
order = ['pelvis', 'thigh_L', 'thigh_R', 'shin_L', 'shin_R', 'boot_L', 'boot_R',
         'torso', 'upperarm_L', 'upperarm_R', 'forearm_L', 'forearm_R', 'fist_L', 'fist_R', 'head']
d = ImageDraw.Draw(canvas)
for n in order:
    im, x, y = placed[n]
    canvas.alpha_composite(im, (x, y + YOFF))
# pivot dots
for n, (px, py) in PIV_I.items():
    d.ellipse((px - 2, py + YOFF - 2, px + 2, py + YOFF + 2), outline=(255, 80, 80, 255))
# skull and ground guides
d.line((0, int(SKULL_Y_ART) + YOFF, ART_W, int(SKULL_Y_ART) + YOFF), fill=(80, 200, 80, 180))
d.line((0, GROUND_Y + YOFF, ART_W, GROUND_Y + YOFF), fill=(80, 200, 80, 180))
canvas.convert('RGB').save(os.path.join(TANK, 'assemble_preview.jpg'), quality=85, optimize=True)
canvas.convert('RGB').save(os.path.join(DBG, 'assemble.png'), quality=92)

bytes_total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT) if f.endswith('.png'))
notes = [
    'Tank v1: cut from tank-arms-out.jpg (T-pose) + page fists 9/10. Local, $0.',
    f'src_scale={SRC_S:.4f}  skull_src={SKULL_TOP} feet_src={FEET_BOTTOM} fedora_src={FEDORA_TOP}',
    f'art skull_y={SKULL_Y_ART} groundY={GROUND_Y} skull_to_feet={SKULL_TO_FEET_ART} on-screen scale={SCALE_ONSCREEN} (7 ft)',
    'Arms rotated from T-pose to boxing-guard orientation (upper shoulder-at-top, forearm wrist-at-top).',
    'Fists are the riveted page-9/10 fists, color-matched to the T-pose metal, larger than Gavin.',
    'Soles are a local metal/rust construction from boot colors (no new image gen).',
    'Height is measured to the top of the skull under the fedora, not the hat.',
    f'parts_bytes={bytes_total}',
]
for n, m in meta['parts'].items():
    notes.append(f"{n}: -> ({m['w']}, {m['h']})")
open(os.path.join(TANK, 'BUILD_NOTES.txt'), 'w').write('\n'.join(notes) + '\n')
print('parts_bytes', bytes_total, 'over2MB' if bytes_total > 2_000_000 else 'ok')
print('done')
