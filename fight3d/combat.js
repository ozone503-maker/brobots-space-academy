// fight3d/combat.js: fighter state (F, G), state machine (stepFighter), startMove/dodge, hit resolution,
// stun, knockdowns (trip sweeps don't count), KO.
import * as THREE from 'three';
import { $, clamp, lerp, rnd } from './util.js?v=079d986';
import { FLOW, LIGHT, MOVES, T } from './moves.js?v=079d986';
import { FLOOR, sfx } from './stage.js?v=079d986';
import { dbg, showBanner } from './hud.js?v=079d986';
import { spark } from './anim.js?v=079d986';
import { endRound } from './main.js?v=079d986';

// ---------------- fighters + combat ----------------
function mkFighter(name, isPlayer) {
  return { name, isPlayer, x: 0, z: 0, hp: T.hp, bal: T.balMax, balDelay: 0, state: 'idle', st: 0, move: null, mk: null, hitDone: false,
    blocking: false, dodge: 0, dodgeDir: 0, react: null, meter: 0, superUsed: false, wins: 0, downs: 0, spd: 1, vx: 0, vz: 0,
    inp: { mx: 0, mz: 0, block: false, atk: null, dodge: 0, spd: 1 }, ai: { t: 0, plan: [], strafe: 1, hist: [] } };
}
const F = [mkFighter('YOU', true), mkFighter('GAVIN', false)];
const G = { mode: 'title', round: 1, timer: T.roundTime, tf: 0, hitstop: 0, shake: 0, banner: '', bannerT: 0, phaseT: 0, diff: 'normal', matchesDone: 0, frames: 0, fps: 60, winner: null };

function resetPositions() {
  F[0].x = 0; F[0].z = 1.0; F[1].x = 0; F[1].z = -1.0;
  for (const f of F) { f.hp = T.hp; f.bal = T.balMax; f.state = 'idle'; f.st = 0; f.move = null; f.dodge = 0; f.downs = 0; f.react = null; f.blocking = false; }
}
function dist() { return Math.hypot(F[1].x - F[0].x, F[1].z - F[0].z); }
function dirTo(a, b) { const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 1; return [dx / d, dz / d]; }
function canAct(f) { return f.state === 'idle' || f.state === 'block'; }
function startMove(f, k) {
  if (!canAct(f)) return false;
  if (k === 'super') { if (f.superUsed || f.meter < T.superCost) return false; f.superUsed = true; f.meter = 0; }
  f.state = 'atk'; f.move = MOVES[k]; f.mk = k; f.st = 0; f.hitDone = false; f.whiffed = false; f.blocking = false;
  f.spd = clamp(f.inp.spd || 1, T.speedMin, T.speedMax);
  if (f.isPlayer) { f.hand = f.inp.hand ?? (k === 'jab' ? 0 : 1); f.inp.hand = undefined; f.mod = f.inp.mod || { t: 0.5, c: 0, L: 0.35, cv: 0 }; f.inp.mod = undefined; const FL = FLOW[k]; f.ht = FL ? lerp(FL.ht[0], FL.ht[1], f.mod.t) : 0; (window.__acts = window.__acts || []).push({ k, hand: f.hand, spd: +f.spd.toFixed(2), ht: +f.ht.toFixed(2), t01: +f.mod.t.toFixed(2), t: Math.round(performance.now()) }); }
  return true;
}
function startDodge(f, dir) {
  if (!canAct(f)) return false; f.state = 'dodge'; f.st = 0; f.dodgeDir = dir; f.blocking = false; sfx('whoosh', 0.5); return true;
}
function resolveHit(a, d) {
  const m = a.move;
  const reach = m.reach * (a.isPlayer && a.mod ? 0.93 + 0.12 * a.mod.L : 1);
  if (dist() > reach) { a.whiffed = true; return; }
  if (d.state === 'dodge' && d.st >= 2 && d.st <= 13) { a.whiffed = true; return; }
  if (d.state === 'down' || d.state === 'ko') { a.whiffed = true; return; }
  const [fx, fz] = dirTo(a, d);
  const hitPos = new THREE.Vector3(d.x - fx * 0.28, FLOOR + (a.isPlayer && a.ht ? a.ht : m.ht ? m.ht : a.mk === 'jab' || a.mk === 'super' || a.mk === 'upper' ? 1.62 : 1.35), d.z - fz * 0.28);
  const counter = d.state === 'atk' && d.st < d.move.s;
  let scale = Math.min(T.speedMax * T.counterMul, clamp(a.spd, T.speedMin, T.speedMax) * (counter ? T.counterMul : 1));
  const htNow = a.isPlayer && a.ht ? a.ht : 0;
  if (m.sweep && !d.isPlayer && canAct(d) && !d.blocking && rnd() < 0.3) { a.whiffed = true; d.vy = 0; d.hop = 18; dbg('Gavin hopped the sweep'); return; }
  if (m.sweep && d.blocking && canAct(d)) { d.state = 'block'; d.st = -6; a.whiffed = true; spark(hitPos, 0.5, 0x88ccff); sfx('block'); dbg('sweep checked'); return; }
  const underGuard = htNow && htNow < 1.38 && !d.isPlayer && !m.sweep; // Gavin's guard is high: body/low shots get under it
  if (underGuard && d.blocking) { scale *= 0.8; dbg('under guard @' + htNow.toFixed(2)); }
  if (d.blocking && canAct(d) && !m.unblock && !underGuard) {
    d.hp -= m.dmg * T.chip; d.bal -= m.bal * T.blockBal; d.balDelay = T.balRegenDelay; d.state = 'block'; d.st = -(d.isPlayer ? Math.min(m.bs, 8) : m.bs); d.meter = Math.min(100, d.meter + 3);
    G.hitstop = Math.round(m.stop * 0.6); G.shake = m.shake * 0.4; spark(hitPos, 0.6, 0x88ccff); sfx('block');
    d.vx += fx * 0.03; d.vz += fz * 0.03;
  } else {
    if (d.blocking && m.unblock) scale *= m.unblock;
    const dmg = Math.min(Math.round(m.dmg * scale), a.mk === 'super' ? T.hp * 0.2 : m.sweep ? T.hp * 0.03 : T.hp * 0.09); // hard cap per hit; sweep ~3%
    d.hp -= dmg; d.bal -= Math.min(m.bal * scale, a.mk === 'super' ? 50 : 22);
    if (a.isPlayer || d.isPlayer) dbg('hit ' + a.mk + ' ' + dmg + ' dmg -> ' + (d.isPlayer ? 'you' : 'cpu') + ' ' + Math.max(0, Math.round(d.hp))); d.balDelay = T.balRegenDelay;
    a.meter = Math.min(100, a.meter + m.meter * scale); d.meter = Math.min(100, d.meter + m.meter * 0.5);
    d.state = 'hit'; d.st = 0; d.hs = d.isPlayer ? Math.min(m.hs, 12) : m.hs; d.move = null; d.react = (htNow ? htNow < 1.42 : m.body || (a.mk === 'hook' && rnd() < 0.5)) ? 'hitBody' : 'hitHead';
    if (a.isPlayer) a.lastHit = { k: a.mk, ht: htNow, dmg, react: d.react };
    d.vx += fx * 0.04 * scale; d.vz += fz * 0.04 * scale;
    G.hitstop = Math.round(m.stop * (counter ? 1.4 : 1) * (a.isPlayer && LIGHT[a.mk] ? 0.5 : 1)); G.shake = m.shake * scale * (counter ? 1.4 : 1);
    spark(hitPos, 1 + (scale - 1) * 2 + (a.mk === 'super' ? 2 : 0), counter ? 0xffe040 : 0xffffff);
    sfx('hit', 1 / scale);
    if (d.isPlayer) { $('flash').style.opacity = 0.9; setTimeout(() => $('flash').style.opacity = 0, 120); }
    if (counter && a.isPlayer) showBanner('COUNTER', 30);
    if (m.push) { d.vx += fx * m.push; d.vz += fz * m.push; }
    if (d.hp <= 0) { d.hp = 0; knockdown(d, true); }
    else if (m.sweep) knockdown(d, false, true); // trip: down, but never counts toward the 3-knockdown KO
    else if (d.bal <= 0) knockdown(d, false);
  }
}
function knockdown(f, ko, trip) {
  f.state = ko ? 'ko' : 'down'; f.st = 0; f.trip = !!trip; if (!trip) f.downs++; f.blocking = false; f.move = null;
  G.hitstop = 26; G.shake = 0.3; sfx('thud'); sfx('crowd', 1.2);
  if (ko || f.downs >= 3) { f.state = 'ko'; endRound(F.indexOf(f) === 0 ? 1 : 0, 'K.O.'); }
  else showBanner(trip ? 'TRIPPED' : 'DOWN', 60);
}
function stepFighter(f, o) {
  f.st++;
  { const act = canAct(f) && !(f.state === 'block' && f.st < 0); if (act && !f.wasAct) f.actF = G.frames; f.wasAct = act; }
  const inp = f.inp;
  if (f.state !== 'down' && f.state !== 'ko') {
    f.balDelay > 0 ? f.balDelay-- : (f.bal = Math.min(T.balMax, f.bal + T.balRegen));
  }
  switch (f.state) {
    case 'idle': case 'block':
      if (f.state === 'block' && f.st < 0) break;
      f.blocking = !!inp.block; f.state = f.blocking ? 'block' : 'idle';
      if (inp.dodge) { startDodge(f, inp.dodge); inp.dodge = 0; break; }
      if (inp.atk && f.isPlayer && (inp.atkF || 0) < (f.actF || 0) - 10) { dbg('dropped stale ' + inp.atk); inp.atk = null; }
      if (inp.atk) { const k = inp.atk; inp.atk = null; if (startMove(f, k)) { sfx('whoosh', k === 'jab' ? 0.6 : 1); break; } }
      { // movement relative to foe
        const [fx, fz] = dirTo(f, o); const rx = -fz, rz = fx;
        const sp = f.blocking ? 0.5 : 1;
        f.x += (fx * inp.mz * T.walk + rx * inp.mx * T.strafe) * sp;
        f.z += (fz * inp.mz * T.walk + rz * inp.mx * T.strafe) * sp;
      }
      break;
    case 'atk': {
      const m = f.move;
      if (f.st === m.s + 1 && !f.hitDone) { f.hitDone = true; resolveHit(f, o); }
      if (f.st >= 3 && f.st <= m.s) { const [fx, fz] = dirTo(f, o); f.x += fx * 0.006; f.z += fz * 0.006; } // step in
      if (f.st >= m.s + m.a + m.r + (f.whiffed ? 6 + (m.whiffR || 0) : 0)) { f.state = 'idle'; f.st = 0; f.move = null; }
      else if (f.isPlayer && inp.atk && f.hitDone && LIGHT[f.mk] && f.st >= m.s + m.a + 3) { f.state = 'idle'; f.st = 0; f.move = null; } // spam stays responsive
      break; }
    case 'dodge': if (f.st >= 18) { f.state = 'idle'; f.st = 0; } break;
    case 'hit': if (f.st >= f.hs) { f.state = f.bal < 25 ? 'stagger' : 'idle'; f.st = 0; } break;
    case 'stagger': if (f.st >= (f.isPlayer ? 16 : 40)) { f.state = 'idle'; f.st = 0; } break;
    case 'down':
      if (f.st >= (f.trip ? 90 : T.downFrames)) { f.state = 'getup'; f.st = 0; }
      break;
    case 'getup': if (f.st >= 40) { f.state = 'idle'; f.st = 0; f.bal = T.balMax * 0.6; } break;
  }
  f.x += f.vx; f.z += f.vz; f.vx *= 0.82; f.vz *= 0.82;
}
function separate() {
  const a = F[0], b = F[1]; let dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 0.001;
  if (d < T.minSep) { const p = (T.minSep - d) / 2; dx /= d; dz /= d; a.x -= dx * p; a.z -= dz * p; b.x += dx * p; b.z += dz * p; }
  for (const f of F) { const r = Math.hypot(f.x, f.z); if (r > T.ringR) { f.x *= T.ringR / r; f.z *= T.ringR / r; } }
}

export { F, G, canAct, dirTo, dist, resetPositions, separate, stepFighter };
