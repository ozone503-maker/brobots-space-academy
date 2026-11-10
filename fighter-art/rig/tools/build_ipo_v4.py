#!/usr/bin/env python3
"""Ipo v4: T-pose arms from ipo-arms-out.jpg, full ears from full-body-v2,
deeper joint overlaps, color match, local $0.

Idempotent: body/leg/boot parts are always restored from the v3 snapshot
before any leg processing, so re-runs do not stack extensions.
"""
from __future__ import annotations
import json, os, shutil
from pathlib import Path
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageChops

HERE = Path(__file__).resolve().parent
IPO = HERE.parent / 'ipo'
PARTS = IPO / 'parts'
TPOSE = Path('/workspace/muse_zip2/ipo-arms-out.jpg')
FULL = Path('/workspace/muse_zip2/ipo-full-body-v2.png')
V3BODY = Path('/workspace/ipo_v3_body_backup')
MUSE = Path('/workspace/muse_zip2')

GAVIN = json.loads((HERE.parent / 'gavin' / 'skin.json').read_text())
V3SKIN = json.loads((V3BODY / 'skin.json').read_text())
skin = json.loads((IPO / 'skin.json').read_text())
meta = json.loads((IPO / 'parts_meta.json').read_text())
PIV = skin['pivots']
ART_W, ART_H, GROUND_Y = 534, 1265, 1231

GI_TGT = None
FUR_TGT = None
HAND_TGT = None  # T-pose hand fur


def load_rgba(path):
    return Image.open(path).convert('RGBA')


def crop_thr(im, thr=40):
    a = np.array(im)
    a[..., 3] = np.where(a[..., 3] < thr, 0, a[..., 3])
    im = Image.fromarray(a, 'RGBA')
    b = im.getbbox()
    return im.crop(b) if b else im


def remove_white_bg(rgb, lo=10, hi=36):
    """Soft alpha from white background. Decontaminate edges only.
    Does not punch interior near-white gi highlights."""
    rgb_f = rgb.astype(np.float32)
    dist = np.sqrt(((255.0 - rgb_f) ** 2).sum(2))
    alpha = np.clip((dist - lo) / max(1.0, hi - lo), 0, 1)
    a3 = np.maximum(alpha, 1e-4)[..., None]
    fg = np.clip((rgb_f - (1.0 - alpha)[..., None] * 255.0) / a3, 0, 255)
    edge = (alpha > 0.05) & (alpha < 0.92)
    out_rgb = rgb_f.copy()
    out_rgb[edge] = fg[edge]
    out = np.dstack([out_rgb, alpha * 255.0])
    return np.clip(out, 0, 255).astype(np.uint8)


def sharpen(im, amt=1.35):
    rgb = ImageEnhance.Sharpness(im.convert('RGB')).enhance(amt)
    return Image.merge('RGBA', (*rgb.split(), im.split()[-1]))


def unsharp(im, radius=1.2, percent=130, threshold=2):
    rgb = im.convert('RGB').filter(ImageFilter.UnsharpMask(radius=radius, percent=percent, threshold=threshold))
    return Image.merge('RGBA', (*rgb.split(), im.split()[-1]))


def color_shift(im, target_mean, strength=0.45, mask_fn=None):
    a = np.array(im).astype(np.float32)
    solid = a[..., 3] > 40
    if mask_fn is not None:
        use = solid & mask_fn(a)
    else:
        use = solid
    if not use.any():
        return im
    cur = a[use, :3].mean(0)
    shift = (np.array(target_mean, dtype=np.float32) - cur) * strength
    a[..., :3] += shift
    a[..., :3] = np.clip(a[..., :3], 0, 255)
    return Image.fromarray(a.astype(np.uint8), 'RGBA')


def is_gi(a):
    lum = a[..., :3].mean(2)
    sat = a[..., :3].max(2) - a[..., :3].min(2)
    return (lum > 140) & (sat < 55) & (a[..., 3] > 30)


def is_fur(a):
    return (a[..., 0] > 140) & (a[..., 0] > a[..., 1] + 18) & (a[..., 3] > 30)


def tube_mask(im, side_feather=0.07, end_round=0.10, min_half=0.36):
    """Feather a rectangular sleeve into a rounded tube. Does not fill interiors."""
    a = np.array(im).astype(np.float32)
    h, w = a.shape[:2]
    xs = np.arange(w, dtype=np.float32)
    ys = np.arange(h, dtype=np.float32)
    cx, cy = (w - 1) / 2.0, (h - 1) / 2.0
    # horizontal half-width: full in the midsection, taper at the ends (rounded caps)
    # vertical: feather left/right long sides
    mask = np.ones((h, w), np.float32)
    # long sides
    half = w * 0.5
    side = np.clip((half - 0.5 - np.abs(xs - cx)) / max(1.0, w * side_feather), 0, 1)
    mask *= side[None, :]
    # rounded ends
    ntop = max(6, int(h * end_round))
    nbot = max(6, int(h * end_round))
    for y in range(ntop):
        t = (y + 1) / ntop
        half_y = w * (min_half + (0.50 - min_half) * t)
        mask[y] *= np.clip((half_y - np.abs(xs - cx)) / max(1.0, half_y * 0.22), 0, 1)
    for i in range(nbot):
        y = h - 1 - i
        t = (i + 1) / nbot
        half_y = w * (min_half + (0.50 - min_half) * t)
        mask[y] *= np.clip((half_y - np.abs(xs - cx)) / max(1.0, half_y * 0.22), 0, 1)
    a[..., 3] *= mask
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA')


def cap_opaque(im, px, side='both', min_frac=0.38):
    """Short rounded OPAQUE cap of cloned fabric. No ghost-fade triangles."""
    if px <= 0:
        return im
    a = np.array(im)
    def make_cap(src_rows, px, tip_first):
        cap = np.zeros((px, src_rows.shape[1], 4), np.uint8)
        # row touching the original image uses src_rows[0]
        if tip_first:
            for i in range(px):
                cap[px - 1 - i] = src_rows[min(i, src_rows.shape[0] - 1)]
        else:
            for i in range(px):
                cap[i] = src_rows[min(i, src_rows.shape[0] - 1)]
        h, w = cap.shape[:2]
        xs = np.arange(w)
        cx = (w - 1) / 2.0
        for i in range(h):
            t = (i + 0.5) / h if tip_first else (h - i - 0.5) / h  # 0 at tip
            half = w * (min_frac + (0.50 - min_frac) * t)
            m = np.clip((half - np.abs(xs - cx)) / 2.0, 0, 1)
            cap[i, ..., 3] = (cap[i, ..., 3].astype(np.float32) * m).astype(np.uint8)
        return cap

    if side in ('top', 'both'):
        src = a[: min(16, a.shape[0])]
        a = np.vstack([make_cap(src, px, tip_first=True), a])
    if side in ('bot', 'both'):
        src = a[max(0, a.shape[0] - 16):][::-1]  # first row = closest to edge
        a = np.vstack([a, make_cap(src, px, tip_first=False)])
    return Image.fromarray(a, 'RGBA')


def round_corners_only(im, top=0.06, bot=0.06, min_half=0.38):
    """Lightly feather hard rectangular corners. No added caps."""
    a = np.array(im).astype(np.float32)
    h, w = a.shape[:2]
    xs = np.arange(w, dtype=np.float32)
    cx = (w - 1) / 2
    n = max(4, int(h * top))
    for y in range(n):
        t = (y + 1) / n
        half = w * (min_half + (0.50 - min_half) * t)
        a[y, ..., 3] *= np.clip((half - np.abs(xs - cx)) / max(1, half * 0.22), 0, 1)
    n = max(4, int(h * bot))
    for i in range(n):
        y = h - 1 - i
        t = (i + 1) / n
        half = w * (min_half + (0.50 - min_half) * t)
        a[y, ..., 3] *= np.clip((half - np.abs(xs - cx)) / max(1, half * 0.22), 0, 1)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA')


def put(name, im, fx, fy):
    im = crop_thr(im, 18)
    im.save(PARTS / f'{name}.png', optimize=True)
    w, h = im.size
    px, py = PIV[name]
    abs_x = int(round(px - fx * w))
    abs_y = int(round(py - fy * h))
    meta['parts'][name] = {'x': abs_x, 'y': abs_y, 'w': w, 'h': h}
    skin['parts'][name] = {
        'image': f'parts/{name}.png',
        'x': int(abs_x - px), 'y': int(abs_y - py), 'w': w, 'h': h,
    }
    fill = (np.array(im)[..., 3] > 40).mean()
    print(f'{name}: {w}x{h} rel=({skin["parts"][name]["x"]},{skin["parts"][name]["y"]}) fill={fill:.2f}')
    return im


def put_from_v3(name):
    """Restore a body part and its v3 placement exactly."""
    shutil.copy2(V3BODY / f'{name}.png', PARTS / f'{name}.png')
    sp = V3SKIN['parts'][name]
    skin['parts'][name] = dict(sp)
    px, py = PIV[name]
    meta['parts'][name] = {
        'x': int(px + sp['x']), 'y': int(py + sp['y']),
        'w': sp['w'], 'h': sp['h'],
    }
    print(f'{name}: restored v3 {sp["w"]}x{sp["h"]} rel=({sp["x"]},{sp["y"]})')


def scale_to_solid_width(im, target_w):
    """Uniform scale so the opaque (a>128) width matches target_w."""
    a = np.array(im)
    solid = a[..., 3] > 128
    if not solid.any():
        return im
    cols = np.where(solid.any(0))[0]
    sw = max(1, int(cols[-1] - cols[0] + 1))
    s = target_w / sw
    nw, nh = max(1, int(round(im.width * s))), max(1, int(round(im.height * s)))
    return im.resize((nw, nh), Image.LANCZOS)


def inpaint_pink_tab(im):
    """Remove leftover pink belt tabs from a thigh by inpainting with nearby gi."""
    a = np.array(im)
    r, g, b, al = a[:,:,0], a[:,:,1], a[:,:,2], a[:,:,3]
    pink = (r > 145) & (r > g + 18) & (r > b + 8) & (al > 30)
    if pink.sum() < 20:
        return im
    mask = cv2.dilate(pink.astype(np.uint8) * 255, np.ones((3, 3), np.uint8), iterations=1)
    bgr = cv2.cvtColor(a[..., :3], cv2.COLOR_RGB2BGR)
    inp = cv2.inpaint(bgr, mask, 7, cv2.INPAINT_TELEA)
    a[..., :3] = cv2.cvtColor(inp, cv2.COLOR_BGR2RGB)
    return Image.fromarray(a, 'RGBA')


def fill_side_holes(im, min_a=200, end_margin=0.12):
    """Close chewed / low-alpha gaps along the midsection of a sleeve tube."""
    a = np.array(im)
    h, w = a.shape[:2]
    y0, y1 = int(h * end_margin), int(h * (1 - end_margin))
    for y in range(y0, y1):
        good = np.where(a[y, :, 3] >= min_a)[0]
        if len(good) < 4:
            continue
        xa, xb = int(good[0]), int(good[-1])
        # running donor for color
        donor = a[y, good[len(good)//2], :3].copy()
        for x in range(xa, xb + 1):
            if a[y, x, 3] >= min_a:
                donor = a[y, x, :3].copy()
            else:
                a[y, x, :3] = donor
                a[y, x, 3] = 255
    return Image.fromarray(a, 'RGBA')


def drop_pink_gi(im):
    """Replace leftover ear-pink on a sleeve with nearby gi."""
    return inpaint_pink_tab(im)


def cut_tpose(tpose, box, rot, kind):

    x0, y0, x1, y1 = box
    tile = tpose[y0:y1, x0:x1].copy()
    rgba = remove_white_bg(tile, lo=10, hi=36)
    im = crop_thr(Image.fromarray(rgba, 'RGBA'), 16)
    im = im.rotate(rot, expand=True, resample=Image.BICUBIC)
    im = crop_thr(im, 16)
    return im


def main():
    global GI_TGT, FUR_TGT, HAND_TGT, skin, meta
    PARTS.mkdir(parents=True, exist_ok=True)
    assert V3BODY.is_dir(), f'missing v3 body snapshot at {V3BODY}'

    # Restore body/legs/boots so this script is idempotent
    for n in ['torso', 'pelvis', 'thigh_L', 'thigh_R', 'shin_L', 'shin_R',
              'boot_L', 'boot_R']:
        put_from_v3(n)
    # soles are boot overlays (no pivot); copy file + v3 skin entry
    import shutil as _shutil
    for n in ['sole_L', 'sole_R']:
        _shutil.copy2(V3BODY / f'{n}.png', PARTS / f'{n}.png')
        skin['parts'][n] = dict(V3SKIN['parts'][n])
        print(f'{n}: restored v3 overlay')

    skin['about'] = (
        'Ipo v4: body from ipo-full-body-v2; arms cut from ipo-arms-out T-pose '
        '(clean sleeve tube, rotated to hanging/guard bone orientation); '
        'full ears; Muse fists color-matched to T-pose fur; rounded joint caps.'
    )
    skin['fighter'] = 'ipo'
    skin['skeleton'] = 'bvh-punchout-front-v1'
    skin['ikTargets'] = GAVIN['ikTargets']
    skin['artSize'] = [ART_W, ART_H]
    skin['groundY'] = GROUND_Y
    skin['scale'] = 1.0

    torso_a = np.array(Image.open(PARTS / 'torso.png'))
    m = (torso_a[..., 3] > 80) & is_gi(torso_a.astype(np.float32))
    GI_TGT = torso_a[m, :3].mean(0) if m.any() else np.array([213, 203, 199])

    # T-pose hand fur target (lighting-consistent with new arms)
    tpose_rgb = np.array(Image.open(TPOSE).convert('RGB'))
    hand_tile = tpose_rgb[200:236, 318:424]
    dist = np.sqrt(((255 - hand_tile.astype(np.float32)) ** 2).sum(2))
    hm = dist > 25
    HAND_TGT = hand_tile[hm].mean(0) if hm.any() else np.array([220, 146, 155])

    # ---------- HEAD: full ears from full-body-v2 ----------
    fb = np.array(Image.open(FULL).convert('RGBA'))
    hx0, hy0, hx1, hy1 = 720, 28, 1195, 410
    head = fb[hy0:hy1, hx0:hx1].copy()
    Hh, Hw = head.shape[:2]
    yy, xx = np.mgrid[0:Hh, 0:Hw]
    cx = 960 - hx0
    lum = head[..., :3].mean(2)
    sat = head[..., :3].max(2) - head[..., :3].min(2)
    gi = (lum > 150) & (sat < 45) & (head[..., 3] > 20)
    pink = (head[..., 0] > 140) & (head[..., 0] > head[..., 1] + 18) & (head[..., 3] > 20)
    chin_y = 300
    mid = (yy > chin_y) & (np.abs(xx - cx) < 90)
    head[mid & gi & ~pink, 3] = 0
    head[(yy > 340) & (np.abs(xx - cx) < 80) & ~pink, 3] = 0
    head[(lum < 20) & (head[..., 3] > 0) & ~pink, 3] = 0
    him = crop_thr(Image.fromarray(head, 'RGBA'), 30)
    sw, sh = him.size
    s = min(440 / sw, 370 / sh)
    nw, nh = max(1, int(sw * s)), max(1, int(sh * s))
    him = sharpen(him.resize((nw, nh), Image.LANCZOS), 1.2)
    fy = min(0.82, 245 / nh)
    put('head', him, 0.50, fy)

    # head fur target from the NEW head
    head_a = np.array(Image.open(PARTS / 'head.png'))
    m = (head_a[..., 3] > 80) & is_fur(head_a.astype(np.float32))
    FUR_TGT = head_a[m, :3].mean(0) if m.any() else np.array([206, 138, 145])
    print('GI_TGT', GI_TGT, 'FUR_TGT', FUR_TGT, 'HAND_TGT', HAND_TGT)

    # ---------- ARMS from T-pose (clean sleeve tubes only) ----------
    # L/R = screen side. Tight boxes stay on the ear-free sleeve tube.
    # Upperarm is short in source (~30-34px along the bone before the ear);
    # we scale uniformly then cap_opaque to bone length + overlap.
    specs = {
        # hands include a sliver of cuff for wrist overlap (used only as color ref;
        # shipped fists are Muse, color-shifted)
        'hand_L':     dict(box=(312, 190, 430, 256), rot=-90, kind='hand'),
        'forearm_L':  dict(box=(408, 190, 522, 260), rot=-90, kind='fore'),
        'upperarm_L': dict(box=(500, 196, 528, 256), rot=90,  kind='upper'),
        'hand_R':     dict(box=(846, 190, 968, 256), rot=90,  kind='hand'),
        'forearm_R':  dict(box=(754, 190, 868, 260), rot=90,  kind='fore'),
        'upperarm_R': dict(box=(752, 196, 778, 256), rot=-90, kind='upper'),
    }

    cuts = {}
    for name, sp in specs.items():
        im = cut_tpose(tpose_rgb, sp['box'], sp['rot'], sp['kind'])
        cuts[name] = im
        im.save(f'/tmp/cut_{name}.png')
        print(f'cut {name} {im.size} fill={(np.array(im)[...,3]>40).mean():.2f}')

    for side in ('L',):
        # Upperarm: match sleeve width to body, stretch the short clean-tube
        # texture along the bone (source is only ~30px long before the ear),
        # then add short opaque caps for shoulder/elbow overlap.
        # Bone length ~177; fy=0.10; target h ~270 => 243px along the bone.
        ua = cuts[f'upperarm_{side}']
        ua = scale_to_solid_width(ua, 150)
        ua = ua.resize((ua.size[0], 200), Image.LANCZOS)
        ua = unsharp(sharpen(ua, 1.25), 1.1, 120, 2)
        ua = drop_pink_gi(ua)
        ua = fill_side_holes(ua)
        ua = color_shift(ua, GI_TGT, 0.60, is_gi)
        ua = cap_opaque(ua, 32, 'top', min_frac=0.40)
        ua = cap_opaque(ua, 36, 'bot', min_frac=0.40)
        ua = tube_mask(ua, side_feather=0.06, end_round=0.10, min_half=0.38)
        ax = 0.56 if side == 'L' else 0.44
        put(f'upperarm_{side}', ua, ax, 0.10)

        # Forearm: bone length ~130-138. Must NOT overshoot the fist (v3
        # "pink posts" were a length/orientation bug). Non-uniform: width
        # matches the sleeve, height fits the bone + modest overlap.
        # fy=0.86, h=184 => 158px wrist-to-elbow (20-28px past the bone).
        fa = cuts[f'forearm_{side}']
        fa = fa.resize((138, 160), Image.LANCZOS)
        fa = unsharp(sharpen(fa, 1.25), 1.1, 120, 2)
        fa = fill_side_holes(fa, min_a=180, end_margin=0.16)
        fa = color_shift(fa, GI_TGT, 0.55, is_gi)
        fa = color_shift(fa, FUR_TGT, 0.35, is_fur)
        fa = cap_opaque(fa, 10, 'top', min_frac=0.40)
        fa = cap_opaque(fa, 14, 'bot', min_frac=0.40)
        fa = tube_mask(fa, side_feather=0.05, end_round=0.09, min_half=0.38)
        put(f'forearm_{side}', fa, 0.50, 0.86)

    # Mirror the clean L sleeve for R (R T-pose sleeve is near-white and mattes poorly).
    put('upperarm_R', Image.open(PARTS / 'upperarm_L.png').transpose(Image.FLIP_LEFT_RIGHT), 0.44, 0.10)
    put('forearm_R', Image.open(PARTS / 'forearm_L.png').transpose(Image.FLIP_LEFT_RIGHT), 0.50, 0.86)

    for side in ('L', 'R'):
        # Muse true-scale fists, color-shifted toward T-pose / head fur
        hd = Image.open(V3BODY / f'fist_{side}.png').convert('RGBA')
        # blend of T-pose hand and head fur
        tgt = 0.55 * np.array(HAND_TGT) + 0.45 * np.array(FUR_TGT)
        hd = color_shift(hd, tgt, 0.55, is_fur)
        # keep v3 size and placement (110x120, fy≈0.70)
        v3f = V3SKIN['parts'][f'fist_{side}']
        # v3 rel y=-84, h=120 => fy=84/120=0.70; rel x=-55, w=110 => fx=0.50
        fx = abs(v3f['x']) / v3f['w'] if v3f['w'] else 0.50
        fy = abs(v3f['y']) / v3f['h'] if v3f['h'] else 0.70
        put(f'fist_{side}', hd, fx, fy)

    # ---------- Legs: restore v3 art, drop belt tabs, light corner rounding ----------
    for side in ('L', 'R'):
        th = Image.open(PARTS / f'thigh_{side}.png').convert('RGBA')
        th = inpaint_pink_tab(th)
        th = round_corners_only(th, top=0.06, bot=0.08, min_half=0.38)
        # keep v3 placement (sizes may shrink 1-2px after rounding/crop)
        v3t = V3SKIN['parts'][f'thigh_{side}']
        fx = abs(v3t['x']) / v3t['w'] if v3t['w'] else 0.50
        fy = abs(v3t['y']) / v3t['h'] if v3t['h'] else 0.25
        put(f'thigh_{side}', th, fx, fy)

        shn = Image.open(PARTS / f'shin_{side}.png').convert('RGBA')
        shn = round_corners_only(shn, top=0.08, bot=0.04, min_half=0.38)
        # Force shin tuck under the boot (same formula as v2/v3)
        shn = crop_thr(shn, 18)
        shn.save(PARTS / f'_shin_{side}_tmp.png')

        # boots already restored with v3 placement
        pass

    for side in ('L', 'R'):
        shin = Image.open(PARTS / f'_shin_{side}_tmp.png')
        boot = meta['parts'][f'boot_{side}']
        overlap = 78
        sy = boot['y'] + overlap - shin.height
        sx = PIV[f'shin_{side}'][0] - shin.width // 2
        th = meta['parts'][f'thigh_{side}']
        meta['parts'][f'shin_{side}'] = {'x': int(sx), 'y': int(sy), 'w': shin.width, 'h': shin.height}
        skin['parts'][f'shin_{side}'] = {
            'image': f'parts/shin_{side}.png',
            'x': int(sx - PIV[f'shin_{side}'][0]),
            'y': int(sy - PIV[f'shin_{side}'][1]),
            'w': shin.width, 'h': shin.height,
        }
        shin.save(PARTS / f'shin_{side}.png', optimize=True)
        (PARTS / f'_shin_{side}_tmp.png').unlink(missing_ok=True)
        print(f'  shin_{side} tuck={sy + shin.height - boot["y"]} knee_ov={th["y"] + th["h"] - sy}')

    (IPO / 'skin.json').write_text(json.dumps(skin, indent=1))
    (IPO / 'parts_meta.json').write_text(json.dumps(meta, indent=1))

    canvas = Image.new('RGBA', (ART_W, ART_H), (26, 24, 32, 255))
    for n in ['pelvis', 'thigh_L', 'thigh_R', 'shin_L', 'shin_R', 'boot_L', 'boot_R', 'torso',
              'upperarm_L', 'upperarm_R', 'forearm_L', 'forearm_R', 'fist_L', 'fist_R', 'head']:
        m = meta['parts'][n]
        canvas.alpha_composite(Image.open(PARTS / f'{n}.png'), (m['x'], m['y']))
    canvas.convert('RGB').save(IPO / 'assemble_preview.png')
    canvas.convert('RGB').save('/tmp/ipo_v4_assemble.png')
    bytes_total = sum(p.stat().st_size for p in PARTS.glob('*.png'))
    notes = [
        'Ipo v4: T-pose arms from ipo-arms-out.jpg (clean sleeve tubes, rotated,',
        'upscaled uniformly, opaque rounded caps). Full ears from full-body-v2.',
        'Muse fists color-shifted toward T-pose hand fur. v3 body/legs restored;',
        'thigh belt tabs inpainted; light corner rounding (no ghost caps).',
        f'parts_bytes={bytes_total}',
    ]
    for n, m in meta['parts'].items():
        notes.append(f"{n}: -> ({m['w']}, {m['h']})")
    (IPO / 'BUILD_NOTES.txt').write_text('\n'.join(notes) + '\n')
    print('parts_bytes', bytes_total)
    if bytes_total > 2_000_000:
        print('WARNING over 2MB')


if __name__ == '__main__':
    main()
