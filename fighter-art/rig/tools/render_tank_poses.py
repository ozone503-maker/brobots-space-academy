"""Render Tank poses via rig.js in headless Chrome. Writes a contact sheet.
Uses _pose_tank.html so we don't touch the Ipo worker's _pose.html.
"""
import sys, os, subprocess, time, json
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw, ImageFont

RIG = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
fighter = sys.argv[1] if len(sys.argv) > 1 else 'tank'
out = sys.argv[2] if len(sys.argv) > 2 else '/tmp/tank_poses_sheet.png'

SHEET = [('idle',0.0),('walk',0.22),('jab_L',0.15),('jab_R',0.15),('hook_L',0.28),('hook_R',0.28),
 ('upper_L',0.32),('upper_R',0.32),('block',0.5),('dodge_L',0.3),('dodge_R',0.3),('hit',0.06),
 ('kick_front_L',0.3),('kick_front_R',0.3),('kick_round_L',0.3),('kick_round_R',0.3),('fall',0.55),('getup',0.5)]

# Extra top pad so the fedora (art y ≈ -90) is visible. Fit without skin.scale
# so the sheet is about inspection, not the 7 ft on-screen size.
html = f'''<!doctype html><canvas id="c" width="540" height="1200"></canvas>
<script type="module">
import {{ loadRig, channels, draw, mul, T, S }} from './rig.js?v=tank1';
const cv=document.getElementById('c'), cx=cv.getContext('2d');
const rig = await loadRig('./', '{fighter}');
window.rig=rig;
window.renderAt=(anim,t)=>{{
  const ch=channels(rig,anim,t);
  const padTop = 130;
  const sc=(cv.height - padTop - 20)/rig.SKIN.artSize[1];
  const G=mul(S(sc,sc), T((cv.width/sc - rig.SKIN.artSize[0])/2, padTop/sc));
  cx.setTransform(1,0,0,1,0,0); cx.fillStyle='#1c1a24'; cx.fillRect(0,0,cv.width,cv.height);
  draw(rig,cx,ch,G,{{flashMul:0.5}});
}};
window.rigReady=true;
</script>'''
html_path = os.path.join(RIG, '_pose_tank.html')
open(html_path, 'w').write(html)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8768', '--bind', '127.0.0.1'],
                       cwd=RIG, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.7)
frames = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(channel='chrome', headless=True)
        pg = b.new_page(viewport={'width': 540, 'height': 1200})
        pg.on('pageerror', lambda e: print('ERR', e))
        pg.goto('http://127.0.0.1:8768/_pose_tank.html')
        pg.wait_for_function('window.rigReady===true', timeout=60000)
        for anim, t in SHEET:
            pg.evaluate(f'window.renderAt("{anim}",{t})')
            path = f'/tmp/tank_pose_{anim}_{t}.png'
            pg.locator('#c').screenshot(path=path)
            frames.append((anim, t, path))
            print('ok', anim, t)
        b.close()
finally:
    srv.terminate()

# contact sheet 6x3 with labels
try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 14)
except Exception:
    font = ImageFont.load_default()
CW, CH, LH = 180, 400, 22
m = Image.new('RGB', (CW * 6, (CH + LH) * 3), (20, 18, 28))
d = ImageDraw.Draw(m)
for i, (anim, t, path) in enumerate(frames):
    cell = Image.open(path).convert('RGB').resize((CW, CH), Image.Resampling.LANCZOS)
    x, y = (i % 6) * CW, (i // 6) * (CH + LH)
    m.paste(cell, (x, y))
    d.text((x + 6, y + CH + 3), f'{anim} t={t}', font=font, fill=(255, 220, 140))
m.save(out)
print('wrote', out, 'bytes', os.path.getsize(out))
