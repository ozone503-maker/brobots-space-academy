import * as THREE from 'three';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { RoundedBoxGeometry } from './vendor/RoundedBoxGeometry.js';

const TZ = 'Pacific/Honolulu';
const qs = new URLSearchParams(location.search);
const DEMO = qs.has('demo');
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const AV = {violet:0xa58be0,cyan:0x6fd0d8,red:0xe07a5f,green:0x7cc08a,black:0x7d8592,blue:0x78a6e6,magenta:0xd88bc6,orange:0xf0a35a,yellow:0xe8cf6a,brown:0xc49a6c,gray:0xb8bcc2,sparkle:0xa7e0b5};
const ST = { working:{label:'Working',cls:'working',hex:0x5fd3bf}, recent:{label:'Recently active',cls:'recent',hex:0x8db8ff}, needs:{label:'Needs you',cls:'needs',hex:0xffc04d}, idle:{label:'Idle',cls:'idle',hex:0x9aa1ad} };
const RECENT_MS = 6*3600e3;
// page mode: the scrolling FACTORY FLOOR showpiece on brobots.space. Compact mode: the one screen office
const PAGE = document.body.dataset.ff === 'page';
const DATA_URLS = PAGE ? ['https://brobots-office.vercel.app/status.json', '/ff/status.json'] : ['status.json'];
const setT = (sel, v) => { const e = $(sel); if (e) e.textContent = v; };

/* ---------------- stage fit: one screen, no scrolling ---------------- */
const stage = $('#stage');
let stageScale = 1;
function fit(){
  if (PAGE){ stageScale = 1; resizeGL(); return; }
  const vw = innerWidth, vh = innerHeight, port = vh > vw * 1.05;
  const W = port ? 1000 : 1600;
  const H = Math.round(Math.min(port ? 1700 : 1150, Math.max(port ? 1150 : 860, W * vh / vw)));
  stage.classList.toggle('port', port); stage.classList.toggle('land', !port);
  stage.style.width = W + 'px'; stage.style.height = H + 'px';
  stageScale = Math.min(vw / W, vh / H);
  stage.style.transform = `translate(${(vw - W*stageScale)/2}px,${(vh - H*stageScale)/2}px) scale(${stageScale})`;
  resizeGL();
}

/* ---------------- time and shifts ---------------- */
function hiParts(){
  const p = new Intl.DateTimeFormat('en-US',{timeZone:TZ,hour:'numeric',minute:'2-digit',hour12:false}).formatToParts(new Date());
  const h = +p.find(x=>x.type==='hour').value % 24, m = +p.find(x=>x.type==='minute').value;
  return h + m/60;
}
function phaseNow(){
  const f = qs.get('phase'); if (['dawn','day','evening','night'].includes(f)) return f;
  const t = hiParts();
  if (t >= 5.5 && t < 7) return 'dawn'; if (t >= 7 && t < 17.5) return 'day'; if (t >= 17.5 && t < 19.5) return 'evening'; return 'night';
}
function shiftName(){ const t = hiParts(); if (t >= 5.5 && t < 7) return 'Dawn shift'; if (t >= 7 && t < 17.5) return 'Day shift'; if (t >= 17.5 && t < 21) return 'Swing shift'; return 'Night shift'; }
const fmtTime = d => d.toLocaleTimeString('en-US',{timeZone:TZ,hour:'numeric',minute:'2-digit'}).toLowerCase();
const fmtDay = d => d.toLocaleDateString('en-US',{timeZone:TZ,month:'short',day:'numeric'});
function lastDate(b){ if (!b.lastActive) return null; return b.lastActivePrecision === 'day-utc' ? new Date(b.lastActive + 'T12:00:00Z') : new Date(b.lastActive); }
// a day-level record covers one UTC day, which runs 2 pm to 2 pm in Hawaii
function utcDayText(b, long){
  const start = new Date(b.lastActive + 'T00:00:00Z');
  if (fmtDay(start) === fmtDay(new Date())) return long ? 'after 2 pm today' : 'After 2 pm';
  return (long ? 'around ' : '') + start.toLocaleDateString('en-US',{timeZone:'UTC',month:'short',day:'numeric'});
}
function lastText(b){
  const d = lastDate(b); if (!d) return 'No activity on record';
  if (b.lastActivePrecision === 'day-utc') return utcDayText(b, true);
  const mins = (Date.now() - d) / 6e4;
  if (mins < 90) return Math.max(1, Math.round(mins)) + ' min ago';
  if (mins < 60*20) return Math.round(mins/60) + ' h ago';
  return fmtDay(d) + ', ' + fmtTime(d) + ' HST';
}
const ago = d => { const m = Math.round((Date.now() - d)/6e4); if (m < 2) return 'just now'; if (m < 90) return m + ' min ago'; if (m < 2880) return Math.round(m/60) + ' h ago'; return Math.round(m/1440) + ' days ago'; };

/* ---------------- data ---------------- */
let data = null, crew = [], selected = null, userPickedAt = 0;
// recently active: last activity within about 6 hours. Day-level records count only while that UTC day ended under 6 hours ago
function isRecent(b){
  if (!b.lastActive) return false;
  if (b.lastActivePrecision === 'day-utc') return Date.now() - (new Date(b.lastActive + 'T00:00:00Z').getTime() + 864e5) < RECENT_MS;
  return Date.now() - new Date(b.lastActive) < RECENT_MS;
}
function deriveState(b, gen){
  const stale = !DEMO && (Date.now() - gen) > 2*3600e3;
  if (b.state === 'working' && !stale) return 'working';
  if (b.state === 'needs-you') return 'needs';
  if (b.state === 'unknown') return 'idle';
  return isRecent(b) ? 'recent' : 'idle';
}
function demoize(d){
  const pick = ['working','working','working','needs-you','idle','idle','idle','idle'];
  d.bots.forEach(b => { b.state = pick[Math.floor(Math.random()*pick.length)]; b.task = 'Demo task, not real'; b.lastActive = new Date(Date.now() - Math.random()*3e6).toISOString(); b.lastActivePrecision = 'time'; });
  d.generatedAt = new Date().toISOString(); return d;
}
async function getStatus(){
  let err;
  for (const u of DATA_URLS){
    try { const r = await fetch(u + '?t=' + Date.now(), {cache:'no-store'}); if (!r.ok) throw new Error(r.status); return await r.json(); }
    catch (e) { err = e; }
  }
  throw err;
}
async function load(){
  try {
    let d = await getStatus(); if (DEMO) d = demoize(d);
    data = d; const gen = new Date(d.generatedAt);
    crew = d.bots.map(b => ({...b, ds: deriveState(b, gen), noData: b.state === 'unknown'}));
    renderPanel(); syncBots();
  } catch (e) { setT('#snap', 'Could not load status.json, so nothing is shown rather than guessed. Retrying every 5 minutes'); }
}

/* ---------------- side panel ---------------- */
const ORDER = {needs:0, working:1, recent:2, idle:3};
function pillFor(b){ return b.noData ? '<span class="pill idle">No data</span>' : `<span class="pill ${ST[b.ds].cls}">${ST[b.ds].label}</span>`; }
function renderPanel(){
  const n = k => crew.filter(b => b.ds === k).length;
  setT('#n-work', n('working')); setT('#n-recent', n('recent')); setT('#n-need', n('needs')); setT('#n-idle', n('idle'));
  setT('#team-sub', crew.length + ' bots');
  const sorted = [...crew].sort((a,b) => ORDER[a.ds]-ORDER[b.ds] || (lastDate(b)||0) - (lastDate(a)||0));
  $('#team').innerHTML = sorted.map(b => `<li data-n="${esc(b.name)}" class="${selected===b.name?'sel':''}"><i class="dot ${ST[b.ds].cls}"></i><span class="n">${esc(b.name)}</span>${pillFor(b)}<span class="t">${b.ds === 'idle' && !b.noData ? 'On the floor. Last: ' : ''}${esc(b.task)}</span><span class="la">${b.site ? 'Site ' + esc(b.site) + '. ' : 'General station. '}${esc(b.noData ? 'No sessions yet' : 'Last active ' + lastText(b))}</span></li>`).join('');
  $('#team').querySelectorAll('li').forEach(li => li.addEventListener('click', () => select(li.dataset.n, true)));
  const feed = [...crew].filter(b => lastDate(b)).sort((a,b) => lastDate(b) - lastDate(a)).slice(0, PAGE ? 12 : 4);
  const verb = {needs:'is waiting on you', working:'is on it', recent:'was active', idle:'last did this'};
  $('#feed').innerHTML = feed.map(b => { const d = lastDate(b), today = fmtDay(d) === fmtDay(new Date());
    return `<li><time>${b.lastActivePrecision === 'day-utc' ? utcDayText(b) : today ? fmtTime(d) : fmtDay(d)}</time><span><b>${esc(b.name)}</b> ${verb[b.ds]}. ${esc(b.task)}</span></li>`; }).join('');
  const gen = new Date(data.generatedAt);
  setT('#snap', (DEMO ? 'Demo data, not real. ' : '') + `Snapshot from ${fmtDay(gen)}, ${fmtTime(gen)} HST, ${ago(gen)}`);
  const wk = data.weekly;
  setT('#usage', wk && wk.usedPct != null ? `Weekly usage ${wk.usedPct}% of the limit, resets ${new Date(wk.resetsAt).toLocaleString('en-US',{timeZone:TZ,weekday:'short',month:'short',day:'numeric'})}` : '');
  renderSites();
  if (!selected || !crew.find(b => b.name === selected)) autoSelect(); else renderDetail();
}
function siteRows(){
  return (data.sites || []).map(s => ({...s, crew: crew.filter(b => b.site === s.domain).sort((a,b) => ORDER[a.ds]-ORDER[b.ds])}));
}
function siteState(s){
  if (!s.crew.length) return {cls:'none', label:'Empty bay'};
  const k = ['needs','working','recent'].find(k => s.crew.some(b => b.ds === k));
  return k ? {cls:ST[k].cls, label:ST[k].label} : {cls:'idle', label:'Quiet'};
}
function renderSites(){
  const rows = siteRows();
  const el = $('#sites');
  if (el) el.innerHTML = rows.map(s => { const st = siteState(s);
    return `<li style="--acc:${esc(s.accent)}" title="${esc(s.crew.map(b => b.name + ', ' + ST[b.ds].label).join('; ') || 'No bot linked yet')}"><span class="dm">${esc(s.domain)}</span><span class="ds">${s.crew.map(b => `<i class="dot ${ST[b.ds].cls}"></i>`).join('') || '<em>none yet</em>'}</span></li>`; }).join('');
  const grid = $('#sites-grid');
  if (grid) grid.innerHTML = rows.map(s => { const st = siteState(s);
    const list = s.crew.map(b => `<li data-n="${esc(b.name)}"><i class="dot ${ST[b.ds].cls}"></i><span class="n">${esc(b.name)}</span>${pillFor(b)}<span class="t">${esc(b.task)}</span></li>`).join('');
    return `<article class="bay-card ${st.cls}" style="--acc:${esc(s.accent)}"><div class="bay-head"><h3>${esc(s.domain)}</h3><span class="pill ${st.cls === 'none' ? 'idle' : st.cls}">${esc(st.label)}</span></div>
      ${list ? `<ul class="bay-bots">${list}</ul>` : '<p class="bay-empty">No bot has touched this site in its recent work, so the bay is empty. Nothing is guessed</p>'}
      <a class="ff-btn ghost" href="https://${esc(s.domain)}" rel="noopener">Visit ${esc(s.domain)}</a></article>`; }).join('');
  if (grid) grid.querySelectorAll('li[data-n]').forEach(li => li.addEventListener('click', () => { select(li.dataset.n, true); const h = $('#hero'); if (h) h.scrollIntoView({behavior: REDUCED ? 'auto' : 'smooth'}); }));
  setT('#site-evidence', data.siteEvidence || '');
}
function renderDetail(){
  const b = crew.find(x => x.name === selected); if (!b) return;
  const cap = b.noData ? 'No sessions yet, so nothing to show' :
    b.ds === 'working' ? 'In progress. Steps are not tracked, so no percent is shown' :
    b.ds === 'needs' ? 'Blocked until you reply, since ' + lastText(b) :
    b.ds === 'recent' ? 'Last active ' + lastText(b) + ', so it sits at a desk for now. Steps are not tracked' :
    'On the floor between jobs, not on a task. Last active ' + lastText(b);
  $('#detail').innerHTML = `<div class="top"><h3>${esc(b.name)}</h3>${pillFor(b)}</div><p>${esc(b.task)}</p><p class="meta site">${b.site ? 'Works on ' + esc(b.site) : 'General station, no single site'}</p>
    <div class="prog ${ST[b.ds].cls}"><i></i></div><p class="meta">${esc(cap)}</p>`;
  document.querySelectorAll('#team li').forEach(li => li.classList.toggle('sel', li.dataset.n === selected));
}
function select(name, byUser){ selected = name; if (byUser) userPickedAt = Date.now(); renderDetail(); }
let autoIdx = 0;
function autoSelect(){
  const pool = crew.filter(b => b.ds !== 'idle');
  const list = pool.length ? pool : crew; if (!list.length) return;
  selected = list[autoIdx++ % list.length].name; renderDetail();
}
setInterval(() => { if (Date.now() - userPickedAt > 60000 && crew.length) autoSelect(); }, 9000);
// gentle auto scroll of the team list so a wall display shows everyone
setInterval(() => {
  const t = $('#team'); if (!t || t.matches(':hover')) return;
  const max = t.scrollHeight - t.clientHeight; if (max <= 2) return;
  const next = t.scrollTop + 52; t.scrollTo({top: next > max + 40 ? 0 : Math.min(next, max), behavior: REDUCED ? 'auto' : 'smooth'});
}, 3500);

/* ---------------- three.js factory ---------------- */
const canvas = $('#gl');
let renderer;
try { renderer = new THREE.WebGLRenderer({canvas, antialias:true, powerPreference:'high-performance'}); }
catch (e) { $('#gl-fallback').hidden = false; }
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-10,10,10,-10,0.1,300);
const CAM_DIR = new THREE.Vector3(0.62, 0.82, 1).normalize();
const TARGET = new THREE.Vector3(0.5, 1.5, 0);
camera.position.copy(TARGET).addScaledVector(CAM_DIR, 90); camera.lookAt(TARGET); camera.updateMatrixWorld();
if (renderer){
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
}
scene.background = new THREE.Color(0x16141a);

function resizeGL(){
  if (!renderer) return;
  const fv = $('#floorview'), w = fv.clientWidth, h = fv.clientHeight; if (!w || !h) return; fvW = w; fvH = h;
  let pr = Math.min(2, (devicePixelRatio || 1) * stageScale);
  const maxPx = 3.2e6; if (w*h*pr*pr > maxPx) pr = Math.sqrt(maxPx/(w*h));
  renderer.setPixelRatio(pr); renderer.setSize(w, h, false);
  // fit the room into the view
  const pts = [];
  for (const x of [-16,16]) for (const z of [-12,12]) for (const y of [0, (x<0||z<0)?12:0]) pts.push(new THREE.Vector3(x,y,z));
  pts.push(new THREE.Vector3(16,12,-12), new THREE.Vector3(-16,12,12));
  let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
  for (const p of pts){ const v = p.clone().applyMatrix4(camera.matrixWorldInverse); a = Math.min(a,v.x); b = Math.max(b,v.x); c = Math.min(c,v.y); d = Math.max(d,v.y); }
  const port = PAGE ? h > w * 1.05 : stage.classList.contains('port');
  const padTop = port ? 0.1 : 0.06;
  let cw = b - a, ch = (d - c) * (1 + padTop), aspect = w / h;
  const zoomIn = port ? 0.93 : 1.0; // crop a little of the empty corners
  if (cw / ch > aspect) ch = cw / aspect; else cw = ch * aspect;
  cw *= zoomIn; ch *= zoomIn;
  // showpiece hero: crop a little more of the empty corners so the floor reads bigger
  let shift = 0;
  if (PAGE && !port){ cw *= .94; ch *= .94; }
  const cx = (a + b) / 2 + shift, cy = (c + d) / 2 + (d - c) * padTop * 0.5 - (port ? (d-c)*0.04 : 0);
  camera.left = cx - cw/2; camera.right = cx + cw/2; camera.top = cy + ch/2; camera.bottom = cy - ch/2;
  camera.updateProjectionMatrix();
  tagScale = w / cw;
}
let tagScale = 30, fvW = 1, fvH = 1;

/* textures */
function canvasTex(w, h, draw, repeat){
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat){ t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
const glowTex = canvasTex(128,128,(g,w,h)=>{ const r = g.createRadialGradient(64,64,0,64,64,64); r.addColorStop(0,'rgba(255,255,255,1)'); r.addColorStop(.35,'rgba(255,255,255,.45)'); r.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0,0,w,h); });
const floorTex = canvasTex(512,512,(g,w,h)=>{
  g.fillStyle = '#3a3b41'; g.fillRect(0,0,w,h);
  for (let i = 0; i < 4000; i++){ g.fillStyle = `rgba(${Math.random()<.5?255:0},${Math.random()<.5?255:0},${Math.random()<.5?255:0},.025)`; g.fillRect(Math.random()*w, Math.random()*h, 2, 2); }
  g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 3; g.strokeRect(1.5,1.5,w-3,h-3);
  g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 2; g.strokeRect(5,5,w-10,h-10);
  g.fillStyle = 'rgba(200,205,212,.35)'; for (const [x,y] of [[14,14],[w-14,14],[14,h-14],[w-14,h-14]]){ g.beginPath(); g.arc(x,y,4,0,7); g.fill(); }
}, [8,6]);
const wallTex = canvasTex(512,512,(g,w,h)=>{
  const lg = g.createLinearGradient(0,0,w,0); lg.addColorStop(0,'#2b2c33'); lg.addColorStop(.5,'#34353d'); lg.addColorStop(1,'#2a2b31'); g.fillStyle = lg; g.fillRect(0,0,w,h);
  g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 4; g.strokeRect(2,2,w-4,h-4);
  g.fillStyle = 'rgba(200,205,212,.3)'; for (let y = 16; y < h; y += 48){ g.beginPath(); g.arc(14,y,3.5,0,7); g.fill(); g.beginPath(); g.arc(w-14,y,3.5,0,7); g.fill(); }
}, [6,2]);
const holoTex = canvasTex(256,160,(g,w,h)=>{
  g.fillStyle = 'rgba(70,210,190,.22)'; g.fillRect(0,0,w,h);
  g.strokeStyle = 'rgba(140,255,235,.95)'; g.lineWidth = 4; g.strokeRect(4,4,w-8,h-8);
  g.fillStyle = 'rgba(160,255,240,.9)';
  for (let i = 0; i < 6; i++){ g.fillRect(20, 22 + i*20, 60 + Math.random()*140, 7); }
  g.fillStyle = 'rgba(255,200,120,.9)'; g.fillRect(190, 26, 40, 40);
});

/* volcano view, repainted per phase */
const VIEW = { day:{sky:['#5d9fd6','#a9d3ea','#e8efe2'],far:'#7793a3',shield:['#4d4a4a','#2f2c2d'],plume:'rgba(222,216,208,', jungle:['#3e7d52','#2a6040','#1d4a30'], fg:'#173b27', flowCore:'#ffcf6a', glow:.55, stars:0 },
  dawn:{sky:['#5e5f98','#e49b7a','#f5d0a0'],far:'#5e607a',shield:['#3e3639','#26211f'],plume:'rgba(215,180,170,', jungle:['#335a45','#26503b','#1a4030'], fg:'#122f20', flowCore:'#ffd27a', glow:.75, stars:.2 },
  evening:{sky:['#272a5c','#a75a5c','#f09d5c'],far:'#3b3a55',shield:['#2c2529','#191416'],plume:'rgba(120,80,90,', jungle:['#25463a','#1c3a30','#132e25'], fg:'#0c2219', flowCore:'#ffd480', glow:.9, stars:.4 },
  night:{sky:['#050a1c','#121a3a','#2a2140'],far:'#141a2c',shield:['#16110f','#0c0908'],plume:'rgba(70,45,50,', jungle:['#0f2219','#0c1c15','#08150f'], fg:'#050f0a', flowCore:'#ffe08a', glow:1, stars:1 } };
const VW = 2048, VH = 672, CRATER = {u:.56, v:.6};
function paintView(phase){
  const P = VIEW[phase], c = viewCanvas, g = c.getContext('2d'); const W = VW, H = VH; let s = 7;
  const r = () => (s = (s*16807) % 2147483647) / 2147483647;
  g.save(); g.clearRect(0,0,W,H);
  let lg = g.createLinearGradient(0,0,0,H*.75); lg.addColorStop(0,P.sky[0]); lg.addColorStop(.6,P.sky[1]); lg.addColorStop(1,P.sky[2]); g.fillStyle = lg; g.fillRect(0,0,W,H);
  if (P.stars){ g.fillStyle = `rgba(255,255,255,${.8*P.stars})`; for (let i = 0; i < 160; i++){ g.fillRect(r()*W, r()*H*.45, r()*2+.6, r()*2+.6); } }
  // sun or moon
  g.fillStyle = phase === 'night' ? '#e8ecf6' : phase === 'day' ? '#fff6cf' : '#ffc98a';
  g.beginPath(); g.arc(W*.18, H*(phase==='day'?.16:.3), phase==='night'?22:34, 0, 7); g.fill();
  // Mauna Loa, far and hazy
  g.fillStyle = P.far; g.beginPath(); g.moveTo(0,H*.56); g.bezierCurveTo(W*.25,H*.44,W*.5,H*.4,W*.75,H*.43); g.bezierCurveTo(W*.88,H*.45,W*.95,H*.5,W,H*.53); g.lineTo(W,H); g.lineTo(0,H); g.fill();
  // lava glow on the sky
  const cx = W*CRATER.u, cy = H*CRATER.v;
  g.globalCompositeOperation = 'lighter';
  let rg = g.createRadialGradient(cx,cy,10,cx,cy,W*.42); rg.addColorStop(0,`rgba(255,120,40,${.55*P.glow})`); rg.addColorStop(.4,`rgba(255,90,30,${.22*P.glow})`); rg.addColorStop(1,'rgba(255,80,20,0)');
  g.fillStyle = rg; g.fillRect(0,0,W,H); g.globalCompositeOperation = 'source-over';
  // plume, billowing up and drifting with the trades
  for (let i = 0; i < 46; i++){
    const t = i/46, px = cx + Math.sin(i*1.7)*30 + t*t*W*.22, py = cy - 20 - t*H*.62, pr = 30 + t*120 + r()*30;
    const pg = g.createRadialGradient(px,py+pr*.4,pr*.1,px,py,pr);
    pg.addColorStop(0, phase==='day' ? 'rgba(240,236,230,.55)' : `rgba(255,140,70,${.5*P.glow*(1-t)})`);
    pg.addColorStop(.6, P.plume + (.45 - t*.25) + ')'); pg.addColorStop(1, P.plume + '0)');
    g.fillStyle = pg; g.beginPath(); g.arc(px,py,pr,0,7); g.fill();
  }
  // Kilauea shield with the caldera
  lg = g.createLinearGradient(0,H*.55,0,H); lg.addColorStop(0,P.shield[0]); lg.addColorStop(1,P.shield[1]);
  g.fillStyle = lg; g.beginPath(); g.moveTo(W*.12,H*.78); g.bezierCurveTo(W*.3,H*.64,W*.42,H*.6,W*.48,H*.6);
  g.lineTo(W*.5,H*.625); g.lineTo(W*.63,H*.625); g.lineTo(W*.65,H*.6); g.bezierCurveTo(W*.74,H*.6,W*.88,H*.64,W,H*.7); g.lineTo(W,H); g.lineTo(W*.12,H); g.fill();
  // lava lake
  g.shadowColor = '#ff7a22'; g.shadowBlur = 40;
  lg = g.createLinearGradient(0,cy,0,cy+16); lg.addColorStop(0,'#fff0a0'); lg.addColorStop(1,'#ff7a1f');
  g.fillStyle = lg; g.beginPath(); g.ellipse(cx, cy+12, W*.055, 9, 0, 0, 7); g.fill();
  // lava fountain arcs
  for (let i = 0; i < 70; i++){
    const a = (r()-.5)*1.2, hgt = H*(.12 + r()*.22), sx = cx + (r()-.5)*40;
    g.strokeStyle = i%3 ? `rgba(255,${140+Math.floor(r()*90)},40,.85)` : 'rgba(255,240,160,.95)'; g.lineWidth = 2 + r()*4;
    g.beginPath(); g.moveTo(sx, cy+8); g.quadraticCurveTo(sx + a*90, cy - hgt*1.6, sx + a*210, cy + 6 - r()*hgt*.4); g.stroke();
  }
  g.fillStyle = '#fff4b8'; g.beginPath(); g.ellipse(cx, cy-30, 20, 46, 0, 0, 7); g.fill();
  // glowing flows running down toward us
  const flows = [[cx-30,[W*.44,H*.72,W*.38,H*.84,W*.3,H*.98]],[cx+20,[W*.6,H*.73,W*.66,H*.82,W*.7,H*.99]],[cx-5,[W*.55,H*.74,W*.5,H*.86,W*.53,H*.99]]];
  for (const [sx, p] of flows){
    g.shadowBlur = 26; g.strokeStyle = phase==='day' ? 'rgba(230,90,30,.9)' : '#ff6a1a'; g.lineWidth = 12; g.lineCap = 'round';
    g.beginPath(); g.moveTo(sx, cy+16); g.bezierCurveTo(...p); g.stroke();
    g.shadowBlur = 8; g.strokeStyle = P.flowCore; g.lineWidth = 3.5; g.beginPath(); g.moveTo(sx, cy+16); g.bezierCurveTo(...p); g.stroke();
  }
  g.shadowBlur = 0;
  // jungle canopy band
  for (let k = 0; k < 3; k++){
    g.fillStyle = P.jungle[k];
    for (let x = -40; x < W + 60; x += 26 + r()*34){
      const base = H*(.86 + k*.05), rad = 26 + r()*34 - k*4;
      if (k < 2 && x > W*.36 && x < W*.74 && r() < .75) continue;
      g.beginPath(); g.arc(x, base - r()*24, rad, 0, 7); g.fill();
    }
    g.fillRect(0, H*(.9 + k*.04), W, H);
  }
  // foreground framing: ohia on the left, hapuu tree ferns on the right
  const rim = phase === 'day' ? 0 : .5;
  function ohia(x, y, sc){
    g.strokeStyle = P.fg; g.lineWidth = 20*sc; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, H); g.bezierCurveTo(x+30*sc, y+260*sc, x-40*sc, y+140*sc, x+20*sc, y+40*sc); g.stroke();
    g.lineWidth = 10*sc; g.beginPath(); g.moveTo(x+5*sc, y+170*sc); g.quadraticCurveTo(x+90*sc, y+120*sc, x+150*sc, y+60*sc); g.stroke();
    const blobs = [];
    for (let i = 0; i < 26; i++) blobs.push([x + (r()-.3)*240*sc, y + (r()-.5)*110*sc, (26 + r()*36)*sc]);
    g.fillStyle = P.fg; for (const [bx,by,br] of blobs){ g.beginPath(); g.arc(bx,by,br,0,7); g.fill(); }
    if (rim){ g.fillStyle = `rgba(255,120,50,${.12*rim})`; for (const [bx,by,br] of blobs){ g.beginPath(); g.arc(bx+br*.3,by-br*.2,br*.6,0,7); g.fill(); } }
    for (let i = 0; i < 40; i++){ const [bx,by,br] = blobs[i % blobs.length]; g.fillStyle = phase==='night' ? 'rgba(150,50,45,.6)' : 'rgba(205,62,52,.85)';
      g.beginPath(); g.arc(bx + (r()-.5)*br*1.4, by - r()*br*.9, 3.5*sc + r()*3*sc, 0, 7); g.fill(); }
  }
  function hapuu(x, y, sc){
    g.strokeStyle = P.fg; g.lineWidth = 16*sc; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, H); g.lineTo(x + 8*sc, y); g.stroke();
    for (let k = 0; k < 9; k++){
      const ang = -Math.PI*.95 + k*(Math.PI*.9/8), len = (150 + r()*50)*sc;
      const ex = x + Math.cos(ang)*len, ey = y + Math.sin(ang)*len*.55 + len*.35;
      const mx = x + Math.cos(ang)*len*.5, my = y + Math.sin(ang)*len*.75 - 10*sc;
      g.lineWidth = 5*sc; g.beginPath(); g.moveTo(x+8*sc, y); g.quadraticCurveTo(mx, my, ex, ey); g.stroke();
      g.lineWidth = 3*sc;
      for (let j = 1; j < 12; j++){ const t = j/12, qx = (1-t)*(1-t)*(x+8*sc) + 2*(1-t)*t*mx + t*t*ex, qy = (1-t)*(1-t)*y + 2*(1-t)*t*my + t*t*ey;
        const pl = (26 - j*1.4)*sc; g.beginPath(); g.moveTo(qx,qy); g.lineTo(qx + pl*.5, qy + pl); g.moveTo(qx,qy); g.lineTo(qx - pl*.5, qy + pl); g.stroke(); }
    }
  }
  ohia(W*.04, H*.2, 1.25); hapuu(W*.2, H*.62, .9);
  hapuu(W*.93, H*.28, 1.25); ohia(W*.8, H*.42, .8); hapuu(W*.74, H*.7, .7);
  // ferns along the bottom edge
  g.strokeStyle = P.fg; g.lineWidth = 5;
  for (let x = 0; x < W; x += 30 + r()*30){ const y = H - r()*10, sz = 30 + r()*40;
    g.beginPath(); g.moveTo(x,y); g.quadraticCurveTo(x - sz*.6, y - sz, x - sz, y - sz*.3); g.moveTo(x,y); g.quadraticCurveTo(x + sz*.6, y - sz*1.1, x + sz*1.1, y - sz*.4); g.stroke(); }
  g.restore();
  viewTex.needsUpdate = true;
}
const viewCanvas = document.createElement('canvas'); viewCanvas.width = VW; viewCanvas.height = VH;
const viewTex = new THREE.CanvasTexture(viewCanvas); viewTex.colorSpace = THREE.SRGBColorSpace; viewTex.anisotropy = 8;

/* materials */
const M = {
  steel: new THREE.MeshStandardMaterial({color:0x2c2d33, metalness:.7, roughness:.45}),
  steelL: new THREE.MeshStandardMaterial({color:0x4a4c54, metalness:.75, roughness:.4}),
  floor: new THREE.MeshStandardMaterial({map:floorTex, metalness:.55, roughness:.6, color:0xd6d6d6}),
  wall: new THREE.MeshStandardMaterial({map:wallTex, metalness:.5, roughness:.55}),
  copper: new THREE.MeshStandardMaterial({color:0xc27a44, metalness:1, roughness:.32}),
  pewter: new THREE.MeshStandardMaterial({color:0xa9afb7, metalness:1, roughness:.35}),
  rubber: new THREE.MeshStandardMaterial({color:0x1b1b1f, roughness:.9}),
  botBody: new THREE.MeshStandardMaterial({color:0xe9ecf0, metalness:.25, roughness:.32}),
  visor: new THREE.MeshStandardMaterial({color:0x15171c, metalness:.4, roughness:.15}),
  fabric: new THREE.MeshStandardMaterial({color:0x2f5d58, roughness:.85}),
  cushion: new THREE.MeshStandardMaterial({color:0x3b6f69, roughness:.9}),
  rug: new THREE.MeshStandardMaterial({color:0x7a5a3a, roughness:1}),
  leaf: new THREE.MeshStandardMaterial({color:0x2f7a4b, roughness:.7, side:THREE.DoubleSide}),
  leaf2: new THREE.MeshStandardMaterial({color:0x3f9a5c, roughness:.7, side:THREE.DoubleSide}),
  trunk: new THREE.MeshStandardMaterial({color:0x4a3626, roughness:.9}),
  pot: new THREE.MeshStandardMaterial({color:0x8f5b34, metalness:.6, roughness:.4}),
  view: new THREE.MeshBasicMaterial({map:viewTex, toneMapped:false}),
  lava: new THREE.MeshBasicMaterial({color:0xff8a2a, toneMapped:false}),
  holo: new THREE.MeshBasicMaterial({map:holoTex, transparent:true, opacity:.85, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide, toneMapped:false}),
  holoOff: new THREE.MeshBasicMaterial({color:0x2a5d58, transparent:true, opacity:.25, depthWrite:false, side:THREE.DoubleSide}),
  lampShade: new THREE.MeshStandardMaterial({color:0xffd9a0, emissive:0xffb060, emissiveIntensity:1.4, roughness:.6}),
};
const glowSprite = (color, size, opacity=1) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex, color, transparent:true, opacity, blending:THREE.AdditiveBlending, depthWrite:false, toneMapped:false})); s.scale.set(size,size,1); return s; };
function at(m,x,y,z){ m.position.set(x,y,z); return m; }
function box(w,h,d,mat,x,y,z,parent=scene){ const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat); m.position.set(x,y,z); parent.add(m); return m; }
function cyl(rt,rb,h,mat,x,y,z,seg=16,parent=scene){ const m = new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,seg), mat); m.position.set(x,y,z); parent.add(m); return m; }

/* room shell */
const floor = new THREE.Mesh(new THREE.PlaneGeometry(32,24), M.floor); floor.rotation.x = -Math.PI/2; scene.add(floor);
box(32.6,.3,24.6,M.steel,0,-.16,0);
// copper floor trim along the open edges
box(32.6,.18,.25,M.copper,0,.02,12.2); box(.25,.18,24.6,M.copper,16.2,.02,0);
// left wall
const lw = box(.5,12,24,M.wall,-16.25,6,0);
box(.6,.35,24.2,M.copper,-15.95,.18,0); box(.6,.3,24.2,M.copper,-15.95,11.85,0);
// pipes on the left wall
for (const y of [9.4,10.1]){ const p = cyl(.16,.16,23.6,M.copper,-15.7,y,0,12); p.rotation.x = Math.PI/2; }
for (const z of [-6,4.5,10]){ cyl(.12,.12,9,M.pewter,-15.72,4.6,z,10); }
// back wall: one huge window onto Kilauea
const view = new THREE.Mesh(new THREE.PlaneGeometry(32,10.4), M.view); view.position.set(0,6.1,-12.35); scene.add(view);
box(32.6,.9,.6,M.steel,0,.45,-12.2); box(32.6,1.2,.6,M.steel,0,11.9,-12.2);
box(32.6,.18,.7,M.copper,0,.95,-12.1); box(32.6,.18,.7,M.copper,0,11.25,-12.1);
for (const x of [-10.7,-5.35,0,5.35,10.7]) box(.22,10.4,.5,M.copper,x,6.1,-12.1);
box(32,.14,.4,M.pewter,0,7.6,-12.1);
// lava fountain particles in front of the window, matching the painted crater
const CR = new THREE.Vector3(-16 + CRATER.u*32, 11.3 - CRATER.v*10.4, -12.25);
const NF = 90, fGeo = new THREE.BufferGeometry(), fPos = new Float32Array(NF*3), fVel = [];
for (let i = 0; i < NF; i++){ fVel.push({t:Math.random()*2, vx:(Math.random()-.5)*1.4, vy:2.2+Math.random()*1.8}); }
fGeo.setAttribute('position', new THREE.BufferAttribute(fPos,3));
const fountain = new THREE.Points(fGeo, new THREE.PointsMaterial({map:glowTex, color:0xffb24a, size:.42, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, toneMapped:false}));
scene.add(fountain);
const craterGlow = glowSprite(0xff7a2a, 6, .9); craterGlow.position.copy(CR).add(new THREE.Vector3(0,.6,.1)); scene.add(craterGlow);
// lava light spills into the hall
const lavaLight = new THREE.PointLight(0xff7a30, 40, 0, 1.15); lavaLight.position.set(CR.x, 5, -10.2); scene.add(lavaLight);
const floorGlow = new THREE.Mesh(new THREE.PlaneGeometry(30,13), new THREE.MeshBasicMaterial({map:glowTex, color:0xff6a20, transparent:true, opacity:.4, blending:THREE.AdditiveBlending, depthWrite:false, toneMapped:false}));
floorGlow.rotation.x = -Math.PI/2; floorGlow.position.set(CR.x, .03, -10); scene.add(floorGlow);
const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x3a3430, 1.2); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d6, 1.8); sun.position.set(-8, 20, -18); scene.add(sun);
const fill = new THREE.DirectionalLight(0xbfd0ff, .5); fill.position.set(20, 16, 20); scene.add(fill);

/* assembly line with robot arms */
const line = new THREE.Group(); scene.add(line);
box(17,.8,1.6,M.steel,-4.5,.6,-8.5,line); box(17,.12,1.3,M.rubber,-4.5,1.06,-8.5,line);
box(17,.16,.12,M.copper,-4.5,1.12,-7.7,line); box(17,.16,.12,M.copper,-4.5,1.12,-9.3,line);
for (let x = -12.5; x <= 3.5; x += 2) { box(.2,.4,1.5,M.steelL,x,.2,-8.5,line); }
box(1.6,1.1,1.8,M.copper,5,0.55,-8.5,line); // finished goods bin
const items = []; const rocketGeo = new THREE.CylinderGeometry(.16,.2,.5,12), noseGeo = new THREE.ConeGeometry(.16,.3,12), headGeo = new THREE.SphereGeometry(.22,14,10);
for (let i = 0; i < 9; i++){
  const g = new THREE.Group();
  if (i % 2){ const b = new THREE.Mesh(rocketGeo, M.pewter); b.position.y = .25; const n = new THREE.Mesh(noseGeo, M.copper); n.position.y = .65; g.add(b, n); }
  else { const h = new THREE.Mesh(headGeo, M.botBody); h.position.y = .22; const v = new THREE.Mesh(new THREE.BoxGeometry(.3,.1,.05), M.visor); v.position.set(0,.24,.2); g.add(h, v); }
  g.userData.x = -12.8 + i*(16.4/9); g.position.set(g.userData.x, 1.12, -8.5); line.add(g); items.push(g);
}
const arms = [];
for (const [i, ax] of [-9,-4.5,0].entries()){
  const base = new THREE.Group(); base.position.set(ax, 0, -10.2); line.add(base);
  cyl(.55,.7,.5,M.steelL,0,.25,0,18,base);
  const yaw = new THREE.Group(); yaw.position.y = .5; base.add(yaw);
  cyl(.3,.35,.8,M.copper,0,.4,0,14,yaw);
  const sh = new THREE.Group(); sh.position.y = .85; yaw.add(sh);
  const j1 = new THREE.Mesh(new THREE.SphereGeometry(.32,14,10), M.pewter); sh.add(j1);
  box(.28,2.1,.28,M.copper,0,1.05,0,sh);
  const el = new THREE.Group(); el.position.y = 2.1; sh.add(el);
  el.add(new THREE.Mesh(new THREE.SphereGeometry(.24,12,8), M.pewter));
  box(.22,1.6,.22,M.pewter,0,.8,0,el);
  const tool = new THREE.Group(); tool.position.y = 1.65; el.add(tool);
  cyl(.12,.2,.35,M.steelL,0,0,0,10,tool);
  const spark = glowSprite(0x9ff0ff, .9, 0); spark.position.y = .3; tool.add(spark);
  arms.push({sh, el, yaw, spark, ph:i*2.1});
}

/* launch pad with a rocket and gantry */
const pad = new THREE.Group(); pad.position.set(11.6,0,-7.6); scene.add(pad);
cyl(3.1,3.3,.35,M.steelL,0,.18,0,40,pad);
const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6,.08,8,48), M.copper); ring.rotation.x = Math.PI/2; ring.position.y = .38; pad.add(ring);
const prof = [[0,0],[.75,0],[.95,.6],[1,1.6],[1,4.6],[.9,5.6],[.62,6.5],[.3,7.2],[0,7.55]].map(([x,y]) => new THREE.Vector2(x,y));
const rocket = new THREE.Group(); rocket.position.y = .9; pad.add(rocket);
rocket.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 32), M.pewter));
for (const y of [1.4,3.2,5.1]){ const band = new THREE.Mesh(new THREE.CylinderGeometry(1.02,1.02,.22,32,1,true), M.copper); band.position.y = y; rocket.add(band); }
const nose = new THREE.Mesh(new THREE.LatheGeometry(prof.slice(-4).map(v => new THREE.Vector2(v.x*1.04, v.y)), 32), M.copper); rocket.add(nose);
for (let k = 0; k < 3; k++){ const f = new THREE.Mesh(new THREE.BoxGeometry(.12,1.6,1.1), M.copper); const a = k*Math.PI*2/3 + .5; f.position.set(Math.cos(a)*1.1, .7, Math.sin(a)*1.1); f.rotation.y = -a; rocket.add(f); }
const port = new THREE.Mesh(new THREE.CircleGeometry(.28,20), new THREE.MeshBasicMaterial({color:0x8fe9dc, toneMapped:false})); port.position.set(.68,4.2,.68); port.lookAt(10,4.2,10); rocket.add(port);
cyl(.6,.9,.6,M.steel,0,.55,0,20,pad);
const engineGlow = glowSprite(0xffa040, 2.6, .5); engineGlow.position.y = .5; pad.add(engineGlow);
const gantry = new THREE.Group(); gantry.position.set(2.9,0,-1.9); pad.add(gantry);
for (const [x,z] of [[-.6,-.6],[.6,-.6],[-.6,.6],[.6,.6]]) box(.16,9.4,.16,M.steelL,x,4.7,z,gantry);
for (let y = 1; y < 9.4; y += 1.3){ box(1.36,.1,.1,M.copper,0,y,-.6,gantry); box(1.36,.1,.1,M.copper,0,y,.6,gantry); box(.1,.1,1.36,M.copper,-.6,y,0,gantry); box(.1,.1,1.36,M.copper,.6,y,0,gantry); }
box(2.4,.22,.3,M.pewter,-1.6,6.6,.6,gantry); box(1.8,.22,.3,M.pewter,-1.4,3.6,.6,gantry);
const beacon = glowSprite(0xffc04d, .9, .9); beacon.position.y = 9.7; gantry.add(beacon);
const steam = []; for (let i = 0; i < 6; i++){ const s = new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex, color:0xdfe3e8, transparent:true, opacity:.18, depthWrite:false})); s.userData.t = i/6; pad.add(s); steam.push(s); }

/* workstations with holo screens */
const DESKS = []; const deskXs = [-8.5,-4.5,-.5,3.5], deskZs = [-4.2, 1.3];
for (const z of deskZs) for (const x of deskXs){
  const g = new THREE.Group(); g.position.set(x,0,z); scene.add(g);
  box(2.5,.12,1.2,M.steelL,0,.86,0,g); box(2.5,.06,.08,M.copper,0,.86,.62,g);
  for (const sx of [-1.1,1.1]) box(.12,.82,1,M.steel,sx,.41,0,g);
  const holo = new THREE.Mesh(new THREE.PlaneGeometry(1.5,.95), M.holoOff); holo.position.set(0,1.75,.25); g.add(holo);
  cyl(.04,.06,.4,M.pewter,0,1.1,.25,8,g);
  const kb = box(.9,.04,.3,M.steel,0,.94,.32,g);
  const deskGlow = glowSprite(0x5fe3cf, 2.4, 0); deskGlow.position.set(0,1.6,.3); g.add(deskGlow);
  DESKS.push({x, z, holo, deskGlow, spot:{x, z:z-.95, face:0}, via:[{x:x+2, z:2.9},{x:x+2, z:z-.95}]});
}

/* Jessie's office door on the left wall */
const door = new THREE.Group(); door.position.set(-15.95,0,.6); scene.add(door);
box(.3,4.6,3,M.copper,0,2.3,0,door); box(.32,4.2,2.5,new THREE.MeshStandardMaterial({color:0x6e4428, metalness:.5, roughness:.45}),.05,2.1,0,door);
const plateTex = canvasTex(256,96,(g,w,h)=>{ g.fillStyle = '#e9d4b6'; g.fillRect(0,0,w,h); g.fillStyle = '#4a2c18'; g.font = 'bold 54px "Chakra Petch", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Jessie', w/2, h/2+3); });
const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.5,.56), new THREE.MeshStandardMaterial({map:plateTex, roughness:.5})); plate.position.set(.23,3.2,0); plate.rotation.y = Math.PI/2; door.add(plate);
const knob = new THREE.Mesh(new THREE.SphereGeometry(.11,10,8), M.pewter); knob.position.set(.28,2,-.9); door.add(knob);
const doorLamp = glowSprite(0xffc04d, 1.6, .15); doorLamp.position.set(.4,4.9,0); door.add(doorLamp);
box(.3,.24,.5,M.pewter,.15,4.85,0,door);
const QUEUE = []; for (const [x,z] of [[-13.9,2.6],[-13.9,-1.4],[-12.2,.6],[-12.2,2.8],[-12.2,-1.6],[-10.5,.6],[-10.5,2.8],[-10.5,-1.6],[-13.9,4.4],[-12.2,-3.4]]) QUEUE.push({spot:{x,z,face:Math.atan2(-16-x, .6-z)}, via:[{x, z:2.9}]});

/* charging bay for sleeping bots */
const CHARGE = []; const padMat = new THREE.MeshBasicMaterial({color:0x6f86c9, transparent:true, opacity:.5, toneMapped:false});
for (let r = 0; r < 1; r++) for (let c = 0; c < 5; c++){
  const x = 7.8 + c*1.8, z = -3.2 + r*1.6;
  cyl(.55,.6,.08,M.steelL,x,.04,z,20); const p = new THREE.Mesh(new THREE.RingGeometry(.35,.48,24), padMat); p.rotation.x = -Math.PI/2; p.position.set(x,.09,z); scene.add(p);
  CHARGE.push({spot:{x,z,face:0}, via:[{x, z:2.9}]});
}

/* break room lounge */
const lounge = new THREE.Group(); scene.add(lounge);
const rug = new THREE.Mesh(new RoundedBoxGeometry(7.4,.04,5,2,.4), M.rug); rug.position.set(11.2,.02,8.1); lounge.add(rug);
const couch = new THREE.Group(); couch.position.set(11,0,4.4); lounge.add(couch);
couch.add(at(new THREE.Mesh(new RoundedBoxGeometry(5.6,.6,1.4,3,.18), M.fabric), 0,.5,0));
couch.add(at(new THREE.Mesh(new RoundedBoxGeometry(5.6,1.1,.4,3,.18), M.fabric), 0,1.05,-.55));
for (const x of [-2.9,2.9]) couch.add(at(new THREE.Mesh(new RoundedBoxGeometry(.4,.9,1.4,3,.15), M.fabric), x,.75,0));
for (const x of [-1.8,0,1.8]) couch.add(at(new THREE.Mesh(new RoundedBoxGeometry(1.7,.25,1.1,2,.1), M.cushion), x,.88,.1));
const table = new THREE.Group(); table.position.set(11.2,0,7.9); lounge.add(table);
cyl(1.1,1.1,.12,M.copper,0,.62,0,28,table); cyl(.12,.3,.6,M.steel,0,.3,0,12,table);
cyl(.12,.1,.22,new THREE.MeshStandardMaterial({color:0xeee6da}),.3,.79,.1,10,table);
// warm floor lamp
const lamp = new THREE.Group(); lamp.position.set(15,0,4.3); lounge.add(lamp);
cyl(.35,.4,.08,M.steel,0,.04,0,16,lamp); cyl(.05,.05,3,M.copper,0,1.5,0,8,lamp);
const shade = new THREE.Mesh(new THREE.CylinderGeometry(.35,.7,.7,20,1,true), M.lampShade); shade.position.y = 3.1; lamp.add(shade);
const lampLight = new THREE.PointLight(0xffb36b, 8, 0, 1.4); lampLight.position.set(15,2.9,4.6); scene.add(lampLight);
const lampGlow = glowSprite(0xffc07a, 3, .5); lampGlow.position.set(15,3,4.3); scene.add(lampGlow);
// coffee bar
const bar = new THREE.Group(); bar.position.set(15.1,0,9.6); lounge.add(bar);
box(1.2,1,2.4,M.steelL,0,.5,0,bar); box(1.25,.08,2.45,M.copper,0,1.02,0,bar);
box(.7,.9,.7,M.pewter,0,1.5,-.5,bar); const cl = glowSprite(0x7fe0d0,.5,.9); cl.position.set(-.36,1.7,-.5); bar.add(cl);

/* plants: monstera pots and hapuu tree ferns indoors */
function monstera(x,z,s=1){
  const g = new THREE.Group(); g.position.set(x,0,z); g.scale.setScalar(s); scene.add(g);
  cyl(.45,.35,.7,M.pot,0,.35,0,16,g);
  const leafGeo = new THREE.CircleGeometry(.55,10);
  for (let i = 0; i < 9; i++){ const l = new THREE.Mesh(leafGeo, i%2?M.leaf:M.leaf2); const a = i*2.4; const r = .25 + (i%3)*.15;
    l.position.set(Math.cos(a)*r, .9 + (i%4)*.32, Math.sin(a)*r); l.rotation.set(-1.0 + (i%3)*.25, a, .3); l.scale.set(1,1.35,1); g.add(l); }
  return g;
}
function treefern(x,z,s=1){
  const g = new THREE.Group(); g.position.set(x,0,z); g.scale.setScalar(s); scene.add(g);
  cyl(.6,.5,.6,M.pot,0,.3,0,16,g); cyl(.16,.22,2.6,M.trunk,0,1.9,0,10,g);
  const frondGeo = new THREE.PlaneGeometry(.5,2.4,1,4); const pos = frondGeo.attributes.position;
  for (let i = 0; i < pos.count; i++){ const y = pos.getY(i); pos.setZ(i, -(((y+1.2)/2.4)**2) * .9); pos.setX(i, pos.getX(i) * (1 - Math.abs(y)/2.6)); }
  frondGeo.translate(0,1.2,0);
  for (let k = 0; k < 9; k++){ const f = new THREE.Mesh(frondGeo, k%2?M.leaf:M.leaf2); f.position.y = 3.1; f.rotation.set(0, k*0.7, 0); f.rotateX(1.05); g.add(f); }
}
treefern(-14.6,-10.6,1.2); treefern(6.6,-10.8,1); treefern(15.2,-2.2,0.9);
monstera(-14.7,11,1.2); monstera(6.4,11.2,1.1); monstera(15.3,.8,.9); monstera(-14.8,-6.7,1);
/* status consoles on the left wall, checked by bots on the floor */
for (const z of [-4.6,-3.0]){ const c = new THREE.Group(); c.position.set(-15.3,0,z); scene.add(c); box(.7,1.3,1.1,M.steel,0,.65,0,c); const sc = new THREE.Mesh(new THREE.PlaneGeometry(.95,.6), M.holo); sc.position.set(.37,1.6,0); sc.rotation.y = Math.PI/2; sc.rotation.x = 0; c.add(sc); box(.75,.08,1.15,M.copper,0,1.32,0,c); }
// done spots around the lounge
const LOUNGE = [[9.2,4.75,1],[11,4.75,1],[12.8,4.75,1],[8.3,7.6,0],[14,7.6,0],[9.2,10.3,0],[11.2,10.6,0],[13.2,10.3,0],[14.1,9.1,0],[8,9.4,0],[10,12,0],[12.4,12,0]].map(([x,z,sit]) => ({spot:{x,z,face: sit ? 0 : Math.atan2(11.2-x, 7.9-z), sit:!!sit}, via:[{x:6.6, z:2.9},{x:6.6, z}]}));

/* website build bays: one per site, glowing sign, bots that work on that site gather here */
const BAY_POS = [[-9.05,5.6],[-4.5,5.6],[-.5,5.6],[4.05,5.6],[-11.4,10.4],[-7.5,10.4],[-3.6,10.4],[.3,10.4],[4.2,10.4]];
const BAYS = [];
const bayGeo = new THREE.CylinderGeometry(1.25,1.32,.22,6), bayRingGeo = new THREE.RingGeometry(1.02,1.14,6), modelGeo = new THREE.OctahedronGeometry(.32,0);
function signTex(domain, accent, line2){
  return canvasTex(768,224,(g,w,h)=>{
    g.fillStyle = '#121418'; g.fillRect(0,0,w,h);
    const lg = g.createLinearGradient(0,0,w,0); lg.addColorStop(0,'#c27a44'); lg.addColorStop(.5,'#e0a273'); lg.addColorStop(1,'#a9afb7');
    g.strokeStyle = lg; g.lineWidth = 10; g.strokeRect(5,5,w-10,h-10);
    g.fillStyle = accent; g.shadowColor = accent; g.shadowBlur = 22;
    let fs = 92; g.font = `700 ${fs}px "Chakra Petch", "Archivo", sans-serif`;
    while (g.measureText(domain).width > w - 70 && fs > 40){ fs -= 4; g.font = `700 ${fs}px "Chakra Petch", "Archivo", sans-serif`; }
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(domain, w/2, h*.43);
    g.shadowBlur = 0; g.fillStyle = '#c9ced6'; g.font = '500 40px "Chakra Petch", "Archivo", sans-serif'; g.fillText(line2, w/2, h*.79);
  });
}
function bayLine(n){ return n ? (n === 1 ? '1 bot on this site' : n + ' bots on this site') : 'No bot on it yet'; }
function buildBays(sites){
  if (BAYS.length || !sites || !sites.length) return;
  sites.slice(0, BAY_POS.length).forEach((s, i) => {
    const [x, z] = BAY_POS[i], acc = new THREE.Color(s.accent || '#a9afb7');
    const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
    const plat = new THREE.Mesh(bayGeo, M.steelL); plat.position.y = .11; g.add(plat);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.29,.05,6,6), M.copper); rim.rotation.x = Math.PI/2; rim.rotation.z = Math.PI/6; rim.position.y = .23; g.add(rim);
    const ring = new THREE.Mesh(bayRingGeo, new THREE.MeshBasicMaterial({color:acc, transparent:true, opacity:.3, toneMapped:false, depthWrite:false}));
    ring.rotation.x = -Math.PI/2; ring.rotation.z = Math.PI/6; ring.position.y = .24; g.add(ring);
    // pedestal with a slowly turning holo crystal tinted to the site
    cyl(.28,.36,.9,M.pewter,0,.68,-.15,12,g);
    const model = new THREE.Mesh(modelGeo, new THREE.MeshBasicMaterial({color:acc, transparent:true, opacity:.85, toneMapped:false})); model.position.set(0,1.55,-.15); g.add(model);
    const halo = glowSprite(acc.getHex(), 1.5, .45); halo.position.set(0,1.55,-.15); g.add(halo);
    // sign on two copper posts at the back of the bay
    // turned a little toward the viewer so the domain reads from the camera
    const sg = new THREE.Group(); sg.position.set(0,0,-.95); sg.rotation.y = .5; if (PAGE) sg.scale.setScalar(1.18); g.add(sg);
    for (const sx of [-1.25,1.25]) cyl(.05,.05,2.9,M.copper,sx,1.45,-.02,8,sg);
    const n = (s.bots || []).length;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.0,.88), new THREE.MeshBasicMaterial({map:signTex(s.domain, s.accent || '#a9afb7', bayLine(n)), toneMapped:false}));
    sign.position.set(0,2.9,.03); sg.add(sign);
    const back = new THREE.Mesh(new THREE.BoxGeometry(3.12,1.0,.06), M.steel); back.position.set(0,2.9,-.02); sg.add(back);
    const sglow = glowSprite(acc.getHex(), 3.4, .18); sglow.position.set(0,2.9,.2); sg.add(sglow);
    // work spots on the aisle side, reached from the aisle lane
    const sideZ = z < 8 ? 1.65 : -1.65, face = z < 8 ? Math.PI : 0;
    const slots = [-1.05, 0, 1.05].map(o => ({bay:s.domain, who:null, spot:{x:x+o, z:z+sideZ, face, pre:{x:x+o, z:8.0}}}));
    BAYS.push({domain:s.domain, x, z, g, ring, model, sign, slots, n});
  });
}
function syncBays(){
  for (const B of BAYS){ const s = (data.sites || []).find(x => x.domain === B.domain); const n = s ? s.bots.length : 0;
    if (n !== B.n){ B.n = n; B.sign.material.map.dispose(); B.sign.material.map = signTex(B.domain, s.accent, bayLine(n)); B.sign.material.needsUpdate = true; } }
}

/* ---------------- robots ---------------- */
const headGeos = {
  ball: new THREE.SphereGeometry(.5,22,16),
  box: new RoundedBoxGeometry(.95,.8,.85,3,.24),
  hex: new THREE.CylinderGeometry(.52,.52,.8,6),
  pebble: new THREE.SphereGeometry(.52,22,16).scale(1.15,.82,1),
};
const shapeMap = {blob:'ball', square:'box', tablet:'box', squircle:'box', wedge:'box', hex:'hex', pebble:'pebble', cloud:'pebble', flower:'ball', sparkle:'ball', heart:'ball', teardrop:'ball'};
const bodyGeo = new THREE.CapsuleGeometry(.4,.38,6,14), footGeo = new THREE.SphereGeometry(.17,10,8).scale(1,.6,1.3), armGeo = new THREE.CapsuleGeometry(.1,.34,4,8);
const eyeGeo = new THREE.SphereGeometry(.075,10,8), visorGeo = new RoundedBoxGeometry(.72,.34,.12,2,.08), chestGeo = new THREE.CircleGeometry(.12,16), mugGeo = new THREE.CylinderGeometry(.09,.08,.18,10);
const matCache = {}; const crateGeo = new RoundedBoxGeometry(.55,.4,.42,2,.06);
const emis = hex => matCache[hex] ??= new THREE.MeshBasicMaterial({color:hex, toneMapped:false});
const trim = hex => matCache['t'+hex] ??= new THREE.MeshStandardMaterial({color:hex, metalness:.3, roughness:.35});
const shadowMat = new THREE.MeshBasicMaterial({map:glowTex, color:0x000000, transparent:true, opacity:.45, depthWrite:false});
const bots = new Map();
function makeBot(b){
  const c = AV[b.color] ?? AV.gray;
  const g = new THREE.Group(); g.scale.setScalar(1.3); const rig = new THREE.Group(); g.add(rig);
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(1.3,1.3), shadowMat); sh.rotation.x = -Math.PI/2; sh.position.y = .02; g.add(sh);
  const body = new THREE.Mesh(bodyGeo, M.botBody); body.position.y = .8; rig.add(body);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(.41,.05,6,24), trim(c)); belt.rotation.x = Math.PI/2; belt.position.y = .72; rig.add(belt);
  const chest = new THREE.Mesh(chestGeo, emis(0xffffff)); chest.position.set(0,.92,.405); rig.add(chest);
  const feet = [-.18,.18].map(x => { const f = new THREE.Mesh(footGeo, M.steelL); f.position.set(x,.1,.05); rig.add(f); return f; });
  const arms = [-.5,.5].map(x => { const a = new THREE.Group(); a.position.set(x,1.05,0); const m = new THREE.Mesh(armGeo, trim(c)); m.position.y = -.25; a.add(m); rig.add(a); return a; });
  const mug = new THREE.Mesh(mugGeo, new THREE.MeshStandardMaterial({color:0xeee6da})); mug.position.set(0,-.55,.12); arms[1].add(mug); mug.visible = false;
  const crate = new THREE.Mesh(crateGeo, M.copper); crate.position.set(0,.98,.62); crate.visible = false; rig.add(crate);
  const head = new THREE.Group(); head.position.y = 1.62; rig.add(head);
  const hk = shapeMap[b.shape] || 'ball';
  const hm = new THREE.Mesh(headGeos[hk], M.botBody); if (hk === 'hex') hm.rotation.y = Math.PI/6; head.add(hm);
  const visor = new THREE.Mesh(visorGeo, M.visor); visor.position.set(0,0,.42); head.add(visor);
  const eyeMat = emis(c);
  const eyes = [-.15,.15].map(x => { const e = new THREE.Mesh(eyeGeo, eyeMat); e.position.set(x,.01,.49); e.scale.set(1,1.25,.5); head.add(e); return e; });
  for (const x of [-.52,.52]) { const ear = new THREE.Mesh(new THREE.CylinderGeometry(.11,.11,.12,12), trim(c)); ear.rotation.z = Math.PI/2; ear.position.x = x * (hk==='box'?.98:1); head.add(ear); }
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,.35,6), M.pewter); ant.position.y = .55; head.add(ant);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(.08,10,8), emis(c)); tip.position.y = .76; head.add(tip);
  g.traverse(o => o.userData.botName = b.name);
  scene.add(g);
  const tagEl = document.createElement('div'); tagEl.className = 'tag';
  tagEl.innerHTML = `<div class="bub" hidden></div><div class="nm"><i></i>${esc(b.name)}</div>`;
  tagEl.addEventListener('click', e => { e.stopPropagation(); select(b.name, true); });
  $('#tags').appendChild(tagEl);
  const zz = document.createElement('div'); zz.className = 'zz'; zz.textContent = 'z z'; zz.hidden = true; $('#tags').appendChild(zz);
  const bot = {name:b.name, g, rig, head, chest, feet, arms, mug, crate, plan:null, pose:'walk', at:null, eyes, eyeMat, color:c, tagEl, zz, slot:null, path:[], walking:false, phase:Math.random()*6, ds:null, sit:false, faceTarget:0, delay:0};
  return bot;
}
const ENTRY = {x:-14.6, z:2.9}; let firstWalk = true; setTimeout(() => firstWalk = false, 9000);
let firstSync = true;
const rnd = (a, b) => a + Math.random()*(b - a);
const pickOne = arr => arr[Math.floor(Math.random()*arr.length)];
const DESK_PREF = () => [5,3,0,7,2,4,6,1].map(i => DESKS[i]);
function freeSlot(list, name){ if (typeof list === 'function') list = list(); return list.find(s => !s.who || s.who === name) || null; }

/* lanes keep walking bots out of desks, the line and the couch */
const LANES_X = [-11.6,-6.5,-2.5,1.5,6.6], LANES_Z = [-6.4,-1.5,2.9,8.0];
const nearest = (arr, v) => arr.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a);
function route(from, to){
  const pts = [];
  if (from.pre) pts.push({x:from.pre.x, z:from.pre.z});
  const f = pts.length ? pts[0] : from;
  const goal = to.pre || to;
  const ax = nearest(LANES_X, f.x), bx = nearest(LANES_X, goal.x);
  pts.push({x:ax, z:f.z});
  if (ax !== bx){
    let Z = LANES_Z[0], best = 1e9;
    for (const z of LANES_Z){ const c = Math.abs(f.z - z) + Math.abs(goal.z - z); if (c < best){ best = c; Z = z; } }
    pts.push({x:ax, z:Z}, {x:bx, z:Z});
  }
  pts.push({x:bx, z:goal.z}, {x:goal.x, z:goal.z});
  if (to.pre) pts.push({x:to.x, z:to.z});
  const out = []; let px = from.x, pz = from.z;
  for (const p of pts){ if (Math.hypot(p.x - px, p.z - pz) > .05){ out.push(p); px = p.x; pz = p.z; } }
  return out;
}
function walkTo(bot, spot, delay = 0){
  bot.path = route({x:bot.g.position.x, z:bot.g.position.z, pre:bot.at && bot.at.pre}, spot);
  bot.at = spot; bot.walking = true; bot.sit = false; bot.delay = REDUCED ? 0 : delay;
  if (REDUCED){ bot.g.position.set(spot.x, 0, spot.z); bot.path = []; }
}

/* ambient floor life for idle bots: not work, just life */
const busy = new Map();
function claim(list, name){ const free = list.filter(s => !busy.has(s.k) || busy.get(s.k) === name); if (!free.length) return null; const s = pickOne(free); busy.set(s.k, name); return s; }
function releaseAll(name){ for (const [k, v] of busy) if (v === name) busy.delete(k); }
const mk = (k, x, z, face, extra = {}) => ({k, x, z, face, ...extra});
const PICKUP = [mk('pk1',4.4,-7.05,Math.PI), mk('pk2',5.6,-7.05,Math.PI)];
const DROP = [[8.2,-4.9],[9.5,-4.15],[7.6,-6.3]].map(([x,z],i) => mk('dr'+i, x, z, Math.atan2(11.6-x, -7.6-z)));
const TEND = []; for (const ax of [-9,-4.5,0]) for (const o of [-.8,.8]) TEND.push(mk('tn'+ax+o, ax+o, -7.05, Math.PI));
const INSPECT = [-12,-11,-7,-6,-2.6,-1.6,2.2,3.2].map((x,i) => mk('in'+i, x, -7.05, Math.PI));
const CONSOLE = [mk('co1',-14.1,-4.6,-Math.PI/2), mk('co2',-14.1,-3.0,-Math.PI/2)];
const COFFEE = [mk('cf1',13.9,9.0,Math.PI/2), mk('cf2',13.9,10.2,Math.PI/2)];
const SIT = [9.2,11,12.8].map((x,i) => mk('st'+i, x, 4.75, 0, {sit:true, pre:{x, z:5.9}}));
const STAND = [[8.3,7.6],[14,7.6],[9.2,10.3],[11.2,10.6],[13.2,10.3],[8,9.4],[10,12],[12.4,12]].map(([x,z],i) => mk('sd'+i, x, z, Math.atan2(11.2-x, 7.9-z)));
// open floor between the workstations and the build bays, and the aisle between the two rows of bays
function floorPoint(){ return {x:rnd(-9.5,4.5), z: Math.random() < .55 ? rnd(7.7,8.3) : rnd(3.3,3.7)}; }
const ACTS = [['carry',3],['tend',2],['inspect',2],['console',1.3],['coffee',1.5],['sit',1.3],['chat',1],['stroll',1]];
function planFor(bot){
  let r = Math.random() * ACTS.reduce((a, x) => a + x[1], 0), act = 'stroll';
  for (const [a, w] of ACTS){ if ((r -= w) <= 0){ act = a; break; } }
  const n = bot.name;
  if (act === 'carry'){ const p = claim(PICKUP, n), d = claim(DROP, n); if (p && d) return [{to:p, dur:1.4, pose:'reach', then:() => bot.crate.visible = true}, {to:d, dur:1.4, pose:'reach', then:() => bot.crate.visible = false}]; }
  if (act === 'tend'){ const s = claim(TEND, n); if (s) return [{to:s, dur:rnd(6,9), pose:'tend'}]; }
  if (act === 'inspect'){ const s = claim(INSPECT, n); if (s) return [{to:s, dur:rnd(4,6), pose:'inspect'}]; }
  if (act === 'console'){ const s = claim(CONSOLE, n); if (s) return [{to:s, dur:rnd(5,8), pose:'console'}]; }
  if (act === 'coffee'){ const s = claim(COFFEE, n), t = claim(STAND, n); if (s && t) return [{to:s, dur:2.4, pose:'reach', then:() => bot.mug.visible = true}, {to:t, dur:rnd(6,9), pose:'sip', then:() => bot.mug.visible = false}]; }
  if (act === 'sit'){ const s = claim(SIT, n); if (s) return [{to:s, dur:rnd(10,15), pose:'sit'}]; }
  if (act === 'chat'){
    const chats = [...bots.values()].filter(o => o.chatting).length;
    const mate = chats >= 4 ? null : [...bots.values()].find(o => o !== bot && o.ds === 'idle' && !o.noData && !o.chatting && o.plan && o.plan.length <= 1 && o.walking);
    if (mate){
      const p = floorPoint(), dur = rnd(8,11);
      releaseAll(mate.name); mate.crate.visible = false; mate.mug.visible = false;
      mate.chatting = bot.chatting = true; const done = o => () => { o.chatting = false; };
      mate.plan = [{to:{x:p.x+.8, z:p.z, face:-Math.PI/2}, dur, pose:'chat', then:done(mate)}]; startStep(mate);
      return [{to:{x:p.x-.8, z:p.z, face:Math.PI/2}, dur, pose:'chat', then:done(bot)}];
    }
  }
  const p = floorPoint(); return [{to:{...p, face:rnd(-3,3)}, dur:rnd(2,4), pose:'look'}];
}
function startStep(bot, delay = 0){ const s = bot.plan[0]; bot.stepT = s.dur; bot.pose = 'walk'; walkTo(bot, s.to, delay); }
function nextStep(bot){
  const s = bot.plan.shift(); if (s && s.then) s.then();
  if (s && s.to.k) busy.delete(s.to.k);
  if (!bot.plan.length){ releaseAll(bot.name); bot.plan = planFor(bot); }
  startStep(bot);
}

function syncBots(){
  if (!renderer) return;
  buildBays(data.sites);
  for (const s of [...DESKS, ...QUEUE, ...CHARGE, ...BAYS.flatMap(b => b.slots)]) { if (s.who && !crew.find(b => b.name === s.who)) s.who = null; }
  const list = [...crew].sort((a,b) => ORDER[a.ds]-ORDER[b.ds]);
  for (const b of list){ const bot = bots.get(b.name); if (bot && (bot.ds !== b.ds || bot.noData !== b.noData) && bot.slot){ bot.slot.who = null; bot.slot = null; } }
  list.forEach((b, i) => {
    let bot = bots.get(b.name), fresh = false;
    if (!bot){ bot = makeBot(b); bots.set(b.name, bot); bot.g.position.set(ENTRY.x, 0, ENTRY.z); fresh = true; }
    const changed = bot.ds !== b.ds || bot.noData !== b.noData;
    bot.ds = b.ds; bot.noData = b.noData; bot.task = b.task;
    const bay = b.site && BAYS.find(x => x.domain === b.site);
    let want = b.ds === 'working' || b.ds === 'recent' ? (bay ? bay.slots : DESK_PREF) : b.ds === 'needs' ? QUEUE : b.noData ? CHARGE : null;
    if (want && !bot.slot){
      const slot = freeSlot(want, b.name);
      if (slot){ slot.who = b.name; bot.slot = slot; }
    }
    if (changed || fresh){
      releaseAll(b.name); bot.chatting = false; bot.crate.visible = false; bot.mug.visible = false;
      if (bot.slot){ bot.plan = null; bot.pose = 'walk'; walkTo(bot, bot.slot.spot, firstSync ? i * .12 : 0); }
      else {
        if (firstSync && !REDUCED){ const p = Math.random() < .5 ? floorPoint() : {x:pickOne(LANES_X), z:rnd(-6,7)}; bot.g.position.set(p.x, 0, p.z); }
        bot.plan = planFor(bot); startStep(bot, firstSync ? Math.random()*2 : 0);
      }
    }
    const sc = ST[b.ds].hex; bot.chest.material = emis(b.noData ? 0x555a63 : sc);
    bot.tagEl.querySelector('i').style.background = '#' + sc.toString(16).padStart(6,'0');
    bot.tagEl.className = 'tag' + (b.ds === 'needs' ? ' needs' : '') + (b.ds === 'idle' ? ' small floor' : '') + (bot.slot && bot.slot.bay ? ' atbay' : '');
    bot.tagEl.querySelector('.nm').dataset.site = b.site || '';
    bot.asleep = !!b.noData;
  });
  firstSync = false;
  lineSpeed = list.some(b => b.ds === 'working' || b.ds === 'recent') ? 1.4 : .8;
  doorLamp.material.opacity = list.some(b => b.ds === 'needs') ? 1 : .12;
  for (const d of DESKS){ const on = !!d.who; d.holo.material = on ? M.holo : M.holoOff; d.deskGlow.material.opacity = on ? .35 : 0; }
  syncBays();
}

/* raycast clicks on bots */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
canvas.addEventListener('pointerdown', e => {
  const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left)/r.width)*2-1, -((e.clientY - r.top)/r.height)*2+1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects([...bots.values()].map(b => b.g), true).find(h => h.object.userData.botName);
  if (hit) select(hit.object.userData.botName, true);
});

/* labels for areas */
const LABELS = [['Assembly line',-4.5,2.2,-8.5],['Launch pad',11.6,.3,-4.2],["Jessie's office",-15.6,5.6,.6],['Workstations',-2.5,.1,3.1],['Charging bay',11.1,.1,-4.3],['Break room',11.2,.1,12.2],['Website build bays',-3.6,.1,12.3]]
  .map(([t,x,y,z]) => { const el = document.createElement('div'); el.className = 'zlabel'; el.textContent = t; $('#tags').appendChild(el); return {el, v:new THREE.Vector3(x,y,z)}; });
LABELS[4].v.set(11.1,.1,-4.4); LABELS[1].v.set(14.6,.3,-4.6);

/* ---------------- lighting by Hawaii time ---------------- */
const LIGHT = {
  day:{hemi:1.25, hs:0xdfe8ff, hg:0x40382f, sun:1.9, sunC:0xfff1d6, fill:.55, lava:28, floorGlow:.28, env:.6, lamp:3, exp:1.05, bg:0x6f8fb0},
  dawn:{hemi:.8, hs:0xf2c6b0, hg:0x3a2c2a, sun:1.0, sunC:0xffc19a, fill:.35, lava:70, floorGlow:.5, env:.4, lamp:8, exp:1.05, bg:0x6a5a78},
  evening:{hemi:.62, hs:0xd99a8a, hg:0x2a1f22, sun:.7, sunC:0xff9f6a, fill:.25, lava:110, floorGlow:.7, env:.3, lamp:14, exp:1.1, bg:0x3a2c40},
  night:{hemi:.32, hs:0x5a6a9a, hg:0x1a1214, sun:.22, sunC:0x9fb2ff, fill:.12, lava:150, floorGlow:1, env:.16, lamp:18, exp:1.15, bg:0x0d0d16},
};
let curPhase = null;
function applyPhase(){
  const p = phaseNow(); document.body.dataset.phase = p;
  $('#clock').textContent = fmtTime(new Date()); $('#shift').textContent = shiftName();
  if (p === curPhase) return; curPhase = p;
  const L = LIGHT[p];
  hemi.intensity = L.hemi; hemi.color.setHex(L.hs); hemi.groundColor.setHex(L.hg);
  sun.intensity = L.sun; sun.color.setHex(L.sunC); fill.intensity = L.fill;
  lavaLight.userData.base = L.lava; floorGlow.material.opacity = L.floorGlow; floorGlow.userData.base = L.floorGlow;
  scene.environmentIntensity = L.env; lampLight.intensity = L.lamp; lampGlow.material.opacity = p === 'day' ? .25 : .7;
  if (renderer) renderer.toneMappingExposure = L.exp;
  
  paintView(p);
}

/* ---------------- animation loop ---------------- */
let inView = true;
if (PAGE && 'IntersectionObserver' in window) new IntersectionObserver(es => { inView = es[0].isIntersecting; last = performance.now(); }).observe($('#floorview'));
let lineSpeed = .8, last = performance.now(), acc = 0, featured = 0, featuredAt = 0;
const v3 = new THREE.Vector3();
function project(x, y, z){ v3.set(x,y,z).project(camera); return [(v3.x+1)/2*fvW, (1-v3.y)/2*fvH]; }
function frame(now){
  requestAnimationFrame(frame);
  if (document.hidden || !renderer || !inView) return;
  const dt = Math.min(.25, (now - last)/1000); acc += dt; last = now;
  if (acc < 1/45) return; const step = acc; acc = 0; const t = now/1000;
  // lava flicker
  const flick = .85 + Math.sin(t*3.1)*.08 + Math.sin(t*7.3)*.05;
  lavaLight.intensity = (lavaLight.userData.base || 40) * flick; floorGlow.material.opacity = (floorGlow.userData.base || .4) * flick;
  craterGlow.material.opacity = .7 + Math.sin(t*4)*.2;
  // fountain particles
  for (let i = 0; i < NF; i++){ const p = fVel[i]; p.t += step; if (p.t > 1.6){ p.t = 0; p.vx = (Math.random()-.5)*1.6; p.vy = 2.2 + Math.random()*1.8; }
    fPos[i*3] = CR.x + p.vx*p.t; fPos[i*3+1] = CR.y + .2 + p.vy*p.t - 2.6*p.t*p.t; fPos[i*3+2] = CR.z + .05; }
  fGeo.attributes.position.needsUpdate = true;
  // conveyor and arms
  for (const it of items){ it.userData.x += step*lineSpeed; if (it.userData.x > 4.2) it.userData.x = -12.8; it.position.x = it.userData.x; it.visible = it.userData.x < 4; }
  for (const a of arms){ const s = Math.sin(t*lineSpeed*1.6 + a.ph);
    a.yaw.rotation.y = Math.sin(t*lineSpeed*.7 + a.ph)*.5; a.sh.rotation.x = .55 + s*.25; a.el.rotation.x = 1.3 - s*.35;
    a.spark.material.opacity = s > .6 && lineSpeed > 1 ? (Math.random()*.8 + .2) : 0; }
  for (const s of steam){ s.userData.t = (s.userData.t + step*.12) % 1; const u = s.userData.t; s.position.set(Math.sin(u*9)*.6 + u*2, .4 + u*2.2, 1 + u*1.5); s.scale.setScalar(1 + u*3); s.material.opacity = .22*(1-u); }
  beacon.material.opacity = (Math.sin(t*2.2) > 0) ? .95 : .25;
  for (const B of BAYS){ const on = B.slots.some(s => s.who); B.model.rotation.y += step * (on ? .9 : .15); B.model.position.y = 1.55 + Math.sin(t*1.4 + B.x)*.08; B.ring.material.opacity = on ? .75 + Math.sin(t*3 + B.x)*.2 : .22; }
  // bots
  let needsList = [...bots.values()].filter(b => b.ds === 'needs');
  if (now - featuredAt > 5000){ featured++; featuredAt = now; }
  const selNeeds = selected && bots.get(selected) && bots.get(selected).ds === 'needs';
  for (const bot of bots.values()){
    const g = bot.g, A = bot.arms, H = bot.head;
    if (bot.walking){
      if (bot.delay > 0){ bot.delay -= step; }
      else if (bot.path.length){
        const tgt = bot.path[0], dx = tgt.x - g.position.x, dz = tgt.z - g.position.z, d = Math.hypot(dx, dz), sp = (firstWalk ? 5.5 : 3.2)*step;
        if (d <= sp){ g.position.x = tgt.x; g.position.z = tgt.z; bot.path.shift(); }
        else { g.position.x += dx/d*sp; g.position.z += dz/d*sp; bot.faceTarget = Math.atan2(dx, dz); }
        const w = t*11 + bot.phase; bot.feet[0].position.z = .05 + Math.sin(w)*.16; bot.feet[1].position.z = .05 - Math.sin(w)*.16;
        if (bot.crate.visible){ A[0].rotation.x = A[1].rotation.x = -1.25; }
        else { A[0].rotation.x = Math.sin(w)*.6; A[1].rotation.x = bot.mug.visible ? -1.1 : -Math.sin(w)*.6; }
        A[0].rotation.z = A[1].rotation.z = 0; H.rotation.set(0,0,0);
        bot.rig.position.y = Math.abs(Math.sin(w))*.07;
      } else {
        bot.walking = false; bot.faceTarget = bot.at ? (bot.at.face ?? 0) : 0; bot.sit = !!(bot.at && bot.at.sit);
        bot.feet.forEach(f => f.position.z = .05); A.forEach(a => a.rotation.set(0,0,0));
        bot.pose = bot.plan && bot.plan[0] ? bot.plan[0].pose : bot.ds === 'needs' ? 'wave' : bot.asleep ? 'charge' : 'type';
      }
    } else {
      const s = Math.sin(t*14 + bot.phase), c = Math.cos(t*13 + bot.phase);
      bot.rig.position.y = 0; H.rotation.set(0,0,0); A[0].rotation.z = A[1].rotation.z = 0;
      switch (bot.pose){
        case 'type': A[0].rotation.x = -1.1 + s*.12; A[1].rotation.x = -1.1 + c*.12; H.rotation.x = .12 + Math.sin(t*.7+bot.phase)*.05; break;
        case 'wave': A[1].rotation.z = 2.4 + Math.sin(t*6+bot.phase)*.35; A[0].rotation.x = 0; bot.rig.position.y = Math.abs(Math.sin(t*3+bot.phase))*.08; break;
        case 'charge': A.forEach(a => a.rotation.x = .15); H.rotation.x = .38 + Math.sin(t*.9+bot.phase)*.04; break;
        case 'reach': A[0].rotation.x = A[1].rotation.x = -1.3 + Math.sin(t*5)*.15; H.rotation.x = .25; break;
        case 'tend': A[0].rotation.x = -2.3 + s*.3; A[1].rotation.x = -1.9 + c*.35; H.rotation.x = -.25; break;
        case 'inspect': A[1].rotation.x = -1.4; A[0].rotation.x = .1; H.rotation.x = .3; H.rotation.y = Math.sin(t*.9+bot.phase)*.45; break;
        case 'console': A[0].rotation.x = -1.2 + s*.15; A[1].rotation.x = -1.2 + c*.15; H.rotation.x = -.1; break;
        case 'sip': A[1].rotation.x = -1.2 + (Math.sin(t*.8+bot.phase) > .7 ? -.6 : 0); H.rotation.y = Math.sin(t*.5+bot.phase)*.3; break;
        case 'sit': bot.rig.position.y = .32; A[1].rotation.x = -.4; H.rotation.y = Math.sin(t*.4+bot.phase)*.35; break;
        case 'chat': { const talk = Math.sin(t*1.3 + bot.phase) > 0; A[talk ? 1 : 0].rotation.x = -.9 + Math.sin(t*4+bot.phase)*.4; H.rotation.x = Math.sin(t*3+bot.phase)*.08; H.rotation.z = Math.sin(t*1.1+bot.phase)*.1; break; }
        case 'look': H.rotation.y = Math.sin(t*1.2+bot.phase)*.6; break;
      }
      if (bot.plan && bot.plan.length && !bot.chatWait){ bot.stepT -= step; if (bot.stepT <= 0) nextStep(bot); }
    }
    let dr = bot.faceTarget - g.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); g.rotation.y += dr * Math.min(1, step*8);
    bot.eyes.forEach(e => e.scale.y = bot.asleep ? .25 : (Math.sin(t*1.3 + bot.phase*3) > .985 ? .2 : 1.25));
    // tag + bubble
    const [px, py] = project(g.position.x, (bot.sit ? 3.9 : 3.55) + bot.rig.position.y, g.position.z);
    const fw = fvW, cl = fw < 240 ? fw/2 : Math.max(120, Math.min(fw-120, px)); bot.tagEl.style.transform = `translate(${cl}px,${py}px) translate(-50%,-100%)`;
    const bub = bot.tagEl.firstChild, isSel = selected === bot.name;
    const atDesk = bot.ds === 'working' || bot.ds === 'recent';
    const chatNow = !bot.walking && bot.pose === 'chat';
    const showBub = !bot.walking && (atDesk || chatNow || isSel || (bot.ds === 'needs' && !selNeeds && needsList[featured % Math.max(1,needsList.length)] === bot));
    const txt = chatNow && !isSel ? '• • •' : bot.ds === 'idle' && isSel ? 'On the floor, not on a task' : (bot.task || '');
    if (showBub){ if (bub.hidden || bub.dataset.t !== txt){ bub.hidden = false; bub.textContent = txt; bub.dataset.t = txt; bub.classList.toggle('chat', txt === '• • •'); } } else if (!bub.hidden) bub.hidden = true;
    bot.tagEl.classList.toggle('sel', isSel); bot.tagEl.style.zIndex = isSel ? 5 : showBub ? 3 : 1;
    if (bot.asleep && !bot.walking){ bot.zz.hidden = false; const zt = `translate(${px+18}px,${py-6}px)`; bot.zz.style.setProperty("--t", zt); bot.zz.style.transform = zt; } else bot.zz.hidden = true;
  }
  for (const L of LABELS){ const [x,y] = project(L.v.x, L.v.y, L.v.z); L.el.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`; }
  renderer.render(scene, camera);
}

/* ---------------- boot ---------------- */
if (DEMO){ $('#demo-banner').hidden = false; $('#demo-link').textContent = 'Show the real snapshot'; $('#demo-link').href = './'; }
addEventListener('resize', fit); addEventListener('orientationchange', () => setTimeout(fit, 250));
fit(); applyPhase(); load();
setInterval(applyPhase, 30000);
setInterval(load, DEMO ? 25000 : 300000);
setInterval(() => data && renderPanel(), 60000);
document.fonts && document.fonts.ready.then(() => { curPhase = null; applyPhase(); });
requestAnimationFrame(frame);
