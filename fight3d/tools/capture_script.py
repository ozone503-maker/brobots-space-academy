"""Scripted 12s capture: walk, hook, uppercut, kick, knockdown. Writes OUTDIR/fXXXXX.png"""
import sys, os, subprocess, time
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
out, secs, fps = sys.argv[1], float(sys.argv[2]), int(sys.argv[3])
os.makedirs(out, exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8771', '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
# timeline in seconds: (t, cmd)
# show walk, hook, upper, kick, knockdown across ~12s
SCRIPT = [
  (0.0, 'walk'),
  (2.2, 'idle'),
  (2.4, 'hook'),
  (3.6, 'idle'),
  (3.8, 'upper'),
  (5.2, 'idle'),
  (5.4, 'kHigh'),
  (7.0, 'idle'),
  (7.2, 'kRound'),
  (8.8, 'idle'),
  (9.0, 'down'),
]
try:
    with sync_playwright() as p:
        b = p.chromium.launch(channel='chrome', headless=True, args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = b.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
        pg.on('pageerror', lambda e: print('pageerror:', e))
        pg.on('console', lambda m: m.type in ('error', 'warning') and print('console:', m.text[:200]))
        pg.goto('http://127.0.0.1:8771/fight3d.html?auto&cap&speed=1&script=1')
        pg.wait_for_function('window.__rigReady === true && typeof window.capStep === "function" && typeof window.__force === "function"', timeout=60000)
        pg.wait_for_timeout(1200)
        # warm into fight mode
        pg.evaluate('(()=>{for(let i=0;i<180;i++) window.capStep(1000/60)})()')
        n = int(secs * fps); si = 0
        for i in range(n):
            t = i / fps
            while si < len(SCRIPT) and SCRIPT[si][0] <= t + 1e-6:
                cmd = SCRIPT[si][1]; si += 1
                pg.evaluate(f'window.__force({cmd!r}, 1)')
                print('t=%.2f force %s' % (t, cmd), 'states', pg.evaluate('window.__states()'))
            pg.evaluate(f'window.capStep({1000/fps})')
            pg.screenshot(path=os.path.join(out, 'f%05d.png' % i))
            if i % 30 == 0:
                print('frame', i, 'px', round(pg.evaluate('window.__rigHeightPx()') or 0), 'states', pg.evaluate('window.__states()'))
        b.close()
finally:
    srv.terminate()
