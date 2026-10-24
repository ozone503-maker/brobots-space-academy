// fight3d/fighters.js: mesh builders. Toon ramp + inverted-hull ink outline, Gavin's articulated body (OJ),
// player ghost body, kick legs (skin shin/foot), first-person fists and forearms.
import * as THREE from 'three';
import { rnd } from './util.js?v=079d986';
import { camera, palm, scene, uTime } from './stage.js?v=079d986';

// ---------------- opponent: articulated humanoid (photoreal-comic: toon ramp + inverted-hull ink outlines) ----------------
const toonRamp = (() => { const d = new Uint8Array([70, 140, 205, 255]); const t = new THREE.DataTexture(d, 4, 1, THREE.RedFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; })();
const toon = (color, extra) => new THREE.MeshToonMaterial(Object.assign({ color, gradientMap: toonRamp }, extra || {}));
const inkMat = new THREE.MeshBasicMaterial({ color: 0x0a0605, side: THREE.BackSide });
function inkOutline(root, w) { // inverted hull: back-face black shell pushed out along normals
  const list = []; root.traverse(o => { if (o.isMesh && !o.userData.noInk && !o.userData.ink) list.push(o); });
  for (const o of list) { const h = new THREE.Mesh(o.geometry, inkMat); h.userData.ink = true; h.castShadow = false;
    const sc = o.geometry.boundingSphere || (o.geometry.computeBoundingSphere(), o.geometry.boundingSphere); const k = 1 + w / Math.max(0.02, sc.radius); h.scale.setScalar(k); o.add(h); }
}
const camoTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); x.fillStyle = '#4f5a32'; x.fillRect(0, 0, 128, 128);
  for (const col of ['#3a4424', '#6b7046', '#2c3320']) { x.fillStyle = col; for (let i = 0; i < 14; i++) { x.beginPath(); x.ellipse(rnd() * 128, rnd() * 128, 6 + rnd() * 14, 4 + rnd() * 8, rnd() * 3, 0, 7); x.fill(); } }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const skinOpp = toon(0x8a5a3c);
const skinShade = toon(0x6e452c); // muscle grooves / creases
const lipMat = toon(0x5a2e22);
const wrapMat = toon(0xb8b2a6);
const trunksMat = toon(0xffffff, { map: camoTex }); // Gavin's green fatigues, as shorts
const gloveMat = new THREE.MeshPhysicalMaterial({ color: 0xffc400, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.15 });
const shoeMat = toon(0x1a1a20);
const hairMat = toon(0x120c0a);
const eyeMat = toon(0xf4f1ea);
const irisMat = toon(0x3a2416);
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
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.118, 20, 12, 0, Math.PI * 2, 0, 1.3), hairMat); hair.position.set(0, 0.125, -0.006); hair.scale.set(0.96, 1.0, 1.0); hair.userData.noInk = true; J.head.add(hair);
  const browRidge = cap(0.022, 0.1, skinOpp); browRidge.rotation.z = Math.PI / 2; browRidge.position.set(0, 0.142, 0.09); J.head.add(browRidge);
  const nose = cap(0.017, 0.04, skinOpp); nose.position.set(0, 0.098, 0.116); nose.rotation.x = 0.35; J.head.add(nose);
  const noseTip = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 10), skinOpp); noseTip.scale.set(1.35, 0.85, 0.9); noseTip.position.set(0, 0.075, 0.122); J.head.add(noseTip);
  const lipU = cap(0.011, 0.04, lipMat); lipU.rotation.z = Math.PI / 2; lipU.position.set(0, 0.043, 0.108); J.head.add(lipU);
  const lipL = cap(0.012, 0.034, lipMat); lipL.rotation.z = Math.PI / 2; lipL.position.set(0, 0.03, 0.105); J.head.add(lipL);
  const chin = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), skinOpp); chin.scale.set(1.2, 0.8, 0.8); chin.position.set(0, 0.0, 0.085); J.head.add(chin);
  const beard = new THREE.Mesh(new THREE.SphereGeometry(0.105, 18, 10, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.3), hairMat); beard.position.set(0, 0.085, 0.005); beard.scale.set(0.95, 1.1, 1.05); beard.userData.noInk = true; J.head.add(beard);
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.016, 12, 10), eyeMat); e.scale.set(1.3, 0.7, 0.8); e.position.set(s * 0.04, 0.118, 0.1); e.userData.noInk = true; J.head.add(e);
    const ir = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 10, 8), irisMat); ir.position.set(s * 0.039, 0.118, 0.112); ir.userData.noInk = true; J.head.add(ir);
    const pu = new THREE.Mesh(new THREE.SphereGeometry(0.004, 8, 6), hairMat); pu.position.set(s * 0.039, 0.118, 0.12); pu.userData.noInk = true; J.head.add(pu);
    const lid = cap(0.009, 0.026, skinShade); lid.rotation.z = Math.PI / 2 + s * 0.12; lid.position.set(s * 0.04, 0.128, 0.104); J.head.add(lid);
    const br = cap(0.008, 0.038, hairMat); br.rotation.z = Math.PI / 2 - s * 0.2; br.position.set(s * 0.042, 0.148, 0.106); J.head.add(br);
    const nos = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), skinOpp); nos.position.set(s * 0.017, 0.072, 0.112); J.head.add(nos);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), skinOpp); ear.scale.set(0.45, 1, 0.75); ear.position.set(s * 0.106, 0.1, -0.005); J.head.add(ear);
    const earIn = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), skinShade); earIn.scale.set(0.4, 1, 0.7); earIn.position.set(s * 0.116, 0.1, 0); earIn.userData.noInk = true; J.head.add(earIn);
    const pec = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), skinOpp); pec.scale.set(1.05, 0.7, 0.45); pec.position.set(s * 0.085, 0.07, 0.1); J.chest.add(pec);
    for (let r = 0; r < 3; r++) { const ab = new THREE.Mesh(new THREE.SphereGeometry(0.036, 12, 10), skinOpp); ab.scale.set(1, 0.75, 0.3); ab.userData.noInk = true; ab.position.set(s * 0.05, 0.22 - r * 0.075, 0.105); J.spine.add(ab); }
  }
  for (const [side, s] of [['L', 1], ['R', -1]]) {
    const sh = joint(J.chest, s * 0.24, 0.17, 0); J['s' + side] = sh;
    const delt = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 12), skinOpp); delt.castShadow = true; sh.add(delt);
    const ua = cap(0.065, 0.2, skinOpp); ua.position.y = -0.15; sh.add(ua);
    const el = joint(sh, 0, -0.3, 0); J['e' + side] = el;
    const fa = cap(0.055, 0.18, skinOpp); fa.position.y = -0.13; el.add(fa);
    const gl = new THREE.Group(); gl.position.y = -0.3; el.add(gl); // bare fist with hand wraps
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.075, 2, 2, 2), wrapMat); gl.add(palm);
    for (let i = 0; i < 4; i++) { const kn = cap(0.017, 0.035, skinOpp); kn.rotation.x = Math.PI / 2; kn.position.set((i - 1.5) * 0.024, -0.055, 0.012); gl.add(kn); }
    const thb = cap(0.016, 0.04, skinOpp); thb.rotation.z = Math.PI / 2; thb.position.set(-s * 0.03, -0.03, 0.045); gl.add(thb);
    for (let i = 0; i < 3; i++) { const band = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.055, 0.03, 14), wrapMat); band.position.y = 0.065 + i * 0.03; gl.add(band); }
    J['g' + side] = gl;
    const th = joint(J.hips, s * 0.11, -0.05, 0); J['t' + side] = th;
    const leg = cap(0.095, 0.3, skinOpp); leg.position.y = -0.22; th.add(leg);
    const tr = cap(0.11, 0.08, trunksMat); tr.position.y = -0.08; th.add(tr);
    const kn = joint(th, 0, -0.45, 0); J['k' + side] = kn;
    const shin = cap(0.07, 0.3, skinOpp); shin.position.y = -0.22; kn.add(shin);
    const shoe = cap(0.06, 0.14, shoeMat); shoe.rotation.x = Math.PI / 2; shoe.position.set(0, -0.47, 0.05); kn.add(shoe);
  }
  inkOutline(root, 0.006);
  return J;
}
const OJ = buildOpponent();
const JOINTS = ['hips', 'spine', 'chest', 'neck', 'head', 'sL', 'eL', 'sR', 'eR', 'tL', 'kL', 'tR', 'kR'];

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
const legSkin = new THREE.MeshPhysicalMaterial({ color: 0x9a6a4c, roughness: 0.7, sheen: 0.25, sheenColor: new THREE.Color(0xc0705a) });
const ghostLegs = [0, 1].map(() => { // ghost leg: thigh + shin + foot, camera space (feet stay ghost, just brighter)
  const g = new THREE.Group(); g.visible = false; camera.add(g);
  const seg = (r0, r1) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, 1, 14, 1), legMat); const c = new THREE.Mesh(new THREE.CylinderGeometry(r0 * 0.45, r1 * 0.45, 1, 8, 1), legCore); g.add(m); return m; };
  const thigh = seg(0.11, 0.135);
  const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.085, 1, 16, 1), legSkin); g.add(shin);
  const calf = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), legSkin); calf.scale.set(0.95, 2.2, 1.0); calf.position.set(0, 0.12, 0.02); shin.add(calf);
  const foot = new THREE.Group(); g.add(foot); // foot: heel + sole + toes, pointing along -z in camera space
  const sole = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.12, 6, 12), legSkin); sole.rotation.x = Math.PI / 2; sole.scale.set(1.1, 1, 0.7); sole.position.set(0, -0.02, -0.06); foot.add(sole);
  for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), legSkin); t.position.set((i - 1.5) * 0.026, -0.025, -0.16 + Math.abs(i - 1.5) * 0.01); foot.add(t); }
  const knee = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 10), legSkin); g.add(knee);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), legMat); glow.scale.set(1, 0.7, 1.4); glow.visible = false; foot.add(glow); // small ghost aura = tracer
  return { g, thigh, shin, foot, knee };
});
const _fd = new THREE.Vector3(), _fz = new THREE.Vector3(0, 0, -1);
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
const ghostArms = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 1, 10, 1, true), ghostMat); scene.add(m); return m; });
const skinMat = new THREE.MeshPhysicalMaterial({ color: 0xd99a6c, roughness: 0.5, sheen: 0.7, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xff7a5a), clearcoat: 0.15, clearcoatRoughness: 0.7 });
const knuckleMat = new THREE.MeshPhysicalMaterial({ color: 0xe8a77a, roughness: 0.42, sheen: 0.6, sheenColor: new THREE.Color(0xff8060) });
const creaseMat = new THREE.MeshBasicMaterial({ color: 0x8a4a30 });
const nailMat = new THREE.MeshPhysicalMaterial({ color: 0xf6d2c0, roughness: 0.25, clearcoat: 0.6 });
const handSkin = toon(0xc98a62), handShade = toon(0xa86c4a), handKnuck = toon(0xd99a72), handWrap = toon(0xb8b2a6), handNail = toon(0xe8c8b0);
function buildFist(s) { // s=-1 left, 1 right; fist faces -z (camera forward), back of hand +y; thumb on the INNER side
  const g = new THREE.Group(), tIn = -s;
  // back of hand: slightly flattened rounded block, wider at the knuckles
  const back = new THREE.Mesh(new THREE.CapsuleGeometry(0.038, 0.05, 6, 16), handSkin); back.rotation.z = Math.PI / 2; back.scale.set(0.62, 1.0, 1.2); back.position.set(0, 0.004, -0.005); g.add(back);
  for (let i = 0; i < 4; i++) {
    const x = (i - 1.5) * 0.024 * -s, drop = Math.abs(i - 1.5) * 0.004, r = i === 3 ? 0.011 : 0.0125; // index..pinky (pinky smaller)
    const kn = new THREE.Mesh(new THREE.SphereGeometry(0.014, 14, 10), handKnuck); kn.scale.set(1, 0.85, 1); kn.position.set(x, 0.016 - drop, -0.05 + drop); g.add(kn);
    const p1 = new THREE.Mesh(new THREE.CapsuleGeometry(r, 0.022, 4, 10), handSkin); p1.position.set(x, -0.006 - drop, -0.064 + drop); g.add(p1); // proximal, pointing down
    const p2 = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.92, 0.016, 4, 10), handShade); p2.rotation.x = Math.PI / 2; p2.position.set(x, -0.034 - drop, -0.052 + drop); g.add(p2); // middle, curling back
    const nl = new THREE.Mesh(new THREE.SphereGeometry(r * 0.7, 8, 6), handNail); nl.scale.set(1, 0.5, 1); nl.position.set(x, -0.042 - drop, -0.036 + drop); nl.userData.noInk = true; g.add(nl);
  }
  // wrapped thumb: thenar pad on the inner side, proximal segment forward, distal lying across index+middle middle-phalanges
  const thenar = new THREE.Mesh(new THREE.SphereGeometry(0.026, 14, 10), handSkin); thenar.scale.set(0.9, 1, 1.5); thenar.position.set(tIn * 0.045, -0.014, 0.005); g.add(thenar);
  const th1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.03, 4, 10), handSkin); th1.rotation.set(Math.PI / 2, 0, tIn * 0.5); th1.position.set(tIn * 0.042, -0.028, -0.03); g.add(th1);
  const th2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.026, 4, 10), handKnuck); th2.rotation.z = Math.PI / 2; th2.position.set(tIn * 0.012, -0.043, -0.05); g.add(th2);
  const tn = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), handNail); tn.scale.set(1, 0.5, 1.2); tn.position.set(-tIn * 0.004, -0.05, -0.058); tn.userData.noInk = true; g.add(tn);
  // tapered wrist with hand wraps
  const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.036, 0.07, 16), handWrap); wrist.rotation.x = Math.PI / 2; wrist.scale.set(1.15, 1, 0.85); wrist.position.set(0, -0.004, 0.06); g.add(wrist);
  inkOutline(g, 0.0025);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.scale.setScalar(0.95);
  camera.add(g); return g;
}
// forearms: camera-space tapered limbs from each wrist down/out to off-screen anchors at the bottom corners
const foreArms = [-1, 1].map(s => { const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.042, 1, 16), handSkin); m.position.y = 0.5; g.add(m);
  const bulge = new THREE.Mesh(new THREE.SphereGeometry(0.044, 16, 12), handSkin); bulge.scale.set(1.05, 3.2, 0.95); bulge.position.y = 0.72; g.add(bulge);
  const wr = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.038, 0.09, 16), handWrap); wr.position.y = 0.05; g.add(wr);
  inkOutline(g, 0.003); camera.add(g); return g; });
const _wr = new THREE.Vector3(), _an = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
function placeForearm(i, h) {
  const fa = foreArms[i], s = i ? 1 : -1; _wr.set(0, 0, 0.085).applyMatrix4(h.matrix); // h is a direct child of camera
  _an.set(s * 0.36, -0.7, -0.3); const len = _wr.distanceTo(_an);
  fa.position.copy(_wr); fa.scale.set(1, len, 1); const ch = fa.children; ch[1].scale.y = 3 / len; ch[2].scale.y = 0.67 / len; ch[2].children.forEach(o => o.scale.y = o.scale.x);
  fa.quaternion.setFromUnitVectors(_up, _an.clone().sub(_wr).normalize());
}
const fists = [buildFist(-1), buildFist(1)];
const handLight = new THREE.PointLight(0xffd0a0, 1.2, 2.5, 2); camera.add(handLight); handLight.position.set(0, 0.2, 0.1);

export { JOINTS, LEGP, LK, OJ, _fd, _fz, _v, fists, ghost, ghostArms, ghostLegs, legMat, placeForearm, placeSeg };
