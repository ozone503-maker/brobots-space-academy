"""Render key frames of every animation through viewer.html (headless Chrome) and
build gavin/preview_sheet.png: one labeled row per animation."""
import os, subprocess, sys
from PIL import Image, ImageDraw, ImageFont
HERE = os.path.dirname(os.path.abspath(__file__)); RIG = os.path.join(HERE, '..')
FR = '/tmp/rig_preview_frames'
KEYS = [('idle', 'Idle', [0, 0.4, 0.8, 1.2]), ('jab_L', 'Jab left', [0, 0.07, 0.15, 0.4]),
        ('jab_R', 'Jab right', [0, 0.07, 0.15, 0.4]), ('block', 'Block', [0, 0.08, 0.4, 0.95]),
        ('dodge_L', 'Dodge left', [0, 0.09, 0.4, 0.75]), ('dodge_R', 'Dodge right', [0, 0.09, 0.4, 0.75]),
        ('hit', 'Hit reaction', [0, 0.06, 0.2, 0.5])]
specs = [f'{a}:{t}' for a, _, ts in KEYS for t in ts]
subprocess.run([sys.executable, os.path.join(HERE, 'render_frames.py'), FR] + specs, check=True)
CW, CH = 240, 430; LW = 150
def font(sz):
    for p in ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf']:
        if os.path.exists(p): return ImageFont.truetype(p, sz)
    return ImageFont.load_default()
F1, F2 = font(20), font(14)
sheet = Image.new('RGB', (LW + CW * 4 + 10, 60 + CH * len(KEYS)), (16, 17, 24))
d = ImageDraw.Draw(sheet)
d.text((14, 16), 'GAVIN rig preview (skeleton bvh-punchout-front-v1), key frames rendered by viewer.html', font=F1, fill=(240, 240, 245))
for r, (a, label, ts) in enumerate(KEYS):
    y = 60 + r * CH
    d.text((14, y + CH // 2 - 12), label, font=F1, fill=(255, 210, 120))
    for c, t in enumerate(ts):
        im = Image.open(os.path.join(FR, f'{a}_{t:.3f}.png')).convert('RGB').crop((30, 40, 510, 900))
        im = im.resize((CW - 8, int((CW - 8) * im.height / im.width)), Image.LANCZOS)
        sheet.paste(im, (LW + c * CW, y + 4))
        d.text((LW + c * CW + 6, y + 8), f't = {t:.2f} s', font=F2, fill=(255, 255, 255))
out = os.path.join(RIG, 'gavin', 'preview_sheet.png'); sheet.save(out, optimize=True); print(out, sheet.size)
