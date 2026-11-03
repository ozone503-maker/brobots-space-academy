"""Write gavin/skin.json from parts_meta.json and the skeleton pivots, then embed
skeleton + animations + skin into viewer.html (so it also works from file://)."""
import json, os, re
D = os.path.dirname(os.path.abspath(__file__)); RIG = os.path.join(D, '..')
sk = json.load(open(os.path.join(RIG, 'skeleton.json')))
meta = json.load(open(os.path.join(RIG, 'gavin', 'parts_meta.json')))
piv = {b['name']: b['pivot'] for b in sk['bones']}
skin = {
  "fighter": "gavin", "skeleton": "bvh-punchout-front-v1",
  "about": "Per-fighter skin. parts: image per bone, x/y = image top-left relative to the bone pivot (art px). pivots/ikTargets override the skeleton reference values for this art. scale = on-screen size multiplier vs the 662 px human reference (Tank would be about 1.17).",
  "artSize": meta['size'], "scale": 1.0, "groundY": 1231,
  "pivots": piv, "ikTargets": sk['ikTargets'], "parts": {}
}
for n, m in meta['parts'].items():
    px, py = piv[n]
    skin['parts'][n] = {"image": "parts/%s.png" % n, "x": m['x'] - px, "y": m['y'] - py, "w": m['w'], "h": m['h']}
json.dump(skin, open(os.path.join(RIG, 'gavin', 'skin.json'), 'w'), indent=1)
vp = os.path.join(RIG, 'viewer.html')
if os.path.exists(vp):
    v = open(vp).read()
    anims = json.load(open(os.path.join(RIG, 'animations.json')))
    blob = json.dumps({"skeleton": sk, "animations": anims, "skins": {"gavin": skin}}, separators=(',', ':'))
    v = re.sub(r'(<script id="embedded" type="application/json">).*?(</script>)', lambda m: m.group(1) + blob + m.group(2), v, flags=re.S)
    open(vp, 'w').write(v)
print('ok')
