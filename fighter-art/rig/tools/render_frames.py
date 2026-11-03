"""Render viewer.html frames headlessly with Playwright + system Chrome.
usage: python3 render_frames.py OUTDIR anim:t [anim:t ...]   (or 'sheet' for the preview set)"""
import sys, os, subprocess, time, json
from playwright.sync_api import sync_playwright
RIG = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
specs = [a.split(':') for a in sys.argv[2:]]
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8765', '--bind', '127.0.0.1'], cwd=RIG, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(channel='chrome', headless=True)
        pg = b.new_page(viewport={'width': 600, 'height': 1100})
        pg.on('console', lambda m: print('console:', m.text))
        pg.on('pageerror', lambda e: print('pageerror:', e))
        pg.goto('http://127.0.0.1:8765/viewer.html?still=1')
        pg.wait_for_function('window.rigReady === true', timeout=15000)
        for spec in specs:
            a, t = spec[0], float(spec[1]); bones = len(spec) > 2
            pg.evaluate("b => document.getElementById('bones').checked = b", bones)
            pg.evaluate(f"window.renderAt('{a}', {t})")
            pg.locator('#cv').screenshot(path=os.path.join(out, f'{a}_{t:.3f}{"_b" if bones else ""}.png'))
        b.close()
finally:
    srv.terminate()
