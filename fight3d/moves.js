// fight3d/moves.js: pure data. Tuning (T), CPU reaction delays (DIFF), move frame data incl. sweep rules (MOVES),
// light-move set (LIGHT) and per-move swipe flow ranges (FLOW/flowT). No side effects.
import { clamp } from './util.js?v=894c647';

// ================= TUNING =================
const T = {
  hp: 1000, balMax: 100, balRegen: 0.35, balRegenDelay: 50,
  roundTime: 60, walk: 0.042, strafe: 0.036, minSep: 1.15, ringR: 3.55,
  speedMin: 0.85, speedMax: 1.6, chip: 0.12, blockBal: 0.4, counterMul: 1.25,
  downFrames: 150, superCost: 100,
};
const DIFF = { easy: 28, normal: 16, hard: 8 }; // reaction delay in frames, nothing else changes
const MOVES = {
  jab:   { s: 5,  a: 3, r: 9,  dmg: 35,  bal: 7,  hs: 14, bs: 9,  stop: 6,  reach: 1.6,  shake: 0.04, meter: 6 },
  hook:  { s: 9,  a: 4, r: 17, dmg: 50,  bal: 12, hs: 20, bs: 14, stop: 10, reach: 1.5,  shake: 0.09, meter: 9 },
  upper: { s: 12, a: 4, r: 22, dmg: 60,  bal: 15, hs: 24, bs: 16, stop: 13, reach: 1.35, shake: 0.13, meter: 11 },
  // player moves (pads). ht = target height on the opponent in metres above the floor
  pHigh: { s: 6,  a: 3, r: 11, dmg: 40,  bal: 8,  hs: 15, bs: 10, stop: 7,  reach: 1.6,  shake: 0.05, meter: 7,  ht: 1.62 },
  pMid:  { s: 6,  a: 3, r: 11, dmg: 38,  bal: 10, hs: 15, bs: 10, stop: 7,  reach: 1.6,  shake: 0.05, meter: 7,  ht: 1.3, body: 1 },
  pLow:  { s: 7,  a: 3, r: 13, dmg: 35,  bal: 12, hs: 15, bs: 10, stop: 7,  reach: 1.55, shake: 0.05, meter: 7,  ht: 1.05, body: 1 },
  kHigh: { s: 12, a: 4, r: 20, dmg: 58,  bal: 14, hs: 22, bs: 15, stop: 12, reach: 1.8,  shake: 0.11, meter: 10, ht: 1.6 },
  kMid:  { s: 10, a: 4, r: 18, dmg: 50,  bal: 14, hs: 20, bs: 14, stop: 11, reach: 1.8,  shake: 0.1,  meter: 9,  ht: 1.15, body: 1 },
  kSide: { s: 11, a: 4, r: 19, dmg: 52,  bal: 20, hs: 20, bs: 14, stop: 11, reach: 1.9,  shake: 0.12, meter: 9,  ht: 1.1, body: 1, push: 0.1 },
  kRound:{ s: 15, a: 5, r: 22, dmg: 68,  bal: 18, hs: 24, bs: 16, stop: 14, reach: 1.85, shake: 0.15, meter: 11, ht: 1.5 },
  kSweep:{ s: 22, a: 4, r: 34, whiffR: 22, dmg: 22,  bal: 10, hs: 20, bs: 12, stop: 12, reach: 1.75, shake: 0.14, meter: 8,  ht: 0.3, sweep: 1 },
  super: { s: 16, a: 6, r: 30, dmg: 150, bal: 40, hs: 40, bs: 24, stop: 22, reach: 1.7,  shake: 0.25, meter: 0, unblock: 0.45 },
};
// HYBRID flow: the sector picks the move; inside it the swipe's vertical component v (-1 down..1 up)
// maps across the move's own range to t (0 = low/flat end, 1 = high/steep end), which bends height and path.
const FLOW = {
  pHigh: { v: [0.38, 1], ht: [1.48, 1.72], vy: 0.1 },   pMid: { v: [-0.38, 0.38], ht: [1.15, 1.42], vy: 0.14 },
  pLow:  { v: [-1, -0.38], ht: [0.92, 1.15], vy: 0.12 }, hook: { v: [-0.38, 0.92], ht: [1.15, 1.72], vy: 0.3 },
  upper: { v: [-1, -0.38], ht: [1.45, 1.72], vy: 0.12 }, jab: { v: [-1, 1], ht: [1.4, 1.62], vy: 0.08 },
  kHigh: { v: [0.38, 1], ht: [1.45, 1.78], vy: 0.3 },   kMid: { v: [-0.92, 0.38], ht: [0.95, 1.38], vy: 0.32 },
  kSide: { v: [-0.38, 0.38], ht: [0.95, 1.32], vy: 0.3 }, kRound: { v: [0.38, 0.92], ht: [1.25, 1.72], vy: 0.3 },
  kSweep: { v: [-1, -0.38], ht: [0.25, 0.4], vy: 0.06 },
};
function flowT(k, v) { const r = FLOW[k]; return r ? clamp((v - r.v[0]) / (r.v[1] - r.v[0]), 0, 1) : 0.5; }
const LIGHT = { jab: 1, pHigh: 1, pMid: 1, pLow: 1 };

export { DIFF, FLOW, LIGHT, MOVES, T, flowT };
