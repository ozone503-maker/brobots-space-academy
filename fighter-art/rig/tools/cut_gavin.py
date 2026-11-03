"""Cut Gavin's approved upright art into rig parts.
Source is read only. Output: rig/gavin/parts/*.png + rig/gavin/parts_meta.json
Method: every opaque pixel is owned by exactly one part (priority order).
Each part keeps original pixels in its own area plus an overlap band, and
hidden areas (under parts drawn in front) are filled by push-pull inpaint
plus cloned high frequency texture from the same part, with a thin ink
outline wherever the filled area meets empty background."""
import json, os, sys
import numpy as np, cv2
from PIL import Image, ImageDraw

SRC = '/workspace/gavin3d/fighter25d/gavin_upright_full.png'
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'gavin', 'parts')
os.makedirs(OUT, exist_ok=True)

im = np.array(Image.open(SRC).convert('RGBA')).astype(np.float32) / 255.0
H, W = im.shape[:2]
A = im[..., 3]
RGB = im[..., :3]
solid = A > 0.02

def poly(pts):
    m = Image.new('L', (W, H), 0)
    ImageDraw.Draw(m).polygon([tuple(p) for p in pts], fill=255)
    return np.array(m) > 127

def soft_poly(pts, blur=1.2):
    m = Image.new('L', (W * 4, H * 4), 0)
    ImageDraw.Draw(m).polygon([(x * 4, y * 4) for x, y in pts], fill=255)
    m = m.resize((W, H), Image.LANCZOS)
    return np.array(m).astype(np.float32) / 255.0

# ---------- region polygons (source pixel coords) ----------
R = {}
R['fist_L'] = [(93,203),(150,196),(189,206),(191,236),(202,250),(206,262),(198,302),(170,332),(146,342),(118,342),(96,334),(88,262)]
R['fist_R'] = [(326,206),(392,197),(432,210),(440,262),(442,322),(430,338),(398,341),(372,336),(334,300),(321,262),(322,226)]
R['forearm_L'] = [(90,318),(150,322),(150,365),(132,392),(108,432),(82,466),(48,470),(36,440),(52,400),(86,350)]
R['forearm_R'] = [(376,322),(446,318),(452,340),(470,366),(500,410),(505,450),(480,470),(452,455),(428,415),(402,372),(378,345)]
R['head'] = [(150,0),(360,0),(360,150),(338,180),(326,200),(322,236),(300,249),(258,254),(214,249),(190,236),(184,205),(172,180),(150,150)]
R['upperarm_L'] = [(150,252),(108,246),(80,272),(30,340),(0,380),(0,520),(70,510),(112,500),(124,470),(124,360),(140,330),(146,300)]
R['upperarm_R'] = [(385,250),(426,244),(452,262),(500,320),(534,370),(534,520),(470,512),(424,500),(412,470),(410,360),(395,330),(390,300)]
R['torso'] = [(205,222),(178,238),(125,252),(105,268),(110,330),(112,500),(84,560),(84,652),(110,664),(195,684),(201,684),(201,566),(294,566),(294,686),(400,680),(440,664),(458,650),(452,560),(428,500),(424,330),(430,268),(410,250),(356,238),(332,222),(268,212)]
R['pelvis'] = [(88,555),(452,555),(452,700),(440,722),(268,770),(96,722),(84,700)]
R['thigh_L'] = [(60,660),(270,660),(270,770),(232,880),(222,950),(150,968),(68,958),(70,800)]
R['thigh_R'] = [(266,660),(470,660),(470,800),(470,958),(395,970),(318,958),(312,880),(266,770)]
R['shin_L'] = [(40,890),(230,890),(228,960),(205,1040),(186,1046),(160,1052),(130,1055),(100,1052),(70,1042),(50,1030),(60,960)]
R['boot_L'] = [(0,1000),(240,1000),(240,1265),(0,1265)]
R['shin_R'] = [(310,890),(480,890),(490,960),(490,1060),(470,1074),(440,1082),(410,1083),(385,1078),(360,1070),(340,1040),(318,960)]
R['boot_R'] = [(320,1020),(534,1020),(534,1265),(320,1265)]
# hidden fills: silhouettes to invent under front parts
FILL = {
  'forearm_L': [(100,296),(148,300),(150,365),(132,392),(108,432),(82,466),(48,470),(36,440),(52,400),(86,350),(96,320)],
  'forearm_R': [(384,298),(432,296),(446,318),(452,340),(470,366),(500,410),(505,450),(480,470),(452,455),(428,415),(402,372),(378,345)],
  'torso':  [(205,228),(190,240),(150,250),(120,262),(108,282),(108,330),(112,500),(140,520),(395,520),(426,330),(428,282),(416,262),(390,250),(350,240),(332,228),(268,212)],
  'head':   [(190,150),(322,150),(320,234),(300,247),(258,252),(214,247),(192,234)],
  'upperarm_L': [(150,256),(108,250),(80,276),(30,340),(10,380),(20,470),(60,476),(118,470),(124,360),(146,300)],
  'upperarm_R': [(385,254),(426,248),(452,266),(500,320),(527,370),(530,440),(500,470),(416,470),(410,360),(390,300)],
  'pelvis': [(96,560),(440,560),(444,700),(268,760),(96,700)],
  'thigh_L': [[(96,690),(268,690),(268,760),(232,880),(100,880)], [(267, 712), (264, 733), (256, 753), (243, 770), (226, 783), (206, 791), (185, 794), (164, 791), (144, 783), (127, 770), (114, 753), (106, 733), (103, 712), (106, 691), (114, 671), (127, 654), (144, 641), (164, 633), (185, 630), (206, 633), (226, 641), (243, 654), (256, 671), (264, 691)]],
  'thigh_R': [[(268,690),(440,690),(440,880),(312,880),(268,760)], [(434, 712), (431, 733), (423, 753), (410, 770), (393, 783), (373, 791), (352, 794), (331, 791), (311, 783), (294, 770), (281, 753), (273, 733), (270, 712), (273, 691), (281, 671), (294, 654), (311, 641), (331, 633), (352, 630), (373, 633), (393, 641), (410, 654), (423, 671), (431, 691)]],
  'shin_L': [[(70,925),(212,925),(205,1000),(70,1000)], [(206, 925), (204, 942), (197, 958), (187, 972), (173, 982), (157, 989), (140, 991), (123, 989), (107, 982), (93, 972), (83, 958), (76, 942), (74, 925), (76, 908), (83, 892), (93, 878), (107, 868), (123, 861), (140, 859), (157, 861), (173, 868), (187, 878), (197, 892), (204, 908)]],
  'shin_R': [[(327,925),(467,925),(477,1000),(325,1000)], [(467, 925), (465, 943), (458, 960), (446, 974), (432, 986), (415, 993), (397, 995), (379, 993), (362, 986), (348, 974), (336, 960), (329, 943), (327, 925), (329, 907), (336, 890), (348, 876), (362, 864), (379, 857), (397, 855), (415, 857), (432, 864), (446, 876), (458, 890), (465, 907)]],
  'boot_L': [(98,1026),(172,1026),(186,1060),(84,1060)],
  'boot_R': [(390,1050),(458,1050),(472,1090),(376,1090)],
}
# priority (first = front-most owner); also draw order is reverse-ish, see skeleton.json
PRIO = ['fist_L','fist_R','forearm_L','forearm_R','head','upperarm_L','upperarm_R','torso','pelvis','thigh_L','thigh_R','shin_L','shin_R','boot_L','boot_R']
# which parts each part is drawn behind (front occluders)
FRONT = {
  'fist_L': [], 'fist_R': [],
  'forearm_L': ['fist_L'], 'forearm_R': ['fist_R'],
  'head': ['fist_L','fist_R','forearm_L','forearm_R'],
  'upperarm_L': ['fist_L','forearm_L','head'], 'upperarm_R': ['fist_R','forearm_R','head'],
  'torso': ['fist_L','fist_R','forearm_L','forearm_R','head','upperarm_L','upperarm_R'],
  'pelvis': ['torso','forearm_L','forearm_R','upperarm_L','upperarm_R'],
  'thigh_L': ['pelvis','torso'], 'thigh_R': ['pelvis','torso'],
  'shin_L': ['thigh_L'], 'shin_R': ['thigh_R'],
  'boot_L': ['shin_L'], 'boot_R': ['shin_R'],
}
FEATHER = {'fist_L':1.0,'fist_R':1.0,'forearm_L':3,'forearm_R':3,'head':5,'upperarm_L':3,'upperarm_R':3,'torso':3,'pelvis':4,'thigh_L':5,'thigh_R':5,'shin_L':4,'shin_R':4,'boot_L':3,'boot_R':3}
# texture clone offsets per part (dx,dy) tried in order
TEXSRC = {'pelvis':['pelvis','thigh_L','thigh_R'],'torso':['torso'],'head':['head']}
TEXOFF = {'torso':[(0,140),(0,200),(60,120),(-60,120),(30,170),(-30,170)], 'pelvis':[(0,170),(0,230),(40,200),(-40,200),(20,260),(-20,260),(60,150),(-60,150)],
          'head':[(0,-40),(0,-70)], 'upperarm_L':[(-30,60),(-20,100)], 'upperarm_R':[(30,60),(20,100)], 'forearm_L':[(-40,80),(-30,110)], 'forearm_R':[(40,80),(30,110)],
          'thigh_L':[(0,120),(0,160),(20,200),(-20,200)], 'thigh_R':[(0,120),(0,160),(20,200),(-20,200)], 'shin_L':[(0,90),(0,120),(0,60)], 'shin_R':[(0,90),(0,120),(0,60)], 'boot_L':[(0,60),(0,90)], 'boot_R':[(0,60),(0,90)]}

own = {}
taken = np.zeros((H, W), bool)
hsv = cv2.cvtColor((RGB * 255).astype(np.uint8), cv2.COLOR_RGB2HSV)
OLIVE = (hsv[..., 0] >= 22) & (hsv[..., 0] <= 48) & (hsv[..., 1] > 50) & (hsv[..., 2] > 40)
BLUE = (hsv[..., 0] >= 95) & (hsv[..., 0] <= 130) & (hsv[..., 1] > 60)
def clean_fist(m):
    h, sat, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    wrap = (sat < 70) & (v > 120)
    skin = ((h <= 22) | (h >= 170)) & (sat > 50) & (v > 90)
    core = (m & (wrap | skin)).astype(np.uint8)
    core = cv2.morphologyEx(core, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11)))
    k, lab, st, _ = cv2.connectedComponentsWithStats(core)
    core = (lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])).astype(np.uint8)
    ff = core.copy(); msk = np.zeros((H + 2, W + 2), np.uint8); cv2.floodFill(ff, msk, (0, 0), 2)
    core = ((ff != 2) | (core > 0)).astype(np.uint8)
    # grow into the surrounding black ink outline only
    ink = (v < 75)
    out = core.astype(bool)
    for _ in range(3):
        out = out | (cv2.dilate(out.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool) & ink)
    out = cv2.morphologyEx(out.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8)).astype(bool)
    olive2 = (h >= 18) & (h <= 50) & (sat > 45) & (v > 45)
    out = out & ~olive2
    k, lab, st, _ = cv2.connectedComponentsWithStats(out.astype(np.uint8))
    out = (lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])).astype(np.uint8)
    ff = out.copy(); msk = np.zeros((H + 2, W + 2), np.uint8); cv2.floodFill(ff, msk, (0, 0), 2)
    out = (ff != 2) | (out > 0)
    return out & m
for n in PRIO:
    m = poly(R[n]) & solid & ~taken
    if n.startswith('fist'):
        m = clean_fist(m) & solid
    own[n] = m
    taken |= m
left = solid & ~taken
print('unowned solid px:', int(left.sum()))
# give leftovers to nearest owner
if left.any():
    best = np.full((H, W), 1e9, np.float32); lab = np.full((H, W), -1, np.int32)
    for i, n in enumerate(PRIO):
        if n.startswith('fist'): continue
        d = cv2.distanceTransform((~own[n]).astype(np.uint8), cv2.DIST_L2, 3)
        upd = d < best; best[upd] = d[upd]; lab[upd] = i
    for i, n in enumerate(PRIO):
        own[n] |= left & (lab == i)

# round knee joints: thigh keeps only a disc around the knee pivot below the knee line,
# the rest of the knee area goes to the shin, so bent knees show round caps, not cut corners
KNEE = {'L': (140, 925), 'R': (395, 925)}; KR = 84
_yy, _xx = np.mgrid[0:H, 0:W]
for sd_ in 'LR':
    kx, ky = KNEE[sd_]
    outside = (_yy > ky) & (np.hypot(_xx - kx, _yy - ky) > KR)
    mv = own['thigh_' + sd_] & outside
    own['thigh_' + sd_] &= ~mv; own['shin_' + sd_] |= mv

def sdist(mask):
    """signed distance: + inside, - outside"""
    m = mask.astype(np.uint8)
    din = cv2.distanceTransform(m, cv2.DIST_L2, 5)
    dout = cv2.distanceTransform(1 - m, cv2.DIST_L2, 5)
    return din - dout

def pushpull(rgb, known):
    """fill unknown pixels by multiscale push-pull of known pixels"""
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

hp = RGB - cv2.GaussianBlur(RGB, (0, 0), 3.0)  # high pass detail
_l = RGB.mean(axis=2)
INK = cv2.dilate((_l < 0.13).astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool)  # avoid cloning outlines/pocket seams
meta = {'source': os.path.basename(SRC), 'size': [W, H], 'parts': {}}
for n in PRIO:
    f = FEATHER[n]
    sd = sdist(own[n])
    soft = np.clip((sd + f) / (2.0 * f), 0, 1)           # ramps 0..1 across the cut
    soft[own[n]] = np.maximum(soft[own[n]], 0.5)
    region_ext = (sd > -f - 1) & solid                    # own + overlap band, original pixels
    fill = np.zeros((H, W), np.float32)
    if n in FILL:
        polys = FILL[n] if isinstance(FILL[n][0], list) else [FILL[n]]
        fill = np.max([soft_poly(p) for p in polys], axis=0) * solid.astype(np.float32)
    # pixels we may NOT trust as this part's colors: deep inside front occluders
    hidden = np.zeros((H, W), bool)
    for o in FRONT[n]:
        so = sdist(own[o])
        hidden |= so > FEATHER[o] - 0.5
    known = own[n] & ~hidden
    known_ext = region_ext & ~hidden
    for o in PRIO:  # never use another part's own pixels outside our band
        if o != n:
            known_ext &= ~(own[o] & (sd < -f - 1))
    SRCRGB = RGB.copy()
    if n in ('pelvis', 'torso', 'upperarm_L', 'upperarm_R', 'thigh_L', 'thigh_R', 'shin_L', 'shin_R'):
        known = known & (RGB.mean(axis=2) > 0.16)
    if n == 'pelvis':
        for x in range(96, 202):
            SRCRGB[566:602, x] = RGB[566:602, 204 + ((x - 96) % 18)]
        for x in range(292, 446):
            SRCRGB[566:602, x] = RGB[566:602, 270 + ((x - 292) % 18)]
        beltm = np.zeros((H, W), bool); beltm[566:602, 96:446] = True
        beltm &= ~own['pelvis']
        known = known | beltm
    base = pushpull(SRCRGB, known)
    if n == 'pelvis':
        base[beltm] = SRCRGB[beltm]
    color = RGB.copy()
    need = ~known_ext
    # texture clone for filled pixels
    tex = np.zeros_like(RGB); got = np.zeros((H, W), bool)
    ys, xs = np.nonzero(need & (fill > 0))
    srcm = np.zeros((H, W), bool)
    for q in TEXSRC.get(n, [n]): srcm |= own[q]
    srcm &= ~INK
    for dx, dy in TEXOFF.get(n, []):
        sx = np.clip(xs + dx, 0, W - 1); sy = np.clip(ys + dy, 0, H - 1)
        ok = srcm[sy, sx] & ~got[ys, xs]
        tex[ys[ok], xs[ok]] = hp[sy[ok], sx[ok]]
        got[ys[ok], xs[ok]] = True
    if n == 'pelvis': tex[beltm] = 0
    filled = np.clip(base + tex * 0.9, 0, 1)
    color[need] = filled[need]
    alpha = np.maximum(soft * A, fill)
    alpha[~(region_ext | (fill > 0))] = 0
    alpha = np.where(region_ext & ~need, np.maximum(alpha, 0), alpha)
    # ink line where invented silhouette meets background
    a_bin = alpha > 0.5
    edge = a_bin & ~cv2.erode(a_bin.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
    ink_zone = edge & (fill > 0.5) & need
    # only where neighbour outside is NOT original solid of this part's band (i.e. true new edge)
    color[ink_zone] = color[ink_zone] * 0.15 + np.array([0.05, 0.05, 0.05]) * 0.85
    # invented (filled) areas: comic-style shading + diagonal ink hatching toward the edges so caps are not flat
    inv = need & (fill > 0.3)
    if inv.any():
        din = cv2.distanceTransform((alpha > 0.5).astype(np.uint8), cv2.DIST_L2, 5)
        rim = np.clip(din / 16.0, 0, 1)
        hatch = (((_xx + _yy) % 6) < 1.6) & (din < 16) & (din > 3)
        hat = hatch & (np.random.default_rng(7).random((H, W)) > (din / 16.0) ** 0.7)
        shade = (0.72 + 0.28 * rim)[..., None]
        c2 = color * shade
        c2[hat] = c2[hat] * 0.35 + 0.04 * 0.65
        w8 = np.clip(fill, 0, 1)[..., None] * inv[..., None]
        color = color * (1 - w8) + c2 * w8
    if n == 'pelvis':  # round off the hidden lower flaps + crotch point so raised thighs never reveal sharp shards
        clip = soft_poly([(80,550),(456,550),(456,650),(446,690),(410,728),(330,752),(268,758),(206,752),(126,728),(90,690),(80,650)], 1.5)
        alpha = alpha * clip
        cb = clip > 0.5
        ce = cb & ~cv2.erode(cb.astype(np.uint8), np.ones((7, 7), np.uint8)).astype(bool) & (alpha > 0.3) & (_yy > 640)
        color[ce] = color[ce] * 0.2 + 0.04 * 0.8
    if n in ('thigh_L', 'thigh_R'):  # trim the inner crotch spike (hidden by the pelvis at rest)
        sp = ((_yy > 688) & (_yy < 790) & ((_xx > 252) if n == 'thigh_L' else (_xx < 284))) | ((_yy < 750) & ((_xx > 232) if n == 'thigh_L' else (_xx < 304)))
        alpha = np.where(sp, 0, alpha)
        cb = (alpha > 0.5)
        ce = cb & ~cv2.erode(cb.astype(np.uint8), np.ones((7, 7), np.uint8)).astype(bool) & cv2.dilate(sp.astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool)
        color[ce] = color[ce] * 0.2 + 0.04 * 0.8
    # drop stray alpha islands (specks)
    nl, lab_, st, _ = cv2.connectedComponentsWithStats((alpha > 0.08).astype(np.uint8), connectivity=8)
    if nl > 2:
        bigc = st[1:, 4].max()
        for i in range(1, nl):
            if st[i, 4] < 0.02 * bigc: alpha[lab_ == i] = 0
    out = np.dstack([color, alpha])
    ys2, xs2 = np.nonzero(alpha > 0.004)
    x0, x1, y0, y1 = xs2.min(), xs2.max() + 1, ys2.min(), ys2.max() + 1
    crop = (np.clip(out[y0:y1, x0:x1], 0, 1) * 255 + 0.5).astype(np.uint8)
    Image.fromarray(crop, 'RGBA').save(os.path.join(OUT, n + '.png'), optimize=True)
    meta['parts'][n] = {'x': int(x0), 'y': int(y0), 'w': int(x1 - x0), 'h': int(y1 - y0)}
    print(n, meta['parts'][n])
json.dump(meta, open(os.path.join(HERE, '..', 'gavin', 'parts_meta.json'), 'w'), indent=1)
