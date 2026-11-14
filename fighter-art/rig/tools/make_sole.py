"""Draw a foreshortened boot sole (seen from the front, toe up) for the front kick peak.
Pure PIL/numpy, styled like the inked art. Writes gavin/parts/sole_L.png, sole_R.png and gavin/overlays.json."""
import os, json, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
RIG = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SS = 2                      # supersample
W, H = 270, 420             # final image px (drawn at part scale 1/3)
w, h = W * SS, H * SS
cx = w / 2
def prof(v):                # half width of the sole along its length (v 0 = toe, 1 = heel)
    toe = math.sqrt(max(0.0, 1 - ((0.22 - min(v, 0.22)) / 0.22) ** 2))
    fore = 0.43 + 0.05 * math.exp(-((v - 0.28) / 0.13) ** 2)
    waist = -0.10 * math.exp(-((v - 0.62) / 0.10) ** 2)
    heel = math.sqrt(max(0.0, 1 - ((max(v, 0.86) - 0.86) / 0.14) ** 2))
    narrow = 1 - 0.13 * max(0.0, min(1.0, (v - 0.5) / 0.3))
    return (fore + waist - 0.04 * v) * toe * heel * narrow
def outline(inset, top, bot, skew=0.0):
    pts = []
    N = 90
    for i in range(N + 1):
        v = i / N; y = top + (bot - top) * v; x = prof(v) * (w * 0.92) / 2 * 2 - inset
        pts.append((cx + max(x, 0) * (1 + 0.07 * (1 - v)) - 0.035 * w * math.sin(v * math.pi), y))
    for i in range(N, -1, -1):
        v = i / N; y = top + (bot - top) * v; x = prof(v) * (w * 0.92) / 2 * 2 - inset
        pts.append((cx - max(x, 0) * (1 - 0.05 * (1 - v)) - 0.035 * w * math.sin(v * math.pi) - 0.04 * w * math.exp(-((v - 0.62) / 0.12) ** 2), y))
    return pts
img = Image.new('RGBA', (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
T0, B0 = 10 * SS, h - 10 * SS
d.polygon(outline(0, T0, B0), fill=(8, 8, 10, 255))                       # ink outline
d.polygon(outline(7 * SS, T0 + 7 * SS, B0 - 7 * SS), fill=(22, 22, 26, 255))  # leather rim / welt
sole_pts = outline(16 * SS, T0 + 17 * SS, B0 - 15 * SS)
d.polygon(sole_pts, fill=(58, 56, 60, 255))
mask = Image.new('L', (w, h), 0); ImageDraw.Draw(mask).polygon(sole_pts, fill=255)
# arch: recessed waist between forefoot pad and heel block
tread = Image.new('RGBA', (w, h), (0, 0, 0, 0)); t = ImageDraw.Draw(tread)
ay0, ay1 = T0 + (B0 - T0) * 0.55, T0 + (B0 - T0) * 0.70
t.rectangle((0, ay0, w, ay1), fill=(30, 29, 32, 255))
t.line((0, ay0, w, ay0), fill=(6, 6, 8, 255), width=4 * SS)
t.line((0, ay1, w, ay1), fill=(6, 6, 8, 255), width=5 * SS)
t.line((0, ay1 + 5 * SS, w, ay1 + 5 * SS), fill=(96, 94, 98, 255), width=2 * SS)   # heel front edge catches light
# forefoot chevron lugs
y = T0 + 30 * SS
while y < ay0 - 14 * SS:
    for x0 in range(-2, 3):
        x = cx + x0 * 46 * SS
        t.polygon([(x - 20 * SS, y), (x, y + 12 * SS), (x + 20 * SS, y), (x + 20 * SS, y + 9 * SS), (x, y + 21 * SS), (x - 20 * SS, y + 9 * SS)], fill=(84, 82, 87, 255), outline=(10, 10, 12, 255))
    y += 30 * SS
# heel lugs: horizontal bars
y = ay1 + 16 * SS
while y < B0 - 26 * SS:
    t.rounded_rectangle((cx - 80 * SS, y, cx + 80 * SS, y + 12 * SS), radius=5 * SS, fill=(80, 78, 83, 255), outline=(10, 10, 12, 255), width=2 * SS)
    y += 24 * SS
img.alpha_composite(Image.composite(tread, Image.new('RGBA', (w, h), (0, 0, 0, 0)), mask))
a = np.array(img).astype(np.float32)
yy, xx = np.mgrid[0:h, 0:w]
m = np.array(mask) > 0
# shading: light from upper left, heel (nearer the camera) a bit brighter, edges darker
shade = 1.0 + 0.22 * (0.5 - xx / w) + 0.10 * (yy / h - 0.5)
dist = np.array(mask.filter(ImageFilter.GaussianBlur(14 * SS))) / 255.0
shade = shade * (0.72 + 0.28 * dist)
a[..., :3][m] *= shade[m][:, None]
# ink hatching on the shadow side (right) and the arch, like the comic art
hatch = ((xx + yy * 0.55) % (9 * SS) < 2 * SS) & m & ((xx > cx + 0.18 * w) | ((yy > ay0) & (yy < ay1)))
rng = np.random.default_rng(3)
broken = rng.random((h // (6 * SS) + 1, w // (6 * SS) + 1)) > 0.25
hatch &= np.kron(broken, np.ones((6 * SS, 6 * SS), bool))[:h, :w]
a[..., :3][hatch] *= 0.45
# rubber grain
a[..., :3][m] += rng.normal(0, 4, (m.sum(), 1))
# glossy highlight on the leather rim, upper left
rim = (np.array(Image.new('L', (w, h), 0)) > 0)
hl = Image.new('L', (w, h), 0); ImageDraw.Draw(hl).arc((cx - 0.40 * w, T0 + 6 * SS, cx + 0.40 * w, T0 + 0.55 * h), 195, 260, fill=255, width=4 * SS)
hl = np.array(hl.filter(ImageFilter.GaussianBlur(1.5 * SS))) / 255.0
a[..., :3] += (hl * 120)[..., None] * (a[..., 3:4] > 0)
# welt stitches
st = Image.new('L', (w, h), 0); sd = ImageDraw.Draw(st)
pts = outline(11.5 * SS, T0 + 12 * SS, B0 - 11 * SS)
for i in range(0, len(pts) - 1, 3):
    sd.line([pts[i], pts[i + 1]], fill=255, width=2 * SS)
sm = np.array(st) > 0
a[..., :3][sm] = a[..., :3][sm] * 0.4 + 70
a = np.clip(a, 0, 255).astype(np.uint8)
out = Image.fromarray(a, 'RGBA').resize((W, H), Image.LANCZOS)
P = os.path.join(RIG, 'gavin', 'parts')
out.save(os.path.join(P, 'sole_L.png')); out.transpose(Image.FLIP_LEFT_RIGHT).save(os.path.join(P, 'sole_R.png'))
sc = 1 / 2.4
# sole hangs on the boot bone: heel bottom just above the ankle pivot so the pant cuff shows under it
ov = {}
for s_ in 'LR':
    ov['sole_' + s_] = {"image": "parts/sole_%s.png" % s_, "bone": "boot_" + s_, "scale": sc,
                        "x": -W * sc / 2, "y": -H * sc - 4, "shadow": True, "w": W, "h": H}
json.dump(ov, open(os.path.join(RIG, 'gavin', 'overlays.json'), 'w'), indent=1)
print('sole ok')
