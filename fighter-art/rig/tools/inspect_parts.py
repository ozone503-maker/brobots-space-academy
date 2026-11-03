import json, os, numpy as np
from PIL import Image, ImageDraw
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'gavin')
meta = json.load(open(os.path.join(D, 'parts_meta.json')))
names = list(meta['parts'])
cells = []
for n in names:
    p = Image.open(os.path.join(D, 'parts', n + '.png'))
    bg = Image.new('RGBA', (p.width + 20, p.height + 30), (230, 110, 200, 255))
    bg.alpha_composite(p, (10, 25)); ImageDraw.Draw(bg).text((5, 5), n, fill=(0, 0, 0, 255))
    cells.append(bg)
Wt = sum(c.width for c in cells[:6]); sheet = Image.new('RGBA', (max(Wt, sum(c.width for c in cells[6:])), 600 + 400), (255, 255, 255, 255))
x = 0
for c in cells[:6]: sheet.paste(c, (x, 0)); x += c.width
x = 0
for c in cells[6:]: sheet.paste(c, (x, 560)); x += c.width
sheet.convert('RGB').save('/tmp/parts_sheet.png')
# rest composite in draw order
order = ['shin_L','shin_R','thigh_L','thigh_R','pelvis','torso','upperarm_L','upperarm_R','head','forearm_L','forearm_R','fist_L','fist_R']
W, H = meta['size']; comp = Image.new('RGBA', (W, H), (0, 0, 0, 0))
for n in order:
    m = meta['parts'][n]; comp.alpha_composite(Image.open(os.path.join(D, 'parts', n + '.png')), (m['x'], m['y']))
src = Image.open('/workspace/gavin3d/fighter25d/gavin_upright_full.png').convert('RGBA')
a = np.array(comp).astype(int); b = np.array(src).astype(int)
diff = np.abs(a - b).max(axis=2)
print('max diff', diff.max(), 'px>24:', (diff > 24).sum(), 'px>8:', (diff > 8).sum())
dv = Image.fromarray((np.clip(diff * 4, 0, 255)).astype(np.uint8))
side = Image.new('RGB', (W * 2, H), 'white'); bgc = Image.new('RGBA', (W, H), (255, 255, 255, 255)); bgc.alpha_composite(comp)
side.paste(bgc.convert('RGB'), (0, 0)); side.paste(dv.convert('RGB'), (W, 0)); side.save('/tmp/rest_check.png')
