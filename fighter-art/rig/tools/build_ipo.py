#!/usr/bin/env python3
"""Build Ipo Muse-part skin for shared punch-out rig. Local only, $0."""
from __future__ import annotations
import json, os, shutil
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SRC = Path('/workspace/muse_zip2')
OUT = ROOT / 'ipo'
PARTS = OUT / 'parts'
GAVIN_SKIN = json.loads((ROOT / 'gavin' / 'skin.json').read_text())

ART_W, ART_H = 534, 1265
GROUND_Y = 1231
GI = np.array([232.0, 228.0, 222.0])

def load(name: str) -> Image.Image:
    return Image.open(SRC / name).convert('RGBA')

def crop_thr(im: Image.Image, thr: int = 50) -> Image.Image:
    a = np.array(im)
    a[..., 3] = np.where(a[..., 3] < thr, 0, a[..., 3])
    im = Image.fromarray(a, 'RGBA')
    b = im.getbbox()
    return im.crop(b) if b else im

def fit(im: Image.Image, max_w: int, max_h: int) -> Image.Image:
    """Scale uniformly to fit inside max box (no squash)."""
    w, h = im.size
    s = min(max_w / w, max_h / h)
    nw, nh = max(1, int(round(w * s))), max(1, int(round(h * s)))
    return im.resize((nw, nh), Image.LANCZOS)

def stretch(im: Image.Image, w: int, h: int) -> Image.Image:
    return im.resize((w, h), Image.LANCZOS)

def round_ends(im: Image.Image, top_frac: float = 0.12, bot_frac: float = 0.08,
               top_round: bool = True, bot_round: bool = True) -> Image.Image:
    """Soft-round joint ends so overlaps hide seams; keep opaque body."""
    a = np.array(im).astype(np.float32)
    h, w = a.shape[:2]
    xs = np.arange(w, dtype=np.float32)
    cx = (w - 1) / 2.0
    if top_round:
        n = max(4, int(h * top_frac))
        for y in range(n):
            t = (y + 1) / n
            half = w * (0.35 + 0.65 * t) / 2
            mask = np.clip((half - np.abs(xs - cx)) / max(1.0, half * 0.18), 0, 1)
            a[y, ..., 3] *= mask
    if bot_round:
        n = max(4, int(h * bot_frac))
        for i in range(n):
            y = h - 1 - i
            t = (i + 1) / n
            half = w * (0.40 + 0.60 * t) / 2
            mask = np.clip((half - np.abs(xs - cx)) / max(1.0, half * 0.18), 0, 1)
            a[y, ..., 3] *= mask
    return crop_thr(Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA'), 20)

def strip_pink_belt(im: Image.Image) -> Image.Image:
    """Zero pink belt pixels and cut top rows dominated by belt."""
    a = np.array(im).astype(np.float32)
    rgb, al = a[..., :3], a[..., 3]
    pink = (rgb[..., 0] > 145) & (rgb[..., 1] < 160) & (rgb[..., 2] < 180) & (al > 25)
    # also very saturated magenta-pink
    pink |= (rgb[..., 0] > 160) & (rgb[..., 1] < 130) & (rgb[..., 2] > 100) & (al > 25) & (rgb[..., 0] > rgb[..., 1] + 40)
    a[pink, 3] = 0
    h = a.shape[0]
    cut = 0
    for y in range(int(h * 0.75)):
        row = a[y, ..., 3] > 25
        if not row.any():
            continue
        # belt row if mostly pink-ish leftover or dark band
        solid = a[y, row, :3]
        if pink[y].mean() > 0.02 or (solid.mean(1) < 90).mean() > 0.25:
            cut = y
    if cut:
        a[: min(h, cut + 12), ..., 3] = 0
    return crop_thr(Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA'), 40)

def wipe_dark_fringe(im: Image.Image, lum_max: float = 90) -> Image.Image:
    """Kill dark non-Ipo pixels (boot template / gray cuff remnants)."""
    a = np.array(im).astype(np.float32)
    lum = a[..., :3].mean(2)
    dark = (lum < lum_max) & (a[..., 3] > 15)
    # keep pink (crocs/fur) even if mid
    pink = (a[..., 0] > 140) & (a[..., 0] > a[..., 1] + 15)
    a[dark & ~pink, 3] = 0
    return crop_thr(Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA'), 30)

def clean_gi_edge(im: Image.Image) -> Image.Image:
    """Push near-opaque fabric toward gi white; drop dark speckles on edges."""
    a = np.array(im).astype(np.float32)
    solid = a[..., 3] > 40
    lum = a[..., :3].mean(2)
    # dark dirt on gi: lift toward white if not pink
    pink = (a[..., 0] > 150) & (a[..., 0] > a[..., 1] + 25)
    dirty = solid & ~pink & (lum < 140)
    for c in range(3):
        a[..., c] = np.where(dirty, a[..., c] * 0.35 + GI[c] * 0.65, a[..., c])
    # kill remaining near-black edge pixels
    a[(lum < 55) & solid & ~pink, 3] = 0
    return crop_thr(Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA'), 35)

def rel_from_abs(pivot, abs_x, abs_y, w, h):
    px, py = pivot
    return {'image': None, 'x': int(abs_x - px), 'y': int(abs_y - py), 'w': w, 'h': h}

def main():
    PARTS.mkdir(parents=True, exist_ok=True)
    pivots = dict(GAVIN_SKIN['pivots'])
    # keep shared pivots; head pivot from gavin is fine / override if needed
    pivots['head'] = [267, 230]

    meta = {'parts': {}}
    skin_parts = {}

    def save_part(name: str, im: Image.Image, abs_x: int, abs_y: int):
        path = PARTS / f'{name}.png'
        im.save(path)
        w, h = im.size
        meta['parts'][name] = {'x': abs_x, 'y': abs_y, 'w': w, 'h': h}
        px, py = pivots[name]
        skin_parts[name] = {
            'image': f'parts/{name}.png',
            'x': int(abs_x - px),
            'y': int(abs_y - py),
            'w': w, 'h': h,
        }
        print(f'{name}: {w}x{h} abs=({abs_x},{abs_y}) rel=({skin_parts[name]["x"]},{skin_parts[name]["y"]})')

    # ---------- HEAD ----------
    head = crop_thr(load('ipo-head-neck-true-scale-v3.png'), 40)
    head = fit(head, 360, 300)
    # center on head pivot, slightly above
    hx = pivots['head'][0] - head.width // 2
    hy = pivots['head'][1] - int(head.height * 0.82)
    save_part('head', head, hx, hy)

    # ---------- TORSO (keep belt — single belt layer) ----------
    torso = crop_thr(load('ipo-torso-sleeveless-v2.png'), 45)
    torso = clean_gi_edge(torso)
    torso = fit(torso, 280, 450)
    # Gavin: x=-169 y=-404 for 345x483 → top well above torso pivot
    tx = pivots['torso'][0] - torso.width // 2
    ty = pivots['torso'][1] - int(torso.height * 0.88)
    save_part('torso', torso, tx, ty)

    # ---------- PELVIS (strip belt; pants only) ----------
    pel = crop_thr(load('ipo-hips-pelvis-v2.png'), 45)
    pel = strip_pink_belt(pel)
    pel = clean_gi_edge(pel)
    # target ~300x190 like a hip piece that fills waist→thigh
    pel = fit(pel, 310, 200)
    if pel.height < 140:
        pel = stretch(pel, pel.width, 160)
    # sit under torso belt, overlap thighs
    px = pivots['pelvis'][0] - pel.width // 2
    # torso bottom approx
    torso_bot = ty + torso.height
    py = min(pivots['pelvis'][1] - 70, torso_bot - 90)
    save_part('pelvis', pel, px, py)

    # ---------- UPPER ARMS (real Muse sleeve shapes) ----------
    for side, src, ax in [
        ('L', 'ipo-left-upper-arm-v2.png', 0.52),
        ('R', 'ipo-right-upper-arm-v2.png', 0.48),
    ]:
        im = crop_thr(load(src), 45)
        im = clean_gi_edge(im)
        # Muse sleeves are tall; target width ~135–150, height ~240–270 (Gavin ~140x273)
        im = fit(im, 150, 270)
        # if still too narrow after fit (tall source), force width
        if im.width < 120:
            s = 130 / im.width
            im = im.resize((130, int(im.height * s)), Image.LANCZOS)
            if im.height > 280:
                im = im.resize((im.width, 270), Image.LANCZOS)
        im = round_ends(im, top_frac=0.14, bot_frac=0.10, top_round=True, bot_round=True)
        pv = pivots[f'upperarm_{side}']
        # pivot near shoulder (top of sleeve), like Gavin y≈-65
        ax_px = int(ax * im.width)
        ux = pv[0] - ax_px
        uy = pv[1] - int(im.height * 0.08)  # small negative → top just above pivot
        save_part(f'upperarm_{side}', im, ux, uy)

    # ---------- FOREARMS (fur + length; fist trimmed at wrist) ----------
    for side, src, fist_src in [
        ('L', 'ipo-left-forearm-v2.png', 'ipo-left-fist-true-scale-v2.png'),
        ('R', 'ipo-right-forearm-v2.png', 'ipo-right-fist-true-scale-v2.png'),
    ]:
        im = crop_thr(load(src), 45)
        a = np.array(im)
        # find white sleeve → pink fur transition; keep from ~fur start
        pink = np.zeros(a.shape[0], dtype=bool)
        for y in range(a.shape[0]):
            m = a[y, ..., 3] > 50
            if m.sum() < 8:
                continue
            rgb = a[y, m, :3].mean(0)
            pink[y] = rgb[0] > 140 and rgb[0] > rgb[1] + 20
        trans = 0
        for y in range(40, a.shape[0] - 40):
            if pink[y:y + 25].mean() > 0.7 and pink[max(0, y - 25):y].mean() < 0.25:
                trans = y
                break
        # keep a little sleeve cuff overlap at top (~8% of fur section) then fur+fist
        start = max(0, trans - int(0.02 * a.shape[0]))
        # trim fist: find wrist pinch in lower third (min width)
        widths = [(a[y, ..., 3] > 50).sum() for y in range(a.shape[0])]
        lo = int(a.shape[0] * 0.62)
        hi = int(a.shape[0] * 0.92)
        pinch = lo + int(np.argmin(widths[lo:hi]))
        # keep through pinch + small pad so forearm isn't stubby; fist is separate bone
        end = min(a.shape[0], pinch + int(0.04 * a.shape[0]))
        im = Image.fromarray(a[start:end], 'RGBA')
        im = crop_thr(im, 40)
        # scale to match bone span: Gavin forearm ~179; we want longer ~240–280 for fur reach
        im = fit(im, 130, 280)
        if im.height < 220:
            im = stretch(im, im.width, 250)
        im = round_ends(im, top_frac=0.10, bot_frac=0.06, top_round=True, bot_round=True)
        pv = pivots[f'forearm_{side}']
        # Gavin forearm y≈-146 for h=179 → pivot near top third
        fx = pv[0] - im.width // 2
        fy = pv[1] - int(im.height * 0.12)
        save_part(f'forearm_{side}', im, fx, fy)

        # fists (true-scale)
        fist = crop_thr(load(fist_src), 40)
        fist = fit(fist, 100, 120)
        fp = pivots[f'fist_{side}']
        # attach near fist pivot center
        save_part(f'fist_{side}', fist, fp[0] - fist.width // 2, fp[1] - fist.height // 2)

    # ---------- THIGHS + SHINS from Muse full pant leg ----------
    for side, src in [('L', 'ipo-left-thigh-v2.png'), ('R', 'ipo-right-thigh-v3.png')]:
        leg = crop_thr(load(src), 45)
        leg = clean_gi_edge(leg)
        W, H = leg.size
        # split: top 58% thigh, bottom 48% shin (overlap in source)
        split = int(H * 0.55)
        thigh_src = leg.crop((0, 0, W, split + int(H * 0.08)))
        shin_src = leg.crop((0, split - int(H * 0.06), W, H))

        thigh = fit(thigh_src, 170, 340)
        thigh = round_ends(thigh, top_frac=0.10, bot_frac=0.12, top_round=True, bot_round=True)
        tp = pivots[f'thigh_{side}']
        # Gavin: y≈-87 — pivot near top of thigh
        thx = tp[0] - thigh.width // 2
        thy = tp[1] - int(thigh.height * 0.12)
        save_part(f'thigh_{side}', thigh, thx, thy)

        shin = fit(shin_src, 150, 230)
        # ensure opaque hem: boost bottom rows toward gi white, keep texture
        sa = np.array(shin).astype(np.float32)
        sh, sw = sa.shape[:2]
        for i in range(min(18, sh)):
            y = sh - 1 - i
            m = sa[y, ..., 3] > 20
            # lift dark hem dirt
            for c in range(3):
                sa[y, m, c] = sa[y, m, c] * 0.4 + GI[c] * 0.6
            # keep hem opaque (no soft wipe that creates glow-gap)
            sa[y, m, 3] = np.maximum(sa[y, m, 3], 220)
        # kill any gray/dark cuff pixels in bottom 25%
        lum = sa[..., :3].mean(2)
        pink = (sa[..., 0] > 150) & (sa[..., 0] > sa[..., 1] + 20)
        bot = np.zeros(sh, dtype=bool); bot[int(sh * 0.75):] = True
        dark = (lum < 100) & (sa[..., 3] > 15) & ~pink
        sa[dark & bot[:, None], 3] = 0
        shin = crop_thr(Image.fromarray(np.clip(sa, 0, 255).astype(np.uint8), 'RGBA'), 30)
        shin = round_ends(shin, top_frac=0.12, bot_frac=0.0, top_round=True, bot_round=False)
        sp = pivots[f'shin_{side}']
        # Gavin: y≈-70 — pivot near top of shin (knee)
        sx = sp[0] - shin.width // 2
        sy = sp[1] - int(shin.height * 0.18)
        save_part(f'shin_{side}', shin, sx, sy)

    # ---------- CROCS (boots) — attach at ankle pivot ----------
    for side, src in [('L', 'ipo-left-croc-v2.png'), ('R', 'ipo-right-croc-v2.png')]:
        croc = crop_thr(load(src), 80)
        croc = wipe_dark_fringe(croc, lum_max=80)
        # mild vertical emphasis so shoe has presence, stay mostly uniform
        # natural ~2.2:1; target ~190x110 (slight height boost)
        croc = fit(croc, 200, 120)
        if croc.height < 95:
            croc = stretch(croc, croc.width, 105)
        # ensure no gray template pixels remain
        ca = np.array(croc).astype(np.float32)
        lum = ca[..., :3].mean(2)
        pink = (ca[..., 0] > 130) & (ca[..., 0] > ca[..., 1] + 10)
        # keep only pink-ish shoe pixels + soft edges near pink
        keep = pink | ((ca[..., 3] > 40) & (lum > 120) & (ca[..., 0] > 110))
        ca[~keep, 3] = 0
        croc = crop_thr(Image.fromarray(np.clip(ca, 0, 255).astype(np.uint8), 'RGBA'), 40)

        bp = pivots[f'boot_{side}']
        # Ankle pivot in UPPER shoe (opening). Gavin boot y≈-70 for tall boot.
        # For flat croc: pivot ~25–35% down from top → y_rel negative.
        bx = bp[0] - croc.width // 2
        by = bp[1] - int(croc.height * 0.32)
        # nudge so sole near ground in bind pose
        bot = by + croc.height
        if bot < GROUND_Y - 40:
            by += (GROUND_Y - 25) - bot
        if bot > GROUND_Y + 5:
            by -= bot - (GROUND_Y - 5)
        save_part(f'boot_{side}', croc, bx, by)

    # Force shin hem to tuck over croc top (recompute shin y after boot settle)
    for side in ('L', 'R'):
        shin = Image.open(PARTS / f'shin_{side}.png')
        boot = meta['parts'][f'boot_{side}']
        overlap = 42  # px of shin over croc top
        new_sy = boot['y'] + overlap - shin.height
        # also keep knee overlap with thigh
        thigh = meta['parts'][f'thigh_{side}']
        knee_needed = thigh['y'] + thigh['h'] - 90  # shin top should be at/above this
        new_sy = min(new_sy, knee_needed)
        sp = pivots[f'shin_{side}']
        meta['parts'][f'shin_{side}']['y'] = new_sy
        skin_parts[f'shin_{side}']['y'] = int(new_sy - sp[1])
        print(f'  shin_{side} tuck fix: y={new_sy} hem={new_sy+shin.height} boot_top={boot["y"]} overlap={new_sy+shin.height-boot["y"]}')

    # ---------- SOLES (kick overlays) ----------
    for side, src in [('L', 'ipo-left-sole-true-scale-v2.png'), ('R', 'ipo-right-sole-true-scale-v2.png')]:
        sole = crop_thr(load(src), 40)
        sole = fit(sole, 180, 380)
        sole.save(PARTS / f'sole_{side}.png')
        meta['parts'][f'sole_{side}'] = {'x': 0, 'y': 0, 'w': sole.width, 'h': sole.height, 'overlay': True}
        # mirror gavin sole attachment style
        skin_parts[f'sole_{side}'] = {
            'image': f'parts/sole_{side}.png',
            'bone': f'boot_{side}',
            'scale': 0.42,
            'x': -sole.width * 0.42 / 2,
            'y': -sole.height * 0.42 * 0.85,
            'shadow': True,
            'w': sole.width,
            'h': sole.height,
        }
        print(f'sole_{side}: {sole.size}')

    # ---------- skin.json ----------
    skin = {
        'name': 'ipo',
        'artSize': [ART_W, ART_H],
        'groundY': GROUND_Y,
        'scale': 1.0,
        'pivots': pivots,
        'parts': skin_parts,
        'drawOrder': [
            'pelvis', 'thigh_L', 'thigh_R', 'shin_L', 'shin_R',
            'boot_L', 'boot_R', 'torso',
            'upperarm_L', 'upperarm_R', 'forearm_L', 'forearm_R',
            'fist_L', 'fist_R', 'head',
            'sole_L', 'sole_R',
        ],
    }
    # preserve any extra gavin skin keys if present
    for k in ('flashColor', 'shadow'):
        if k in GAVIN_SKIN:
            skin[k] = GAVIN_SKIN[k]

    (OUT / 'skin.json').write_text(json.dumps(skin, indent=1))
    (OUT / 'parts_meta.json').write_text(json.dumps(meta, indent=1))

    # assemble preview (bind-pose absolute)
    canvas = Image.new('RGBA', (ART_W, ART_H), (26, 24, 32, 255))
    order = ['pelvis', 'thigh_L', 'thigh_R', 'shin_L', 'shin_R', 'boot_L', 'boot_R',
             'torso', 'upperarm_L', 'upperarm_R', 'forearm_L', 'forearm_R', 'fist_L', 'fist_R', 'head']
    for n in order:
        m = meta['parts'][n]
        im = Image.open(PARTS / f'{n}.png')
        canvas.alpha_composite(im, (m['x'], m['y']))
    canvas.convert('RGB').save('/tmp/ipo_v2e_assemble.png')
    canvas.convert('RGB').save(OUT / 'assemble_preview.png')

    bytes_total = sum((PARTS / f).stat().st_size for f in os.listdir(PARTS) if f.endswith('.png'))
    notes = []
    for n, m in meta['parts'].items():
        notes.append(f"{n}: -> ({m['w']}, {m['h']})")
    notes.append(f'\nparts_bytes={bytes_total}')
    # ankle checks
    for side in ('L', 'R'):
        s, b = meta['parts'][f'shin_{side}'], meta['parts'][f'boot_{side}']
        notes.append(f"ankle_{side}: shin_hem={s['y']+s['h']} boot_top={b['y']} tuck={s['y']+s['h']-b['y']}")
        # foreign pixel check on boot
        ba = np.array(Image.open(PARTS / f'boot_{side}.png'))
        lum = ba[..., :3].mean(2)
        pink = (ba[..., 0] > 130) & (ba[..., 0] > ba[..., 1] + 8)
        foreign = ((ba[..., 3] > 40) & ~pink & (lum < 110)).sum()
        notes.append(f"boot_{side}_foreign_dark_px={int(foreign)}")
    (OUT / 'BUILD_NOTES.txt').write_text('\n'.join(notes) + '\n')
    print('parts_bytes', bytes_total)
    print('wrote', OUT)

if __name__ == '__main__':
    main()
