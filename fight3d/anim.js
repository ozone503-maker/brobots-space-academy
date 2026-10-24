// fight3d/anim.js: poses + pose mixing, fist keyframes (HP/FK), leg poses, hit sparks, camera,
// walk cycle, hinged fall, and the per-frame visual update (updateVisuals). Touch-down fist cock state.
import * as THREE from 'three';
import { D2R, clamp, ease, lerp, rnd } from './util.js?v=894c647';
import { FLOW, T } from './moves.js?v=894c647';
import { FLOOR, camera, flames, ocean, palms, particles, ringSpot, scene, softTex, sun, torchLight, uTime, updateVolcano } from './stage.js?v=894c647';
import { JOINTS, LEGP, LK, OJ, _fd, _fz, _v, fists, ghost, ghostArms, ghostLegs, legMat, placeForearm, placeSeg } from './fighters.js?v=894c647';
import { F, G, dirTo } from './combat.js?v=894c647';
import { last } from './main.js?v=894c647';

function pose(o, base) { const p = { y: 0, rx: 0 }; if (base) Object.assign(p, JSON.parse(JSON.stringify(base))); for (const j of JOINTS) if (!p[j]) p[j] = [0, 0, 0]; for (const k in o) p[k] = Array.isArray(o[k]) ? o[k].slice() : o[k]; return p; }
const P = {};
P.guard = pose({ spine: [10, 0, 0], neck: [-5, 0, 0], head: [5, 0, 0], sL: [-62, 0, 14], eL: [-132, 0, 0], sR: [-62, 0, -14], eR: [-132, 0, 0], tL: [-22, 0, -4], kL: [28, 0, 0], tR: [8, 0, 4], kR: [22, 0, 0], y: -0.05, chest: [0, -8, 0] });
P.block = pose({ spine: [18, 0, 0], head: [20, 0, 0], sL: [-72, 0, 18], eL: [-135, 0, 0], sR: [-72, 0, -18], eR: [-135, 0, 0], y: -0.09, tL: [-30, 0, -4], kL: [40, 0, 0], tR: [0, 0, 4], kR: [36, 0, 0] }, P.guard);
P.jab_w = pose({ chest: [0, 6, 0], sL: [-55, 0, 10], eL: [-125, 0, 0] }, P.guard);
P.jab_s = pose({ chest: [0, -28, 0], sL: [-88, 0, -6], eL: [-6, 0, 0], spine: [14, 0, 0] }, P.guard);
P.hook_w = pose({ chest: [0, -32, 0], spine: [10, -10, 0], sR: [-60, 0, -55], eR: [-80, 0, 0] }, P.guard);
P.hook_s = pose({ chest: [0, 38, 0], spine: [12, 15, 0], sR: [-82, 40, -70], eR: [-75, 0, 0], head: [5, 15, 0] }, P.guard);
P.upper_w = pose({ spine: [26, 0, -8], y: -0.18, sR: [-5, 0, -12], eR: [-110, 0, 0], tL: [-40, 0, -4], kL: [60, 0, 0], tR: [-10, 0, 4], kR: [55, 0, 0] }, P.guard);
P.upper_s = pose({ spine: [-12, 0, 6], y: 0.03, sR: [-150, 0, -8], eR: [-55, 0, 0], head: [-8, 0, 0], chest: [0, 20, 0] }, P.guard);
P.super_w = pose({ spine: [30, 0, 0], y: -0.25, sR: [20, 0, -20], eR: [-90, 0, 0], sL: [-80, 0, 20], eL: [-120, 0, 0], tL: [-50, 0, -4], kL: [80, 0, 0], tR: [-15, 0, 4], kR: [70, 0, 0], chest: [0, -30, 0] }, P.guard);
P.super_s = pose({ spine: [-18, 0, 0], y: 0.08, sR: [-165, 0, 0], eR: [-20, 0, 0], head: [-10, 0, 0], chest: [0, 25, 0] }, P.guard);
P.hitHead = pose({ head: [-38, 18, 12], neck: [-18, 0, 0], spine: [-14, 0, 6], sL: [-25, 0, 35], eL: [-60, 0, 0], sR: [-30, 0, -40], eR: [-70, 0, 0] }, P.guard);
P.hitBody = pose({ spine: [34, 0, 0], head: [22, 0, 0], sL: [-20, 0, 15], eL: [-110, 0, 0], sR: [-25, 0, -15], eR: [-110, 0, 0], y: -0.12 }, P.guard);
P.stagger = pose({ spine: [-8, 0, 12], head: [-15, 0, 15], sL: [-20, 0, 30], eL: [-50, 0, 0], sR: [-15, 0, -35], eR: [-40, 0, 0], y: -0.1 }, P.guard);
P.down = pose({ rx: -78, y: -0.78, spine: [-12, 0, 8], head: [25, 25, 0], sL: [-120, 0, 75], eL: [-45, 0, 0], sR: [-100, 0, -80], eR: [-60, 0, 0], tL: [-55, 0, -14], kL: [75, 0, 0], tR: [-25, 0, 16], kR: [40, 0, 0] });
P.buckle = pose({ rx: -12, y: -0.38, spine: [-10, 0, 6], head: [-25, 0, 0], sL: [15, 0, 30], eL: [-20, 0, 0], sR: [10, 0, -35], eR: [-15, 0, 0], tL: [-55, 0, -6], kL: [95, 0, 0], tR: [-40, 0, 8], kR: [85, 0, 0] });
P.kneel = pose({ rx: 0, y: -0.48, spine: [30, 0, 0], head: [20, 0, 0], sL: [-30, 0, 20], eL: [-60, 0, 0], sR: [-40, 0, -20], eR: [-40, 0, 0], tL: [-90, 0, -4], kL: [90, 0, 0], tR: [10, 0, 6], kR: [100, 0, 0] });
P.win = pose({ sL: [-175, 0, 25], eL: [-15, 0, 0], sR: [-175, 0, -25], eR: [-15, 0, 0], head: [-15, 0, 0], spine: [-5, 0, 0] }, P.guard);
P.slipL = pose({ spine: [12, 0, 22], head: [0, 0, 12] }, P.guard);
P.slipR = pose({ spine: [12, 0, -22], head: [0, 0, -12] }, P.guard);
function mixPose(a, b, t, out) {
  out = out || pose({});
  for (const j of JOINTS) for (let i = 0; i < 3; i++) out[j][i] = lerp(a[j][i], b[j][i], t);
  out.y = lerp(a.y, b.y, t); out.rx = lerp(a.rx, b.rx, t); return out;
}
const curPose = pose({}, P.guard), tmpPose = pose({});
function applyPose(J, p) {
  for (const j of JOINTS) J[j].rotation.set(p[j][0] * D2R, p[j][1] * D2R, p[j][2] * D2R);
  J.hips.position.y = 1.0 + p.y;
}
// fist keyframes for the right hand [x,y,z,rx,ry,rz]; left hand mirrored
const FK = {
  jab:   [[0.13, -0.05, -0.8, 0.4, -0.1, -0.5], [0.03, -0.06, -1.25, 0.05, 0, -1.5]],
  pHigh: [[0.13, -0.03, -0.8, 0.4, -0.1, -0.5], [0.02, 0.02, -1.28, 0.05, 0, -1.5]],
  pMid:  [[0.13, -0.1, -0.8, 0.3, -0.1, -0.5], [0.03, -0.17, -1.25, 0.15, 0, -1.5]],
  pLow:  [[0.13, -0.18, -0.78, 0.2, -0.1, -0.5], [0.04, -0.3, -1.15, -0.25, 0, -1.5]],
  hook:  [[0.38, -0.04, -0.62, 0.0, -0.6, -0.2], [0.36, -0.02, -1.02, 0, -0.9, -1.4], [-0.02, -0.04, -1.18, 0, 0.6, -1.5]],
  upper: [[0.14, -0.42, -0.68, 1.2, 0, -0.2], [0.05, -0.18, -0.95, 0.4, 0, -0.25], [0.03, 0.06, -1.1, -0.9, 0, -0.3]],
};
function mir(q, side) { return side ? q : [-q[0], q[1], q[2], q[3], -q[4], -q[5]]; }
function legPose(side, a, b, t, h) { for (let i = 0; i < 3; i++) { const A = LEGP[a][i], B = LEGP[b][i]; _v[i].set(lerp(A[0], B[0], t) * (side ? 1 : -1), lerp(A[1], B[1], t) + (i ? (h - 0.5) * 0.25 * (a !== 'rest' || t > 0.3 ? 1 : 0) : 0), lerp(A[2], B[2], t)); } return _v; }
const HP = { // hand poses in camera space [x,y,z, rx, ry, rz]
  guardL: [-0.15, -0.035, -0.85, 0.55, -0.15, 0.35], guardR: [0.15, -0.04, -0.83, 0.55, 0.15, -0.35],
  blockL: [-0.075, -0.05, -0.42, 1.25, 0.3, 0.2], blockR: [0.075, -0.06, -0.43, 1.25, -0.3, -0.2],
  jabW: [-0.13, -0.27, -0.55, 0.2, 0.1, 0.4], jabS: [-0.04, -0.12, -1.25, 0.05, 0, 1.5],
  hookW: [0.34, -0.3, -0.5, 0.0, -0.6, -0.2], hookM: [0.3, -0.13, -1.0, 0, -0.9, -1.4], hookS: [-0.02, -0.1, -1.18, 0, 0.6, -1.5],
  upW: [0.14, -0.55, -0.58, 1.2, 0, -0.2], upS: [0.03, -0.02, -1.12, -0.9, 0, -0.3],
  supW: [0.22, -0.65, -0.45, 1.3, 0, -0.3], supS: [0.0, 0.05, -1.25, -1.1, 0, -0.2],
};
function setFist(f, a, b, t) { const p = []; for (let i = 0; i < 6; i++) p[i] = lerp(a[i], b[i], t); f.position.set(p[0], p[1], p[2]); f.rotation.set(p[3], p[4], p[5]); }

// ---------------- sparks ----------------
const sparkTex = softTex('rgba(255,255,230,1)', 'rgba(255,140,0,0)');
const sparks = [];
for (let i = 0; i < 6; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true })); s.visible = false; scene.add(s); sparks.push({ s, t: 0 }); }
const BURST_N = 60, burst = particles(BURST_N, 0.05, 0xffe080, THREE.AdditiveBlending, 1); burst.material.depthTest = false; scene.add(burst);
const burstV = new Float32Array(BURST_N * 3); let burstT = 1;
function spark(pos, big, col) {
  const s = sparks.find(x => x.t <= 0) || sparks[0]; s.t = 1; s.big = big; s.s.position.copy(pos); s.s.visible = true; s.s.material.color.set(col || 0xffffff);
  const bp = burst.geometry.attributes.position;
  for (let i = 0; i < BURST_N; i++) { bp.setXYZ(i, pos.x, pos.y, pos.z); burstV[i * 3] = (rnd() - .5) * 0.12 * big; burstV[i * 3 + 1] = (rnd() - .3) * 0.12 * big; burstV[i * 3 + 2] = (rnd() - .5) * 0.12 * big; }
  bp.needsUpdate = true; burstT = 0;
}
// hit-test: block circle first, then outer strip = kick (below the kick top), everything else = punch on that side
const cock = [0, 0];

// ---------------- render update ----------------
const tmpV = new THREE.Vector3(), lookAt = new THREE.Vector3(), camPos = new THREE.Vector3();
let camRoll = 0, camDrop = 0;
function fighterVisualPos(f, o) {
  const [fx, fz] = dirTo(f, o); const rx = -fz, rz = fx;
  let off = 0; if (f.state === 'dodge') off = Math.sin(clamp(f.st / 18, 0, 1) * Math.PI) * 0.42 * f.dodgeDir;
  return [f.x + rx * off, f.z + rz * off];
}
function oppTargetPose(f) {
  const st = f.st;
  switch (f.state) {
    case 'atk': {
      const m = f.move, k = f.mk;
      const W = P[k + '_w'], S = P[k + '_s'];
      if (st <= m.s) return mixPose(P.guard, W, ease(st / m.s), tmpPose);
      if (st <= m.s + m.a) return mixPose(W, S, ease((st - m.s) / 2), tmpPose);
      return mixPose(S, P.guard, ease((st - m.s - m.a) / m.r), tmpPose);
    }
    case 'block': return P.block;
    case 'hit': return mixPose(P[f.react || 'hitHead'], P.guard, ease((st - 4) / f.hs), tmpPose);
    case 'stagger': { const p = mixPose(P.stagger, P.guard, 0.3 + 0.3 * Math.sin(st * 0.3), tmpPose); p.spine[2] = 14 * Math.sin(st * 0.18); return p; }
    case 'down': case 'ko': { // hinged fall: knees buckle, torso tips, arms flop; then (down only) back to a kneel
      if (st < 12) return mixPose(P.guard, P.buckle, ease(st / 12), tmpPose);
      if (st < 34) return mixPose(P.buckle, P.down, ease((st - 12) / 22), tmpPose);
      { const kn = (f.trip ? 90 : T.downFrames) - 50; return st < kn || f.state === 'ko' ? P.down : mixPose(P.down, P.kneel, ease((st - kn) / 40), tmpPose); } }
    case 'getup': return mixPose(P.kneel, P.guard, ease(st / 40), tmpPose);
    case 'dodge': return f.dodgeDir < 0 ? P.slipR : P.slipL;
  }
  if (G.mode === 'roundEnd' && G.winner === 1) return P.win;
  return P.guard;
}
let animClock = 0, walkV = 0, walkPh = 0, walkAmp = 0; const walkLast = {}, _box = new THREE.Box3();
function updateVisuals(dt) {
  animClock += dt;
  const me = F[0], op = F[1];
  const [px, pz] = fighterVisualPos(me, op), [ox, oz] = fighterVisualPos(op, me);
  // opponent
  const tp = oppTargetPose(op);
  const k = op.state === 'atk' ? 0.55 : op.state === 'hit' ? 0.45 : (op.state === 'down' || op.state === 'ko') && op.st < 40 ? 0.5 : 0.18;
  mixPose(curPose, tp, k, curPose);
  const bob = (op.state === 'idle' || op.state === 'block') ? Math.sin(animClock * 5) * 0.012 : 0;
  applyPose(OJ, curPose); OJ.hips.position.y += bob;
  // walk cycle from actual ground speed (no more sliding)
  const wv = Math.hypot(ox - (walkLast.x ?? ox), oz - (walkLast.z ?? oz)) / Math.max(dt, 1e-3); walkLast.x = ox; walkLast.z = oz;
  walkV = lerp(walkV, wv, 0.2);
  const walking = ['idle', 'block', 'stagger', 'getup', 'dodge'].includes(op.state) && walkV > 0.15;
  walkAmp = lerp(walkAmp, walking ? clamp(walkV / 1.2, 0.5, 1) : 0, 0.15); walkPh += dt * (7 + walkV * 3) * (walkAmp > 0.02 ? 1 : 0);
  if (walkAmp > 0.02) {
    const sw = Math.sin(walkPh), a = walkAmp;
    OJ.tL.rotation.x += -sw * 0.45 * a; OJ.tR.rotation.x += sw * 0.45 * a;
    OJ.kL.rotation.x += Math.max(0, sw) * 0.7 * a; OJ.kR.rotation.x += Math.max(0, -sw) * 0.7 * a;
    OJ.sL.rotation.x += sw * 0.12 * a; OJ.sR.rotation.x += -sw * 0.12 * a;
    OJ.hips.position.y += (Math.abs(Math.cos(walkPh)) - 0.6) * 0.045 * a; OJ.spine.rotation.z += sw * 0.05 * a;
  }
  OJ.root.position.set(ox, FLOOR + (op.hop > 0 ? Math.sin(op.hop / 18 * Math.PI) * 0.28 : 0), oz); if (op.hop > 0) op.hop -= dt * 60;
  OJ.root.rotation.set(curPose.rx * D2R, Math.atan2(px - ox, pz - oz), 0, 'YXZ');
  if (curPose.rx < -5 || curPose.y < -0.3) { // rest on the canvas: never let any part sink through the floor
    OJ.root.updateMatrixWorld(true); _box.setFromObject(OJ.root);
    if (_box.min.y < FLOOR + 0.005) OJ.root.position.y += FLOOR + 0.005 - _box.min.y;
  }
  // breathing
  OJ.chest.scale.setScalar(1 + Math.sin(animClock * 2.4) * 0.012);
  // player ghost
  const yaw = Math.atan2(ox - px, oz - pz);
  ghost.position.set(px, FLOOR, pz); ghost.rotation.y = yaw;
  // camera
  const [fx, fz] = dirTo({ x: px, z: pz }, { x: ox, z: oz });
  const down = me.state === 'down' || me.state === 'ko';
  camDrop = lerp(camDrop, down ? 1 : 0, 0.06); camRoll = lerp(camRoll, down ? 0.5 : (me.state === 'dodge' ? -me.dodgeDir * 0.12 * Math.sin(me.st / 18 * Math.PI) : 0), 0.15);
  const hitRecoil = me.state === 'hit' ? 0.12 * (1 - me.st / me.hs) : 0;
  camPos.set(px - fx * (0.85 + hitRecoil), FLOOR + 2.0 - camDrop * 1.4, pz - fz * (0.85 + hitRecoil));
  const headY = OJ.head.getWorldPosition(tmpV).y;
  lookAt.set(ox, lerp(FLOOR + 1.42, headY - 0.15, 0.4) - camDrop * 0.8, oz);
  if (G.shake > 0.001) { camPos.x += (rnd() - .5) * G.shake * 0.5; camPos.y += (rnd() - .5) * G.shake * 0.5; lookAt.x += (rnd() - .5) * G.shake; lookAt.y += (rnd() - .5) * G.shake; G.shake *= 0.86; }
  camera.position.copy(camPos); camera.up.set(Math.sin(camRoll) * fz, Math.cos(camRoll), -Math.sin(camRoll) * fx); camera.lookAt(lookAt);
  // fists
  const L = fists[0], R = fists[1];
  const t = animClock * 4;
  const sway = (i) => [Math.sin(t + i) * 0.008, Math.cos(t * 1.3 + i) * 0.01];
  let lp = [HP.guardL, HP.guardL, 0], rp = [HP.guardR, HP.guardR, 0];
  if (me.blocking || me.state === 'block') { lp = [HP.blockL, HP.blockL, 0]; rp = [HP.blockR, HP.blockR, 0]; }
  if (me.state === 'atk' && me.mk === 'super') {
    const m = me.move, s = me.st, W = HP.supW, S = HP.supS;
    if (s <= m.s) rp = [HP.guardR, W, ease(s / m.s)]; else if (s <= m.s + m.a) rp = [W, S, ease((s - m.s) / 2)]; else rp = [S, HP.guardR, ease((s - m.s - m.a) / m.r)];
  } else if (me.state === 'atk' && FK[me.mk]) {
    const m = me.move, s = me.st, side = me.hand, G0 = side ? HP.guardR : HP.guardL, md = me.mod || { t: 0.5, c: 0, L: 0.35, cv: 0 }, FLm = FLOW[me.mk] || { vy: 0.1 };
    const n = FK[me.mk].length, K = FK[me.mk].map((q, i) => {
      q = q.slice(); const last = i === n - 1;
      if (i === 0) { const w = 0.65 + 0.6 * md.L; for (let j = 0; j < 3; j++) q[j] = HP.guardR[j] * (1 - w) + q[j] * w; } // windup grows with swipe length
      q[1] += (md.t - 0.5) * FLm.vy * (last ? 1 : 0.5);              // steeper -> higher target
      if (me.mk === 'pHigh' && last) q[0] -= (md.c - 0.7) * 0.25;     // more inward -> crosses to centre
      if (!last) q[0] += md.cv * 0.35;                                // curved swipe -> arc
      if (last) q[2] *= 0.95 + 0.1 * md.L;                            // longer swipe -> longer reach
      return mir(q, side);
    });
    let pose; // guard -> wind -> (mid) -> strike -> guard
    if (s <= m.s) pose = [G0, K[0], ease(s / m.s)];
    else if (s <= m.s + m.a) { const u = ease((s - m.s) / Math.max(1, m.a - 1)); pose = K.length > 2 ? (u < 0.5 ? [K[0], K[1], u * 2] : [K[1], K[2], (u - 0.5) * 2]) : [K[0], K[1], u]; }
    else pose = [K[K.length - 1], G0, ease((s - m.s - m.a) / m.r)];
    if (side) rp = pose; else lp = pose;
  }
  // ghost leg: each kick has its own path (camera space, right side; mirrored for left)
  const kickSide = me.state === 'atk' && LK[me.mk] ? me.hand : -1;
  for (const side of [0, 1]) {
    const leg = ghostLegs[side]; let v = null;
    if (side === kickSide) {
      const m = me.move, st = me.st, path = LK[me.mk];
      let u; // 0 rest, 1 = chamber, 2.. = path keys
      if (st <= m.s) u = ease(st / m.s) * 1.0; else if (st <= m.s + m.a) u = 1 + ease((st - m.s) / Math.max(1, m.a - 1)) * (path.length - 2); else u = (path.length - 1) * (1 - ease((st - m.s - m.a) / m.r));
      const i0 = Math.min(path.length - 2, Math.floor(u)), fr = u - i0, A = path[i0], B = path[i0 + 1];
      const md = me.mod || { t: 0.5 }, lift = (md.t - 0.5) * (FLOW[me.mk] ? FLOW[me.mk].vy : 0) * Math.min(1, u);
      for (let i = 0; i < 3; i++) _v[i].set(lerp(A[i][0], B[i][0], fr) * (side ? 1 : -1), lerp(A[i][1], B[i][1], fr) + lift * (i === 2 ? 1 : i === 1 ? 0.6 : 0), lerp(A[i][2], B[i][2], fr));
      v = _v;
    }
    leg.g.visible = !!v;
    if (v) { placeSeg(leg.thigh, v[0], v[1]); placeSeg(leg.shin, v[1], v[2]); leg.knee.position.copy(v[1]); leg.foot.position.copy(v[2]); _fd.copy(v[2]).sub(v[1]).normalize(); _fd.y *= 0.4; _fd.normalize(); leg.foot.quaternion.setFromUnitVectors(_fz, _fd); }
  }
  legMat.opacity = 0.12;
  setFist(L, lp[0], lp[1], lp[2]); setFist(R, rp[0], rp[1], rp[2]);
  [L, R].forEach((h, i) => { if (cock[i] > 0) { h.position.z += 0.07 * cock[i]; h.position.y -= 0.025 * cock[i]; h.rotation.x += 0.25 * cock[i]; cock[i] = Math.max(0, cock[i] - dt * 6); } });
  const s0 = sway(0), s1 = sway(2); if (me.state !== 'atk') { L.position.x += s0[0]; L.position.y += s0[1]; R.position.x += s1[0]; R.position.y += s1[1]; }
  if (down) { L.position.y -= camDrop * 0.4; R.position.y -= camDrop * 0.4; }
  // ghost arms from shoulders to wrists
  [L, R].forEach((h, i) => {
    const sh = new THREE.Vector3((i ? 1 : -1) * 0.25, 1.44 + FLOOR, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(new THREE.Vector3(px, 0, pz));
    const w = new THREE.Vector3(0, 0, 0.17).applyMatrix4(h.matrixWorld);
    h.updateMatrixWorld(); const wr = new THREE.Vector3(0, 0, 0.14); h.localToWorld(wr);
    const arm = ghostArms[i], mid = sh.clone().add(wr).multiplyScalar(0.5), len = sh.distanceTo(wr);
    arm.visible = false; h.updateMatrix(); placeForearm(i, h);
  });
  // environment
  uTime.value = animClock;
  for (const p of palms) { p.top.rotation.z = Math.sin(animClock * 1.1 + p.ph) * 0.12; p.top.rotation.x = Math.cos(animClock * 0.8 + p.ph) * 0.08; p.root.children[0].rotation.x = Math.sin(animClock * 0.9 + p.ph) * 0.03; }
  flames.forEach((f, i) => { const s = 1 + Math.sin(animClock * 17 + i * 3) * 0.15 + Math.sin(animClock * 31 + i) * 0.08; f.scale.set(1, s, 1); });
  torchLight.intensity = 5 + Math.sin(animClock * 13) * 1.2;
  updateVolcano(dt);
  ringSpot.target.position.set((px + ox) / 2, 0, (pz + oz) / 2);
  sun.target.position.set((px + ox) / 2, 0, (pz + oz) / 2); sun.position.copy(sun.target.position).add(new THREE.Vector3(-18, 22, -24));
  ocean.material.uniforms.camPos.value.copy(camera.position);
  for (const s of sparks) if (s.t > 0) { s.t -= dt * 4; const sc = (1.2 - s.t) * 0.55 * (s.big || 1); s.s.scale.set(sc, sc, sc); s.s.material.opacity = s.t; if (s.t <= 0) s.s.visible = false; }
  if (burstT < 1) { burstT += dt * 2.5; const bp = burst.geometry.attributes.position; for (let i = 0; i < BURST_N; i++) { bp.setXYZ(i, bp.getX(i) + burstV[i * 3], bp.getY(i) + burstV[i * 3 + 1], bp.getZ(i) + burstV[i * 3 + 2]); burstV[i * 3 + 1] -= 0.004; } bp.needsUpdate = true; burst.material.opacity = 1 - burstT; }
}

export { P, applyPose, cock, curPose, spark, updateVisuals };
