// fight3d/cpu.js: Gavin's AI (think). Difficulty = reaction delay only.
import { clamp, rnd } from './util.js?v=079d986';
import { canAct, dist } from './combat.js?v=079d986';

// ---------------- CPU AI (difficulty = reaction delay only) ----------------
function snapshot(f) { return { state: f.state, st: f.st, s: f.move ? f.move.s : 0, mk: f.mk, whiffed: f.whiffed, a: f.move ? f.move.a : 0 }; }
function think(me, foe, delay) {
  const ai = me.ai, inp = me.inp;
  ai.hist.push(snapshot(foe)); if (ai.hist.length > 60) ai.hist.shift();
  const seen = ai.hist[Math.max(0, ai.hist.length - 1 - delay)];
  inp.mx = 0; inp.mz = 0; inp.block = false; inp.spd = 0.9 + rnd() * 0.4;
  if (!canAct(me) && me.state !== 'atk') { ai.plan = []; return; }
  const d = dist();
  // continue combo
  if (me.state === 'atk') { if (ai.plan.length && me.st >= me.move.s + me.move.a + me.move.r - 1) inp.atk = ai.plan.shift(); return; }
  if (foe.state === 'down' || foe.state === 'ko') { inp.mz = d > 2 ? 0.4 : -0.5; return; }
  // defense: react to what I saw
  if (seen.state === 'atk' && seen.st <= seen.s + 1 && d < 1.9) {
    if (ai.defT !== seen) { ai.defT = seen; ai.def = rnd() < 0.3 ? 'dodge' : (rnd() < 0.75 ? 'block' : 'none'); }
    if (ai.def === 'dodge') { inp.dodge = rnd() < 0.5 ? -1 : 1; return; }
    if (ai.def === 'block') { inp.block = true; return; }
  }
  // punish whiffs: saw foe in recovery
  if (seen.state === 'atk' && seen.st > seen.s + seen.a && d < 1.6) { inp.atk = rnd() < 0.5 ? 'hook' : 'upper'; return; }
  if (foe.state === 'stagger' && d < 1.6) { inp.atk = me.meter >= 100 && !me.superUsed ? 'super' : 'hook'; return; }
  // spacing and circling
  ai.t--;
  if (ai.t <= 0) { ai.t = 40 + rnd() * 60; ai.strafe = rnd() < 0.5 ? -1 : 1; ai.wantD = 1.15 + rnd() * 0.5; ai.guard = rnd() < 0.35; }
  inp.mx = ai.strafe * 0.8;
  inp.mz = clamp((d - ai.wantD) * 2, -1, 1);
  inp.block = ai.guard && d < 1.7;
  if (d < 1.55 && rnd() < 0.045) {
    const combos = [['jab'], ['jab', 'jab'], ['jab', 'hook'], ['jab', 'jab', 'hook'], ['hook'], ['upper'], ['jab', 'upper']];
    ai.plan = combos[(rnd() * combos.length) | 0].slice();
    if (me.meter >= 100 && !me.superUsed && rnd() < 0.3) ai.plan = ['super'];
    inp.block = false; inp.atk = ai.plan.shift();
  }
}

export { think };
