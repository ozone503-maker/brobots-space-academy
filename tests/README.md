# fight3d regression test

`tests/fight3d.spec.py` drives the real page in headless Chromium (390x844, real CDP touch events) using the debug hooks (`?dummy=1&debug=1`, `window.FIGHT`, `window.__acts`, `window.__dbgLines`).

## Setup (once)
    pip install playwright && python3 -m playwright install chromium

## Run
    # local (serve the repo root first: python3 -m http.server 8765)
    python3 tests/fight3d.spec.py http://localhost:8765/fight3d.html
    # preview
    python3 tests/fight3d.spec.py https://brobots-space-academy-git-fight3d-v1-ozone503-6682.vercel.app/fight3d.html --json /tmp/result.json

Takes about 3.5 minutes. It has a hard 7-minute timeout, so it can't hang. Exit code 0 means every check passed.

## Checks
- the build stamp (`#build`) is present
- all 36 pad swipes/taps (2 punch + 2 kick pads x 8 directions + tap) map to the right move and hand
- block circle hold/release
- super (two-thumb hold with full meter)
- the sweep can't KO and doesn't count toward the 3-knockdown KO; a second sweep inside 3 s becomes a mid kick (cooldown)
- rapid taps are not dropped (moves actually start, counted per frame)
- a 300-touch random spam with cancels leaves no stuck state, and a tap still works afterwards
- no console errors or page errors

## Release rule
Run this before sending Jessie a preview link. After committing code, re-stamp with `sh tests/stamp.sh <oldhash> <newhash>`, commit, push, then run the spec against the preview.
