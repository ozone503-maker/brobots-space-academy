"""Headless capture of the fight scene (fight3d.html?auto&cap). usage:
python3 capture.py OUTDIR SECONDS FPS [extra query]   -> OUTDIR/f00000.png ... (phone portrait 390x844 @2x)"""
import sys, os, subprocess, time
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
out, secs, fps = sys.argv[1], float(sys.argv[2]), int(sys.argv[3]); q = sys.argv[4] if len(sys.argv) > 4 else ''
os.makedirs(out, exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8771', '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(channel='chrome', headless=True, args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = b.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
        pg.on('pageerror', lambda e: print('pageerror:', e))
        pg.on('console', lambda m: m.type in ('error', 'warning') and print('console:', m.text))
        pg.goto('http://127.0.0.1:8771/fight3d.html?auto&cap&speed=1' + q)
        pg.wait_for_function('window.__rigReady === true && typeof window.capStep === "function"', timeout=60000)
        pg.wait_for_timeout(1500)
        warm = float(os.environ.get('WARM', '1.8'))
        pg.evaluate(f'(()=>{{for(let i=0;i<{int(warm*60)};i++) window.capStep(1000/60)}})()')
        n = int(secs * fps)
        for i in range(n):
            pg.evaluate(f'window.capStep({1000/fps})')
            pg.screenshot(path=os.path.join(out, 'f%05d.png' % i))
            if i % 30 == 0: print('frame', i, 'gavin skull-to-feet device px', round(pg.evaluate('window.__rigHeightPx()')), 'states', pg.evaluate('window.__states ? window.__states() : ""'))
        b.close()
finally:
    srv.terminate()
