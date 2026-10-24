// VOLCANO RING : 3D Punch Out x Ring King slice
// Same combat philosophy as fight/game.js: 60Hz frame data, startup/active/recovery,
// hitstop, shake, balance knockdowns, speed scaled damage, CPU difficulty = reaction delay only.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

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
  kSweep:{ s: 17, a: 4, r: 34, dmg: 40,  bal: 10, hs: 20, bs: 12, stop: 12, reach: 1.75, shake: 0.14, meter: 8,  ht: 0.3, sweep: 1 },
  super: { s: 16, a: 6, r: 30, dmg: 150, bal: 40, hs: 40, bs: 24, stop: 22, reach: 1.7,  shake: 0.25, meter: 0, unblock: 0.45 },
};
// ==========================================
const qs = new URLSearchParams(location.search);
const AUTO = qs.has('auto');
const D2R = Math.PI / 180, clamp = (v, a, b) => v < a ? a : v > b ? b : v, lerp = (a, b, t) => a + (b - a) * t;
const ease = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const rnd = Math.random;
const $ = id => document.getElementById(id);

// ---------------- renderer ----------------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
let PR = Math.min(devicePixelRatio || 1, qs.get('q') === 'low' ? 1 : 1.75);
renderer.setPixelRatio(PR);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xff8a5c, 60, 380);
const camera = new THREE.PerspectiveCamera(58, 9 / 16, 0.05, 900);
scene.add(camera);
let composer = null, bloom = null, useBloom = qs.get('q') !== 'low';
function makeComposer() {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.5, 0.82);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
}
try { makeComposer(); } catch (e) { useBloom = false; }
function resize() {
  const el = $('app'); const w = el.clientWidth, h = el.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  if (composer) { composer.setPixelRatio(PR); composer.setSize(w, h); }
}
addEventListener('resize', resize);

// ---------------- lights ----------------
const hemi = new THREE.HemisphereLight(0xffc7a0, 0x3a1f4a, 0.9); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffb070, 2.6);
sun.position.set(-30, 22, -40); sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 120 });
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
scene.add(sun); scene.add(sun.target);
const rim = new THREE.DirectionalLight(0x7fb8ff, 1.4); rim.position.set(25, 12, 30); scene.add(rim);
const ringSpot = new THREE.SpotLight(0xffffff, 40, 20, 0.6, 0.5, 1.5); ringSpot.position.set(0, 9, 0); scene.add(ringSpot); scene.add(ringSpot.target);

// ---------------- background ----------------
const NOISE = `
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*vn(p);p*=2.03;a*=.5;}return v;}`;
const uTime = { value: 0 };
const sunDir = new THREE.Vector3(-0.55, 0.12, -0.83).normalize();
const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { uTime, sunDir: { value: sunDir } },
  vertexShader: `varying vec3 vDir; void main(){ vDir=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position.z=gl_Position.w; }`,
  fragmentShader: NOISE + `uniform float uTime; uniform vec3 sunDir; varying vec3 vDir;
  void main(){ vec3 d=normalize(vDir); float y=d.y;
   vec3 top=vec3(.10,.07,.32), mid=vec3(.85,.25,.45), hor=vec3(1.0,.55,.22);
   vec3 c=mix(hor,mid,smoothstep(0.,.18,y)); c=mix(c,top,smoothstep(.15,.6,y));
   if(y<0.) c=mix(hor*.8,vec3(.2,.08,.2),smoothstep(0.,-.2,y));
   float s=max(dot(d,sunDir),0.); c+=vec3(1.,.6,.25)*pow(s,8.)*.6+vec3(1.,.85,.5)*pow(s,400.)*6.;
   if(y>0.){ vec2 uv=d.xz/(y+.12)*1.4; uv.x+=uTime*.015; float n=fbm(uv*1.3+fbm(uv+uTime*.02));
    float cl=smoothstep(.48,.78,n)*smoothstep(0.,.12,y);
    vec3 cc=mix(vec3(1.,.45,.35),vec3(1.,.8,.6),pow(s,2.)); cc=mix(cc,vec3(.35,.15,.4),smoothstep(.2,.6,y));
    c=mix(c,cc,cl*.8);
    float st=step(.9975,h21(floor(d.xz/(y+.3)*300.)))*smoothstep(.35,.7,y); c+=st*vec3(.8);}
   gl_FragColor=vec4(c,1.);}`
}));
scene.add(sky);

// ocean
const ocean = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200, 1, 1), new THREE.ShaderMaterial({
  uniforms: { uTime, sunDir: { value: sunDir }, camPos: { value: camera.position } },
  vertexShader: `varying vec3 wp; void main(){ vec4 w=modelMatrix*vec4(position,1.); wp=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
  fragmentShader: NOISE + `uniform float uTime; uniform vec3 sunDir; uniform vec3 camPos; varying vec3 wp;
  void main(){ vec2 p=wp.xz*.08; float n=fbm(p+vec2(uTime*.05,uTime*.03))+.5*fbm(p*3.-uTime*.08);
   vec3 nrm=normalize(vec3((n-.75)*.6,1.,(fbm(p*1.7+uTime*.04)-.5)*.6));
   vec3 v=normalize(camPos-wp); vec3 r=reflect(-v,nrm);
   float fres=pow(1.-max(v.y,0.),4.);
   vec3 deep=vec3(.02,.18,.28), sky=vec3(1.,.5,.35);
   vec3 c=mix(deep,sky,fres*.85);
   float sp=pow(max(dot(r,sunDir),0.),120.); c+=vec3(1.,.7,.35)*sp*5.;
   float dist=length(wp.xz); c=mix(c,vec3(1.,.55,.3),smoothstep(150.,480.,dist));
   float foam=smoothstep(.05,0.,abs(dist-12.5+sin(atan(wp.z,wp.x)*7.+uTime)*.4))*(.5+.5*sin(uTime*1.3));
   c+=foam*.6; gl_FragColor=vec4(c,1.);}`
}));
ocean.rotation.x = -Math.PI / 2; ocean.position.y = -1.3; scene.add(ocean);

// volcano
const volc = new THREE.Group(); volc.position.set(-90, -1.3, -230); scene.add(volc);
{
  const g = new THREE.CylinderGeometry(9, 95, 70, 64, 24, true);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), a = Math.atan2(z, x);
    const k = 1 + 0.08 * Math.sin(a * 5 + y * 0.1) + 0.05 * Math.sin(a * 13);
    pos.setX(i, x * k); pos.setZ(i, z * k);
  }
  g.computeVertexNormals();
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime }, fog: false,
    vertexShader: `varying vec2 vUv; varying float vY; varying vec3 vN; void main(){ vUv=uv; vY=position.y; vN=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: NOISE + `uniform float uTime; varying vec2 vUv; varying float vY; varying vec3 vN;
    void main(){ float h=(vY+35.)/70.; vec3 rock=mix(vec3(.10,.05,.08),vec3(.30,.13,.16),fbm(vUv*vec2(30.,8.)));
     rock*=.5+.6*max(dot(vN,normalize(vec3(-.5,.3,.8))),0.);
     float ch=fbm(vec2(vUv.x*18.,vUv.y*3.-uTime*.06));
     float lava=smoothstep(.62,.7,ch)*smoothstep(.05,.9,h)*(.6+.4*sin(uTime*2.+vUv.x*40.));
     float glow=smoothstep(.85,1.,h);
     vec3 c=rock+vec3(2.6,.7,.08)*lava+vec3(1.8,.45,.05)*glow;
     c=mix(c,vec3(.95,.5,.4),.35*(1.-h)); gl_FragColor=vec4(c,1.);}`
  });
  const cone = new THREE.Mesh(g, m); cone.position.y = 35; volc.add(cone);
  const crater = new THREE.Mesh(new THREE.CircleGeometry(9, 32), new THREE.MeshBasicMaterial({ color: 0xff7a1a, fog: false }));
  crater.rotation.x = -Math.PI / 2; crater.position.y = 69.5; volc.add(crater);
  // second smaller peak
  const c2 = new THREE.Mesh(new THREE.ConeGeometry(70, 38, 40, 1, true), new THREE.MeshBasicMaterial({ color: 0x5a2c46, fog: false }));
  c2.position.set(140, 19, 30); volc.add(c2);
}
function softTex(inner, outer) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, inner); g.addColorStop(1, outer);
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const smokeTex = softTex('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
function particles(n, size, color, blending, opacity) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const m = new THREE.PointsMaterial({ size, map: smokeTex, color, transparent: true, opacity, depthWrite: false, blending, fog: false, sizeAttenuation: true });
  const p = new THREE.Points(g, m); p.frustumCulled = false; return p;
}
const SMOKE_N = 160, smoke = particles(SMOKE_N, 26, 0x6a4a5a, THREE.NormalBlending, 0.5);
const smokeLife = new Float32Array(SMOKE_N).map(() => rnd());
volc.add(smoke);
const EMB_N = 120, embers = particles(EMB_N, 2.6, 0xff8a20, THREE.AdditiveBlending, 1);
const embV = new Float32Array(EMB_N * 3), embLife = new Float32Array(EMB_N).map(() => rnd());
volc.add(embers);
function updateVolcano(dt) {
  const sp = smoke.geometry.attributes.position;
  for (let i = 0; i < SMOKE_N; i++) {
    smokeLife[i] += dt * 0.05; if (smokeLife[i] > 1) smokeLife[i] -= 1;
    const l = smokeLife[i], s = i * 12.9898;
    sp.setXYZ(i, Math.sin(s) * (4 + l * 30) + l * l * 90, 72 + l * 120, Math.cos(s * 1.3) * (4 + l * 20));
  }
  sp.needsUpdate = true;
  const ep = embers.geometry.attributes.position;
  for (let i = 0; i < EMB_N; i++) {
    embLife[i] += dt * 0.5;
    if (embLife[i] > 1) { embLife[i] = 0; embV[i * 3] = (rnd() - .5) * 30; embV[i * 3 + 1] = 25 + rnd() * 30; embV[i * 3 + 2] = (rnd() - .5) * 30; }
    const l = embLife[i] * 2.4;
    ep.setXYZ(i, embV[i * 3] * l, 70 + embV[i * 3 + 1] * l - 18 * l * l, embV[i * 3 + 2] * l);
  }
  ep.needsUpdate = true;
}

// island + ring
const std = (o) => new THREE.MeshStandardMaterial(o);
const rockMat = std({ color: 0x3a2a2e, roughness: 0.95 });
const island = new THREE.Mesh(new THREE.CylinderGeometry(9, 12.5, 2, 48, 1), rockMat); island.position.y = -1.0; island.receiveShadow = true; scene.add(island);
const sand = new THREE.Mesh(new THREE.CylinderGeometry(8.6, 9, 0.12, 48), std({ color: 0xe0b98a, roughness: 1 })); sand.position.y = 0.0; sand.receiveShadow = true; scene.add(sand);
function ringTex() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1024; const x = cv.getContext('2d');
  x.fillStyle = '#1d6fb8'; x.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 4000; i++) { x.fillStyle = `rgba(255,255,255,${rnd() * 0.04})`; x.fillRect(rnd() * 1024, rnd() * 1024, 3, 3); }
  x.strokeStyle = '#ffd400'; x.lineWidth = 18; x.beginPath(); x.arc(512, 512, 470, 0, 7); x.stroke();
  x.strokeStyle = '#ffffff55'; x.lineWidth = 6; x.beginPath(); x.arc(512, 512, 150, 0, 7); x.stroke();
  x.font = 'italic 900 120px system-ui,sans-serif'; x.textAlign = 'center'; x.fillStyle = '#ffffff30'; x.fillText('BROBOTS', 512, 560);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const ringMat = new THREE.MeshStandardMaterial({ map: ringTex(), roughness: 0.75 });
const ringFloor = new THREE.Mesh(new THREE.CylinderGeometry(4.3, 4.5, 0.5, 64), [std({ color: 0x14143a, roughness: .6 }), ringMat, ringMat]);
ringFloor.position.y = 0.0; ringFloor.receiveShadow = true; scene.add(ringFloor);
const FLOOR = 0.25;
const postMat = std({ color: 0xd8d8e0, metalness: 0.9, roughness: 0.25 });
const ropeMats = [0xff2a3c, 0xffffff, 0x1b8cff].map(c => std({ color: c, roughness: .4 }));
for (let i = 0; i < 8; i++) {
  const a = i / 8 * Math.PI * 2, p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.5, 12), postMat);
  p.position.set(Math.cos(a) * 4.15, FLOOR + 0.75, Math.sin(a) * 4.15); p.castShadow = true; scene.add(p);
  const pad = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), ropeMats[i % 3]); pad.position.set(p.position.x, FLOOR + 1.52, p.position.z); scene.add(pad);
}
[0.55, 0.9, 1.25].forEach((h, i) => {
  const r = new THREE.Mesh(new THREE.TorusGeometry(4.12, 0.025, 6, 8 * 6), ropeMats[i]);
  r.rotation.x = Math.PI / 2; r.position.y = FLOOR + h; scene.add(r);
});
// tiki torches
const flames = [];
const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa040 });
for (let i = 0; i < 4; i++) {
  const a = i / 4 * Math.PI * 2 + Math.PI / 4, x = Math.cos(a) * 6.2, z = Math.sin(a) * 6.2;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.4, 8), std({ color: 0x5a3a20, roughness: 1 }));
  pole.position.set(x, 1.2, z); scene.add(pole);
  const f = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 10), flameMat); f.position.set(x, 2.6, z); scene.add(f); flames.push(f);
}
const torchLight = new THREE.PointLight(0xff8a30, 6, 14, 1.6); torchLight.position.set(0, 3, -5); scene.add(torchLight);

// palms
const palms = [];
const trunkMat = std({ color: 0x6b4a2e, roughness: 0.9 });
const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f8a3a, roughness: 0.7, side: THREE.DoubleSide });
function leafGeo() {
  const s = new THREE.Shape(); s.moveTo(0, 0); s.quadraticCurveTo(0.35, 1.2, 0, 2.6); s.quadraticCurveTo(-0.35, 1.2, 0, 0);
  const g = new THREE.ShapeGeometry(s, 6); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setZ(i, -0.12 * y * y); }
  g.rotateX(-Math.PI / 2 + 0.3); g.computeVertexNormals(); return g;
}
const LG = leafGeo();
function palm(x, z, h, sc) {
  const root = new THREE.Group(); root.position.set(x, 0, z); root.scale.setScalar(sc); scene.add(root);
  const top = new THREE.Group(); let prev = root; const segs = 6;
  const lean = rnd() * Math.PI * 2;
  for (let i = 0; i < segs; i++) {
    const s = new THREE.Group(); s.position.y = i ? h / segs : 0; s.rotation.z = 0.06; prev.add(s);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.13 - i * 0.012, 0.16 - i * 0.012, h / segs + 0.02, 7), trunkMat);
    m.position.y = h / segs / 2; m.castShadow = sc > 0.8; s.add(m); prev = s;
  }
  root.rotation.y = lean; top.position.y = h / segs; prev.add(top);
  for (let i = 0; i < 8; i++) {
    const l = new THREE.Mesh(LG, leafMat); l.rotation.y = i / 8 * Math.PI * 2; l.rotation.x = 0.2 * rnd(); top.add(l);
  }
  palms.push({ root, top, ph: rnd() * 6 });
}
for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2 + 0.3; palm(Math.cos(a) * (7.6 + rnd()), Math.sin(a) * (7.6 + rnd()), 4 + rnd() * 2, 1); }
for (let i = 0; i < 10; i++) { const a = rnd() * Math.PI * 2; const d = 30 + rnd() * 40; palm(Math.cos(a) * d, Math.sin(a) * d, 5, 2.5); }

// ---------------- opponent: articulated humanoid ----------------
const skinOpp = new THREE.MeshPhysicalMaterial({ color: 0x8a5a3c, roughness: 0.48, metalness: 0, sheen: 0.6, sheenColor: new THREE.Color(0xff9070), clearcoat: 0.25, clearcoatRoughness: 0.6 });
const trunksMat = new THREE.MeshPhysicalMaterial({ color: 0xc8102e, roughness: 0.35, sheen: 1, sheenColor: new THREE.Color(0xff8080) });
const gloveMat = new THREE.MeshPhysicalMaterial({ color: 0xffc400, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.15 });
const shoeMat = std({ color: 0x111118, roughness: 0.5 });
const hairMat = std({ color: 0x120c0a, roughness: 0.9 });
const eyeMat = std({ color: 0xffffff, roughness: 0.1 });
function cap(r, len, mat) { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 14), mat); m.castShadow = true; m.receiveShadow = true; return m; }
function joint(parent, x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }
function buildOpponent() {
  const J = {}; const root = new THREE.Group(); scene.add(root); J.root = root;
  J.hips = joint(root, 0, 1.0, 0);
  const pelvis = cap(0.17, 0.16, trunksMat); pelvis.rotation.z = Math.PI / 2; pelvis.scale.set(1, 1, 0.8); J.hips.add(pelvis);
  J.spine = joint(J.hips, 0, 0.08, 0);
  const abs = cap(0.15, 0.18, skinOpp); abs.position.y = 0.14; abs.scale.set(1.1, 1, 0.8); J.spine.add(abs);
  J.chest = joint(J.spine, 0, 0.3, 0);
  const chest = cap(0.19, 0.12, skinOpp); chest.position.y = 0.1; chest.rotation.z = Math.PI / 2; chest.scale.set(1, 1.05, 0.75); J.chest.add(chest);
  const pecs = cap(0.16, 0.14, skinOpp); pecs.position.set(0, 0.06, 0.05); pecs.rotation.z = Math.PI / 2; pecs.scale.set(1, 1, 0.7); J.chest.add(pecs);
  J.neck = joint(J.chest, 0, 0.27, 0.01);
  const neck = cap(0.07, 0.06, skinOpp); neck.position.y = 0.04; J.neck.add(neck);
  J.head = joint(J.neck, 0, 0.1, 0);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.115, 24, 18), skinOpp); skull.scale.set(0.92, 1.12, 1); skull.position.y = 0.1; skull.castShadow = true; J.head.add(skull);
  const jaw = cap(0.07, 0.06, skinOpp); jaw.rotation.z = Math.PI / 2; jaw.position.set(0, 0.02, 0.04); J.head.add(jaw);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.118, 20, 12, 0, Math.PI * 2, 0, 1.3), hairMat); hair.position.y = 0.12; hair.scale.set(0.95, 1.05, 1.02); J.head.add(hair);
  const brow = cap(0.025, 0.12, skinOpp); brow.rotation.z = Math.PI / 2; brow.position.set(0, 0.14, 0.095); J.head.add(brow);
  const nose = cap(0.018, 0.035, skinOpp); nose.position.set(0, 0.1, 0.115); nose.rotation.x = 0.3; J.head.add(nose);
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), eyeMat); e.position.set(s * 0.04, 0.12, 0.1); J.head.add(e);
    const pu = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), hairMat); pu.position.set(s * 0.04, 0.12, 0.114); J.head.add(pu);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), skinOpp); ear.scale.set(0.5, 1, 0.8); ear.position.set(s * 0.108, 0.1, 0); J.head.add(ear);
  }
  for (const [side, s] of [['L', 1], ['R', -1]]) {
    const sh = joint(J.chest, s * 0.24, 0.17, 0); J['s' + side] = sh;
    const delt = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 12), skinOpp); delt.castShadow = true; sh.add(delt);
    const ua = cap(0.065, 0.2, skinOpp); ua.position.y = -0.15; sh.add(ua);
    const el = joint(sh, 0, -0.3, 0); J['e' + side] = el;
    const fa = cap(0.055, 0.18, skinOpp); fa.position.y = -0.13; el.add(fa);
    const gl = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 16), gloveMat); gl.scale.set(0.9, 1.15, 1.05); gl.position.y = -0.3; gl.castShadow = true; el.add(gl);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.08, 14), std({ color: 0xffffff, roughness: .4 })); cuff.position.y = -0.2; el.add(cuff);
    J['g' + side] = gl;
    const th = joint(J.hips, s * 0.11, -0.05, 0); J['t' + side] = th;
    const leg = cap(0.095, 0.3, skinOpp); leg.position.y = -0.22; th.add(leg);
    const tr = cap(0.11, 0.08, trunksMat); tr.position.y = -0.08; th.add(tr);
    const kn = joint(th, 0, -0.45, 0); J['k' + side] = kn;
    const shin = cap(0.07, 0.3, skinOpp); shin.position.y = -0.22; kn.add(shin);
    const shoe = cap(0.06, 0.14, shoeMat); shoe.rotation.x = Math.PI / 2; shoe.position.set(0, -0.47, 0.05); kn.add(shoe);
  }
  return J;
}
const OJ = buildOpponent();
const JOINTS = ['hips', 'spine', 'chest', 'neck', 'head', 'sL', 'eL', 'sR', 'eR', 'tL', 'kL', 'tR', 'kR'];
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
P.down = pose({ rx: -86, y: -0.82, spine: [0, 0, 0], head: [10, 20, 0], sL: [-170, 0, 50], eL: [-30, 0, 0], sR: [-160, 0, -40], eR: [-40, 0, 0], tL: [-10, 0, -10], kL: [20, 0, 0], tR: [-30, 0, 12], kR: [50, 0, 0] });
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

// ---------------- player: ghost body + bare fists ----------------
const ghostMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { col: { value: new THREE.Color(0x66e0ff) }, uTime },
  vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
  fragmentShader: `uniform vec3 col; uniform float uTime; varying vec3 vN; varying vec3 vV;
  void main(){ float f=pow(1.-abs(dot(vN,vV)),2.5); gl_FragColor=vec4(col*(f*.9+.02),f*.32+.015); }`
});
const ghost = new THREE.Group(); scene.add(ghost);
{
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.35, 6, 16), ghostMat); torso.position.y = 1.2; torso.scale.set(1.15, 1, 0.7); ghost.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 14), ghostMat); head.position.y = 1.68; head.scale.set(0.95, 1.1, 1); ghost.add(head);
  const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.06, 4, 10), ghostMat); neck.position.y = 1.53; ghost.add(neck);
  for (const s of [-1, 1]) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10), ghostMat); d.position.set(s * 0.25, 1.44, 0); ghost.add(d);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.7, 4, 10), ghostMat); leg.position.set(s * 0.12, 0.5, 0); ghost.add(leg); }
}
const legMat = new THREE.MeshBasicMaterial({ color: 0x8fe6ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
const legCore = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
const ghostLegs = [0, 1].map(() => { // ghost leg: thigh + shin + foot, camera space (feet stay ghost, just brighter)
  const g = new THREE.Group(); g.visible = false; camera.add(g);
  const seg = (r0, r1) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, 1, 14, 1), legMat); const c = new THREE.Mesh(new THREE.CylinderGeometry(r0 * 0.45, r1 * 0.45, 1, 8, 1), legCore); m.add(c); g.add(m); return m; };
  const thigh = seg(0.075, 0.095), shin = seg(0.05, 0.07);
  const foot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), legMat); foot.scale.set(1, 0.7, 1.5); g.add(foot);
  const knee = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), legMat); g.add(knee);
  return { g, thigh, shin, foot, knee };
});
function placeSeg(m, a, b) { m.position.copy(a).add(b).multiplyScalar(0.5); m.scale.set(1, a.distanceTo(b), 1); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); }
const LEGP = { // camera-space [hip, knee, foot]; chamber = knee pulled up, extend = foot driven at him
  rest: [[0.16, -0.95, -0.3], [0.15, -0.8, -0.5], [0.15, -0.95, -0.55]],
  chamber: [[0.16, -0.62, -0.45], [0.11, -0.17, -0.78], [0.13, -0.33, -0.62]],
  extend: [[0.14, -0.6, -0.5], [0.08, -0.2, -0.95], [0.03, -0.04, -1.45]],
};
const _v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const LR = LEGP.rest, LC = LEGP.chamber;
const LK = { // [rest, chamber, ...strike keys] as [hip, knee, foot]
  kHigh:  [LR, LC, [[0.14, -0.6, -0.5], [0.07, -0.08, -0.95], [0.02, 0.12, -1.5]]],
  kMid:   [LR, LC, [[0.14, -0.6, -0.5], [0.08, -0.22, -0.95], [0.03, -0.14, -1.5]]],
  kSide:  [LR, [[0.16, -0.62, -0.45], [0.2, -0.2, -0.7], [0.12, -0.25, -0.62]], [[0.1, -0.58, -0.5], [0.06, -0.24, -0.95], [0.0, -0.2, -1.62]]],
  kRound: [LR, [[0.16, -0.62, -0.45], [0.32, -0.15, -0.7], [0.5, -0.12, -0.75]], [[0.16, -0.6, -0.5], [0.25, -0.05, -0.95], [0.35, 0.02, -1.25]], [[0.14, -0.6, -0.5], [0.05, 0.0, -1.0], [-0.12, 0.04, -1.42]]],
  kSweep: [LR, [[0.16, -0.7, -0.45], [0.3, -0.5, -0.75], [0.45, -0.65, -0.9]], [[0.14, -0.72, -0.5], [0.12, -0.55, -0.95], [0.12, -0.7, -1.35]], [[0.12, -0.72, -0.5], [-0.02, -0.55, -1.0], [-0.22, -0.68, -1.4]]],
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
// fist keyframes for the right hand [x,y,z,rx,ry,rz]; left hand mirrored
const FK = {
  jab:   [[0.13, -0.05, -0.8, 0.4, -0.1, 0.5], [0.03, -0.06, -1.25, 0.05, 0, 1.5]],
  pHigh: [[0.13, -0.03, -0.8, 0.4, -0.1, 0.5], [0.02, 0.02, -1.28, 0.05, 0, 1.5]],
  pMid:  [[0.13, -0.1, -0.8, 0.3, -0.1, 0.5], [0.03, -0.17, -1.25, 0.15, 0, 1.5]],
  pLow:  [[0.13, -0.18, -0.78, 0.2, -0.1, 0.5], [0.04, -0.3, -1.15, -0.25, 0, 1.5]],
  hook:  [[0.38, -0.04, -0.62, 0.0, -0.6, 0.2], [0.36, -0.02, -1.02, 0, -0.9, 1.4], [-0.02, -0.04, -1.18, 0, 0.6, 1.5]],
  upper: [[0.14, -0.42, -0.68, 1.2, 0, 0.2], [0.05, -0.18, -0.95, 0.4, 0, 0.25], [0.03, 0.06, -1.1, -0.9, 0, 0.3]],
};
function mir(q, side) { return side ? q : [-q[0], q[1], q[2], q[3], -q[4], -q[5]]; }
function legPose(side, a, b, t, h) { for (let i = 0; i < 3; i++) { const A = LEGP[a][i], B = LEGP[b][i]; _v[i].set(lerp(A[0], B[0], t) * (side ? 1 : -1), lerp(A[1], B[1], t) + (i ? (h - 0.5) * 0.25 * (a !== 'rest' || t > 0.3 ? 1 : 0) : 0), lerp(A[2], B[2], t)); } return _v; }
const ghostArms = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 1, 10, 1, true), ghostMat); scene.add(m); return m; });
const skinMat = new THREE.MeshPhysicalMaterial({ color: 0xd99a6c, roughness: 0.5, sheen: 0.7, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xff7a5a), clearcoat: 0.15, clearcoatRoughness: 0.7 });
const knuckleMat = new THREE.MeshPhysicalMaterial({ color: 0xe8a77a, roughness: 0.42, sheen: 0.6, sheenColor: new THREE.Color(0xff8060) });
function buildFist(s) { // s=-1 left, 1 right; fist faces -z (camera forward)
  const g = new THREE.Group();
  const back = new THREE.Mesh(new THREE.SphereGeometry(0.05, 20, 14), skinMat); back.scale.set(1.0, 0.72, 1.15); g.add(back);
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.0145, 0.022, 4, 10), knuckleMat);
    f.rotation.x = Math.PI / 2; f.position.set((i - 1.5) * 0.025 * -s, 0.004 - Math.abs(i - 1.5) * 0.004, -0.048 + Math.abs(i - 1.5) * 0.003); g.add(f);
    const k = new THREE.Mesh(new THREE.CapsuleGeometry(0.013, 0.012, 4, 8), skinMat); k.position.set((i - 1.5) * 0.025 * -s, -0.022, -0.04); g.add(k);
  }
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.045, 4, 8), skinMat); thumb.rotation.z = Math.PI / 2; thumb.position.set(s * 0.012, -0.032, -0.03); g.add(thumb);
  const wrist = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.11, 4, 12), skinMat); wrist.rotation.x = Math.PI / 2; wrist.position.set(0, -0.005, 0.1); g.add(wrist);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.scale.setScalar(0.85);
  camera.add(g); return g;
}
const fists = [buildFist(-1), buildFist(1)];
const handLight = new THREE.PointLight(0xffd0a0, 1.2, 2.5, 2); camera.add(handLight); handLight.position.set(0, 0.2, 0.1);
const HP = { // hand poses in camera space [x,y,z, rx, ry, rz]
  guardL: [-0.15, -0.035, -0.85, 0.55, 0.25, -0.35], guardR: [0.15, -0.04, -0.83, 0.55, -0.25, 0.35],
  blockL: [-0.075, -0.05, -0.42, 1.25, 0.3, -0.2], blockR: [0.075, -0.06, -0.43, 1.25, -0.3, 0.2],
  jabW: [-0.13, -0.27, -0.55, 0.2, 0.1, -0.4], jabS: [-0.04, -0.12, -1.25, 0.05, 0, -1.5],
  hookW: [0.34, -0.3, -0.5, 0.0, -0.6, 0.2], hookM: [0.3, -0.13, -1.0, 0, -0.9, 1.4], hookS: [-0.02, -0.1, -1.18, 0, 0.6, 1.5],
  upW: [0.14, -0.55, -0.58, 1.2, 0, 0.2], upS: [0.03, -0.02, -1.12, -0.9, 0, 0.3],
  supW: [0.22, -0.65, -0.45, 1.3, 0, 0.3], supS: [0.0, 0.05, -1.25, -1.1, 0, 0.2],
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

// ---------------- audio ----------------
let AC = null; const audio = { muted: AUTO };
function ac() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } } return AC; }
function noiseBuf(a) { const b = a.createBuffer(1, a.sampleRate * 0.4, a.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1; return b; }
let NB = null;
function sfx(type, k = 1) {
  const a = ac(); if (!a || audio.muted) return; if (!NB) NB = noiseBuf(a);
  const t = a.currentTime, g = a.createGain(); g.connect(a.destination);
  if (type === 'whoosh') {
    const n = a.createBufferSource(); n.buffer = NB; const f = a.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(2200, t + 0.12);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25 * k, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    n.connect(f); f.connect(g); n.start(t); n.stop(t + 0.2);
  } else if (type === 'hit' || type === 'block') {
    const hit = type === 'hit';
    const o = a.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(hit ? 140 * k : 400, t); o.frequency.exponentialRampToValueAtTime(hit ? 45 : 200, t + 0.15);
    const og = a.createGain(); og.gain.setValueAtTime(hit ? 0.9 : 0.3, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.2); o.connect(og); og.connect(a.destination); o.start(t); o.stop(t + 0.22);
    const n = a.createBufferSource(); n.buffer = NB; const f = a.createBiquadFilter(); f.type = hit ? 'lowpass' : 'highpass'; f.frequency.value = hit ? 1800 : 2500;
    g.gain.setValueAtTime(hit ? 0.7 : 0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + (hit ? 0.12 : 0.06)); n.connect(f); f.connect(g); n.start(t); n.stop(t + 0.15);
  } else if (type === 'bell') {
    [880, 1320, 2210].forEach((fr, i) => { const o = a.createOscillator(); const og = a.createGain(); o.frequency.value = fr; og.gain.setValueAtTime(0.25 / (i + 1), t); og.gain.exponentialRampToValueAtTime(0.001, t + 1.6); o.connect(og); og.connect(a.destination); o.start(t); o.stop(t + 1.7); });
  } else if (type === 'thud') {
    const o = a.createOscillator(); o.frequency.setValueAtTime(80, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.4); g.gain.setValueAtTime(1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5); o.connect(g); o.start(t); o.stop(t + 0.5);
  } else if (type === 'crowd') {
    const n = a.createBufferSource(); n.buffer = NB; n.loop = true; const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.6;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3 * k, t + 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8); n.connect(f); f.connect(g); n.start(t); n.stop(t + 1.9);
  }
}

// ---------------- fighters + combat ----------------
function mkFighter(name, isPlayer) {
  return { name, isPlayer, x: 0, z: 0, hp: T.hp, bal: T.balMax, balDelay: 0, state: 'idle', st: 0, move: null, mk: null, hitDone: false,
    blocking: false, dodge: 0, dodgeDir: 0, react: null, meter: 0, superUsed: false, wins: 0, downs: 0, spd: 1, vx: 0, vz: 0,
    inp: { mx: 0, mz: 0, block: false, atk: null, dodge: 0, spd: 1 }, ai: { t: 0, plan: [], strafe: 1, hist: [] } };
}
const F = [mkFighter('YOU', true), mkFighter('GAVIN', false)];
const G = { mode: 'title', round: 1, timer: T.roundTime, tf: 0, hitstop: 0, shake: 0, banner: '', bannerT: 0, phaseT: 0, diff: 'normal', matchesDone: 0, frames: 0, fps: 60, winner: null };
window.FIGHT = { G, F, get PI() { return PI; }, get fps() { return G.fps; } };

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
  const underGuard = htNow && htNow < 1.38 && !d.isPlayer; // Gavin's guard is high: body/low shots get under it
  if (underGuard && d.blocking) { scale *= 0.8; dbg('under guard @' + htNow.toFixed(2)); }
  if (d.blocking && canAct(d) && !m.unblock && !underGuard) {
    d.hp -= m.dmg * T.chip; d.bal -= m.bal * T.blockBal; d.balDelay = T.balRegenDelay; d.state = 'block'; d.st = -m.bs; d.meter = Math.min(100, d.meter + 3);
    G.hitstop = Math.round(m.stop * 0.6); G.shake = m.shake * 0.4; spark(hitPos, 0.6, 0x88ccff); sfx('block');
    d.vx += fx * 0.03; d.vz += fz * 0.03;
  } else {
    if (d.blocking && m.unblock) scale *= m.unblock;
    const dmg = Math.min(Math.round(m.dmg * scale), a.mk === 'super' ? T.hp * 0.2 : T.hp * 0.09); // hard cap per hit
    d.hp -= dmg; d.bal -= Math.min(m.bal * scale, a.mk === 'super' ? 50 : 22);
    if (a.isPlayer || d.isPlayer) dbg('hit ' + a.mk + ' ' + dmg + ' dmg -> ' + (d.isPlayer ? 'you' : 'cpu') + ' ' + Math.max(0, Math.round(d.hp))); d.balDelay = T.balRegenDelay;
    a.meter = Math.min(100, a.meter + m.meter * scale); d.meter = Math.min(100, d.meter + m.meter * 0.5);
    d.state = 'hit'; d.st = 0; d.hs = m.hs; d.move = null; d.react = (htNow ? htNow < 1.42 : m.body || (a.mk === 'hook' && rnd() < 0.5)) ? 'hitBody' : 'hitHead';
    if (a.isPlayer) a.lastHit = { k: a.mk, ht: htNow, dmg, react: d.react };
    d.vx += fx * 0.04 * scale; d.vz += fz * 0.04 * scale;
    G.hitstop = Math.round(m.stop * (counter ? 1.4 : 1)); G.shake = m.shake * scale * (counter ? 1.4 : 1);
    spark(hitPos, 1 + (scale - 1) * 2 + (a.mk === 'super' ? 2 : 0), counter ? 0xffe040 : 0xffffff);
    sfx('hit', 1 / scale);
    if (d.isPlayer) { $('flash').style.opacity = 0.9; setTimeout(() => $('flash').style.opacity = 0, 120); }
    if (counter && a.isPlayer) showBanner('COUNTER', 30);
    if (m.push) { d.vx += fx * m.push; d.vz += fz * m.push; }
    if (d.hp <= 0) { d.hp = 0; knockdown(d, true); }
    else if (d.bal <= 0 || m.sweep) knockdown(d, false); // a landed sweep takes his legs
  }
}
function knockdown(f, ko) {
  f.state = ko ? 'ko' : 'down'; f.st = 0; f.downs++; f.blocking = false; f.move = null;
  G.hitstop = 26; G.shake = 0.3; sfx('thud'); sfx('crowd', 1.2);
  if (ko || f.downs >= 3) { f.state = 'ko'; endRound(F.indexOf(f) === 0 ? 1 : 0, 'K.O.'); }
  else showBanner('DOWN', 60);
}
function stepFighter(f, o) {
  f.st++;
  const inp = f.inp;
  if (f.state !== 'down' && f.state !== 'ko') {
    f.balDelay > 0 ? f.balDelay-- : (f.bal = Math.min(T.balMax, f.bal + T.balRegen));
  }
  switch (f.state) {
    case 'idle': case 'block':
      if (f.state === 'block' && f.st < 0) break;
      f.blocking = !!inp.block; f.state = f.blocking ? 'block' : 'idle';
      if (inp.dodge) { startDodge(f, inp.dodge); inp.dodge = 0; break; }
      if (inp.atk && f.isPlayer && G.frames - (inp.atkF || 0) > 24) { dbg('dropped stale ' + inp.atk); inp.atk = null; }
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
      if (f.st >= m.s + m.a + m.r + (f.whiffed ? 6 : 0)) { f.state = 'idle'; f.st = 0; f.move = null; }
      break; }
    case 'dodge': if (f.st >= 18) { f.state = 'idle'; f.st = 0; } break;
    case 'hit': if (f.st >= f.hs) { f.state = f.bal < 25 ? 'stagger' : 'idle'; f.st = 0; } break;
    case 'stagger': if (f.st >= 40) { f.state = 'idle'; f.st = 0; } break;
    case 'down':
      if (f.st >= T.downFrames) { f.state = 'getup'; f.st = 0; }
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

// ---------------- input ----------------
// Four swipe pads (Jessie's layout): two upper PUNCH pads, two lower KICK pads.
// Left pads = left hand/leg, right pads = right. A swipe is read by its 8-way direction from the
// touch-down point; "in" = toward screen centre, "out" = toward the edge. No labels on screen.
// Guard = both thumbs held still anywhere 0.25s. Super = both PUNCH pads held with a full meter.
// Roam = both thumbs dragged the same way.
const keys = {};
const DEBUG = qs.has('debug'); let dbgEl = null; const dbgLines = [];
function dbg(t) { if (!DEBUG) return; if (!dbgEl) { dbgEl = document.createElement('pre'); dbgEl.id = 'dbg'; document.getElementById('app').appendChild(dbgEl); }
  dbgLines.push((performance.now() / 1000).toFixed(1) + ' ' + t); if (dbgLines.length > 14) dbgLines.shift(); dbgEl.textContent = dbgLines.join('\n'); }
window.__dbgLines = dbgLines;
const app = $('app');
const trailCv = $('trail'), tctx = trailCv.getContext('2d');
const ptrs = new Map(); // pointerId -> state
const trails = []; // {pts:[{x,y,t}], side, kind, dead}
const SWIPE_PX = 25, COMMIT_PX = 70, TAP_MS = 350, STILL_PX = 18, GUARD_MS = 250, SUPER_CHARGE = 30;
// Jessie's staggered layout: punch strips inboard at mid-height, kick strips hugging the edges and lower,
// BLOCK circle bottom-centre. Fractions of the play area width (x) / height (y).
const PAD = { punch: { x0: 0.155, x1: 0.32, y0: 0.50, y1: 0.80 }, kick: { x0: 0.0, x1: 0.15, y0: 0.62, y1: 0.97 }, block: { x: 0.5, y: 0.83, r: 0.15 } };
// hit-test: block circle first, then outer strip = kick (below the kick top), everything else = punch on that side
function padAt(x, y, w, h) {
  const B = PAD.block, br = Math.max(B.r * w, 44);
  if (Math.hypot(x - B.x * w, y - B.y * h) <= br) return 'block';
  const ex = Math.min(x, w - x) / w;
  if (ex < PAD.kick.x1 && y >= PAD.kick.y0 * h - 10) return 'kick';
  return 'punch';
}
function padRects(w, h) {
  const out = [];
  for (const pad of ['punch', 'kick']) for (const side of [0, 1]) {
    const P = PAD[pad], a = side ? w * (1 - P.x1) : w * P.x0, b = side ? w * (1 - P.x0) : w * P.x1;
    out.push({ pad, side, x0: a + 3, x1: b - 3, y0: P.y0 * h, y1: P.y1 * h });
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
  if (G.mode === 'title' || G.mode === 'end') return;
  ac();
  const r = appRect(), x = e.clientX - r.left, y = e.clientY - r.top, now = performance.now();
  const side = x < r.width / 2 ? 0 : 1, pad = padAt(x, y, r.width, r.height);
  const st = { id: e.pointerId, side, pad, x0: x, y0: y, t0: now, pts: [{ x, y, t: now }] };
  st.trail = { pts: st.pts, side, kind: pad === 'kick' ? 'rail' : pad === 'block' ? 'guard' : 'arm', dead: 0 }; trails.push(st.trail);
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
function firePlayer(k, side, spd, why, mod) {
  if (k === 'super' && (F[0].superUsed || F[0].meter < T.superCost)) return;
  const p = F[0].inp; p.atkF = G.frames; p.atk = k; p.spd = Math.min(spd, T.speedMax); p.mod = mod || { t: 0.5, c: 0, L: 0.35, cv: 0 }; p.hand = k === 'super' ? 1 : side;
  lastFire = { k, side, t: performance.now() };
  dbg(k + ' ' + (side ? 'R' : 'L') + ' x' + (+spd).toFixed(2) + (why ? ' (' + why + ')' : '') + (canAct(F[0]) ? '' : ' [busy: ' + F[0].state + ']'));
}
let lastFire = null;
// Real touch events for fingers (non-passive, preventDefault every phase); pointer events for the mouse only.
const tw = (fn) => (e) => { if (G.mode === 'title' || G.mode === 'end') return; e.preventDefault(); for (const t of e.changedTouches) fn({ pointerId: 't' + t.identifier, clientX: t.clientX, clientY: t.clientY }); };
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
    const bothStill = ma < STILL_PX && mb < STILL_PX, sameDir = ma > STILL_PX && mb > STILL_PX && (da[0] * db[0] + da[1] * db[1]) > 0;
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

// ---------------- flow ----------------
function showBanner(t, frames) { G.banner = t; G.bannerT = frames; const b = $('banner'); b.textContent = t; b.classList.add('show'); }
function startMatch() {
  F.forEach(f => { f.wins = 0; f.meter = 0; f.superUsed = false; });
  G.round = 1; startRound();
  $('title').classList.add('hide'); $('end').classList.add('hide'); $('hud').classList.remove('hide');
}
function startRound() {
  resetPositions(); G.timer = AUTO ? 30 : T.roundTime; G.tf = 0; G.mode = 'intro'; G.phaseT = 0; G.winner = null;
  showBanner('ROUND ' + G.round, 80); sfx('bell');
}
function endRound(winner, why) {
  if (G.mode !== 'fight') return;
  G.mode = 'roundEnd'; G.phaseT = 0; G.winner = winner;
  if (winner >= 0) F[winner].wins++;
  showBanner(why, 150); sfx('bell');
}
function afterRound() {
  if (F[0].wins >= 2 || F[1].wins >= 2 || G.round >= 3) {
    G.mode = 'end'; G.matchesDone++;
    const youWin = F[0].wins > F[1].wins;
    $('endTxt').textContent = youWin ? 'YOU WIN' : (F[0].wins === F[1].wins ? 'DRAW' : 'GAVIN WINS');
    $('endSub').textContent = `Rounds ${F[0].wins} to ${F[1].wins}`;
    $('end').classList.remove('hide'); $('banner').classList.remove('show');
    if (AUTO) setTimeout(() => { if (G.mode === 'end') startMatch(); }, 4000);
  } else { G.round++; startRound(); }
}
document.querySelectorAll('.diff button').forEach(b => b.onclick = () => { document.querySelectorAll('.diff button').forEach(x => x.classList.remove('on')); b.classList.add('on'); G.diff = b.dataset.d; });
$('go').onclick = () => { ac(); startMatch(); };
$('again').onclick = () => { startMatch(); };

function tick() { // one 60Hz logic frame
  G.frames++;
  if (G.bannerT > 0 && --G.bannerT === 0) $('banner').classList.remove('show');
  if (G.mode === 'intro') { G.phaseT++; if (G.phaseT === 90) showBanner('FIGHT', 40); if (G.phaseT > 100) G.mode = 'fight'; return; }
  if (G.mode === 'roundEnd') {
    G.phaseT++; for (const f of F) if (f.state === 'ko' || f.state === 'down') f.st++;
    if (G.phaseT > 210) afterRound(); return;
  }
  if (G.mode !== 'fight') return;
  if (G.hitstop > 0) { G.hitstop--; return; }
  if (AUTO) think(F[0], F[1], 10); else readPlayer();
  if (!qs.has('dummy')) think(F[1], F[0], DIFF[G.diff]); else { F[1].inp.atk = null; F[1].inp.block = qs.get('dummy') === 'block'; F[1].inp.mx = F[1].inp.mz = 0; }
  stepFighter(F[0], F[1]); stepFighter(F[1], F[0]); separate();
  if (++G.tf >= 60) { G.tf = 0; G.timer--; if (G.timer <= 0) { G.timer = 0; const a = F[0].hp, b = F[1].hp; endRound(a === b ? -1 : a > b ? 0 : 1, 'TIME'); } }
}

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
    case 'down': case 'ko': return st < 100 || f.state === 'ko' ? P.down : mixPose(P.down, P.kneel, ease((st - 100) / 40), tmpPose);
    case 'getup': return mixPose(P.kneel, P.guard, ease(st / 40), tmpPose);
    case 'dodge': return f.dodgeDir < 0 ? P.slipR : P.slipL;
  }
  if (G.mode === 'roundEnd' && G.winner === 1) return P.win;
  return P.guard;
}
let animClock = 0;
function updateVisuals(dt) {
  animClock += dt;
  const me = F[0], op = F[1];
  const [px, pz] = fighterVisualPos(me, op), [ox, oz] = fighterVisualPos(op, me);
  // opponent
  const tp = oppTargetPose(op);
  const k = op.state === 'atk' ? 0.55 : op.state === 'hit' ? 0.45 : 0.18;
  mixPose(curPose, tp, k, curPose);
  const bob = (op.state === 'idle' || op.state === 'block') ? Math.sin(animClock * 5) * 0.012 : 0;
  applyPose(OJ, curPose); OJ.hips.position.y += bob;
  OJ.root.position.set(ox, FLOOR, oz);
  OJ.root.rotation.set(curPose.rx * D2R, Math.atan2(px - ox, pz - oz), 0, 'YXZ');
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
    if (v) { placeSeg(leg.thigh, v[0], v[1]); placeSeg(leg.shin, v[1], v[2]); leg.knee.position.copy(v[1]); leg.foot.position.copy(v[2]); }
  }
  legMat.opacity = kickSide >= 0 ? 0.8 : 0.55;
  setFist(L, lp[0], lp[1], lp[2]); setFist(R, rp[0], rp[1], rp[2]);
  const s0 = sway(0), s1 = sway(2); if (me.state !== 'atk') { L.position.x += s0[0]; L.position.y += s0[1]; R.position.x += s1[0]; R.position.y += s1[1]; }
  if (down) { L.position.y -= camDrop * 0.4; R.position.y -= camDrop * 0.4; }
  // ghost arms from shoulders to wrists
  [L, R].forEach((h, i) => {
    const sh = new THREE.Vector3((i ? 1 : -1) * 0.25, 1.44 + FLOOR, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(new THREE.Vector3(px, 0, pz));
    const w = new THREE.Vector3(0, 0, 0.17).applyMatrix4(h.matrixWorld);
    h.updateMatrixWorld(); const wr = new THREE.Vector3(0, 0, 0.14); h.localToWorld(wr);
    const arm = ghostArms[i], mid = sh.clone().add(wr).multiplyScalar(0.5), len = sh.distanceTo(wr);
    arm.position.copy(mid); arm.scale.set(1, len, 1); arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), wr.clone().sub(sh).normalize());
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
function updateHUD() {
  for (let i = 0; i < 2; i++) {
    $('hp' + i).style.width = (F[i].hp / T.hp * 100) + '%'; $('bal' + i).style.width = (Math.max(0, F[i].bal) / T.balMax * 100) + '%';
    $('pip' + i).innerHTML = '<b></b>'.repeat(F[i].wins);
  }
  $('timer').textContent = G.timer; $('rnd').textContent = 'ROUND ' + G.round;
  $('sup0').style.width = (F[0].superUsed ? 0 : F[0].meter) + '%';
  $('sup0').parentNode.parentNode.classList.toggle('ready', F[0].meter >= 100 && !F[0].superUsed);
}

// ---------------- loop + adaptive quality ----------------
let last = performance.now(), acc = 0, fpsAcc = 0, fpsN = 0, slowStreak = 0, qLevel = useBloom ? 2 : 1;
function setQuality(q) {
  qLevel = q;
  if (q < 2) useBloom = false;
  if (q < 1) { PR = 1; renderer.setPixelRatio(1); renderer.shadowMap.enabled = false; sun.castShadow = false; scene.traverse(o => { if (o.material) o.material.needsUpdate = true; }); }
  resize();
}
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.1, (now - last) / 1000); last = now;
  fpsAcc += dt; fpsN++;
  if (fpsAcc >= 1) { G.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0;
    if (G.mode !== 'title') { if (G.fps < 42) slowStreak++; else slowStreak = 0; if (slowStreak >= 2 && qLevel > 0) { setQuality(qLevel - 1); slowStreak = 0; } } }
  const speed = AUTO ? 3 : 1;
  acc += dt * speed; let n = 0;
  while (acc >= 1 / 60 && n < 12) { tick(); acc -= 1 / 60; n++; }
  if (G.mode === 'title') { const a = 0.37 + Math.sin(now / 5000) * 0.6; F[0].x = Math.sin(a) * 2.6; F[0].z = Math.cos(a) * 2.6; F[1].x = 0; F[1].z = 0; } else if (0) { F[0].x = Math.sin(now / 4000) * 2.4; F[0].z = Math.cos(now / 4000) * 2.4; F[1].x = 0; F[1].z = 0; }
  updateVisuals(dt); drawTrails();
  if (G.mode !== 'title') updateHUD();
  if (useBloom && composer) composer.render(dt); else renderer.render(scene, camera);
}
resize();
applyPose(OJ, curPose);
if (AUTO) { startMatch(); }
requestAnimationFrame(frame);
