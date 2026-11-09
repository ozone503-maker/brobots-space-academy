"""Build Ipo skin from Muse PNGs. See BUILD_NOTES.txt for shin/forearm methods."""
import json, os
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance

SRC = '/workspace/muse_zip2'
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'ipo'); PARTS = os.path.join(OUT, 'parts')
os.makedirs(PARTS, exist_ok=True)
ART_W, ART_H, GROUND_Y = 534, 1265, 1231
SK = json.load(open(os.path.join(HERE, '..', 'skeleton.json')))
PIV = {b['name']: list(b['pivot']) for b in SK['bones']}
PIV['head'] = [267, 235]
notes = []

def load(n): return Image.open(os.path.join(SRC, n)).convert('RGBA')
def content(im, pad=0):
  b = im.getbbox()
  if not b: return im
  x0,y0,x1,y1 = b
  return im.crop((max(0,x0-pad), max(0,y0-pad), min(im.width,x1+pad), min(im.height,y1+pad)))
def scale_to_h(im, th):
  s = th / max(1, im.height)
  return im.resize((max(1, int(round(im.width * s))), max(1, int(round(th)))), Image.LANCZOS)
def scale_to_w(im, tw):
  s = tw / max(1, im.width)
  return im.resize((max(1, int(round(tw))), max(1, int(round(im.height * s)))), Image.LANCZOS)
def alpha_harden(im, thr=10):
  a = np.array(im); a[...,3] = np.where(a[...,3] < thr, 0, a[...,3]); return Image.fromarray(a, 'RGBA')
def feather(im):
  a = np.array(im); m = Image.fromarray(a[...,3], 'L').filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.7))
  a[...,3] = np.minimum(a[...,3], np.array(m)); return Image.fromarray(a, 'RGBA')

fb = content(load('ipo-full-body-v2.png'))
FB_H = fb.height; notes.append(f'full-body content {fb.size}')

def trim_forearm(im, side):
  im = content(im); w, h = im.size
  a = (np.array(im)[...,3] > 20); widths = a.sum(1).astype(np.float32)
  lo, hi = int(h * 0.50), int(h * 0.85)
  sm = np.convolve(widths[lo:hi], np.ones(11)/11, mode='same')
  cut = lo + int(np.argmin(sm))
  # cut ABOVE the fist bulb: use the pinch, keep only sleeve+forearm fur
  cut = max(int(h * 0.55), min(cut, int(h * 0.72)))
  notes.append(f'{side} forearm wrist cut {cut}/{h} ({cut/h:.2f})')
  return content(im.crop((0, 0, w, cut)))

def gi_shin(shin_src, thigh_src, side, target_h, target_w):
  """Gi-pant shin: silhouette from bare Muse shin (widened), fabric from thigh gi lower half.
  Also try a crop of the matching lower leg from the full-body plate and blend."""
  sil = content(shin_src)
  # widen silhouette to ~thigh width so pants read baggy
  sil = scale_to_h(sil, target_h)
  if sil.width < target_w:
    # pad horizontally by scaling width up (baggy pant)
    sil = sil.resize((target_w, target_h), Image.LANCZOS)
  else:
    sil = scale_to_w(sil, target_w); sil = scale_to_h(sil, target_h)
  thigh = content(thigh_src)
  tw, th = thigh.size
  fabric = thigh.crop((0, int(th * 0.40), tw, th)).resize(sil.size, Image.LANCZOS)
  # full-body lower-leg crop as better fabric if available
  fbc = try_fullbody_shin_crop(side, sil.size)
  if fbc is not None:
    fabric = Image.blend(fabric.convert('RGBA'), fbc, 0.65)
    notes.append(f'{side} shin: blended thigh fabric with full-body lower-leg crop')
  else:
    notes.append(f'{side} shin: thigh gi fabric only, masked to widened shin silhouette')
  mask = sil.split()[-1].filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.GaussianBlur(1.4))
  farr = np.array(fabric).astype(np.float32)
  solid = farr[...,3] > 20
  mean = farr[solid, :3].mean(0) if solid.any() else np.array([228, 226, 220], np.float32)
  for c in range(3):
    farr[..., c] = np.where(farr[...,3] > 20, farr[..., c], mean[c])
  farr[..., 3] = np.array(mask).astype(np.float32)
  # slight despeckle
  out = Image.fromarray(farr.astype(np.uint8), 'RGBA')
  return out

def try_fullbody_shin_crop(side, size):
  """Crop left/right lower pant leg from full-body reference."""
  global fb
  W, H = fb.size
  # character is centered; approximate leg columns and shin rows
  if side == 'L':
    box = (int(W*0.28), int(H*0.68), int(W*0.48), int(H*0.90))
  else:
    box = (int(W*0.52), int(H*0.68), int(W*0.72), int(H*0.90))
  crop = fb.crop(box)
  if crop.getbbox() is None: return None
  crop = content(crop)
  if crop.width < 20 or crop.height < 20: return None
  return crop.resize(size, Image.LANCZOS)

def trim_pelvis(im):
  """Keep lower gi; soften duplicated belt by fading the top 18%."""
  im = content(im); w, h = im.size
  a = np.array(im).astype(np.float32)
  fade = int(h * 0.18)
  for y in range(fade):
    a[y, ..., 3] *= y / max(1, fade)
  notes.append('pelvis: faded top 18% to reduce double-belt with torso')
  return Image.fromarray(a.astype(np.uint8), 'RGBA')

def trim_torso_bottom(im):
  """Slightly fade torso hem so pelvis overlaps cleanly."""
  im = content(im); w, h = im.size
  a = np.array(im).astype(np.float32)
  fade = int(h * 0.12)
  for i, y in enumerate(range(h - fade, h)):
    a[y, ..., 3] *= 1 - (i / max(1, fade)) * 0.55
  return Image.fromarray(a.astype(np.uint8), 'RGBA')

T = {
  'head': 300, 'torso': 470, 'pelvis': 220,
  'upperarm_L': 260, 'upperarm_R': 260,
  'forearm_L': 175, 'forearm_R': 175,
  'fist_L': 115, 'fist_R': 115,
  'thigh_L': 340, 'thigh_R': 340,
  'shin_L': 215, 'shin_R': 215,
  'boot_L': 165, 'boot_R': 165,
  'sole_L': 380, 'sole_R': 380,
}

raw = {
  'head': content(load('ipo-head-neck-true-scale-v3.png')),
  'torso': trim_torso_bottom(load('ipo-torso-sleeveless-v2.png')),
  'pelvis': trim_pelvis(load('ipo-hips-pelvis-v2.png')),
  'upperarm_L': content(load('ipo-left-upper-arm-v2.png')),
  'upperarm_R': content(load('ipo-right-upper-arm-v2.png')),
  'forearm_L': trim_forearm(load('ipo-left-forearm-v2.png'), 'L'),
  'forearm_R': trim_forearm(load('ipo-right-forearm-v2.png'), 'R'),
  'fist_L': content(load('ipo-left-fist-true-scale-v2.png')),
  'fist_R': content(load('ipo-right-fist-true-scale-v2.png')),
  'thigh_L': content(load('ipo-left-thigh-v2.png')),
  'thigh_R': content(load('ipo-right-thigh-v3.png')),
  'boot_L': content(load('ipo-left-croc-v2.png')),
  'boot_R': content(load('ipo-right-croc-v2.png')),
  'sole_L': content(load('ipo-left-sole-true-scale-v2.png')),
  'sole_R': content(load('ipo-right-sole-true-scale-v2.png')),
}
# shins after thighs exist
raw['shin_L'] = gi_shin(load('ipo-left-shin-v2.png'), load('ipo-left-thigh-v2.png'), 'L', T['shin_L'], 125)
raw['shin_R'] = gi_shin(load('ipo-right-shin-v3.png'), load('ipo-right-thigh-v3.png'), 'R', T['shin_R'], 125)

scaled = {}
for n, im in raw.items():
  sc = scale_to_h(im, T[n])
  if n.startswith('boot_') and sc.width > 195: sc = scale_to_w(sc, 185)
  if n.startswith('fist_') and sc.width > 125: sc = scale_to_w(sc, 110)
  if n.startswith('upperarm_') and sc.width > 140: sc = scale_to_w(sc, 135)
  if n.startswith('forearm_') and sc.width > 110: sc = scale_to_w(sc, 100)
  if n == 'head' and sc.width > 320:
    sc = scale_to_w(sc, 310); sc = scale_to_h(sc, T['head'])
  scaled[n] = feather(alpha_harden(sc))
  notes.append(f'{n}: {im.size} -> {scaled[n].size}')

# placement: pivot fractions inside each part
place_fr = {
  'head': (0.50, 0.78),
  'torso': (0.50, 0.82),
  'pelvis': (0.50, 0.28),
  'upperarm_L': (0.58, 0.08), 'upperarm_R': (0.42, 0.08),
  'forearm_L': (0.50, 0.08), 'forearm_R': (0.50, 0.08),
  'fist_L': (0.42, 0.58), 'fist_R': (0.58, 0.58),
  'thigh_L': (0.55, 0.10), 'thigh_R': (0.45, 0.10),
  'shin_L': (0.50, 0.08), 'shin_R': (0.50, 0.08),
  'boot_L': (0.58, 0.30), 'boot_R': (0.42, 0.30),
}

meta = {'size': [ART_W, ART_H], 'parts': {}}
for n, im in scaled.items():
  if n.startswith('sole_'): 
    im.save(os.path.join(PARTS, f'{n}.png'))
    meta['parts'][n] = {'x':0,'y':0,'w':im.width,'h':im.height,'overlay':True}
    continue
  ax, ay = place_fr[n]; px, py = PIV[n]
  w, h = im.size
  x = int(round(px - ax * w)); y = int(round(py - ay * h))
  im.save(os.path.join(PARTS, f'{n}.png'))
  meta['parts'][n] = {'x': x, 'y': y, 'w': w, 'h': h}
  print(f'{n:12s} ({x:4d},{y:4d}) {w:3d}x{h:3d}')

json.dump(meta, open(os.path.join(OUT, 'parts_meta.json'), 'w'), indent=1)

skin = {
  'fighter': 'ipo', 'skeleton': 'bvh-punchout-front-v1',
  'about': 'Ipo pink dog in white gi. Muse parts rescaled to shared punch-out skeleton. Height scale 1.0 = same bone height as Gavin (1.83 m); Jessie should confirm Ipo lore height.',
  'artSize': [ART_W, ART_H], 'scale': 1.0, 'groundY': GROUND_Y,
  'pivots': PIV,
  'ikTargets': {'foot_L': list(PIV['boot_L']), 'foot_R': list(PIV['boot_R'])},
  'parts': {}
}
for n, m in meta['parts'].items():
  if m.get('overlay'): continue
  px, py = PIV[n]
  skin['parts'][n] = {'image': f'parts/{n}.png', 'x': m['x']-px, 'y': m['y']-py, 'w': m['w'], 'h': m['h']}
for side in ('L','R'):
  n = f'sole_{side}'; imw, imh = scaled[n].size; sc = 0.42
  skin['parts'][n] = {'image': f'parts/{n}.png', 'bone': f'boot_{side}', 'scale': sc,
    'x': -(imw*sc)/2, 'y': -imh*sc*0.85, 'shadow': True, 'w': imw, 'h': imh}
json.dump(skin, open(os.path.join(OUT, 'skin.json'), 'w'), indent=1)

prev = Image.new('RGBA', (ART_W, ART_H), (28, 26, 38, 255))
for n in ['boot_L','boot_R','shin_L','shin_R','thigh_L','thigh_R','pelvis','torso','upperarm_L','upperarm_R','head','forearm_L','forearm_R','fist_L','fist_R']:
  m = meta['parts'][n]; im = Image.open(os.path.join(PARTS, f'{n}.png'))
  prev.alpha_composite(im, (m['x'], m['y']))
prev.save(os.path.join(OUT, 'assemble_preview.png'))
prev.resize((280, 663), Image.LANCZOS).save('/tmp/ipo_assemble.png')
total = sum(os.path.getsize(os.path.join(PARTS,f)) for f in os.listdir(PARTS))
open(os.path.join(OUT, 'BUILD_NOTES.txt'), 'w').write('\n'.join(notes)+f'\n\nparts_bytes={total}\n')
print('parts_bytes', total)
