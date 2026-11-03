// fighter-art/rig/rig.js: shared 2D cut-out rig runtime (ES module, no deps).
// Same math as viewer.html: load skeleton + animations + a skin, sample tracks, blend poses, draw parts on a 2D canvas.
// Used by the game (fight3d/rig2d.js). L/R = screen side.
const mul = (m, n) => [m[0]*n[0]+m[2]*n[1], m[1]*n[0]+m[3]*n[1], m[0]*n[2]+m[2]*n[3], m[1]*n[2]+m[3]*n[3], m[0]*n[4]+m[2]*n[5]+m[4], m[1]*n[4]+m[3]*n[5]+m[5]];
const T = (x, y) => [1,0,0,1,x,y], R = a => { const c = Math.cos(a), s = Math.sin(a); return [c,s,-s,c,0,0]; }, S = (x, y) => [x,0,0,y,0,0];
const ap = (m, x, y) => [m[0]*x+m[2]*y+m[4], m[1]*x+m[3]*y+m[5]];
const D2R = Math.PI / 180, ease = u => u * u * (3 - 2 * u);
const DEF = {rot: 0, x: 0, y: 0, sx: 1, sy: 1, flash: 0, z: 0, follow: 0, fk: 0, alpha: 1};

function mirrorAnim(src) {
  const sw = n => n.endsWith('_L') ? n.slice(0, -2) + '_R' : n.endsWith('_R') ? n.slice(0, -2) + '_L' : n;
  const tr = {};
  for (const [b, keys] of Object.entries(src.tracks)) tr[sw(b)] = keys.map(k => ({...k, rot: -(k.rot || 0), x: -(k.x || 0)}));
  return {...src, tracks: tr};
}
function prepAnims(A) {
  const out = {};
  for (const [n, a] of Object.entries(A)) if (n !== 'about' && !a.mirrorOf) out[n] = a;
  for (const [n, a] of Object.entries(A)) if (a && a.mirrorOf) out[n] = {...mirrorAnim(out[a.mirrorOf]), duration: a.duration, loop: a.loop};
  return out;
}
function sample(keys, t) {
  const o = {...DEF};
  if (!keys || !keys.length) return o;
  let i = 0; while (i < keys.length - 1 && keys[i + 1].t <= t) i++;
  const a = keys[i], b = keys[Math.min(i + 1, keys.length - 1)];
  const u = b.t > a.t ? ease(Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)))) : 0;
  for (const k in DEF) { const va = a[k] ?? DEF[k], vb = b[k] ?? DEF[k]; o[k] = va + (vb - va) * u; }
  return o;
}
const loadImg = s => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = s; });

export async function loadRig(base, fighter = 'gavin') {
  const j = u => fetch(base + u).then(r => r.json());
  const [SK, A, SKIN] = await Promise.all([j('skeleton.json'), j('animations.json'), j(fighter + '/skin.json')]);
  const rig = { SK, ANIMS: prepAnims(A), SKIN, IMGS: {} };
  await Promise.all(Object.entries(SKIN.parts).map(async ([n, p]) => { rig.IMGS[n] = await loadImg(base + fighter + '/' + p.image); }));
  for (const ik of SK.ik) { // which way each knee bends
    const P = SKIN.pivots, [ub, lb] = ik.chain, h = P[ub], k = P[lb], f = SKIN.ikTargets[ik.target];
    const L1 = Math.hypot(k[0] - h[0], k[1] - h[1]), L2 = Math.hypot(f[0] - k[0], f[1] - k[1]), d = Math.hypot(f[0] - h[0], f[1] - h[1]);
    const base0 = Math.atan2(f[1] - h[1], f[0] - h[0]), a = Math.acos(Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)));
    const err = s => Math.hypot(h[0] + L1 * Math.cos(base0 + s * a) - k[0], h[1] + L1 * Math.sin(base0 + s * a) - k[1]);
    ik._side = err(1) < err(-1) ? 1 : -1;
  }
  return rig;
}

// channel samples of one anim at time t (bones, foot targets, overlay parts)
export function channels(rig, name, t) {
  const A = rig.ANIMS[name], tt = A.loop ? t % A.duration : Math.min(t, A.duration), ch = {}, own = {};
  for (const n of new Set([...rig.SK.bones.map(b => b.name), ...rig.SK.ik.map(k => k.target), ...Object.keys(rig.SKIN.parts)])) {
    ch[n] = sample(A.tracks[n], tt); own[n] = !!A.tracks[n]; ch[n]._z = !!(A.tracks[n] && A.tracks[n].some(k => 'z' in k));
    if (!own[n] && rig.SKIN.parts[n] && rig.SKIN.parts[n].bone) ch[n].alpha = 0;  // overlays stay hidden unless a track shows them
  }
  ch._own = own; return ch;
}
// blend list of [ch, weight] (weights sum to 1)
export function blend(list) {
  if (list.length === 1) return list[0][0];
  const out = { _own: {} };
  for (const n of Object.keys(list[0][0])) {
    if (n === '_own') continue;
    const o = {}; for (const k in DEF) o[k] = 0;
    for (const [c, w] of list) for (const k in DEF) o[k] += c[n][k] * w;
    const top = list.reduce((a, b) => b[1] > a[1] ? b : a)[0][n]; o.z = top.z; o.fk = top.fk;  // layer + FK flag never blend
    o._z = list.some(([c]) => c[n]._z); out[n] = o; out._own[n] = list.some(([c]) => c._own[n]);
  }
  return out;
}
export function solve(rig, ch) {
  const { SK, SKIN } = rig, P = SKIN.pivots, W = {};
  for (const b of SK.bones) {
    const p = P[b.name], c = ch[b.name], pp = b.parent ? P[b.parent] : [0, 0], parent = b.parent ? W[b.parent] : [1,0,0,1,0,0];
    W[b.name] = mul(mul(mul(parent, T(p[0] - pp[0] + c.x, p[1] - pp[1] + c.y)), R(c.rot * D2R)), S(c.sx, c.sy));
  }
  const parentOf = n => SK.bones.find(b => b.name === n).parent;
  for (const ik of SK.ik) {
    const [ub, lb] = ik.chain, tgt = SKIN.ikTargets[ik.target], hip = P[ub], knee = P[lb], cu = ch[ub], cl = ch[lb];
    const par = W[parentOf(ub)], pv = P[parentOf(ub)], Hw = ap(par, hip[0] - pv[0], hip[1] - pv[1]);
    const L1 = Math.hypot(knee[0] - hip[0], knee[1] - hip[1]) * cu.sy, L2 = Math.hypot(tgt[0] - knee[0], tgt[1] - knee[1]) * cl.sy;
    const tk = ch[ik.target], tg = [tgt[0] + tk.x, tgt[1] + tk.y];
    if (tk.fk > 0.5) {
      const Kw = ap(W[ub], knee[0] - hip[0], knee[1] - hip[1]), tha = Math.atan2(W[ub][1], W[ub][0]);
      W[lb] = mul(mul(T(Kw[0], Kw[1]), R(tha + cl.rot * D2R)), S(cl.sx, cl.sy));
      const Fa = ap(W[lb], tgt[0] - knee[0], tgt[1] - knee[1]);
      if (ik.end) { const ce = ch[ik.end]; W[ik.end] = mul(mul(T(Fa[0] + ce.x, Fa[1] + ce.y), R(ce.rot * D2R)), S(ce.sx, ce.sy)); }
      continue;
    }
    let dx = tg[0] - Hw[0], dy = tg[1] - Hw[1], d = Math.hypot(dx, dy);
    d = Math.min(Math.max(d, Math.abs(L1 - L2) + 1e-3), L1 + L2 - 1e-3);
    const base = Math.atan2(dy, dx), a = Math.acos((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d));
    const ka = base + ik._side * a, K = [Hw[0] + L1 * Math.cos(ka), Hw[1] + L1 * Math.sin(ka)];
    const r1 = ka - Math.atan2(knee[1] - hip[1], knee[0] - hip[0]);
    const Fw = [Hw[0] + Math.cos(base) * d, Hw[1] + Math.sin(base) * d];
    const r2 = Math.atan2(Fw[1] - K[1], Fw[0] - K[0]) - Math.atan2(tgt[1] - knee[1], tgt[0] - knee[0]);
    W[ub] = mul(mul(T(Hw[0], Hw[1]), R(r1)), S(cu.sx, cu.sy));
    W[lb] = mul(mul(T(K[0], K[1]), R(r2)), S(cl.sx, cl.sy));
    if (ik.end) { const ce = ch[ik.end]; W[ik.end] = mul(mul(T(Fw[0] + ce.x, Fw[1] + ce.y), R(ce.rot * D2R + ce.follow * r2)), S(ce.sx, ce.sy)); }
  }
  return W;
}
// draw a pose. G = art px -> canvas px affine. opts.flashMul scales the white hit flash.
export function draw(rig, c, ch, G, opts = {}) {
  const { SK, SKIN, IMGS } = rig, W = solve(rig, ch);
  const PELV = SK.drawOrder.indexOf('pelvis'), key = (i, z) => z >= 10 ? 100 + z : z > 0.05 ? PELV - 1 + z / 10 : i;
  const items = [];
  for (const [n, part] of Object.entries(SKIN.parts)) {
    const bone = part.bone || n, bi = SK.drawOrder.indexOf(bone) + (part.bone ? 0.5 : 0), own = ch._own[n];
    const z = own && ch[n]._z ? ch[n].z : ch[bone].z;
    const alpha = ch[n].alpha;
    if (alpha > 0.003) items.push({ n, bone, part, alpha, k: key(bi, z) + (part.bone ? 0.01 : 0) });
  }
  items.sort((p, q) => p.k - q.k);
  c.save(); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  for (const it of items) {
    const img = IMGS[it.n]; if (!img) continue;
    const ps = it.part.scale || 1, o = it.part.bone && ch[it.n];
    const m = o ? mul(mul(mul(G, W[it.bone]), mul(T(o.x, o.y), S(o.sx, o.sy))), S(ps, ps)) : mul(mul(G, W[it.bone]), S(ps, ps));
    c.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]); c.globalAlpha = it.alpha;
    if (it.part.shadow) { c.shadowColor = `rgba(0,0,0,${0.5 * it.alpha})`; c.shadowBlur = 22 * G[0]; c.shadowOffsetX = 8 * G[0]; c.shadowOffsetY = 14 * G[0]; }
    c.drawImage(img, it.part.x / ps, it.part.y / ps);
    c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetX = 0; c.shadowOffsetY = 0;
  }
  c.globalAlpha = 1;
  const flash = ch.root.flash * (opts.flashMul ?? 1);
  if (flash > 0.01) { c.setTransform(1,0,0,1,0,0); c.globalCompositeOperation = 'source-atop'; c.fillStyle = `rgba(255,255,255,${flash})`; c.fillRect(0, 0, c.canvas.width, c.canvas.height); c.globalCompositeOperation = 'source-over'; }
  c.restore();
  return W;
}
export { mul, T, S, ap };
