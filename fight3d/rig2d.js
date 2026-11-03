// fight3d/rig2d.js: draws Gavin's 2D cut-out rig (fighter-art/rig) on a camera-facing card in the 3D ring.
// The card is real size (6 ft human, skull to soles), drawn every frame into a CanvasTexture from the CPU fighter's state.
// ?rig=0 keeps the old 3D mesh.
import * as THREE from 'three';
import { clamp, ease, qs } from './util.js?v=894c647';
import { FLOOR, scene } from './stage.js?v=894c647';
import { loadRig, channels, blend, draw, mul, T, S } from '../fighter-art/rig/rig.js?v=894c647';

const ON = qs.get('rig') !== '0';
const HUMAN_M = 1.83;           // 6 ft, skull top to soles
const SKULL_TO_FEET_PX = 1209;  // in Gavin's source art (674 px sprite box : 662 px skull to feet at punch-out scale)
const AX0 = -330, AX1 = 864, AY0 = -150, AY1 = 1265, K = 0.62;  // art window (room for kicks) and texture px per art px
const M_PER_PX = HUMAN_M / SKULL_TO_FEET_PX;
const cv = document.createElement('canvas'); cv.width = Math.round((AX1 - AX0) * K); cv.height = Math.round((AY1 - AY0) * K);
const cx = cv.getContext('2d');
const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
const card = new THREE.Group(), tilt = new THREE.Group(); card.add(tilt); card.visible = false;
let rig = null, groundY = 1231, artCX = 267;
const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.04, depthWrite: true, fog: false, toneMapped: false, side: THREE.DoubleSide });
const planeW = (AX1 - AX0) * M_PER_PX, planeH = (AY1 - AY0) * M_PER_PX;
const plane = new THREE.Mesh(new THREE.PlaneGeometry(planeW, planeH), mat);
tilt.add(plane);
const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.42, 32), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false }));
shadow.rotation.x = -Math.PI / 2; shadow.scale.set(1, 0.55, 1); scene.add(shadow); shadow.visible = false;
scene.add(card);

const PEAK = { jab_L: 0.15, jab_R: 0.15, kick_front_L: 0.3, kick_front_R: 0.3, kick_round_L: 0.3, kick_round_R: 0.3 };
const MOVE_ANIM = { jab: ['jab_L', 'jab_R'], hook: ['jab_R'], upper: ['jab_L'], kHigh: ['kick_front_L', 'kick_front_R'], kMid: ['kick_front_R'], kSide: ['kick_round_R'], kRound: ['kick_round_L', 'kick_round_R'], super: ['kick_round_R'], kSweep: ['kick_round_L'] };
const st8 = { key: '', anim: 'idle', t: 0, prev: null, fade: 0, n: 0 };

if (ON) loadRig('fighter-art/rig/', 'gavin').then(r => {
  rig = r; groundY = r.SKIN.groundY; artCX = r.SKIN.artSize[0] / 2;
  // card origin = feet centre: shift plane so art (artCX, groundY) sits at (0,0)
  plane.position.set(((AX0 + AX1) / 2 - artCX) * M_PER_PX, (groundY - (AY0 + AY1) / 2) * M_PER_PX, 0);
  card.visible = true; shadow.visible = true; window.__rigReady = true;
  window.__rigHeightPx = () => { const c = window.__cam; if (!c) return 0; const a = new THREE.Vector3(0, 0, 0), b = new THREE.Vector3(0, HUMAN_M, 0); card.localToWorld(a); card.localToWorld(b); a.project(c); b.project(c); return (b.y - a.y) / 2 * innerHeight * devicePixelRatio; }; // skull-to-feet in device px
}).catch(e => console.error('rig load failed', e));

// game state -> [anim, time]
function target(f, clock, win) {
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
    case 'down': case 'ko': return ['hit', 0.06, 'down'];
    case 'getup': return ['idle', 0, 'getup'];
  }
  if (f.blocking) return ['block', 0.5, 'block'];
  return ['idle', clock % 1.6, 'idle'];
}
let lastState = '', lastSt = 0;
function update(f, cam, x, z, clock, dt) {
  if (!rig || !card.visible) return;
  // count move / hit instances so alternating jabs and fresh hits restart cleanly
  if (f.state !== lastState || f.st < lastSt) { if (f.state === 'atk') f.atkN = (f.atkN || 0) + 1; if (f.state === 'hit') f.hitN = (f.hitN || 0) + 1; f.st0 = (f.st0 || 0) + 1; }
  lastState = f.state; lastSt = f.st; f.atkN = f.atkN || 0; f.hitN = f.hitN || 0;
  const [anim, t, key] = target(f, clock);
  if (key !== st8.key) { // crossfade from the pose we were showing
    if (st8.key) { st8.prev = { anim: st8.anim, t: st8.t }; st8.fade = 1; }
    st8.key = key;
  }
  st8.anim = anim; st8.t = t;
  st8.fade = Math.max(0, st8.fade - dt / 0.09);
  let ch = channels(rig, anim, t);
  if (st8.prev && st8.fade > 0) ch = blend([[ch, 1 - ease(st8.fade)], [channels(rig, st8.prev.anim, st8.prev.t), ease(st8.fade)]]);
  cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, cv.width, cv.height);
  draw(rig, cx, ch, mul(S(K, K), T(-AX0, -AY0)), { flashMul: 0.6 });
  tex.needsUpdate = true;
  // place card: feet on the canvas, facing the camera (yaw only)
  card.position.set(x, FLOOR + (f.hop > 0 ? Math.sin(f.hop / 18 * Math.PI) * 0.28 : 0), z);
  card.rotation.set(0, Math.atan2(cam.position.x - x, cam.position.z - z), 0);
  // knockdown: tip over backwards around the feet, then (down only) back up
  let fall = 0;
  if (f.state === 'down' || f.state === 'ko') { fall = ease(clamp((f.st - 6) / 26, 0, 1)); const kn = (f.trip ? 90 : 150) - 40; if (f.state === 'down' && f.st > kn) fall *= 1 - ease((f.st - kn) / 40); }
  else if (f.state === 'getup') fall = 0;
  tilt.rotation.x = -fall * 1.42; tilt.position.y = 0.02 * fall;
  shadow.position.set(x, FLOOR + 0.006, z); shadow.scale.set(1 + fall * 0.6, 0.55 + fall * 1.2, 1);
}
export { ON as RIG_ON, update as updateRig, card as rigCard };
