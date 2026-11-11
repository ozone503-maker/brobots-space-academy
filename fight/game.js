// BROBOTS vs HUMANS vs ALIENS : fight prototype v1
// Authored keyframe animation + frame data. Physics only for hit reactions.
(function(){
'use strict';
// ================= TUNING KNOBS =================
const T = {
  walkF: 3.2, walkB: 2.6, jumpV: 15.5, jumpX: 3.6, grav: 0.75,
  hp: 1000, balMax: 100, balRegen: 0.4, balRegenDelay: 45,
  roundTime: 60, hitstopMul: 1, shakeMul: 1,
  speedMin: 0.8, speedMax: 1.4,      // damage scale from strike speed
  counterMul: 1.2, chip: 0.12,
  meterOnHit: 0.12, meterOnTaken: 0.08, meterOnBlock: 3,
  pushW: 44, wallL: 40, wallR: 500,
};
const DIFF = {
  easy:   {delay: 24, block: 0.25, punish: 0.2,  aa: 0.1,  aggr: 0.35},
  normal: {delay: 14, block: 0.5,  punish: 0.5,  aa: 0.35, aggr: 0.5},
  hard:   {delay: 8,  block: 0.78, punish: 0.85, aa: 0.65, aggr: 0.65},
};
// ================================================
const W = 540, H = 960, GY = 560, PANEL = 640, HIPH = 74;
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const qs = new URLSearchParams(location.search);
let DPR = 1, SCALE = 1;
function resize(){
  SCALE = Math.min(innerWidth / W, innerHeight / H);
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  cv.style.width = (W * SCALE) + 'px'; cv.style.height = (H * SCALE) + 'px';
  cv.width = Math.round(W * SCALE * DPR); cv.height = Math.round(H * SCALE * DPR);
}
addEventListener('resize', resize); resize();
const rnd = Math.random, clamp = (v,a,b)=>v<a?a:v>b?b:v, lerp=(a,b,t)=>a+(b-a)*t;
const ease = t => t<0?0:t>1?1:t*t*(3-2*t);
const D2R = Math.PI/180;

// ---------------- POSES ----------------
const KEYS = ['hx','hy','torso','head','ua1','la1','ua2','la2','th1','sh1','th2','sh2','rot'];
function P(o, base){ const p = {}; for (const k of KEYS) p[k] = (o[k] !== undefined) ? o[k] : (base ? base[k] : 0); return p; }
const IDLE = P({hy:3, torso:8, ua1:40, la1:95, ua2:22, la2:105, th1:16, sh1:-16, th2:-12, sh2:-4});
const CROUCH = P({hy:30, torso:18, ua1:55, la1:85, ua2:35, la2:95, th1:80, sh1:-110, th2:20, sh2:-100});
const JUMP = P({hy:-10, torso:4, ua1:70, la1:70, ua2:40, la2:90, th1:70, sh1:-110, th2:30, sh2:-100});
const BLOCK = P({hx:-4, torso:-6, ua1:125, la1:50, ua2:110, la2:60}, IDLE);
const CBLOCK = P({ua1:125, la1:50, ua2:110, la2:60, torso:8}, CROUCH);
const HIT = P({hx:-6, torso:-24, head:-20, ua1:25, la1:40, ua2:-25, la2:30}, IDLE);
const LIE = P({hy:62, torso:0, head:0, ua1:160, la1:10, ua2:150, la2:20, th1:4, sh1:-4, th2:-6, sh2:0, rot:-90});
const WIN = P({torso:-5, ua1:170, la1:10, ua2:160, la2:20}, IDLE);
const AIRHIT = P({torso:-30, head:-25, ua1:150, la1:20, ua2:120, la2:30, th1:30, sh1:-40, th2:-10, sh2:-50});

// ---------------- MOVES (frame data) ----------------
// s=startup a=active r=recovery, dmg, bal=balance damage, hs=hitstun, bs=blockstun, kb=knockback px/f, stop=hitstop frames
const MOVES = {
  LP:  {s:4, a:3, r:7,  dmg:40,  bal:6,  hs:13, bs:9,  kb:3, stop:6,  tip:'hand1', rad:13, light:1, base:'IDLE',
        wind:{ua1:55,la1:115,torso:5}, strike:{ua1:88,la1:2,torso:14,ua2:15,la2:110,hx:4}},
  HP:  {s:9, a:4, r:18, dmg:110, bal:24, hs:20, bs:15, kb:7, stop:11, tip:'hand1', rad:16, base:'IDLE',
        wind:{ua1:15,la1:140,torso:-14,hx:-8,ua2:60,la2:60}, strike:{ua1:92,la1:0,torso:30,hx:16,ua2:-10,la2:40,th1:35,sh1:-10,th2:-25,sh2:-10}},
  LK:  {s:5, a:3, r:10, dmg:50,  bal:9,  hs:14, bs:10, kb:4, stop:7,  tip:'foot1', rad:14, light:1, base:'IDLE',
        wind:{th1:65,sh1:-110,torso:-4}, strike:{th1:88,sh1:-8,torso:-14,hy:-2,th2:-8}},
  HK:  {s:11,a:4, r:22, dmg:130, bal:32, hs:22, bs:16, kb:9, stop:12, tip:'foot1', rad:17, base:'IDLE',
        wind:{th1:55,sh1:-125,torso:-12,hx:-6,ua1:80,la1:60}, strike:{th1:118,sh1:-4,torso:-34,hx:6,hy:-4,th2:-10,sh2:-4,ua1:-20,la1:30,ua2:130,la2:20}},
  cLP: {s:4, a:3, r:7,  dmg:32,  bal:5,  hs:12, bs:8,  kb:3, stop:6,  tip:'hand1', rad:13, light:1, base:'CROUCH',
        wind:{ua1:50,la1:110}, strike:{ua1:86,la1:0,torso:22}},
  cHP: {s:6, a:5, r:22, dmg:100, bal:22, hs:20, bs:14, kb:5, stop:11, tip:'hand1', rad:17, base:'CROUCH', aa:1,
        wind:{ua1:30,la1:130,hy:34}, strike:{ua1:165,la1:5,torso:10,hy:4,th1:40,sh1:-40,th2:10,sh2:-30}},
  cLK: {s:5, a:3, r:9,  dmg:36,  bal:8,  hs:13, bs:9,  kb:3, stop:6,  tip:'foot1', rad:14, light:1, low:1, base:'CROUCH',
        wind:{th1:70,sh1:-120}, strike:{th1:86,sh1:-2,hy:32,torso:12}},
  cHK: {s:10,a:4, r:26, dmg:95,  bal:20, hs:20, bs:14, kb:5, stop:11, tip:'foot1', rad:16, low:1, kd:1, base:'CROUCH',
        wind:{th1:60,sh1:-130,torso:10}, strike:{th1:92,sh1:0,hy:38,torso:-20,th2:30,sh2:-120,ua1:-40,ua2:-60}},
  jP:  {s:4, a:8, r:6,  dmg:60,  bal:12, hs:16, bs:11, kb:4, stop:8,  tip:'hand1', rad:15, over:1, base:'JUMP',
        wind:{ua1:120,la1:60}, strike:{ua1:58,la1:4,torso:20}},
  jK:  {s:6, a:10,r:6,  dmg:90,  bal:18, hs:18, bs:13, kb:5, stop:10, tip:'foot1', rad:16, over:1, base:'JUMP',
        wind:{th1:40,sh1:-130}, strike:{th1:72,sh1:-6,th2:-20,sh2:-80,torso:-10}},
  SUPER:{s:8, a:32, r:24, dmg:45, bal:10, hs:18, bs:10, kb:2, stop:6, tip:'hand1', rad:18, base:'IDLE', super:1,
        wind:{ua1:20,la1:140,ua2:20,la2:140,torso:-10,hx:-10}, strike:{ua1:90,la1:0,torso:22,hx:10,ua2:20,la2:110}},
};
const SUPER_B = P({ua2:90,la2:0,ua1:30,la1:110,torso:22,hx:10}, IDLE);
const BASES = {IDLE, CROUCH, JUMP};
for (const k in MOVES){ const m = MOVES[k]; m.name = k; const b = BASES[m.base]; m.W = P(m.wind, b); m.S = P(m.strike, b); }

function movePose(m, f){
  const b = BASES[m.base];
  if (f < m.s){ const t = (f+1)/m.s; return t < 0.65 ? mix(b, m.W, ease(t/0.65)) : mix(m.W, m.S, ease((t-0.65)/0.35)); }
  if (f < m.s + m.a){
    if (m.super){ const k = Math.floor((f - m.s) / 6) % 2; return k ? SUPER_B : m.S; }
    return m.S;
  }
  return mix(m.S, b, ease((f - m.s - m.a + 1) / m.r));
}
function mix(a, b, t){ const p = {}; for (const k of KEYS) p[k] = a[k] + (b[k]-a[k])*t; return p; }

// forward kinematics: returns world points
const L = {torso:52, head:20, ua:30, la:30, th:38, sh:38};
function fk(F, pose){
  const f = F.face, r = pose.rot*D2R, cr = Math.cos(r), sr = Math.sin(r);
  const hx = F.x + f*pose.hx, hy = F.y - HIPH + pose.hy;
  const out = {};
  const put = (n, lx, ly) => { const x = lx*cr - ly*sr, y = lx*sr + ly*cr; out[n] = [hx + f*x, hy + y]; };
  const t = pose.torso*D2R;
  const nx = L.torso*Math.sin(t), ny = -L.torso*Math.cos(t);
  const th = (pose.torso+pose.head)*D2R;
  const hdx = nx + L.head*Math.sin(th), hdy = ny - L.head*Math.cos(th);
  const sx = nx*0.88, sy = ny*0.88;
  const limb = (ox, oy, a1, a2, l1, l2, n1, n2) => {
    const A = a1*D2R, B = (a1+a2)*D2R;
    const ex = ox + l1*Math.sin(A), ey = oy + l1*Math.cos(A);
    put(n1, ex, ey); put(n2, ex + l2*Math.sin(B), ey + l2*Math.cos(B));
  };
  put('hip', 0, 0); put('neck', nx, ny); put('head', hdx, hdy); put('sh', sx, sy);
  limb(sx, sy, pose.ua1, pose.la1, L.ua, L.la, 'elbow1', 'hand1');
  limb(sx, sy, pose.ua2, pose.la2, L.ua, L.la, 'elbow2', 'hand2');
  limb(0, 0, pose.th1, pose.sh1, L.th, L.sh, 'knee1', 'foot1');
  limb(0, 0, pose.th2, pose.sh2, L.th, L.sh, 'knee2', 'foot2');
  out.headAng = th * f + r * f;
  return out;
}
// nominal tip speed + reach per move (stationary)
for (const k in MOVES){
  const m = MOVES[k]; const dummy = {x:0, y:GY, face:1};
  let prev = null, peak = 0, reach = 0;
  for (let f = 0; f < m.s + 2; f++){ const p = fk(dummy, movePose(m, f))[m.tip]; if (prev) peak = Math.max(peak, Math.hypot(p[0]-prev[0], p[1]-prev[1])); prev = p; reach = Math.max(reach, p[0]); }
  m.nom = Math.max(peak, 1); m.reach = reach + m.rad;
}

// ---------------- AUDIO ----------------
let AC = null, noiseBuf = null;
function audioInit(){
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) { return; }
  noiseBuf = AC.createBuffer(1, AC.sampleRate * 0.4, AC.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = rnd()*2-1;
}
function tone(freq, dur, type, vol, slideTo){
  if (!AC) return; const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
  o.type = type || 'square'; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol || 0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(AC.destination); o.start(t); o.stop(t + dur);
}
function noise(dur, vol, freq, typ){
  if (!AC) return; const t = AC.currentTime, s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = noiseBuf; f.type = typ || 'lowpass'; f.frequency.value = freq || 1200;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f).connect(g).connect(AC.destination); s.start(t); s.stop(t + dur);
}
const SFX = {
  whoosh: h => noise(h ? 0.16 : 0.08, h ? 0.12 : 0.06, h ? 900 : 1800, 'bandpass'),
  hit: h => { noise(h ? 0.22 : 0.1, h ? 0.5 : 0.3, h ? 900 : 2200); tone(h ? 140 : 260, h ? 0.2 : 0.08, 'sine', 0.4, h ? 40 : 90); },
  block: () => { tone(900, 0.05, 'square', 0.08, 500); noise(0.05, 0.15, 4000, 'highpass'); },
  ko: () => { tone(400, 0.9, 'sawtooth', 0.2, 50); noise(0.6, 0.4, 500); },
  bell: () => { tone(880, 0.3, 'triangle', 0.2); setTimeout(() => tone(1320, 0.4, 'triangle', 0.15), 120); },
  superS: () => { tone(200, 0.5, 'sawtooth', 0.18, 1600); },
  land: () => noise(0.12, 0.35, 300),
};

// ---------------- INPUT ----------------
function mkInput(){ return {left:0, right:0, up:0, down:0, press:[]}; }
const kb = {};
const KMAP = {KeyU:'lp', KeyI:'hp', KeyJ:'lk', KeyK:'hk', KeyL:'sp', Space:'sp'};
addEventListener('keydown', e => {
  audioInit();
  if (e.repeat) return; kb[e.code] = 1;
  if (KMAP[e.code]) { pressBtn(KMAP[e.code]); e.preventDefault(); }
  if (e.code === 'Enter') tapAt(W/2, 500, true);
  if (e.code.startsWith('Arrow')) e.preventDefault();
});
addEventListener('keyup', e => { kb[e.code] = 0; });
const touch = {stick:null, held:{}};
const BTN = [
  {id:'lp', x:340, y:752, r:52, label:'LP', sub:'jab', col:'#ffd23f'},
  {id:'hp', x:462, y:752, r:52, label:'HP', sub:'punch', col:'#ff6b3d'},
  {id:'lk', x:340, y:872, r:52, label:'LK', sub:'kick', col:'#3dd6ff'},
  {id:'hk', x:462, y:872, r:52, label:'HK', sub:'big kick', col:'#b45cff'},
];
const SPBTN = {x:330, y:660, w:190, h:44};
const STICK = {x:125, y:810, r:78};
let pendingPress = [];
function pressBtn(b){ pendingPress.push(b); }
function toLogical(e){ const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H]; }
const ptrs = {};
cv.addEventListener('pointerdown', e => {
  audioInit(); e.preventDefault();
  const [x, y] = toLogical(e);
  if (G.mode !== 'fight' && G.mode !== 'intro' && G.mode !== 'ko') { tapAt(x, y); return; }
  if (y > PANEL - 10 && x < 260) { ptrs[e.pointerId] = {k:'stick'}; touch.stick = {ox:x, oy:y, x, y, id:e.pointerId}; }
  else if (x >= SPBTN.x && y >= SPBTN.y - 6 && y <= SPBTN.y + SPBTN.h + 4) { pressBtn('sp'); ptrs[e.pointerId] = {k:'b', b:'sp'}; touch.held.sp = 1; }
  else if (y > PANEL - 10) {
    let best = null, bd = 1e9; for (const b of BTN){ const d = Math.hypot(x-b.x, y-b.y); if (d < bd) { bd = d; best = b; } }
    if (best && bd < 95) { pressBtn(best.id); ptrs[e.pointerId] = {k:'b', b:best.id}; touch.held[best.id] = 1; }
  }
  try { cv.setPointerCapture(e.pointerId); } catch(_){}
}, {passive:false});
cv.addEventListener('pointermove', e => {
  const p = ptrs[e.pointerId]; if (!p) return; const [x, y] = toLogical(e);
  if (p.k === 'stick' && touch.stick) {
    const s = touch.stick; s.x = x; s.y = y;
    const dx = x - s.ox, dy = y - s.oy, d = Math.hypot(dx, dy);
    if (d > 90) { s.ox = x - dx/d*90; s.oy = y - dy/d*90; } // drag origin along
  } else if (p.k === 'b') {
    // slide onto another button presses it (rolling inputs)
    for (const b of BTN) if (b.id !== p.b && Math.hypot(x-b.x, y-b.y) < 44) { touch.held[p.b] = 0; p.b = b.id; touch.held[b.id] = 1; pressBtn(b.id); }
  }
});
function ptrEnd(e){ const p = ptrs[e.pointerId]; if (!p) return; if (p.k === 'stick') touch.stick = null; else touch.held[p.b] = 0; delete ptrs[e.pointerId]; }
cv.addEventListener('pointerup', ptrEnd); cv.addEventListener('pointercancel', ptrEnd);
cv.addEventListener('contextmenu', e => e.preventDefault());

function readPlayer(inp){
  inp.left = kb.KeyA || kb.ArrowLeft ? 1 : 0; inp.right = kb.KeyD || kb.ArrowRight ? 1 : 0;
  inp.up = kb.KeyW || kb.ArrowUp ? 1 : 0; inp.down = kb.KeyS || kb.ArrowDown ? 1 : 0;
  const s = touch.stick;
  if (s) { const dx = s.x - s.ox, dy = s.y - s.oy;
    if (dx < -22) inp.left = 1; if (dx > 22) inp.right = 1; if (dy < -34) inp.up = 1; if (dy > 26) inp.down = 1; }
  inp.press = pendingPress; pendingPress = [];
}

// ---------------- FIGHTERS ----------------
const SKINS = [
  {name:'BROBOT', body:'#2ad4ff', dark:'#137aa8', acc:'#ffd23f', head:'robot'},
  {name:'ZORG', body:'#8cff3a', dark:'#3f9a12', acc:'#ff3ad1', head:'alien'},
];
function mkFighter(i){
  return {i, skin:SKINS[i], x: i ? 360 : 180, y:GY, vx:0, vy:0, face: i ? -1 : 1, state:'idle', sf:0,
    hp:T.hp, bal:T.balMax, sinceHit:999, meter:0, superUsed:false, move:null, mf:0, hitDone:false, hitGroup:-1,
    peak:0, prevTip:null, stun:0, rotV:0, rot:0, airAtk:false, combo:0, buf:[], jdir:0, pose:IDLE, wins:0, blocking:false, didHit:false, inv:0, kdLock:false};
}
const ACTION = {idle:1, walk:1, crouch:1};
function canAct(F){ return !!ACTION[F.state]; }
function relDirs(F, inp){ return {fwd: F.face > 0 ? inp.right : inp.left, back: F.face > 0 ? inp.left : inp.right}; }
function setState(F, s){ F.state = s; F.sf = 0; }
function startMove(F, name){
  const m = MOVES[name]; F.move = m; F.mf = 0; F.hitDone = false; F.hitGroup = -1; F.peak = 0; F.prevTip = null; F.didHit = false;
  setState(F, 'attack'); SFX.whoosh(!m.light);
  if (m.super) { F.superUsed = true; F.meter = 0; G.superFlash = 40; G.superBy = F; SFX.superS(); }
}
function pickMove(F, btn, inp){
  const air = F.state === 'jump';
  if (btn === 'sp') return (F.meter >= 100 && !F.superUsed && !air) ? 'SUPER' : null;
  const map = {lp:'LP', hp:'HP', lk:'LK', hk:'HK'}[btn];
  if (air) return F.airAtk ? null : (btn === 'lp' || btn === 'hp' ? 'jP' : 'jK');
  return (inp.down ? 'c' : '') + map;
}
function stepFighter(F, O, inp){
  F.sf++; F.sinceHit++; if (F.inv > 0) F.inv--;
  for (const b of inp.press) F.buf.push({b, t:8});
  F.buf = F.buf.filter(x => --x.t > 0);
  const {fwd, back} = relDirs(F, inp);
  const grounded = F.y >= GY && F.vy >= 0;
  if (F.sinceHit > T.balRegenDelay) F.bal = Math.min(T.balMax, F.bal + T.balRegen);
  // cancel: light normal that hit can cancel into heavy or super in early recovery
  if (F.state === 'attack' && F.didHit && F.move.light && F.mf >= F.move.s && F.buf.length) {
    const b = F.buf.find(x => x.b !== 'lp' && x.b !== 'lk');
    if (b) { const n = pickMove(F, b.b, inp); if (n) { F.buf = []; startMove(F, n); } }
  }
  if (canAct(F) && grounded) {
    F.face = O.x >= F.x ? 1 : -1;
    const rel = relDirs(F, inp);
    let started = false;
    if (F.buf.length) { const b = F.buf.shift(); const n = pickMove(F, b.b, inp); if (n) { startMove(F, n); started = true; } }
    if (!started) {
      if (inp.up) { setState(F, 'prejump'); F.jdir = rel.fwd ? 1 : rel.back ? -1 : 0; F.vx = 0; }
      else if (inp.down) { if (F.state !== 'crouch') setState(F, 'crouch'); F.vx = 0; }
      else if (rel.fwd) { if (F.state !== 'walk') setState(F, 'walk'); F.vx = T.walkF * F.face; }
      else if (rel.back) { if (F.state !== 'walk') setState(F, 'walk'); F.vx = -T.walkB * F.face; }
      else { if (F.state !== 'idle') setState(F, 'idle'); F.vx = 0; }
    }
  } else if (F.state === 'jump' && F.buf.length && !F.airAtk) {
    const b = F.buf.shift(); const n = pickMove(F, b.b, inp); if (n) { F.airAtk = true; startMove(F, n); F.airMove = true; }
  }
  F.blocking = canAct(F) && grounded && back;
  switch (F.state) {
    case 'prejump': if (F.sf >= 3) { F.vy = -T.jumpV; F.vx = F.jdir * T.jumpX * F.face; F.airAtk = false; F.airMove = false; setState(F, 'jump'); } break;
    case 'land': if (F.sf >= 4) setState(F, 'idle'); break;
    case 'attack': {
      const m = F.move; F.mf++;
      if (m.super && F.mf >= m.s && F.mf < m.s + m.a) F.vx = 7.5 * F.face;
      else if (m.super) F.vx *= 0.8;
      else if (grounded && !F.airMove) F.vx *= 0.7;
      if (F.mf >= m.s + m.a + m.r) { F.move = null; if (F.airMove && F.y < GY) setState(F, 'jump'); else setState(F, inp.down ? 'crouch' : 'idle'); F.state === 'jump' && (F.sf = 10); }
      break; }
    case 'hitstun': case 'blockstun': F.vx *= 0.86; if (F.sf >= F.stun) setState(F, F.state === 'blockstun' && inp.down ? 'crouch' : 'idle'); break;
    case 'tumble': F.rot += F.rotV; break;
    case 'down': F.vx *= 0.8; if (F.sf >= 40 && !F.kdLock) { setState(F, 'getup'); F.inv = 30; } break;
    case 'getup': if (F.sf >= 26) { setState(F, 'idle'); F.bal = T.balMax; F.rot = 0; } break;
  }
  // physics
  const wasAir = F.y < GY;
  if (F.y < GY || F.vy < 0) { F.vy += T.grav; F.y += F.vy; }
  F.x += F.vx;
  if (F.y >= GY) {
    F.y = GY;
    if (wasAir) {
      if (F.state === 'tumble') {
        if (F.vy > 6) { F.vy = -F.vy * 0.35; F.vx *= 0.6; F.y = GY - 0.1; G.shake = Math.max(G.shake, 6); SFX.land(); }
        else { F.vy = 0; setState(F, 'down'); F.rot = -90; SFX.land(); G.shake = Math.max(G.shake, 4); }
      } else if (F.state === 'jump' || (F.state === 'attack' && F.airMove)) { F.vy = 0; F.vx = 0; F.move = null; F.airMove = false; setState(F, 'land'); }
      else if (F.state === 'hitstun') { F.vy = 0; }
    }
    if (F.state !== 'tumble') F.vy = Math.max(0, F.vy);
  }
  F.x = clamp(F.x, T.wallL, T.wallR);
  F.pose = computePose(F, O, inp);
}
function computePose(F, O, inp){
  const t = G.frame;
  switch (F.state) {
    case 'idle': { const b = Math.sin(t * 0.09 + F.i) * 2; const p = mix(IDLE, IDLE, 0); p.hy += b; p.ua1 += b; p.ua2 -= b;
      return (F.blocking || (relDirs(F, inp).back && O.state === 'attack')) ? BLOCK : p; }
    case 'walk': { if (F.blocking && O.state === 'attack') return BLOCK;
      const ph = F.sf * 0.22 * (F.vx * F.face > 0 ? 1 : -1), s = Math.sin(ph); const p = mix(IDLE, IDLE, 0);
      p.th1 = 10 + s * 24; p.sh1 = -14 - Math.max(0, -s) * 30; p.th2 = -6 - s * 24; p.sh2 = -14 - Math.max(0, s) * 30; p.hy += Math.abs(Math.cos(ph)) * -3; return p; }
    case 'crouch': return relDirs(F, inp).back ? CBLOCK : CROUCH;
    case 'prejump': return mix(IDLE, CROUCH, 0.5);
    case 'land': return mix(CROUCH, IDLE, F.sf / 4);
    case 'jump': { const p = mix(IDLE, JUMP, ease(F.sf / 8)); if (F.jdir) p.rot = clamp(F.sf, 0, 30) * 0; return p; }
    case 'attack': return movePose(F.move, F.mf);
    case 'hitstun': { if (F.y < GY) return AIRHIT; const k = F.sf < 4 ? ease(F.sf / 3) : 1 - ease((F.sf - 4) / Math.max(1, F.stun - 4));
      const p = mix(IDLE, HIT, k); if (F.bal < 35) { p.torso += Math.sin(F.sf * 0.6) * 8; p.hx += Math.sin(F.sf * 0.5) * 3; } return p; }
    case 'blockstun': return F.crouchBlock ? CBLOCK : BLOCK;
    case 'tumble': { const p = mix(AIRHIT, AIRHIT, 0); p.rot = F.rot; p.hy = -10; return p; }
    case 'down': case 'ko': return LIE;
    case 'getup': return mix(LIE, CROUCH, ease(F.sf / 18));
    case 'win': return mix(IDLE, WIN, ease(F.sf / 15));
  }
  return IDLE;
}
function hurtCircles(F, pts){
  const c = [[pts.head, 17], [[(pts.hip[0]+pts.neck[0])/2, (pts.hip[1]+pts.neck[1])/2], 24], [pts.hip, 20], [pts.knee1, 13], [pts.knee2, 13]];
  if (F.state === 'attack') { c.push([pts.elbow1, 11]); c.push([pts[F.move.tip], 11]); }
  return c;
}
function tryHit(A, D){
  if (A.state !== 'attack') return;
  const m = A.move, f = A.mf; const pts = fk(A, A.pose); const tip = pts[m.super && Math.floor((f - m.s) / 6) % 2 ? 'hand2' : m.tip];
  if (A.prevTip) { const v = Math.hypot(tip[0]-A.prevTip[0], tip[1]-A.prevTip[1]); if (f <= m.s + 1) A.peak = Math.max(A.peak, v); }
  A.prevTip = tip;
  if (f < m.s || f >= m.s + m.a) return;
  if (m.super) { const g = Math.floor((f - m.s) / 6); if (g !== A.hitGroup) { A.hitGroup = g; A.hitDone = false; } }
  if (A.hitDone || D.inv > 0 || D.state === 'down' || D.state === 'getup' || D.state === 'ko' || D.state === 'tumble') return;
  const dp = fk(D, D.pose); let hitAt = null;
  for (const [p, r] of hurtCircles(D, dp)) { if (Math.hypot(p[0]-tip[0], p[1]-tip[1]) < r + m.rad) { hitAt = [(p[0]+tip[0])/2, (p[1]+tip[1])/2]; break; } }
  if (!hitAt) return;
  A.hitDone = true; A.didHit = true;
  const last = m.super && f >= m.s + m.a - 7;
  const speed = clamp(A.peak / m.nom, T.speedMin, T.speedMax);
  const counter = D.state === 'attack' && D.mf < D.move.s;
  const grounded = D.y >= GY;
  const inp = D.i === 0 ? G.pin : G.cin; const {back} = relDirs(D, inp);
  const blockable = grounded && back && (canAct(D) || D.state === 'blockstun' || (D.state === 'idle'));
  const crouching = D.state === 'crouch' || (D.state === 'blockstun' && D.crouchBlock) || inp.down;
  let blocked = blockable && !(m.low && !crouching) && !(m.over && crouching);
  if (blocked) {
    D.hp -= Math.round(m.dmg * (m.super ? 0.25 : (m.light ? 0 : T.chip)));
    D.crouchBlock = crouching; D.stun = m.bs; setState(D, 'blockstun'); D.vx = A.face * m.kb * 0.9;
    if (D.x <= T.wallL + 1 || D.x >= T.wallR - 1) A.vx = -A.face * m.kb * 0.7;
    G.hitstop = Math.round((m.stop - 3) * T.hitstopMul); G.shake = Math.max(G.shake, 2 * T.shakeMul);
    sparks(hitAt[0], hitAt[1], '#9fe8ff', 8, A.face); SFX.block();
    D.meter = Math.min(100, D.meter + T.meterOnBlock); D.combo = 0;
    if (D.hp <= 0) { D.hp = 1; }
    return;
  }
  const dmg = Math.round(m.dmg * speed * (counter ? T.counterMul : 1) * (last ? 2.6 : 1));
  D.hp = Math.max(0, D.hp - dmg); D.sinceHit = 0;
  D.bal -= m.bal * speed * (counter ? 1.5 : 1) * (D.state === 'hitstun' ? 0.7 : 1);
  D.combo = (D.state === 'hitstun' || D.state === 'tumble') ? D.combo + 1 : 1;
  if (D.combo >= 2) G.pop(D, D.combo + ' HITS', '#ffd23f');
  if (counter) G.pop(D, 'COUNTER', '#ff3d7f'); else if (speed >= 1.2) G.pop(D, 'HARD HIT', '#fff');
  A.meter = Math.min(100, A.meter + (m.super ? 0 : dmg * T.meterOnHit)); D.meter = Math.min(100, D.meter + dmg * T.meterOnTaken);
  const heavy = !m.light;
  const kd = m.kd || last || !grounded || D.bal <= 0 || D.hp <= 0 || (m.aa && !grounded);
  if (D.move) D.move = null;
  if (kd) {
    const pw = (m.kb * 0.5 + 3) * speed * (last ? 1.6 : 1);
    D.vx = A.face * pw; D.vy = -(6 + m.kb * 0.55 * speed) * (last ? 1.3 : 1); D.y = Math.min(D.y, GY - 1);
    const air = 2 * -D.vy / T.grav; D.rot = 0; D.rotV = -90 / air; setState(D, 'tumble'); D.bal = T.balMax;
    if (D.bal <= 0 || !m.kd) G.pop(D, D.hp <= 0 ? '' : 'KNOCKDOWN', '#3dd6ff');
  } else {
    D.stun = m.hs + (counter ? 4 : 0) + (D.bal < 35 ? 6 : 0); setState(D, 'hitstun'); D.vx = A.face * m.kb * speed;
    if (D.x <= T.wallL + 1 || D.x >= T.wallR - 1) A.vx = -A.face * m.kb * 0.6;
  }
  const stop = (m.stop + (counter ? 3 : 0) + (last ? 14 : 0)) * T.hitstopMul;
  G.hitstop = Math.round(stop); G.shake = Math.max(G.shake, (heavy ? 9 : 4) * speed * T.shakeMul * (last ? 2 : 1));
  sparks(hitAt[0], hitAt[1], heavy ? '#ffe14d' : '#ffffff', heavy ? 16 : 9, A.face, heavy);
  SFX.hit(heavy);
  if (D.hp <= 0) G.koBy(A, D);
}

// ---------------- PARTICLES ----------------
const parts = [];
function sparks(x, y, col, n, dir, big){
  parts.push({ring:1, x, y, r:4, life:10, max:10, col, big});
  for (let i = 0; i < n; i++) { const a = (rnd() - 0.5) * 2.4 + (dir > 0 ? 0 : Math.PI); const s = 4 + rnd() * (big ? 10 : 6);
    parts.push({x, y, vx:Math.cos(a)*s, vy:Math.sin(a)*s - 1, life:10 + rnd()*8, max:18, col}); }
}
function stepParts(){ for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life--; if (p.ring) p.r += p.big ? 6 : 4; else { p.x += p.vx; p.y += p.vy; p.vx *= 0.88; p.vy = p.vy * 0.88 + 0.3; } if (p.life <= 0) parts.splice(i, 1); } }

// ---------------- AI ----------------
function mkAI(level){ return {lv:DIFF[level] || DIFF.normal, hist:[], plan:'wait', planT:0, defT:0, def:false, pressCd:0}; }
function snap(F){ const m = F.move; const ph = F.state === 'attack' ? (F.mf < m.s ? 'start' : F.mf < m.s + m.a ? 'act' : 'rec') : '';
  return {x:F.x, y:F.y, air:F.y < GY - 20, vy:F.vy, st:F.state, ph, low:m && m.low, over:m && m.over, reach:m ? m.reach : 0, light:m && m.light, sup:m && m.super}; }
function aiStep(C, Pl, ai, inp){
  inp.left = inp.right = inp.up = inp.down = 0; inp.press = [];
  ai.hist.push(snap(Pl)); if (ai.hist.length > 60) ai.hist.shift();
  const s = ai.hist[Math.max(0, ai.hist.length - 1 - ai.lv.delay)];
  const dx = s.x - C.x, dist = Math.abs(dx), dir = dx >= 0 ? 1 : -1;
  const fwdK = dir > 0 ? 'right' : 'left', backK = dir > 0 ? 'left' : 'right';
  const press = b => { if (ai.pressCd <= 0) { inp.press.push(b); ai.pressCd = 6; } };
  ai.pressCd--;
  if (C.state === 'jump' && dist < 110 && C.vy > -2 && rnd() < 0.3) { press(rnd() < 0.5 ? 'hk' : 'hp'); return; }
  if (C.state === 'blockstun') { inp[backK] = 1; if (C.crouchBlock) inp.down = 1; return; }
  if (!canAct(C)) return;
  // defense
  const threat = (s.st === 'attack' && s.ph !== 'rec' && dist < s.reach + 60) || (s.air && dist < 170 && s.vy > 0);
  if (threat) {
    if (ai.defT <= 0) { ai.def = rnd() < ai.lv.block; ai.defT = 20; }
    if (s.air && dist < 140 && rnd() < ai.lv.aa * 0.25) { inp.down = 1; press('hp'); return; }
    if (ai.def) { inp[backK] = 1; if (s.low) inp.down = 1; return; }
  } else ai.defT--;
  // punish whiffs / recovery
  if ((s.ph === 'rec' && !s.light) || s.st === 'land' || s.st === 'getup' && false) {
    if (dist < 150 && rnd() < ai.lv.punish * 0.4) {
      if (C.meter >= 100 && !C.superUsed && dist < 200) { press('sp'); return; }
      press(dist < 85 ? 'hp' : 'hk'); return; }
  }
  if (C.meter >= 100 && !C.superUsed && dist < 170 && rnd() < 0.006) { press('sp'); return; }
  if (ai.planT-- <= 0) {
    const r = rnd(), a = ai.lv.aggr;
    if (dist > 200) ai.plan = r < 0.6 + a * 0.2 ? 'approach' : r < 0.85 ? 'wait' : 'jumpin';
    else if (dist > 95) ai.plan = r < a * 0.6 ? 'poke' : r < a * 0.6 + 0.25 ? 'approach' : r < 0.85 ? 'retreat' : r < 0.93 ? 'jumpin' : 'wait';
    else ai.plan = r < a * 0.5 ? 'jab' : r < a * 0.5 + 0.2 ? 'heavy' : r < 0.75 ? 'sweep' : r < 0.88 ? 'retreat' : 'guard';
    ai.planT = 12 + Math.floor(rnd() * 30); ai.acted = false;
  }
  switch (ai.plan) {
    case 'approach': inp[fwdK] = 1; if (dist < 90) ai.planT = 0; break;
    case 'retreat': inp[backK] = 1; break;
    case 'guard': inp[backK] = 1; if (rnd() < 0.4) inp.down = 1; break;
    case 'jumpin': if (!ai.acted) { inp.up = 1; inp[fwdK] = 1; ai.acted = true; } break;
    case 'poke': if (dist > 150) inp[fwdK] = 1; else if (!ai.acted) { const o = rnd(); if (o < 0.4) press('lk'); else if (o < 0.7) { inp.down = 1; press('lk'); } else press('hk'); ai.acted = true; } break;
    case 'jab': if (!ai.acted) { press(rnd() < 0.6 ? 'lp' : 'lk'); ai.acted = rnd() < 0.5; ai.planT = Math.min(ai.planT, 10); } break;
    case 'heavy': if (!ai.acted) { press(rnd() < 0.5 ? 'hp' : 'hk'); ai.acted = true; } break;
    case 'sweep': if (!ai.acted) { inp.down = 1; press(rnd() < 0.6 ? 'hk' : 'lk'); ai.acted = true; } break;
  }
  // light hit confirm into heavy
  if (C.state === 'attack' && C.didHit && C.move.light && rnd() < ai.lv.punish) press('hp');
}

// ---------------- GAME FLOW ----------------
const G = { mode:'title', frame:0, hitstop:0, shake:0, superFlash:0, diff: qs.get('diff') || 'normal', auto: qs.get('auto') === '1',
  pin:mkInput(), cin:mkInput(), pops:[], round:1, timer:T.roundTime, tFrames:0, big:null, slow:0, fps:60, matchesDone:0 };
window.FIGHT = G; G.T = T; G.MOVES = MOVES;
G.pop = (F, txt, col) => { if (txt) G.pops.push({x:F.x, y:F.y - 190 - G.pops.length * 26, txt, col, life:50}); };
G.say = (txt, dur, col, size) => { G.big = {txt, life:dur, max:dur, col:col || '#fff', size:size || 96}; };
function newMatch(){ G.f = [mkFighter(0), mkFighter(1)]; G.round = 1; G.ai = mkAI(G.diff); G.ai1 = mkAI('normal'); newRound(); }
function newRound(){
  const [a, b] = G.f; for (const F of G.f) { const n = mkFighter(F.i); n.wins = F.wins; n.meter = F.meter; n.superUsed = F.superUsed; Object.assign(F, n); }
  G.timer = T.roundTime; G.tFrames = 0; G.mode = 'intro'; G.introT = 0; G.ai.hist = []; G.ai1.hist = []; G.pops = []; parts.length = 0;
  G.say('ROUND ' + G.round, 70, '#ffd23f'); SFX.bell();
}
G.koBy = (A, D) => { if (G.mode !== 'fight') return; G.mode = 'ko'; G.koT = 0; G.slow = 50; D.kdLock = true; G.winner = A; A.wins++; G.say('K.O.', 120, '#ff3d7f', 150); SFX.ko(); };
function timeUp(){
  const [a, b] = G.f; G.mode = 'ko'; G.koT = 0;
  if (a.hp === b.hp) { G.winner = null; G.say('DRAW', 120, '#fff'); a.wins++; b.wins++; }
  else { G.winner = a.hp > b.hp ? a : b; G.winner.wins++; G.say('TIME', 120, '#fff'); }
}
function tapAt(x, y, key){
  if (G.mode === 'title') {
    for (const d of ['easy', 'normal', 'hard']) { const bx = DBTN[d]; if (!key && x > bx.x && x < bx.x + bx.w && y > bx.y && y < bx.y + bx.h) { G.diff = d; return; } }
    if (key || y > 820) { newMatch(); }
  } else if (G.mode === 'over') { if (G.overT > 40) { G.mode = 'title'; if (key || y > 600) newMatch(); } }
}
const DBTN = {easy:{x:60, y:740, w:130, h:56}, normal:{x:205, y:740, w:130, h:56}, hard:{x:350, y:740, w:130, h:56}};

function tick(){
  G.frame++;
  if (G.mode === 'title' || G.mode === 'over') { pendingPress = []; if (G.mode === 'over') G.overT++; if (G.big) { G.big.life--; if (G.big.life <= 0) G.big = null; } return; }
  const [A, B] = G.f;
  if (G.big) { G.big.life--; if (G.big.life <= 0) G.big = null; }
  for (const p of G.pops) { p.life--; p.y -= 0.6; } G.pops = G.pops.filter(p => p.life > 0);
  stepParts();
  if (G.shake > 0) G.shake *= 0.85; if (G.shake < 0.3) G.shake = 0;
  if (G.mode === 'intro') { G.introT++; readPlayer(G.pin); pendingPress = [];
    if (G.introT === 70) { G.say('FIGHT', 45, '#fff', 130); SFX.bell(); }
    if (G.introT >= 100) G.mode = 'fight';
    for (const F of G.f) F.pose = computePose(F, F === A ? B : A, mkInput());
    return; }
  if (G.superFlash > 0) { G.superFlash--; readPlayer(G.pin); return; }
  if (G.hitstop > 0) { G.hitstop--; readPlayer(G.pin); G.pin.press.forEach(b => pendingPress.push(b)); return; }
  if (G.mode === 'ko') { G.koT++; if (G.slow > 0) { G.slow--; if (G.slow % 3) return; } }
  // inputs
  if (G.mode === 'fight') {
    if (G.auto) { aiStep(A, B, G.ai1, G.pin); pendingPress = []; } else readPlayer(G.pin);
    aiStep(B, A, G.ai, G.cin);
  } else { G.pin = mkInput(); G.cin = mkInput(); pendingPress = []; }
  stepFighter(A, B, G.pin); stepFighter(B, A, G.cin);
  // push boxes
  const dx = B.x - A.x;
  if (Math.abs(dx) < T.pushW && Math.abs(A.y - B.y) < 110 && A.state !== 'down' && B.state !== 'down') {
    const o = (T.pushW - Math.abs(dx)) / 2, s = dx >= 0 ? 1 : -1;
    A.x -= o * s; B.x += o * s;
    if (A.x < T.wallL) { B.x += T.wallL - A.x; A.x = T.wallL; } if (B.x < T.wallL) { A.x += T.wallL - B.x; B.x = T.wallL; }
    if (A.x > T.wallR) { B.x -= A.x - T.wallR; A.x = T.wallR; } if (B.x > T.wallR) { A.x -= B.x - T.wallR; B.x = T.wallR; }
  }
  if (G.mode === 'fight') { tryHit(A, B); if (G.mode === 'fight') tryHit(B, A); }
  if (G.mode === 'fight' && ++G.tFrames % 60 === 0) { G.timer--; if (G.timer <= 0) timeUp(); }
  if (G.mode === 'ko') {
    if (G.koT === 90 && G.winner) { setState(G.winner, 'win'); }
    if (G.koT >= 200) {
      if (A.wins >= 2 || B.wins >= 2) { G.mode = 'over'; G.overT = 0; G.matchesDone++;
        G.champ = A.wins >= 2 && B.wins >= 2 ? null : A.wins >= 2 ? A : B; }
      else { G.round++; newRound(); }
    }
  }
}

// ---------------- RENDER ----------------
const bg = document.createElement('canvas'); bg.width = W; bg.height = PANEL;
(function paintBG(){
  const b = bg.getContext('2d');
  const g = b.createLinearGradient(0, 0, 0, GY); g.addColorStop(0, '#2a0f8a'); g.addColorStop(0.5, '#ff2f8f'); g.addColorStop(1, '#ffb43a');
  b.fillStyle = g; b.fillRect(0, 0, W, GY);
  b.fillStyle = '#ffe94a'; b.beginPath(); b.arc(W/2, 400, 120, 0, 7); b.fill();
  b.fillStyle = '#ff6a3a'; for (let i = 0; i < 6; i++) b.fillRect(W/2 - 130, 390 + i * 18, 260, 6 + i);
  let s = 7; const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  b.fillStyle = '#3a1060'; for (let x = -10; x < W; x += 34 + r() * 30) { const h = 60 + r() * 150; b.fillRect(x, GY - 60 - h, 30 + r() * 26, h + 60); }
  b.fillStyle = '#ffd23f'; for (let i = 0; i < 70; i++) b.fillRect(r() * W, GY - 60 - r() * 170, 4, 5);
  b.fillStyle = '#22114a'; b.fillRect(0, GY - 30, W, 30);
  const gg = b.createLinearGradient(0, GY, 0, PANEL); gg.addColorStop(0, '#1ee08a'); gg.addColorStop(1, '#0b7a52'); b.fillStyle = gg; b.fillRect(0, GY - 6, W, PANEL - GY + 6);
  b.strokeStyle = 'rgba(0,0,0,0.25)'; b.lineWidth = 3; for (let i = -10; i <= 10; i++) { b.beginPath(); b.moveTo(W/2 + i * 50, GY - 6); b.lineTo(W/2 + i * 130, PANEL); b.stroke(); }
  for (let y = GY + 10, k = 1; y < PANEL; y += 12 * k, k += 0.6) { b.beginPath(); b.moveTo(0, y); b.lineTo(W, y); b.stroke(); }
  b.fillStyle = '#000'; b.fillRect(0, GY - 8, W, 4);
})();

function seg(a, b, w, col){ ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
function limb2(a, b, c, w, col){ seg(a, b, w + 7, '#111'); seg(b, c, w + 7, '#111'); seg(a, b, w, col); seg(b, c, w - 2, col); }
function dot(p, r, col){ ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(p[0], p[1], r + 3.5, 0, 7); ctx.fill(); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 7); ctx.fill(); }
function drawFighter(F){
  const p = fk(F, F.pose), s = F.skin;
  let jx = 0; if (G.hitstop > 0 && (F.state === 'hitstun' || F.state === 'tumble' || F.state === 'blockstun')) jx = (G.frame % 2 ? 3 : -3);
  ctx.save(); ctx.translate(jx, 0); ctx.lineCap = 'round';
  // back limbs
  limb2(p.hip, p.knee2, p.foot2, 15, s.dark); limb2(p.sh, p.elbow2, p.hand2, 12, s.dark); dot(p.hand2, 8, s.dark);
  // torso
  seg(p.hip, p.neck, 38, '#111'); seg(p.hip, p.neck, 31, s.body);
  seg(lerpP(p.hip, p.neck, 0.15), lerpP(p.hip, p.neck, 0.15), 30, s.acc);
  ctx.globalAlpha = 0.9; seg(lerpP(p.hip, p.neck, 0.55), lerpP(p.hip, p.neck, 0.7), 12, s.acc); ctx.globalAlpha = 1;
  // head
  ctx.save(); ctx.translate(p.head[0], p.head[1]); ctx.rotate(p.headAng); ctx.scale(F.face, 1);
  ctx.fillStyle = '#111';
  if (s.head === 'robot') {
    rr(-20, -20, 40, 38, 9); ctx.fill(); ctx.fillStyle = s.body; rr(-16.5, -16.5, 33, 31, 6); ctx.fill();
    ctx.fillStyle = '#111'; rr(-4, -10, 22, 11, 4); ctx.fill(); ctx.fillStyle = s.acc; ctx.fillRect(6, -7, 9, 5);
    ctx.fillStyle = '#111'; ctx.fillRect(-2, -30, 4, 12); ctx.fillStyle = s.acc; ctx.beginPath(); ctx.arc(0, -31, 5, 0, 7); ctx.fill();
  } else {
    ctx.beginPath(); ctx.ellipse(2, -4, 22, 25, 0, 0, 7); ctx.fill(); ctx.fillStyle = s.body; ctx.beginPath(); ctx.ellipse(2, -4, 18.5, 21.5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.ellipse(11, -6, 6, 9, 0.4, 0, 7); ctx.fill(); ctx.beginPath(); ctx.ellipse(-2, -6, 4, 8, 0.3, 0, 7); ctx.fill();
    ctx.fillStyle = s.acc; ctx.beginPath(); ctx.arc(-8, -28, 5, 0, 7); ctx.fill();
  }
  ctx.restore();
  // front limbs
  limb2(p.hip, p.knee1, p.foot1, 16, s.body); dot(p.foot1, 9, s.acc);
  limb2(p.sh, p.elbow1, p.hand1, 13, s.body); dot(p.hand1, 10, s.acc);
  if (F.state === 'attack' && F.mf >= F.move.s && F.mf < F.move.s + F.move.a) { // motion smear
    const tip = p[F.move.tip]; ctx.globalAlpha = 0.35; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(tip[0], tip[1], F.move.rad + 6, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
  if (G.debug) { ctx.strokeStyle = '#0f0'; ctx.lineWidth = 1; for (const [c, r] of hurtCircles(F, p)) { ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, 7); ctx.stroke(); } }
  ctx.restore();
}
function lerpP(a, b, t){ return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)]; }
function rr(x, y, w, h, r){ ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function txt(t, x, y, size, col, align, stroke){
  ctx.font = '900 ' + size + 'px Impact, "Arial Black", system-ui, sans-serif'; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = stroke || Math.max(4, size / 7); ctx.strokeStyle = '#111'; ctx.strokeText(t, x, y); ctx.fillStyle = col; ctx.fillText(t, x, y);
}
function hud(){
  const [A, B] = G.f;
  const bar = (F, x, w, flip) => {
    ctx.fillStyle = '#111'; rr(x - 4, 26, w + 8, 34, 8); ctx.fill();
    ctx.fillStyle = '#5a0a1a'; ctx.fillRect(x, 30, w, 26);
    const hw = w * Math.max(0, F.hp) / T.hp; F.lag = F.lag === undefined ? hw : Math.max(hw, F.lag - 2);
    ctx.fillStyle = '#fff'; ctx.fillRect(flip ? x + w - F.lag : x, 30, F.lag, 26);
    ctx.fillStyle = F.hp < 300 ? '#ff3d3d' : '#ffd23f'; ctx.fillRect(flip ? x + w - hw : x, 30, hw, 26);
    // balance
    const bw = w * 0.7 * F.bal / T.balMax; ctx.fillStyle = '#111'; ctx.fillRect(flip ? x + w * 0.3 - 2 : x - 2, 62, w * 0.7 + 4, 10);
    ctx.fillStyle = F.bal < 35 ? (G.frame % 10 < 5 ? '#ff3d7f' : '#fff') : '#3dd6ff'; ctx.fillRect(flip ? x + w - bw : x, 64, bw, 6);
    txt(F.skin.name, flip ? x + w : x, 90, 22, F.skin.body, flip ? 'right' : 'left', 5);
    for (let i = 0; i < 2; i++) { ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(flip ? x + w - 112 - i * 22 : x + 112 + i * 22, 90, 9, 0, 7); ctx.fill();
      ctx.fillStyle = F.wins > i ? '#ffd23f' : '#333'; ctx.beginPath(); ctx.arc(flip ? x + w - 112 - i * 22 : x + 112 + i * 22, 90, 6, 0, 7); ctx.fill(); }
    // super meter
    const mw = 150, mx = flip ? W - 20 - mw : 20, my = PANEL - 34;
    ctx.fillStyle = '#111'; rr(mx - 3, my - 3, mw + 6, 20, 6); ctx.fill();
    const full = F.meter >= 100 && !F.superUsed;
    ctx.fillStyle = F.superUsed ? '#444' : full ? (G.frame % 12 < 6 ? '#ff3ad1' : '#ffd23f') : '#ff3ad1';
    const mf = F.superUsed ? mw : mw * F.meter / 100; ctx.fillRect(flip ? mx + mw - mf : mx, my, mf, 14);
    txt(F.superUsed ? 'SUPER USED' : full ? 'SUPER READY' : 'SUPER', flip ? mx + mw : mx, my - 14, 15, '#fff', flip ? 'right' : 'left', 4);
  };
  bar(A, 18, 200, false); bar(B, W - 218, 200, true);
  ctx.fillStyle = '#111'; rr(W/2 - 36, 20, 72, 60, 12); ctx.fill();
  txt(String(Math.max(0, G.timer)), W/2, 52, 42, G.timer <= 10 ? '#ff3d3d' : '#fff', 'center', 6);
  txt('ROUND ' + G.round, W/2, 98, 16, '#fff', 'center', 4);
}
function controls(){
  const g = ctx.createLinearGradient(0, PANEL, 0, H); g.addColorStop(0, '#1b0f3d'); g.addColorStop(1, '#0a0618'); ctx.fillStyle = g; ctx.fillRect(0, PANEL, W, H - PANEL);
  ctx.fillStyle = '#000'; ctx.fillRect(0, PANEL, W, 4);
  // stick
  const s = touch.stick, bx = s ? s.ox : STICK.x, by = s ? s.oy : STICK.y;
  ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(bx, by, STICK.r, 0, 7); ctx.fill(); ctx.stroke();
  let kx = bx, ky = by; if (s) { const dx = s.x - s.ox, dy = s.y - s.oy, d = Math.hypot(dx, dy) || 1, m = Math.min(d, 60); kx = bx + dx / d * m; ky = by + dy / d * m; }
  const arrows = [['\u25B2', 0, -1], ['\u25BC', 0, 1], ['\u25C0', -1, 0], ['\u25B6', 1, 0]];
  ctx.font = '700 18px system-ui'; ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const [a, x, y] of arrows) ctx.fillText(a, bx + x * 58, by + y * 58);
  ctx.fillStyle = '#2ad4ff'; ctx.beginPath(); ctx.arc(kx, ky, 34, 0, 7); ctx.fill(); ctx.strokeStyle = '#111'; ctx.lineWidth = 4; ctx.stroke();
  txt('MOVE', STICK.x, PANEL + 22, 14, 'rgba(255,255,255,0.6)', 'center', 3);
  for (const b of BTN) {
    const on = touch.held[b.id] || kb[{lp:'KeyU', hp:'KeyI', lk:'KeyJ', hk:'KeyK'}[b.id]];
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(b.x, b.y + (on ? 0 : 5), b.r, 0, 7); ctx.fill();
    ctx.fillStyle = b.col; ctx.beginPath(); ctx.arc(b.x, b.y + (on ? 4 : 0), b.r - 4, 0, 7); ctx.fill();
    txt(b.label, b.x, b.y - 6 + (on ? 4 : 0), 30, '#fff', 'center', 5); txt(b.sub, b.x, b.y + 22 + (on ? 4 : 0), 13, '#fff', 'center', 3);
  }
  const F = G.f ? G.f[0] : null, ready = F && F.meter >= 100 && !F.superUsed;
  ctx.globalAlpha = ready ? 1 : 0.4; ctx.fillStyle = '#111'; rr(SPBTN.x, SPBTN.y, SPBTN.w, SPBTN.h, 22); ctx.fill();
  ctx.fillStyle = ready ? (G.frame % 16 < 8 ? '#ff3ad1' : '#ffd23f') : '#663366'; rr(SPBTN.x + 3, SPBTN.y + 3, SPBTN.w - 6, SPBTN.h - 6, 19); ctx.fill();
  txt('SUPER', SPBTN.x + SPBTN.w / 2, SPBTN.y + SPBTN.h / 2, 24, '#fff', 'center', 5); ctx.globalAlpha = 1;
}
function render(){
  ctx.setTransform(SCALE * DPR, 0, 0, SCALE * DPR, 0, 0);
  if (G.mode === 'title') return titleScreen();
  const sx = G.shake ? (rnd() - 0.5) * G.shake * 2 : 0, sy = G.shake ? (rnd() - 0.5) * G.shake * 2 : 0;
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, PANEL); ctx.clip(); ctx.translate(sx, sy);
  ctx.drawImage(bg, -10, -10, W + 20, PANEL + 20);
  if (G.superFlash > 0) { ctx.fillStyle = 'rgba(20,0,40,0.65)'; ctx.fillRect(-20, -20, W + 40, PANEL + 40); }
  const [A, B] = G.f;
  for (const F of G.f) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; const k = clamp(1 - (GY - F.y) / 300, 0.3, 1); ctx.beginPath(); ctx.ellipse(F.x, GY + 4, 46 * k, 10 * k, 0, 0, 7); ctx.fill(); }
  const order = (A.state === 'attack') ? [B, A] : [A, B];
  for (const F of order) drawFighter(F);
  for (const p of parts) { ctx.globalAlpha = Math.max(0, p.life / p.max);
    if (p.ring) { ctx.strokeStyle = p.col; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.stroke(); }
    else { ctx.strokeStyle = p.col; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 2, p.y - p.vy * 2); ctx.stroke(); } }
  ctx.globalAlpha = 1;
  if (G.superFlash > 0) { const F = G.superBy; txt('BRO RUSH', W/2, 250, 64, '#ff3ad1'); ctx.globalAlpha = 0.5; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(F.x, F.y - 80, 40 + (40 - G.superFlash) * 6, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
  ctx.restore();
  for (const p of G.pops) { ctx.globalAlpha = Math.min(1, p.life / 15); txt(p.txt, clamp(p.x, 90, W - 90), p.y, 26, p.col); } ctx.globalAlpha = 1;
  hud();
  if (G.big) { const b = G.big, t = 1 - b.life / b.max, sc = t < 0.15 ? 2 - t / 0.15 : 1; ctx.save(); ctx.translate(W/2, 330); ctx.scale(sc, sc); txt(b.txt, 0, 0, b.size, b.col, 'center', b.size / 6); ctx.restore(); }
  controls();
  if (G.mode === 'over') overScreen();
  if (qs.get('fps')) txt(G.fps.toFixed(0) + ' fps', W - 10, 120, 16, '#0f0', 'right', 3);
}
function titleScreen(){
  ctx.drawImage(bg, 0, 0, W, PANEL); ctx.fillStyle = 'rgba(10,5,30,0.55)'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#0a0618'; ctx.fillRect(0, PANEL, W, H - PANEL);
  txt('BROBOTS', W/2, 110, 84, '#2ad4ff', 'center', 12); txt('vs HUMANS vs', W/2, 178, 40, '#fff', 'center', 8); txt('ALIENS', W/2, 240, 84, '#8cff3a', 'center', 12);
  const lines = [['HOW TO PLAY', '#ffd23f', 30], ['Left thumb: drag the stick to walk, jump, crouch', '#fff', 19], ['Hold away from your enemy to block', '#fff', 19],
    ['Hold down plus away to block low sweeps', '#fff', 19], ['Right thumb: LP jab, HP punch, LK kick, HK big kick', '#fff', 19],
    ['Heavy hits are slow but wreck balance', '#fff', 19], ['Empty the blue balance bar to knock them down', '#fff', 19],
    ['Walk or jump in while striking to hit harder', '#fff', 19], ['Fill the pink meter, tap SUPER once per match', '#ff3ad1', 19],
    ['Keyboard: WASD move, U I J K attack, L super', 'rgba(255,255,255,0.7)', 16]];
  let y = 310; for (const [t, c, s] of lines) { txt(t, W/2, y, s, c, 'center', 4); y += s + 16; }
  txt('CPU LEVEL', W/2, 712, 22, '#fff', 'center', 4);
  for (const d in DBTN) { const b = DBTN[d], on = G.diff === d; ctx.fillStyle = '#111'; rr(b.x, b.y, b.w, b.h, 14); ctx.fill();
    ctx.fillStyle = on ? '#ffd23f' : '#3a2a6a'; rr(b.x + 3, b.y + 3, b.w - 6, b.h - 6, 11); ctx.fill(); txt(d.toUpperCase(), b.x + b.w / 2, b.y + b.h / 2, 24, on ? '#111' : '#fff', 'center', on ? 0.01 : 4); }
  const pulse = 1 + Math.sin(G.frame * 0.1) * 0.05;
  ctx.save(); ctx.translate(W/2, 880); ctx.scale(pulse, pulse); ctx.fillStyle = '#111'; rr(-170, -42, 340, 84, 24); ctx.fill(); ctx.fillStyle = '#ff3d7f'; rr(-165, -37, 330, 74, 20); ctx.fill();
  txt('TAP TO FIGHT', 0, 0, 40, '#fff', 'center', 7); ctx.restore();
}
function overScreen(){
  ctx.fillStyle = 'rgba(10,5,30,0.7)'; ctx.fillRect(0, 0, W, H);
  const c = G.champ; txt(c ? c.skin.name : 'NOBODY', W/2, 300, 90, c ? c.skin.body : '#fff', 'center', 12); txt('WINS', W/2, 390, 80, '#fff', 'center', 12);
  if (c && c.i === 0) txt('NICE WORK', W/2, 470, 34, '#ffd23f'); else txt('RUN IT BACK', W/2, 470, 34, '#ffd23f');
  if (G.overT > 40) { ctx.fillStyle = '#111'; rr(W/2 - 160, 640, 320, 90, 24); ctx.fill(); ctx.fillStyle = '#ff3d7f'; rr(W/2 - 155, 645, 310, 80, 20); ctx.fill(); txt('REMATCH', W/2, 685, 44, '#fff', 'center', 7);
    txt('Tap above for title screen', W/2, 790, 18, 'rgba(255,255,255,0.7)', 'center', 3); }
}

// ---------------- LOOP ----------------
let last = performance.now(), acc = 0, fpsAcc = 0, fpsN = 0;
function loop(now){
  const dt = Math.min(100, now - last); last = now; acc += dt; fpsAcc += dt; fpsN++;
  if (fpsAcc > 500) { G.fps = fpsN * 1000 / fpsAcc; fpsAcc = 0; fpsN = 0; }
  let n = 0; while (acc >= 1000 / 60 && n < 4) { tick(); acc -= 1000 / 60; n++; } if (n === 4) acc = 0;
  render(); requestAnimationFrame(loop);
}
G.start = () => newMatch();
if (G.auto) newMatch();
requestAnimationFrame(loop);
})();
