#!/usr/bin/env python3
"""Make every part's interior fully opaque.

Flood-fill from the canvas border through low-alpha pixels to mark the true
background. Everything inside the silhouette gets alpha 255 (RGB inpainted
where a hole was keyed out). A 1-2 px antialiased edge is left alone so
outlines stay smooth. Does not crop, so skin.json offsets stay valid.
"""
from __future__ import annotations
import os, sys, json
import numpy as np
import cv2
from PIL import Image

EDGE_PX = 2.0
OUTSIDE_THR = 10  # alpha below this is treated as empty for the flood


def harden(arr: np.ndarray, edge_px: float = EDGE_PX, outside_thr: int = OUTSIDE_THR) -> np.ndarray:
    a = arr[..., 3]
    h, w = a.shape
    empty = (a < outside_thr).astype(np.uint8)
    pad = np.pad(empty, 1, constant_values=1)
    _, lab = cv2.connectedComponents(pad, 8)
    outside = lab[1:-1, 1:-1] == lab[0, 0]
    sil = ~outside
    if not sil.any():
        return arr
    dist = cv2.distanceTransform(sil.astype(np.uint8), cv2.DIST_L2, 5)
    interior = sil & (dist > edge_px)
    out = arr.copy()
    # Inpaint RGB for interior holes so we don't leave premultiplied black/white
    need = interior & (a < 16)
    if need.any():
        mask = need.astype(np.uint8) * 255
        # Seed inpaint with nearby opaque colors; TELEA fills small keyed holes
        rgb = cv2.inpaint(out[..., :3], mask, 5, cv2.INPAINT_TELEA)
        out[..., :3] = rgb
    out[interior, 3] = 255
    out[outside, 3] = 0
    # Don't invent edge coverage: leave the 1-2 px band's existing AA,
    # but snap near-solid edge pixels up so a 254 fringe doesn't linger inward.
    band = sil & ~interior
    near = band & (out[..., 3] >= 220)
    out[near, 3] = 255
    return out


def process_folder(fighter: str, dry=False):
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', fighter))
    parts = os.path.join(root, 'parts')
    changed = []
    for fn in sorted(os.listdir(parts)):
        if not fn.endswith('.png'):
            continue
        path = os.path.join(parts, fn)
        im = np.array(Image.open(path).convert('RGBA'))
        hard = harden(im)
        # stats
        a0, a1 = im[..., 3], hard[..., 3]
        from cv2 import erode, getStructuringElement, MORPH_ELLIPSE
        k = getStructuringElement(MORPH_ELLIPSE, (5, 5))
        interior0 = erode((a0 > 20).astype(np.uint8), k, 1).astype(bool)
        n_before = int((interior0 & (a0 < 255)).sum()) if interior0.any() else 0
        interior1 = erode((a1 > 20).astype(np.uint8), k, 1).astype(bool)
        n_after = int((interior1 & (a1 < 255)).sum()) if interior1.any() else 0
        same = np.array_equal(im, hard)
        print(f'  {fn:18s} int_lt255 {n_before:6d} -> {n_after:6d}  {"unchanged" if same else "hardened"}')
        if not same and not dry:
            Image.fromarray(hard).save(path, optimize=True, compress_level=9)
            changed.append(fn)
    folder = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(root) for f in fs)
    print(f'{fighter}: {len(changed)} files written, folder {folder} ({folder/1024/1024:.2f} MB)'
          f' {"OVER 2MB" if folder > 2_000_000 else "ok"}')
    return folder, changed


if __name__ == '__main__':
    targets = sys.argv[1:] or ['ipo', 'tank']
    for t in targets:
        print(f'======= {t} =======')
        process_folder(t)
