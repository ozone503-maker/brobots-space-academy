// fight3d/rig2d.js: draws Gavin's 2D cut-out rig on a camera-facing card in the 3D ring.
// Real size (6 ft human). Smooth crossfades, secondary follow-through, walk cycle, hooks/uppercuts, crumple fall.
// ?rig=0 keeps the old 3D mesh.
import * as THREE from 'three';
import { clamp, ease, qs } from './util.js?v=h3';
import { FLOOR, scene } from './stage.js?v=h3';
import { loadRig, channels, blend, draw, mul, T, S } from '../fighter-art/rig/rig.js?v=h5';

const ON = qs.get('rig') !== '0';
const CPU = (qs.get('cpu') || 'gavin').toLowerCase(); // gavin (default) | ipo | tank | ozone | ryan | jeff (drawn frames) | jeffrig (old cut-out Jeff)
const FIGHTERS = new Set(['gavin', 'ipo', 'tank', 'ozone', 'ryan', 'jeff', 'jeffrig']);
const FIGHTER = FIGHTERS.has(CPU) ? CPU : 'gavin';
const SKIN_DIR = ({ jeff: 'jeff_frames', jeffrig: 'jeff' })[FIGHTER] || FIGHTER;
const FRAME_SKINS = new Set(['jeff_frames']); // skin.json mode "frames": one drawn photo per pose, no bones
const HUMAN_M = 1.83; // skeleton bone height; skin.scale may shrink a fighter
const SKULL_TO_FEET_PX = 1209;
const AX0 = -330, AX1 = 864, AY0 = -150, AY1 = 1265, K = 0.62;
const M_PER_PX = HUMAN_M / SKULL_TO_FEET_PX;
const FADE = 0.16; // longer crossfade so poses ease instead of popping
const FOLLOW = { head: 0.18, forearm_L: 0.16, forearm_R: 0.16, fist_L: 0.12, fist_R: 0.12, upperarm_L: 0.1, upperarm_R: 0.1, torso: 0.08 };

const cv = document.createElement('canvas'); cv.width = Math.round((AX1 - AX0) * K); cv.height = Math.round((AY1 - AY0) * K);
const cx = cv.getContext('2d');
const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
const card = new THREE.Group(), tilt = new THREE.Group(); card.add(tilt); card.visible = false;
let rig = null, groundY = 1231, artCX = 267;
const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.04, depthWrite: true, fog: false, toneMapped: false, side: THREE.DoubleSide });
const planeW = (AX1 - AX0) * M_PER_PX, planeH = (AY1 - AY0) * M_PER_PX;
const plane = new THREE.Mesh(new THREE.PlaneGeometry(planeW, planeH), mat);
tilt.add(plane);
const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 40), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.48, depthWrite: false }));
shadow.rotation.x = -Math.PI / 2; shadow.scale.set(1, 0.62, 1); scene.add(shadow); shadow.visible = false;
scene.add(card);

const PEAK = { jab_L: 0.15, jab_R: 0.15, hook_L: 0.28, hook_R: 0.28, upper_L: 0.32, upper_R: 0.32, kick_front_L: 0.3, kick_front_R: 0.3, kick_round_L: 0.3, kick_round_R: 0.3 };
const MOVE_ANIM = {
  jab: ['jab_L', 'jab_R'], hook: ['hook_L', 'hook_R'], upper: ['upper_L', 'upper_R'],
  kHigh: ['kick_front_L', 'kick_front_R'], kMid: ['kick_front_R'], kSide: ['kick_round_R'],
  kRound: ['kick_round_L', 'kick_round_R'], super: ['kick_round_R'], kSweep: ['kick_round_L'],
};
const st8 = { key: '', anim: 'idle', t: 0, prev: null, fade: 0 };
let lag = null; // secondary motion: lagged copy of channels
let lastX = 0, lastZ = 0, walkPh = 0, moveSpd = 0;
window.__walkBias = 0; // capture/script can force walk blend 0..1

// frames mode: clips map to [frame, start sec, {flip, rot, dx, dy}]; missing clips fall back below
async function loadFrames(base, dir) {
  const j = u => fetch(base + u).then(r => r.json());
  const [A, SKIN] = await Promise.all([j('animations.json'), j(dir + '/skin.json')]);
  const ANIMS = {}, IMGS = {};
  for (const [n, a] of Object.entries(A)) if (a && a.duration) ANIMS[n] = { duration: a.duration, loop: a.loop };
  await Promise.all(Object.entries(SKIN.frames).map(([n, f]) => new Promise((res, rej) => { const i = new Image(); i.onload = () => { IMGS[n] = i; res(); }; i.onerror = rej; i.src = base + dir + '/' + f.src; })));
  return { ANIMS, SKIN, IMGS, FR: true };
}
const FR_FALLBACK = [[/^(hook|upper)_/, 'jab_'], [/^kick_round_/, 'kick_front_'], [/^dodge_.*/, 'walk'], [/^getup$/, 'idle']];
function pickFrame(anim, t) {
  const C = rig.SKIN.clips; let n = anim, tt = t;
  if (!C[n]) for (const [re, to] of FR_FALLBACK) { const m = n.replace(re, to); if (m !== n && C[m]) { tt = t * (rig.ANIMS[m]?.duration || 1) / (rig.ANIMS[n]?.duration || 1); n = m; break; } }
  if (!C[n]) n = 'idle';
  let e = C[n][0]; for (const k of C[n]) if (k[1] <= tt + 1e-6) e = k;
  return e;
}
function drawFrame(e, breathe) {
  const fn = e[0], o = e[2] || {}, f = rig.SKIN.frames[fn], im = rig.IMGS[fn], s = 1 / (rig.SKIN.store || 1);
  cx.save(); cx.setTransform(K, 0, 0, K, -AX0 * K, -AY0 * K); // art space, same as the cut-out rig
  cx.translate(artCX + (o.dx || 0), groundY + (o.dy || 0));
  if (o.rot) cx.rotate(o.rot * Math.PI / 180);
  if (o.flip) cx.scale(-1, 1);
  if (breathe) cx.scale(1, 1 + 0.007 * breathe);
  cx.drawImage(im, -f.ax * s, -f.ay * s, f.w * s, f.h * s);
  cx.restore();
}

if (ON) (FRAME_SKINS.has(SKIN_DIR) ? loadFrames : loadRig)('fighter-art/rig/', SKIN_DIR).then(r => {
  rig = r; groundY = r.SKIN.groundY; artCX = r.SKIN.artSize[0] / 2;
  const sk = (r.SKIN.scale || 1);
  plane.scale.setScalar(sk);
  plane.position.set(((AX0 + AX1) / 2 - artCX) * M_PER_PX * sk, (groundY - (AY0 + AY1) / 2) * M_PER_PX * sk, 0);
  card.visible = true; shadow.visible = true; window.__rigReady = true; window.__fighter = FIGHTER;
  window.__rigHeightPx = () => { const c = window.__cam; if (!c) return 0; const a = new THREE.Vector3(0, 0, 0), b = new THREE.Vector3(0, HUMAN_M * sk, 0); card.localToWorld(a); card.localToWorld(b); a.project(c); b.project(c); return (b.y - a.y) / 2 * innerHeight * devicePixelRatio; };
}).catch(e => console.error('rig load failed', e));

function target(f, clock, dt) {
  const sec = f.st / 60;
  switch (f.state) {
    case 'atk': {
      const m = f.move, list = MOVE_ANIM[f.mk] || ['jab_L'], a = list[f.atkN % list.length], D = rig.ANIMS[a].duration, pk = PEAK[a] ?? 0.15;
      const t = f.st <= m.s ? pk * ease(f.st / m.s) : pk + (D - pk) * clamp((f.st - m.s) / (m.a + m.r + (f.whiffed ? 6 : 0)), 0, 1);
      return [a, Math.min(t, D - 0.001), 'atk' + f.atkN];
    }
    case 'block': return ['block', Math.min(0.15 + sec * 0.2, 0.6), 'block'];
    case 'hit': return ['hit', clamp(f.st / Math.max(1, f.hs), 0, 1) * 0.5, 'hit' + f.hitN];
    case 'stagger': return ['hit', 0.12 + 0.06 * Math.sin(f.st * 0.25), 'stagger'];
    case 'dodge': { const a = f.dodgeDir > 0 ? 'dodge_L' : 'dodge_R'; return [a, clamp(f.st / 18, 0, 1) * 0.94, 'dodge' + f.st0]; }
    case 'down': case 'ko': {
      const D = rig.ANIMS.fall.duration;
      const t = Math.min(D - 0.001, ease(clamp(f.st / 40, 0, 1)) * D);
      return ['fall', t, 'down'];
    }
    case 'getup': {
      const D = rig.ANIMS.getup.duration;
      return ['getup', Math.min(D - 0.001, ease(clamp(f.st / 40, 0, 1)) * D), 'getup'];
    }
  }
  if (f.blocking) return ['block', 0.5, 'block'];
  const walkW = Math.max(window.__walkBias || 0, moveSpd > 0.35 ? clamp((moveSpd - 0.35) / 1.2, 0, 1) : 0);
  if (walkW > 0.05) {
    walkPh = (walkPh + (0.4 + moveSpd * 0.35 + (window.__walkBias || 0) * 0.5) * Math.max(dt || 1/60, 1/120)) % 0.9;
    return ['walk', walkPh, 'walk', walkW];
  }
  return ['idle', clock % 1.8, 'idle', 0];
}

function followThrough(ch, dt) {
  if (!lag) { lag = {}; for (const n of Object.keys(ch)) if (n !== '_own') lag[n] = { ...ch[n] }; return ch; }
  const out = { _own: ch._own };
  for (const n of Object.keys(ch)) {
    if (n === '_own') continue;
    const src = ch[n], prev = lag[n] || src, k = FOLLOW[n];
    if (!k) { out[n] = src; lag[n] = { ...src }; continue; }
    const a = 1 - Math.pow(1 - (1 - k), Math.max(0.001, dt) * 60); // frame-rate independent lag
    const o = { ...src };
    for (const p of ['rot', 'x', 'y']) { // pose lags; scale/flash/z snap so punches still pop
      const sv = src[p], pv = prev[p] ?? sv;
      o[p] = pv + (sv - pv) * a;
    }
    o._z = src._z; out[n] = o; lag[n] = o;
  }
  return out;
}

let lastState = '', lastSt = 0;
function update(f, cam, x, z, clock, dt) {
  if (!rig || !card.visible) return;
  const dx = x - lastX, dz = z - lastZ;
  moveSpd = Math.hypot(dx, dz) / Math.max(dt, 1 / 120);
  lastX = x; lastZ = z;
  if (f.state !== lastState || f.st < lastSt) { if (f.state === 'atk') f.atkN = (f.atkN || 0) + 1; if (f.state === 'hit') f.hitN = (f.hitN || 0) + 1; f.st0 = (f.st0 || 0) + 1; }
  lastState = f.state; lastSt = f.st; f.atkN = f.atkN || 0; f.hitN = f.hitN || 0;
  const tgt = target(f, clock, dt), anim = tgt[0], t = tgt[1], key = tgt[2], walkW = tgt[3] || 0;
  if (key !== st8.key) {
    if (st8.key) { st8.prev = { anim: st8.anim, t: st8.t }; st8.fade = 1; }
    st8.key = key;
  }
  st8.anim = anim; st8.t = t;
  st8.fade = Math.max(0, st8.fade - dt / FADE);
  if (rig.FR) { // drawn frames: hard cuts like a classic sprite fighter
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, cv.width, cv.height);
    drawFrame(pickFrame(key === 'walk' && walkW < 0.5 ? 'idle' : anim, t), anim === 'idle' ? Math.sin(t / 1.8 * Math.PI * 2) : 0);
  } else {
  let ch = channels(rig, anim, t);
  if (st8.prev && st8.fade > 0) {
    const w = ease(st8.fade);
    ch = blend([[ch, 1 - w], [channels(rig, st8.prev.anim, st8.prev.t), w]]);
  }
  if (key === 'walk' && walkW < 0.98) {
    ch = blend([[ch, walkW], [channels(rig, 'idle', clock % 1.8), 1 - walkW]]);
  }
  ch = followThrough(ch, dt);
  cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, cv.width, cv.height);
  draw(rig, cx, ch, mul(S(K, K), T(-AX0, -AY0)), { flashMul: 0.55 });
  }
  tex.needsUpdate = true;
  const hop = f.hop > 0 ? Math.sin(f.hop / 18 * Math.PI) * 0.28 : 0;
  card.position.set(x, FLOOR + hop, z);
  card.rotation.set(0, Math.atan2(cam.position.x - x, cam.position.z - z), 0);
  // soft tip only late in a fall (crumple anim does the work); getup has none
  let tip = 0;
  if (f.state === 'down' || f.state === 'ko') tip = 0;
  tilt.rotation.x = -tip; tilt.position.y = 0;
  const fallen = (f.state === 'down' || f.state === 'ko') ? ease(clamp(f.st / 40, 0, 1)) : (f.state === 'getup' ? 1 - ease(clamp(f.st / 40, 0, 1)) : 0);
  shadow.position.set(x, FLOOR + 0.006, z);
  shadow.scale.set(1 + fallen * 0.85 + moveSpd * 0.04, 0.62 + fallen * 0.55, 1);
  shadow.material.opacity = 0.42 + fallen * 0.18;
}
export { ON as RIG_ON, update as updateRig, card as rigCard };
