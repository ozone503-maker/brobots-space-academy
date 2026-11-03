// fight3d/backdrop.js: painted home-base backdrop from fighter-art/backgrounds behind the ring (default bg01, Gavin's
// Arlington Stadium Lot). Screen-space cover crop with a little yaw parallax, horizon row locked to the camera horizon.
// ?bg=bg12 picks another painting, ?bg=0 keeps the volcano island.
import * as THREE from 'three';
import { qs } from './util.js?v=894c647';
import { camera, flames, ocean, palms, scene, sky, volc, island, sand, torchLight } from './stage.js?v=894c647';

const BG = qs.get('bg') ?? 'bg01';
const HORIZON = { bg01: 0.56, bg12: 0.5, bg08: 0.52, bg04: 0.45 };  // horizon row of each painting, as v from the bottom
const ON = BG !== '0';
let tex = null, aspect = 1.5;
if (ON) {
  for (const o of [sky, ocean, volc, island, sand]) o.visible = false;
  for (const p of palms) p.root.visible = false;
  for (const f of flames) f.visible = false;
  scene.traverse(o => { if (o.isMesh && Math.abs(o.position.y - 1.2) < 1e-3 && Math.hypot(o.position.x, o.position.z) > 6) o.visible = false; }); // tiki poles
  torchLight.intensity = 0;
  scene.fog = new THREE.Fog(0xd9c7a8, 80, 400);
  const ext = /^bg(0\d|1[0-2])$/.test(BG) ? '.webp' : '.jpg';
  new THREE.TextureLoader().load('fighter-art/backgrounds/' + BG + ext, t => {
    t.colorSpace = THREE.SRGBColorSpace; aspect = t.image.width / t.image.height; tex = t; scene.background = t;
  });
}
const _v = new THREE.Vector3(), _d = new THREE.Vector3();
function updateBackdrop(w, h) {
  if (!tex) return;
  const ca = w / h, ry = 0.94, rx = Math.min(1, ry * ca / aspect);
  camera.getWorldDirection(_d); const yaw = Math.atan2(_d.x, _d.z);
  _v.set(camera.position.x + _d.x * 300, camera.position.y, camera.position.z + _d.z * 300).project(camera); // a far point at eye height = horizon
  const hs = (_v.y + 1) / 2, hv = HORIZON[BG] ?? 0.5;
  tex.repeat.set(rx, ry);
  tex.offset.set(Math.min(1 - rx, Math.max(0, (1 - rx) / 2 + Math.sin(yaw) * 0.12)), Math.min(1 - ry, Math.max(0, hv - hs * ry)));
}
export { ON as BG_ON, updateBackdrop };
