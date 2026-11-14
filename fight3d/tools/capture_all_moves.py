"""Scripted capture of every Jeff move. usage: cap_v2.py OUTDIR FPS QUERY"""
import sys, os, subprocess, time
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
out, fps, q = sys.argv[1], int(sys.argv[2]), sys.argv[3]
os.makedirs(out, exist_ok=True)
SCRIPT = [(0.0,'walk'),(2.0,'idle'),(2.2,'jab'),(3.0,'jab'),(3.8,'hook'),(4.8,'hook'),(5.8,'upper'),(6.9,'upper'),(8.0,'kHigh'),(9.3,'kHigh'),
          (10.6,'kRound'),(12.0,'kRound'),(13.4,'idle'),(13.5,'@block'),(14.7,'idle'),(14.8,'@dodge1'),(15.6,'idle'),(15.7,'@dodge-1'),(16.5,'idle'),
          (16.6,'@hit'),(17.4,'idle'),(17.6,'down'),(21.6,'idle')]
SECS = 22.5
JS = {'@block': "(()=>{const f=FIGHT.F[1]; window.__force('idle'); window.__blk=1; f.state='block'; f.st=0; f.blocking=true;})()",
      '@dodge1': "(()=>{const f=FIGHT.F[1]; window.__force('idle'); window.__blk=0; f.blocking=false; f.state='dodge'; f.st=0; f.dodgeDir=1;})()",
      '@dodge-1': "(()=>{const f=FIGHT.F[1]; window.__force('idle'); f.state='dodge'; f.st=0; f.dodgeDir=-1;})()",
      '@hit': "(()=>{const f=FIGHT.F[1]; window.__force('idle'); f.state='hit'; f.st=0; f.hs=26;})()"}
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8771', '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(channel='chrome', headless=True, args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = b.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
        pg.on('pageerror', lambda e: print('pageerror:', e))
        pg.goto('http://127.0.0.1:8771/fight3d.html?auto&cap&speed=1&script=1' + q)
        pg.wait_for_function('window.__rigReady === true && typeof window.capStep === "function" && typeof window.__force === "function"', timeout=60000)
        pg.wait_for_timeout(1200)
        pg.evaluate('(()=>{for(let i=0;i<180;i++) window.capStep(1000/60)})()')
        si = 0
        for i in range(int(SECS * fps)):
            t = i / fps
            while si < len(SCRIPT) and SCRIPT[si][0] <= t + 1e-6:
                cmd = SCRIPT[si][1]; si += 1
                if cmd == 'idle': pg.evaluate("window.__blk=0; FIGHT.F[1].blocking=false")
                pg.evaluate(JS[cmd] if cmd in JS else f'window.__force({cmd!r}, 1)')
                print('t=%.2f %s' % (t, cmd), pg.evaluate('window.__states()'))
            pg.evaluate("(()=>{const f=FIGHT.F[1]; if(window.__blk){f.state='block'; f.blocking=true;}})()")
            pg.evaluate(f'window.capStep({1000/fps})')
            pg.screenshot(path=os.path.join(out, 'f%05d.png' % i))
        b.close()
finally:
    srv.terminate()
