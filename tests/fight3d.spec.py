#!/usr/bin/env python3
"""fight3d regression check. Usage: python3 tests/fight3d.spec.py <url-to-fight3d.html> [--json out.json]
Runs headless Chromium at 390x844 with real CDP touch. Exit code 0 = all checks pass."""
import time, sys, math, json, signal, random
from playwright.sync_api import sync_playwright

URL = sys.argv[1]; OUT = sys.argv[sys.argv.index('--json') + 1] if '--json' in sys.argv else None
W, H = 390, 844
signal.signal(signal.SIGALRM, lambda *a: (_ for _ in ()).throw(TimeoutError('suite timeout')))
signal.alarm(420)  # whole suite hard limit: never hangs
PM = {'up-in': 'pHigh', 'in': 'pMid', 'down-in': 'pLow', 'out': 'hook', 'up-out': 'hook', 'down-out': 'upper', 'up': 'pHigh', 'down': 'upper', 'tap': 'jab'}
KM = {'up-out': 'kRound', 'up-in': 'kHigh', 'in': 'kMid', 'out': 'kSide', 'down-out': 'kSweep', 'down': 'kSweep', 'up': 'kHigh', 'down-in': 'kMid', 'tap': 'kMid'}
DIRS = ['in', 'up-in', 'up', 'up-out', 'out', 'down-out', 'down', 'down-in']
R = {}
def check(name, ok, info=''):
    R[name] = bool(ok); print(f"{'PASS' if ok else 'FAIL'}  {name}  {info}", flush=True)

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    ctx = b.new_context(viewport={'width': W, 'height': H}, is_mobile=True, has_touch=True); pg = ctx.new_page(); errs = []
    pg.set_default_timeout(15000)
    pg.on('console', lambda m: m.type == 'error' and errs.append(m.text)); pg.on('pageerror', lambda e: errs.append(str(e)))
    cdp = ctx.new_cdp_session(pg)
    T = lambda t, pts: cdp.send('Input.dispatchTouchEvent', {'type': t, 'touchPoints': [{'x': x, 'y': y, 'id': i} for i, (x, y) in pts]})
    n = lambda: pg.evaluate('(window.__acts||[]).length')
    def prep(cd=True):
        for _ in range(60):
            if pg.evaluate('FIGHT.F[0].state') == 'idle': break
            time.sleep(0.1)
        pg.evaluate('FIGHT.F[0].x=0;FIGHT.F[0].z=0.5;FIGHT.F[1].x=0;FIGHT.F[1].z=-0.75;FIGHT.F[1].hp=1000;FIGHT.F[1].bal=100;FIGHT.F[1].state="idle";FIGHT.F[1].downs=0;FIGHT.F[0].hp=1000;FIGHT.G.timer=3600')
        if cd: time.sleep(0.05)
    def wait_cooldown():
        time.sleep(3.1)  # sweep cooldown is 3 s
    pg.goto(URL + ('&' if '?' in URL else '?') + 'dummy=1&debug=1', wait_until='load'); time.sleep(4)
    stamp = pg.evaluate("(document.getElementById('build')||{}).textContent||''")
    check('build stamp present', len(stamp.strip()) >= 7, stamp)
    pg.tap('#go'); time.sleep(3.4)
    # 36 directions + taps
    pc, kc = round(0.3275 * W), round(0.14 * W)
    pads = [('punch', 0, (pc, round(.58 * H))), ('punch', 1, (W - pc, round(.58 * H))), ('kick', 0, (kc, round(.80 * H))), ('kick', 1, (W - kc, round(.80 * H)))]
    bad = []; tot = 0
    for pad, side, (cx, cy) in pads:
        for dname in DIRS + ['tap']:
            exp = (PM if pad == 'punch' else KM)[dname]
            prep(); k0 = n()
            if dname == 'tap': T('touchStart', [(0, (cx, cy))]); T('touchEnd', [])
            else:
                a = DIRS.index(dname) * math.pi / 4; ux = math.cos(a) * (-1 if side else 1); uy = -math.sin(a)
                T('touchStart', [(0, (cx, cy))])
                for i in range(1, 4): T('touchMove', [(0, (cx + ux * 13 * i, cy + uy * 13 * i))])
                T('touchEnd', [])
            time.sleep(0.5)
            acts = pg.evaluate('window.__acts||[]'); got = acts[-1] if len(acts) > k0 else None
            tot += 1
            if not (got and got['k'] == exp and got['hand'] == side): bad.append(f"{pad}{'LR'[side]}:{dname}->{got and got['k']}")
            if exp == 'kSweep': wait_cooldown()
    check('36 pad directions/taps', not bad, f"{tot - len(bad)}/{tot} {bad}")
    # block
    prep(); T('touchStart', [(0, (W / 2, .86 * H))]); time.sleep(0.4); g1 = pg.evaluate('FIGHT.F[0].blocking'); T('touchEnd', []); time.sleep(0.3)
    g2 = pg.evaluate('FIGHT.F[0].blocking'); check('block hold/release', g1 and not g2, f"held={g1} released={g2}")
    # super
    prep(); pg.evaluate('FIGHT.F[0].meter=100'); T('touchStart', [(0, (pc, .58 * H)), (1, (W - pc, .58 * H))]); time.sleep(1.2); T('touchEnd', []); time.sleep(0.3)
    sk = pg.evaluate('(window.__acts.slice(-1)[0]||{}).k'); check('super', sk == 'super', sk)
    # sweep: cannot KO, no knockdown count, cooldown
    prep(); wait_cooldown(); pg.evaluate('FIGHT.F[1].hp=500;FIGHT.F[1].downs=2')
    def sweep():
        T('touchStart', [(0, (W - kc, .80 * H))]); [T('touchMove', [(0, (W - kc - 10 * i, .80 * H + 14 * i))]) for i in (1, 2, 3)]; T('touchEnd', [])
    sweep(); time.sleep(1.6); st = pg.evaluate('[FIGHT.F[1].hp,FIGHT.F[1].downs,FIGHT.G.mode,FIGHT.F[1].state]')
    k0 = n(); sweep(); time.sleep(0.4); second = pg.evaluate('(window.__acts.slice(-1)[0]||{}).k')
    check('sweep cannot KO (downs not counted)', st[0] > 0 and st[1] == 2 and st[2] == 'fight', f"hp/downs/mode/state={st}")
    check('sweep cooldown', second == 'kMid', f"2nd sweep fired {second}")
    # rapid taps (fastest CDP allows)
    time.sleep(1.5); prep()
    pg.evaluate("window.__starts=0;(function w(){const f=FIGHT.F[0];if(f.state==='atk'&&(w.s!=='atk'||f.st<w.t))__starts++;w.s=f.state;w.t=f.st;requestAnimationFrame(w)})()")
    taps = 20; t0 = time.time()
    for i in range(taps):
        x = pc if i % 2 == 0 else W - pc; T('touchStart', [(0, (x, .58 * H))]); T('touchEnd', []); time.sleep(0.12)
    time.sleep(0.8); fired = pg.evaluate('__starts'); rate = taps / (time.time() - t0 - 0.8)
    check('rapid taps not dropped', fired >= taps - 2, f"{fired}/{taps} moves started at {rate:.1f}/s")
    # 300-touch spam with cancels
    random.seed(7); t0 = time.time()
    for i in range(300):
        if time.time() - t0 > 90: break
        pts = [(j, (random.uniform(0, W), random.uniform(.3 * H, H))) for j in range(random.choice([1, 1, 2]))]
        T('touchStart', pts)
        for _ in range(random.randint(0, 2)): T('touchMove', [(j, (x + random.uniform(-40, 40), y + random.uniform(-40, 40))) for j, (x, y) in pts])
        T('touchCancel' if random.random() < 0.2 else 'touchEnd', [])
    time.sleep(2.5)
    s = pg.evaluate('[FIGHT.F[0].state, FIGHT.F[0].blocking, FIGHT.PI.guard, document.querySelectorAll(".pad.on,.pad.active").length]')
    prep(); k0 = n(); T('touchStart', [(0, (pc, .58 * H))]); T('touchEnd', []); time.sleep(0.5)
    check('300-touch spam: no stuck state', s[0] in ('idle', 'atk', 'stagger', 'block', 'getup', 'down') and not s[1] and n() > k0, f"state={s} tap-after-ok={n() > k0}")
    check('no console errors', not errs, errs[:3])
    b.close()
signal.alarm(0)
print(f"\n{sum(R.values())}/{len(R)} checks passed")
if OUT: json.dump(R, open(OUT, 'w'), indent=1)
sys.exit(0 if all(R.values()) else 1)
