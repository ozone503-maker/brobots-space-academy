# BROBOTSvsHUMANSvsALIENS Fighter Style Guide (for ChatGPT image generation)

Use this guide to draw the remaining fighters so they match the approved Gavin and Tank art.

## 1. Reference images to attach (every time)

1. Final Gavin: `/workspace/gavin3d/fighter25d/gavin_upright_full.png` (style and pose reference for humans)
2. Final Tank: `/workspace/tank/tank_full.png` (style and pose reference, especially for robots or non-humans)
3. The real photo of the person being drawn (likeness reference). Use a clear, well lit, front facing photo if possible. Add a second photo from another angle if you have one.

Tell ChatGPT which image is which, in the order attached.

## 2. Master prompt (paste as is, then add the per-fighter block)

```
Create full-body character art for a mobile fighting game, matching the attached
style references exactly (image 1: Gavin, image 2: Tank). Image 3 is the real
person to draw; keep a true, recognizable likeness of their face.

STYLE: photoreal comic-ink illustration. Thick black ink outlines, bold cel
shading with clear light and shadow shapes, fine ink hatching for texture,
rich but natural colors. The face must be drawn in the same inked style as the
body, not a pasted photo. Flattering and slightly youthful, but still clearly
the same person.

POSE: one figure only, standing upright and tall in a boxer's guard, facing the
camera. Straight spine, level shoulders, visible neck, legs straight under the
hips at about shoulder width (not crouched, not bow-legged). Both fists raised
to chin or cheek height beside the face, never covering the eyes, mouth, or jaw.
Forearms angle up naturally from the elbows.

FRAMING: full body from the top of the head (or hat) to the bottom of the feet,
with a small margin on all sides. Portrait orientation (9:16).

BACKGROUND: plain flat white or light gray background, no floor, no shadow
blob, no props, no scenery, so the figure is easy to cut out.

DO NOT include any text, logos, watermarks, borders, or extra characters.
```

## 3. Per-fighter template (append under the master prompt)

```
FIGHTER: [name exactly as given]
TYPE: [human / robot / alien]
FACE AND HAIR: [match photo; note beard, glasses, hairstyle, hat]
OUTFIT: [exact clothing and colors]
BUILD: [body type; relative size, e.g. "about 1.3x taller and bulkier than Gavin"]
EXPRESSION: [e.g. confident grin / mean glare with narrowed eyes]
SIGNATURE DETAILS: [anything that must appear, e.g. taped fists, oversized metal fists]
```

Only fill in facts you actually have for that fighter. Leave a line out rather than guessing.

## 4. Style rules summary

- Photoreal comic-ink look: thick ink lines, bold cel shading, fine hatching.
- True likeness from the real photo; flattering and youthful, never a different person.
- Face in the same ink style as the body.
- Upright boxer guard, facing the camera, straight legs, level shoulders, visible neck.
- Fists up beside the face, not covering it.
- Full body from head to feet, with margin.
- Plain flat background for cutout.
- Portrait orientation (9:16).
- One figure only. No text.

## 5. Reject checklist (regenerate or fix if ANY are true)

- [ ] Face does not look like the real person (compare side by side with the photo).
- [ ] Face looks like a photo pasted on, or a different style than the body.
- [ ] Looks old, tired, half asleep, or unflattering when that was not asked for.
- [ ] Crouched, hunched, slouched, bow-legged, or leaning heavily.
- [ ] Head sunk into the shoulders with no neck.
- [ ] Fists cover the eyes, mouth, or jaw; or fists are tiny or malformed; wrong number of fingers.
- [ ] Any part cut off (hat, head, hands, feet).
- [ ] Not facing the camera, or shown from a high or low angle.
- [ ] Background has scenery, a floor, props, a strong shadow, or a gradient that is hard to cut out.
- [ ] More than one figure, or any text, logo, or watermark.
- [ ] Line weight or shading clearly softer or thinner than Gavin and Tank.
- [ ] Outfit colors or signature details differ from what was specified.
- [ ] Landscape or square image.

## 6. Tips

- Ask for one change at a time when revising ("same image, but lift the fists to cheek height").
- If the face drifts but the body is good, keep the body and ask for "the same image with the face matched to image 3".
- Keep the approved final files as references for every new fighter so the set stays consistent.
