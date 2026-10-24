// fight3d/input.js: touch/mouse/keyboard input, pad layout + hit-testing, swipe-to-move mapping,
// input buffer handoff (readPlayer), sweep cooldown, pad + trail drawing.
import { $, clamp, lerp } from './util.js?v=079d986';
import { T, flowT } from './moves.js?v=079d986';
import { ac } from './stage.js?v=079d986';
import { dbg } from './hud.js?v=079d986';
import { F, G, canAct } from './combat.js?v=079d986';
import { P, cock } from './anim.js?v=079d986';
import { last } from './main.js?v=079d986';

// ---------------- input ----------------
// Four swipe pads (Jessie's layout): two upper PUNCH pads, two lower KICK pads.
// Left pads = left hand/leg, right pads = right. A swipe is read by its 8-way direction from the
// touch-down point; "in" = toward screen centre, "out" = toward the edge. No labels on screen.
// Guard = both thumbs held still anywhere 0.25s. Super = both PUNCH pads held with a full meter.
// Roam = both thumbs dragged the same way.
const keys = {};
const app = $('app');
const trailCv = $('trail'), tctx = trailCv.getContext('2d');
const ptrs = new Map(); // pointerId -> state
const trails = []; // {pts:[{x,y,t}], side, kind, dead}
const SWIPE_PX = 25, COMMIT_PX = 70, TAP_MS = 350, STILL_PX = 18, GUARD_MS = 250, SUPER_CHARGE = 30;
// Jessie's staggered layout: punch strips inboard at mid-height, kick strips hugging the edges and lower,
// BLOCK circle bottom-centre. Fractions of the play area width (x) / height (y).
// Kick strips start ~4.5% in (out of the Android back-gesture edge) and are wider; anything outboard of a kick strip
// (including the very edge) still counts as kick, so the hit area always covers what is drawn.
const PAD = { punch: { x0: 0.255, x1: 0.40, y0: 0.42, y1: 0.74 }, kick: { x0: 0.045, x1: 0.235, y0: 0.58, y1: 0.95 }, block: { x: 0.5, y: 0.86, r: 0.12 } };
function padAt(x, y, w, h) {
  const ex = Math.min(x, w - x) / w;
  if (ex < PAD.kick.x1 && y >= PAD.kick.y0 * h) return 'kick';
  const B = PAD.block, br = Math.max(B.r * w, 44);
  if (Math.hypot(x - B.x * w, y - B.y * h) <= br) return 'block';
  return 'punch';
}
function padRects(w, h) {
  const out = [];
  for (const pad of ['punch', 'kick']) for (const side of [0, 1]) {
    const P = PAD[pad], a = side ? w * (1 - P.x1) : w * P.x0, b = side ? w * (1 - P.x0) : w * P.x1;
    out.push({ pad, side, x0: a + 2, x1: b - 2, y0: P.y0 * h, y1: P.y1 * h });
  }
  return out;
}
const PI = { guard: false, roamX: 0, roamY: 0, superCharge: 0 };
function appRect() { return app.getBoundingClientRect(); }
// 8-way direction in the pad's own frame (in/out mirrored per side)
const DIRS = ['in', 'up-in', 'up', 'up-out', 'out', 'down-out', 'down', 'down-in'];
function dir8(dx, dy, side) { const inX = side ? -dx : dx, up = -dy; let a = Math.atan2(up, inX) * 180 / Math.PI; if (a < 0) a += 360; return DIRS[Math.round(a / 45) % 8]; }
const PUNCH_MAP = { 'up-in': 'pHigh', 'in': 'pMid', 'down-in': 'pLow', 'out': 'hook', 'up-out': 'hook', 'down-out': 'upper', 'up': 'pHigh', 'down': 'upper' };
const KICK_MAP = { 'up-out': 'kRound', 'up-in': 'kHigh', 'in': 'kMid', 'out': 'kSide', 'down-out': 'kSweep', 'down': 'kSweep', 'up': 'kHigh', 'down-in': 'kMid' };
window.FIGHT_MAP = { DIRS, PUNCH_MAP, KICK_MAP };
function pDown(e) {
  if (G.mode === 'title' || G.mode === 'end' || ptrs.has(e.pointerId)) return;
  ac();
  const r = appRect(), x = e.clientX - r.left, y = e.clientY - r.top, now = performance.now();
  const side = x < r.width / 2 ? 0 : 1, pad = padAt(x, y, r.width, r.height);
  const st = { id: e.pointerId, side, pad, x0: x, y0: y, t0: now, pts: [{ x, y, t: now }] };
  st.trail = { pts: st.pts, side, kind: pad === 'kick' ? 'rail' : pad === 'block' ? 'guard' : 'arm', dead: 0 }; trails.push(st.trail);
  if (pad === 'punch') cock[side] = 1; // instant visual: fist cocks back on touch-down
  ptrs.set(e.pointerId, st); dbg('down ' + pad + (side ? 'R' : 'L') + ' @' + Math.round(x) + ',' + Math.round(y));
}
function pMove(e) {
  const st = ptrs.get(e.pointerId); if (!st) return;
  const r = appRect(), x = e.clientX - r.left, y = e.clientY - r.top, now = performance.now();
  st.pts.push({ x, y, t: now }); if (st.pts.length > 80) st.pts.shift();
  // commit early once the direction is clear, unless both thumbs are roaming together
  if (st.pad === 'block') return;
  if (!st.fired && !st.multi && Math.hypot(x - st.x0, y - st.y0) >= COMMIT_PX && !otherMoving(st)) release(st, 'commit');
}
function otherMoving(st) { for (const o of ptrs.values()) if (o !== st && !o.fired && o.pad !== 'block') { const l = o.pts[o.pts.length - 1]; if (Math.hypot(l.x - o.x0, l.y - o.y0) > STILL_PX) return true; } return false; }
function pUp(e) {
  const st = ptrs.get(e.pointerId); if (!st) return; ptrs.delete(e.pointerId);
  st.trail.dead = performance.now();
  if (st.fired || st.pad === 'block') { if (st.pad === 'block') dbg('block up'); return; }
  if (st.multi) { dbg('lift (' + st.multiKind + ', no strike)'); return; }
  release(st, 'lift');
}
// Every swipe >= 25px fires; a short tap fires the pad's tap move. Never dropped.
function release(st, why) {
  const last = st.pts[st.pts.length - 1], dx = last.x - st.x0, dy = last.y - st.y0, d = Math.hypot(dx, dy), dur = performance.now() - st.t0;
  let k, dir = 'tap';
  if (d >= SWIPE_PX) { dir = dir8(dx, dy, st.side); k = (st.pad === 'punch' ? PUNCH_MAP : KICK_MAP)[dir]; }
  else if (why === 'lift' && dur < TAP_MS) k = st.pad === 'punch' ? 'jab' : 'kMid';
  else { dbg('hold released, no strike (d=' + Math.round(d) + ')'); return; }
  st.fired = true;
  const v = d / Math.max(30, dur);
  let mod = { t: 0.5, c: 0, L: 0.35, cv: 0 };
  if (dir !== 'tap') {
    const vy = -dy / d, inX = (st.side ? -dx : dx) / d;
    let cv = 0; for (const q of st.pts) { const dev = ((q.x - st.x0) * dy - (q.y - st.y0) * dx) / d; if (Math.abs(dev) > Math.abs(cv)) cv = dev; }
    mod = { t: flowT(k, vy), c: inX, L: clamp((d - 25) / 110, 0, 1), cv: clamp(cv / d * (st.side ? -1 : 1), -0.5, 0.5) };
  }
  firePlayer(k, st.side, dir === 'tap' ? 1 : speedScale(v) * (0.94 + 0.12 * mod.L), dir + ' ' + why + ' d=' + Math.round(d) + ' t=' + mod.t.toFixed(2), mod);
}
function speedScale(v) { return clamp(lerp(T.speedMin, T.speedMax, clamp((v - 0.3) / 2.0, 0, 1)), T.speedMin, T.speedMax); }
let lastSweepT = -1e9;
function firePlayer(k, side, spd, why, mod) {
  if (k === 'kSweep') { if (performance.now() - lastSweepT < 3000) { k = 'kMid'; why = (why || '') + ' sweep on cooldown'; } else lastSweepT = performance.now(); }
  if (k === 'super' && (F[0].superUsed || F[0].meter < T.superCost)) return;
  const p = F[0].inp; p.atkF = G.frames; p.atk = k; p.spd = Math.min(spd, T.speedMax); p.mod = mod || { t: 0.5, c: 0, L: 0.35, cv: 0 }; p.hand = k === 'super' ? 1 : side;
  lastFire = { k, side, t: performance.now() };
  dbg(k + ' ' + (side ? 'R' : 'L') + ' x' + (+spd).toFixed(2) + (why ? ' (' + why + ')' : '') + (canAct(F[0]) ? '' : ' [busy: ' + F[0].state + ']'));
}
let lastFire = null;
// Real touch events for fingers (non-passive, preventDefault every phase); pointer events for the mouse only.
// Touch bookkeeping is never skipped (even between rounds), so a lost or cancelled touch can't latch block/roam/super.
let lastTouchEvt = 0;
function dropPtr(id, why) { const st = ptrs.get(id); if (!st) return; ptrs.delete(id); st.trail.dead = performance.now(); dbg('drop ' + id + ' (' + why + ')'); }
function clearTouches(why) { for (const id of [...ptrs.keys()]) dropPtr(id, why); PI.guard = false; PI.roamX = PI.roamY = 0; PI.superCharge = 0; }
const tw = (fn) => (e) => {
  lastTouchEvt = performance.now();
  const live = G.mode !== 'title' && G.mode !== 'end';
  if (live && e.cancelable) e.preventDefault(); // menus need their synthesized clicks
  if (e.type === 'touchcancel') { for (const t of e.changedTouches) dropPtr('t' + t.identifier, 'cancel'); }
  else if (live || e.type !== 'touchstart') for (const t of e.changedTouches) fn({ pointerId: 't' + t.identifier, clientX: t.clientX, clientY: t.clientY });
  // reconcile: any tracked finger the browser no longer reports is gone
  const ids = new Set([...e.touches].map(t => 't' + t.identifier));
  for (const id of [...ptrs.keys()]) if (String(id)[0] === 't' && !ids.has(id)) dropPtr(id, 'lost');
  if (e.touches.length === 0) clearTouches('all up');
};
addEventListener('visibilitychange', () => { if (document.hidden) { clearTouches('hidden'); for (const k in keys) keys[k] = false; } });
addEventListener('blur', () => { clearTouches('blur'); for (const k in keys) keys[k] = false; });
addEventListener('pagehide', () => clearTouches('pagehide'));
app.addEventListener('touchstart', tw(pDown), { passive: false });
app.addEventListener('touchmove', tw(pMove), { passive: false });
app.addEventListener('touchend', tw(pUp), { passive: false });
app.addEventListener('touchcancel', tw(pUp), { passive: false });
document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
const mouseOnly = (fn) => (e) => { if (e.pointerType !== 'mouse') return; if (e.type === 'pointerdown' && e.button !== 0) return; fn(e); };
app.addEventListener('pointerdown', mouseOnly(pDown));
addEventListener('pointermove', mouseOnly(pMove));
addEventListener('pointerup', mouseOnly(pUp));
app.addEventListener('contextmenu', e => e.preventDefault());
// per-frame two-thumb interpretation: guard, roam, super
function readTouch() {
  if (ptrs.size && performance.now() - lastTouchEvt > 8000 && [...ptrs.keys()].some(id => String(id)[0] === 't')) clearTouches('watchdog'); // no touch event for 8s
  const now = performance.now();
  const all = [...ptrs.values()];
  const live = all.filter(s => !s.fired && s.pad !== 'block');
  PI.guard = false; PI.roamX = PI.roamY = 0;
  let charging = false;
  if (all.some(s => s.pad === 'block')) PI.guard = true; // BLOCK button held
  if (live.length >= 2) {
    const [a, b] = live;
    const la = a.pts[a.pts.length - 1], lb = b.pts[b.pts.length - 1];
    const da = [la.x - a.x0, la.y - a.y0], db = [lb.x - b.x0, lb.y - b.y0];
    const ma = Math.hypot(...da), mb = Math.hypot(...db), held = now - Math.max(a.t0, b.t0);
    const bothStill = ma < STILL_PX && mb < STILL_PX, sameDir = ma > STILL_PX && mb > STILL_PX && (da[0] * db[0] + da[1] * db[1]) > 0 && held > 300;
    let kind = null;
    if (bothStill && held > GUARD_MS && a.pad === 'punch' && b.pad === 'punch' && a.side !== b.side && !F[0].superUsed && F[0].meter >= T.superCost) kind = 'super';
    else if (sameDir) kind = 'roam';
    if (kind) for (const s of [a, b]) { if (s.multiKind !== kind) dbg(kind + ' start'); s.multi = true; s.multiKind = kind; s.trail.kind = kind; }
    if (kind === 'super') { charging = true; PI.guard = true; }
    else if (kind === 'roam') { PI.roamX = clamp((da[0] + db[0]) / 100, -1, 1); PI.roamY = clamp((da[1] + db[1]) / 100, -1, 1); }
  }
  if (charging) { if (++PI.superCharge === SUPER_CHARGE) firePlayer('super', 1, 1.2, 'both punch pads held'); }
  else PI.superCharge = 0;
}
// keyboard / mouse fallbacks (desktop testing). Mouse drag works like a thumb on the pads.
const KEYMAP = {
  KeyR: ['pHigh', 0], KeyF: ['pMid', 0], KeyV: ['pLow', 0], KeyT: ['hook', 0], KeyG: ['upper', 0], KeyC: ['jab', 0],
  KeyU: ['pHigh', 1], KeyJ: ['pMid', 1], KeyM: ['pLow', 1], KeyY: ['hook', 1], KeyH: ['upper', 1], KeyN: ['jab', 1],
  Digit1: ['kHigh', 0], Digit2: ['kMid', 0], Digit3: ['kSide', 0], Digit4: ['kRound', 0], Digit5: ['kSweep', 0],
  Digit6: ['kHigh', 1], Digit7: ['kMid', 1], Digit8: ['kSide', 1], Digit9: ['kRound', 1], Digit0: ['kSweep', 1],
};
addEventListener('keydown', e => {
  if (e.repeat) return;
  keys[e.code] = true; ac();
  if (G.mode !== 'fight') return;
  if (KEYMAP[e.code]) { const [k, side] = KEYMAP[e.code]; firePlayer(k, side, e.shiftKey ? T.speedMax : 1.05, 'key ' + e.code); }
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', e => { keys[e.code] = false; });
function readPlayer() {
  readTouch();
  const p = F[0].inp;
  PI.keySuper = keys.KeyB ? (PI.keySuper || 0) + 1 : 0; if (PI.keySuper === SUPER_CHARGE) firePlayer('super', 1, 1.2, 'key B');
  let mx = PI.roamX, mz = -PI.roamY;
  if (keys.KeyA || keys.ArrowLeft) mx -= 1; if (keys.KeyD || keys.ArrowRight) mx += 1; if (keys.KeyW || keys.ArrowUp) mz += 1; if (keys.KeyS || keys.ArrowDown) mz -= 1;
  p.mx = clamp(mx, -1, 1); p.mz = clamp(mz, -1, 1); p.block = !!keys.Space || PI.guard || (PI.keySuper > 0);
}
// pads + thumb trails
function drawPads(w, h) {
  if (G.mode === 'title' || G.mode === 'end') return;
  const pulse = G.mode === 'intro' ? 0.5 + 0.5 * Math.sin(G.phaseT * 0.25) : 0, now = performance.now();
  for (const { pad, side, x0, x1, y0, y1 } of padRects(w, h)) {
    let pressed = false; for (const p of ptrs.values()) if (p.pad === pad && p.side === side && !p.fired) pressed = true;
    const flash = lastFire && lastFire.side === side && ((pad === 'kick') === lastFire.k.startsWith('k')) ? Math.max(0, 1 - (now - lastFire.t) / 300) : 0;
    const a = 0.05 + pulse * 0.08 + (pressed ? 0.07 : 0) + flash * 0.12;
    const rgb = pad === 'punch' ? '255,225,190' : '140,215,255';
    tctx.fillStyle = `rgba(${rgb},${a})`; tctx.strokeStyle = `rgba(${rgb},${0.16 + pulse * 0.2 + (pressed ? 0.2 : 0) + flash * 0.3})`; tctx.lineWidth = 1.2;
    tctx.beginPath(); tctx.roundRect(x0, y0, x1 - x0, y1 - y0, 14); tctx.fill(); tctx.stroke();
    // small direction ticks (6 used directions), no text
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rr = Math.min(x1 - x0, y1 - y0) * 0.36;
    const used = pad === 'punch' ? ['up-in', 'in', 'down-in', 'up-out', 'out', 'down-out'] : ['up-in', 'in', 'up-out', 'out', 'down-out'];
    tctx.strokeStyle = `rgba(${rgb},${0.28 + pulse * 0.3})`; tctx.lineWidth = 2;
    for (const dname of used) {
      const ang = DIRS.indexOf(dname) * 45 * Math.PI / 180, ux = Math.cos(ang) * (side ? -1 : 1), uy = -Math.sin(ang);
      tctx.beginPath(); tctx.moveTo(cx + ux * rr * 0.78, cy + uy * rr * 0.78); tctx.lineTo(cx + ux * rr, cy + uy * rr); tctx.stroke();
    }
    tctx.fillStyle = `rgba(${rgb},${0.25 + pulse * 0.3})`; tctx.beginPath(); tctx.arc(cx, cy, 2.5, 0, 7); tctx.fill();
  }
  // STUN indicator: while YOU are in hitstun/stagger/blockstun the pads fill red and the screen edges glow red
  const me0 = F[0], stun = me0.state === 'hit' ? 1 - me0.st / Math.max(1, me0.hs) : me0.state === 'stagger' ? 1 - me0.st / 16 : me0.state === 'block' && me0.st < 0 ? -me0.st / 8 : 0;
  if (stun > 0) {
    const a = clamp(stun, 0, 1);
    for (const r of padRects(w, h)) { tctx.fillStyle = `rgba(255,50,50,${0.16 * a})`; tctx.strokeStyle = `rgba(255,70,70,${0.75 * a})`; tctx.lineWidth = 3; tctx.beginPath(); tctx.roundRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0, 14); tctx.fill(); tctx.stroke(); }
    const gr = tctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.75); gr.addColorStop(0, 'rgba(255,0,0,0)'); gr.addColorStop(1, `rgba(255,30,30,${0.35 * a})`);
    tctx.fillStyle = gr; tctx.fillRect(0, 0, w, h);
  }
  // BLOCK circle with a small shield glyph
  const B = PAD.block, bx = B.x * w, by = B.y * h, br = Math.max(B.r * w, 44);
  const held = [...ptrs.values()].some(p => p.pad === 'block');
  tctx.fillStyle = `rgba(140,255,170,${0.05 + pulse * 0.08 + (held ? 0.14 : 0)})`; tctx.strokeStyle = `rgba(140,255,170,${0.2 + pulse * 0.2 + (held ? 0.35 : 0)})`; tctx.lineWidth = 1.5;
  tctx.beginPath(); tctx.arc(bx, by, br, 0, 7); tctx.fill(); tctx.stroke();
  const s2 = br * 0.32; tctx.strokeStyle = `rgba(140,255,170,${0.32 + pulse * 0.3 + (held ? 0.4 : 0)})`; tctx.lineWidth = 2;
  tctx.beginPath(); tctx.moveTo(bx, by - s2); tctx.lineTo(bx + s2 * 0.8, by - s2 * 0.6); tctx.lineTo(bx + s2 * 0.7, by + s2 * 0.2);
  tctx.quadraticCurveTo(bx + s2 * 0.4, by + s2 * 0.8, bx, by + s2); tctx.quadraticCurveTo(bx - s2 * 0.4, by + s2 * 0.8, bx - s2 * 0.7, by + s2 * 0.2);
  tctx.lineTo(bx - s2 * 0.8, by - s2 * 0.6); tctx.closePath(); tctx.stroke();
}
function drawTrails() {
  const w = trailCv.clientWidth, h = trailCv.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
  if (trailCv.width !== Math.round(w * dpr)) { trailCv.width = Math.round(w * dpr); trailCv.height = Math.round(h * dpr); }
  tctx.setTransform(dpr, 0, 0, dpr, 0, 0); tctx.clearRect(0, 0, w, h);
  drawPads(w, h);
  const now = performance.now(), COL = { arm: '255,240,210', rail: '160,220,255', chamber: '120,220,255', guard: '140,255,170', super: '255,90,190', roam: '255,255,255' };
  for (let i = trails.length - 1; i >= 0; i--) {
    const tr = trails[i], age = tr.dead ? (now - tr.dead) / 260 : 0;
    if (age >= 1) { trails.splice(i, 1); continue; }
    const pts = tr.pts.filter(p => now - p.t < 380 || !tr.dead && p === tr.pts[tr.pts.length - 1]);
    const col = COL[tr.kind] || COL.arm, a = 0.42 * (1 - age);
    tctx.lineCap = 'round'; tctx.lineJoin = 'round';
    for (let j = 1; j < pts.length; j++) {
      const f = j / pts.length; tctx.strokeStyle = `rgba(${col},${a * f})`; tctx.lineWidth = 2 + 7 * f;
      tctx.beginPath(); tctx.moveTo(pts[j - 1].x, pts[j - 1].y); tctx.lineTo(pts[j].x, pts[j].y); tctx.stroke();
    }
    const l = tr.pts[tr.pts.length - 1]; if (!tr.dead) { tctx.fillStyle = `rgba(${col},0.22)`; tctx.beginPath(); tctx.arc(l.x, l.y, 16, 0, 7); tctx.fill(); }
  }
  if (PI.superCharge > 0) { tctx.strokeStyle = 'rgba(255,90,190,0.7)'; tctx.lineWidth = 4; tctx.beginPath(); tctx.arc(w / 2, h * 0.62, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, PI.superCharge / SUPER_CHARGE)); tctx.stroke(); }
}

export { PI, drawTrails, readPlayer };
