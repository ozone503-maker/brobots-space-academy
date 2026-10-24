// fight3d/stage.js: renderer, camera, bloom composer, lights, sky/ocean/volcano, ring, palms, audio (sfx),
// and render-quality flags (setUseBloom/setPR).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { $, AUTO, qs, rnd } from './util.js?v=894c647';

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
function setUseBloom(v) { useBloom = v; } function setPR(v) { PR = v; }
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

export { FLOOR, ac, camera, composer, flames, ocean, palm, palms, particles, renderer, resize, ringSpot, scene, setPR, setUseBloom, sfx, softTex, sun, torchLight, uTime, updateVolcano, useBloom };
