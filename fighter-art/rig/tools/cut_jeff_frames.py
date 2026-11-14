#!/usr/bin/env python3
"""Cut Jeff's drawn pose frames (white background) to transparent WebP sprites.

Scale: every frame is normalized by the fez (sqrt of red pixel area), calibrated on
jeff-full-body.png where skull->feet = 1474 src px and fez sqrt-area = 91.7, so a
standing Jeff is 1209 art px (6 ft to the skull, fez not counted). Frames are stored
at K=0.62 of art px (the in-game canvas resolution). Anchor = bottom of the lowest
foot (ground) and the fez center x (head over the shadow).
usage: cut_jeff_frames.py SRC_DIR OUT_DIR
"""
import sys, os, json
import numpy as np, cv2
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from harden_part_alpha import harden

SRC, OUT = sys.argv[1], sys.argv[2]
REF_H, REF_FEZ, ART_H, K = 1474.0, 91.7, 1209.0, 0.62
CAL = 1.06  # fez area reads ~6% big on the 1592 px kit photo; calibrated so the straight standing leg in 'chamber' is 6 ft to the skull
# per-frame overrides: fez size is unreliable when the head is tilted or lying down
FEZ_OVERRIDE = {'hit': 72.0, 'midfall': 92.0}  # tilted fez reads ~10% small           # head tilted back: area undercounts; match by face size
DOWN_LEN_ART = 1150.0                   # lying: fez top to heel spans this many art px
X_NUDGE = {}                            # art px nudges after eyeballing the sheet

def fez(a):
    h = cv2.cvtColor(a, cv2.COLOR_RGB2HSV)
    m = (((h[..., 0] < 8) | (h[..., 0] > 170)) & (h[..., 1] > 120) & (h[..., 2] > 80)).astype(np.uint8)
    n, lab, st, cen = cv2.connectedComponentsWithStats(m, 8)
    i = 1 + int(np.argmax(st[1:, 4]))
    return st[i], cen[i]

def cut(a, floor=False):
    border = np.concatenate([a[:8].reshape(-1, 3), a[-8:].reshape(-1, 3), a[:, :8].reshape(-1, 3), a[:, -8:].reshape(-1, 3)])
    bg = np.median(border, 0).astype(np.float32)
    af = a.astype(np.float32)
    diff = np.abs(af - bg).max(-1)
    alpha = np.clip((diff - 14) / 30.0, 0, 1)
    if floor:  # frames on the floor: drop the grey contact shadow (light, unsaturated) in the lower part
        hsv = cv2.cvtColor(a, cv2.COLOR_RGB2HSV)
        sh = (hsv[..., 1] < 26) & (hsv[..., 2] > 135)
        sh[:int(a.shape[0] * 0.55)] = False
        alpha[sh] = 0
    # keep only the largest blob (+ anything big), drop specks and faint floor shadow
    m = (alpha > 0.5).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    keep = np.zeros_like(m, bool)
    big = st[1:, 4].max()
    for i in range(1, n):
        if st[i, 4] > big * 0.02: keep |= lab == i
    keep = cv2.dilate(keep.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    alpha *= keep
    # un-blend the background from edge pixels so no white halo
    a3 = alpha[..., None]
    rgb = np.where(a3 > 0.02, (af - (1 - a3) * bg) / np.maximum(a3, 0.02), af)
    rgba = np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8)
    out = harden(rgba, edge_px=1.5)
    # harden() fills every enclosed hole; reopen real background gaps (arm-to-body loops), keep pinholes filled
    empty = (alpha < 0.04).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(empty, 4)
    for i in range(1, n):
        if st[i, 4] > 600:
            out[lab == i, 3] = 0
    return out

meta = {}
for name in ['stance', 'walk', 'walk2', 'jab', 'hook', 'upper', 'chamber', 'kick', 'rchamber', 'rkick', 'block', 'dodge', 'hit', 'midfall', 'down', 'getup']:
    a = np.array(Image.open(os.path.join(SRC, name + '.jpg')).convert('RGB'))
    st, cen = fez(a)
    rgba = cut(a, floor=name in ('midfall', 'getup', 'down'))
    al = rgba[..., 3]
    ys, xs = np.nonzero(al > 128)
    if name == 'down':
        length = xs.max() - xs.min()
        s_art = DOWN_LEN_ART / length
        anc_x = (xs.max() + xs.min()) / 2
    else:
        f = FEZ_OVERRIDE.get(name, float(np.sqrt(st[4])))
        s_art = CAL * ART_H / (REF_H * f / REF_FEZ)
        anc_x = (xs.max() + xs.min()) / 2 if name in ('midfall',) else cen[0]  # sprawled: center the body
    anc_y = ys.max()
    s = s_art * K  # stored px per src px
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    pad = 4
    crop = rgba[max(0, y0 - pad):y1 + pad, max(0, x0 - pad):x1 + pad]
    oy, ox = max(0, y0 - pad), max(0, x0 - pad)
    W, H = max(1, round(crop.shape[1] * s)), max(1, round(crop.shape[0] * s))
    # premultiplied resize to avoid fringes
    c = crop.astype(np.float32); c[..., :3] *= c[..., 3:4] / 255
    r = cv2.resize(c, (W, H), interpolation=cv2.INTER_AREA)
    r[..., :3] /= np.maximum(r[..., 3:4], 1) / 255
    r = np.clip(r, 0, 255).astype(np.uint8)
    Image.fromarray(r, 'RGBA').save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=86, method=6, alpha_quality=100)
    ax = (anc_x - ox) * s - X_NUDGE.get(name, 0) * K
    ay = (anc_y - oy) * s
    meta[name] = {'src': name + '.webp', 'w': W, 'h': H, 'ax': round(ax, 1), 'ay': round(ay, 1)}
    print(name, 'scale', round(s_art, 4), 'size', W, H, 'skull-ish art height', round((anc_y - st[1]) * s_art))
sk = os.path.join(OUT, 'skin.json')  # keep clips, refresh frame anchors
j = json.load(open(sk)) if os.path.exists(sk) else {}
j['frames'] = meta
json.dump(j, open(sk, 'w'), indent=1)
