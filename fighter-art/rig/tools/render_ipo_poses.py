"""Render Ipo (or gavin) poses via rig.js in headless Chrome. Writes a contact sheet."""
import sys, os, subprocess, time, json
from playwright.sync_api import sync_playwright
from PIL import Image
RIG = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
fighter = sys.argv[1] if len(sys.argv)>1 else 'ipo'
out = sys.argv[2] if len(sys.argv)>2 else '/tmp/ipo_poses_sheet.png'
anims = json.load(open(os.path.join(RIG,'animations.json')))
# one key time per anim
KEYS = {
  'idle':[0.0,0.9], 'walk':[0.0,0.22,0.45], 'jab_L':[0.15], 'jab_R':[0.15],
  'hook_L':[0.28], 'hook_R':[0.28], 'upper_L':[0.32], 'upper_R':[0.32],
  'block':[0.5], 'dodge_L':[0.3], 'dodge_R':[0.3], 'hit':[0.06],
  'kick_front_L':[0.3], 'kick_front_R':[0.3], 'kick_round_L':[0.3], 'kick_round_R':[0.3],
  'fall':[0.55], 'getup':[0.5],
}
# for sheet: one representative frame per anim (18)
SHEET = [('idle',0.0),('walk',0.22),('jab_L',0.15),('jab_R',0.15),('hook_L',0.28),('hook_R',0.28),
 ('upper_L',0.32),('upper_R',0.32),('block',0.5),('dodge_L',0.3),('dodge_R',0.3),('hit',0.06),
 ('kick_front_L',0.3),('kick_front_R',0.3),('kick_round_L',0.3),('kick_round_R',0.3),('fall',0.55),('getup',0.5)]

html = f'''<!doctype html><canvas id="c" width="540" height="1100"></canvas>
<script type="module">
import {{ loadRig, channels, draw, mul, T, S }} from './rig.js?v=ipo1';
const cv=document.getElementById('c'), cx=cv.getContext('2d');
const rig = await loadRig('./', '{fighter}');
window.rig=rig;
window.renderAt=(anim,t)=>{{
  const ch=channels(rig,anim,t);
  const sc=cv.height*0.8/rig.SKIN.artSize[1]*(rig.SKIN.scale||1);
  const G=mul(S(sc,sc), T((cv.width/sc - rig.SKIN.artSize[0])/2, 40/sc));
  cx.setTransform(1,0,0,1,0,0); cx.fillStyle='#1c1a24'; cx.fillRect(0,0,cv.width,cv.height);
  draw(rig,cx,ch,G,{{flashMul:0.5}});
}};
window.rigReady=true;
</script>'''
open(os.path.join(RIG,'_pose.html'),'w').write(html)
srv=subprocess.Popen([sys.executable,'-m','http.server','8766','--bind','127.0.0.1'],cwd=RIG,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(0.7)
frames=[]
try:
  with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome',headless=True)
    pg=b.new_page(viewport={'width':540,'height':1100})
    pg.on('pageerror', lambda e: print('ERR',e))
    pg.goto('http://127.0.0.1:8766/_pose.html')
    pg.wait_for_function('window.rigReady===true', timeout=60000)
    for anim,t in SHEET:
      pg.evaluate(f'window.renderAt("{anim}",{t})')
      path=f'/tmp/ipo_pose_{anim}_{t}.png'
      pg.locator('#c').screenshot(path=path)
      frames.append((anim,t,path))
      print('ok', anim, t)
    b.close()
finally:
  srv.terminate()
# contact sheet 6x3
cells=[Image.open(p).convert('RGB').resize((180,366)) for _,_,p in frames]
m=Image.new('RGB',(180*6,366*3),(20,18,28))
for i,c in enumerate(cells):
  m.paste(c,((i%6)*180,(i//6)*366))
m.save(out)
print('wrote', out, 'bytes', os.path.getsize(out))
