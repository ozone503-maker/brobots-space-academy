// fight3d/backdrop.js: painted stage still + optional moving overlay layers (crowd/water/neon/steam) from stages.json.
// Seats the ring into the painting: horizon lock, soft fog wash, contact shadow under the canvas.
// ?bg=bg12 picks another stage, ?bg=0 keeps the volcano island.
import * as THREE from 'three';
import { qs } from './util.js?v=h3';
import { camera, flames, ocean, palms, scene, sky, volc, island, sand, torchLight, FLOOR } from './stage.js?v=h3';

const BG = qs.get('bg') ?? 'bg01';
const ON = BG !== '0';
let cfg = null, still = null, aspect = 1.5, layers = [], t0 = performance.now();
const DEFAULTS = {
  bg01: { still: 'bg01.webp', horizon: 0.58, fog: 0xd9c7a8, layers: [{ type: 'steam', parallax: 0.25, opacity: 0.28, speed: 0.018 }] },
  bg12: { still: 'bg12.webp', horizon: 0.5, fog: 0xc8d4b8, layers: [] },
  bg08: { still: 'bg08.webp', horizon: 0.52, fog: 0xb8c8d8, layers: [{ type: 'steam', parallax: 0.2, opacity: 0.22, speed: 0.012 }] },
  bg04: { still: 'bg04.webp', horizon: 0.45, fog: 0xa8b8c8, layers: [] },
};

function makeSteamTex() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  for (let i = 0; i < 18; i++) {
    const g = x.createRadialGradient(40 + i * 12, 40 + (i % 5) * 14, 4, 40 + i * 12, 50, 50);
    g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.beginPath(); x.arc(30 + (i * 37) % 220, 20 + (i * 19) % 90, 28 + (i % 4) * 6, 0, 7); x.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

function hideIsland() {
  for (const o of [sky, ocean, volc, island, sand]) o.visible = false;
  for (const p of palms) p.root.visible = false;
  for (const f of flames) f.visible = false;
  scene.traverse(o => { if (o.isMesh && Math.abs(o.position.y - 1.2) < 1e-3 && Math.hypot(o.position.x, o.position.z) > 6) o.visible = false; });
  torchLight.intensity = 0;
}

// soft ground wash so the ring canvas fades into the parking lot instead of sitting like a sticker
const wash = new THREE.Mesh(
  new THREE.RingGeometry(3.6, 9.5, 64),
  new THREE.MeshBasicMaterial({ color: 0x2a2418, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide })
);
wash.rotation.x = -Math.PI / 2; wash.position.y = FLOOR - 0.02; wash.visible = false; scene.add(wash);
const contact = new THREE.Mesh(
  new THREE.CircleGeometry(4.6, 64),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false })
);
contact.rotation.x = -Math.PI / 2; contact.position.y = FLOOR - 0.01; contact.visible = false; scene.add(contact);

if (ON) {
  hideIsland();
  fetch('fighter-art/backgrounds/stages.json').then(r => r.ok ? r.json() : {}).then(j => {
    cfg = j[BG] || DEFAULTS[BG] || { still: BG + '.webp', horizon: 0.5, fog: 0xd9c7a8, layers: [] };
    scene.fog = new THREE.Fog(cfg.fog || 0xd9c7a8, 18, 90);
    const ext = cfg.still.includes('.') ? '' : '.webp';
    new THREE.TextureLoader().load('fighter-art/backgrounds/' + cfg.still + ext, t => {
      t.colorSpace = THREE.SRGBColorSpace; aspect = t.image.width / t.image.height; still = t; scene.background = t;
    });
    for (const L of (cfg.layers || [])) {
      if (L.type === 'steam' || L.src) {
        const tex = L.type === 'steam' ? makeSteamTex() : null;
        if (L.src) new THREE.TextureLoader().load('fighter-art/backgrounds/' + L.src, t => { t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; layer.tex = t; });
        const layer = { tex, parallax: L.parallax || 0.2, opacity: L.opacity || 0.3, speed: L.speed || 0.015, scroll: 0 };
        // overlay as a second screen-space plane via scene.background is one-slot; use a large distant billboard instead
        const m = new THREE.Mesh(
          new THREE.PlaneGeometry(80, 40),
          new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: layer.opacity, depthWrite: false, fog: false, toneMapped: false })
        );
        m.position.set(0, 8, -40); scene.add(m); layer.mesh = m; layers.push(layer);
      }
    }
    wash.visible = true; contact.visible = true;
  }).catch(() => {
    cfg = DEFAULTS[BG] || DEFAULTS.bg01;
    scene.fog = new THREE.Fog(cfg.fog, 18, 90);
    new THREE.TextureLoader().load('fighter-art/backgrounds/' + cfg.still, t => {
      t.colorSpace = THREE.SRGBColorSpace; aspect = t.image.width / t.image.height; still = t; scene.background = t;
    });
    wash.visible = true; contact.visible = true;
  });
}

const _v = new THREE.Vector3(), _d = new THREE.Vector3();
function updateBackdrop(w, h) {
  if (!still || !cfg) return;
  const ca = w / h, ry = 0.92, rx = Math.min(1, ry * ca / aspect);
  camera.getWorldDirection(_d); const yaw = Math.atan2(_d.x, _d.z);
  _v.set(camera.position.x + _d.x * 300, camera.position.y, camera.position.z + _d.z * 300).project(camera);
  const hs = (_v.y + 1) / 2, hv = cfg.horizon ?? 0.55;
  still.repeat.set(rx, ry);
  still.offset.set(Math.min(1 - rx, Math.max(0, (1 - rx) / 2 + Math.sin(yaw) * 0.1)), Math.min(1 - ry, Math.max(0, hv - hs * ry)));
  const now = (performance.now() - t0) / 1000;
  for (const L of layers) {
    if (!L.mesh) continue;
    L.scroll += L.speed * 0.016;
    if (L.tex) { L.tex.offset.x = L.scroll; L.tex.offset.y = Math.sin(now * 0.4) * 0.02; L.mesh.material.map = L.tex; }
    L.mesh.position.x = Math.sin(yaw) * 12 * L.parallax;
    L.mesh.quaternion.copy(camera.quaternion);
    L.mesh.material.opacity = L.opacity * (0.85 + 0.15 * Math.sin(now * 0.7));
  }
  // keep wash seated under the ring as the camera yaws
  wash.position.set(0, FLOOR - 0.02, 0);
  contact.position.set(0, FLOOR - 0.01, 0);
}
export { ON as BG_ON, updateBackdrop };
