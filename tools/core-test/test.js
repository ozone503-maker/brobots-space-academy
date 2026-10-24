const make=require('./harness');
let fails=0; const assert=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++;};
const ok=C=>C.P.every(q=>isFinite(q.p.x)&&isFinite(q.p.y)&&isFinite(q.p.z))&&C.fists.every(f=>isFinite(f.p.x+f.p.y+f.p.z));
const last=A=>A.log.innerHTML.split('<br>')[0];
const targets=[[195,330],[175,300],[215,300],[150,420],[240,420],[195,470],[130,360],[260,360]];
function session(react,noise,durs,n=48,seed=3){
  const B=make(seed); B.C.setDials(react,noise); B.step(480); const parts={}; let nan=false;
  for(let i=0;i<n;i++){const L=i%2==0; const h0=B.C.stats.hits;
    B.swipe(1,[[L?110:280,770],targets[i%8]],durs[i%durs.length]); B.step(60);
    if(B.C.stats.hits>h0){const m=last(B).match(/(HIT|ARM) (\w+)/);parts[m[2]]=(parts[m[2]]||0)+1;}
    if(B.C.fallen||B.C.rise)B.step(420); if(!ok(B.C))nan=true;}
  return {s:B.C.stats,parts,nan,B};
}
// 1 idle: walks in and stands
let A=make(7); A.step(480);
assert(!A.C.fallen&&!A.C.rise&&A.C.P[0].p.y>1.5&&Math.abs(A.C.root.z-1.75)<0.01,'idle 8s: walked in to 1.75 m and stands (head y '+A.C.P[0].p.y.toFixed(2)+')');
// 2 guard: slow/medium punches get taken on the forearm, much less with no reflex
const slow=[250,350,450];
const none=session(99,0,slow), def=session(0.05,0.15,slow), sloppy=session(0.05,0.5,slow), fast=session(0.05,0.15,[100,150,200]);
console.log('  no reflex   ',JSON.stringify(none.s),JSON.stringify(none.parts));
console.log('  default     ',JSON.stringify(def.s),JSON.stringify(def.parts));
console.log('  noise 0.5   ',JSON.stringify(sloppy.s),JSON.stringify(sloppy.parts));
console.log('  fast swipes ',JSON.stringify(fast.s),JSON.stringify(fast.parts));
assert(def.s.armHits>=def.s.hits*0.35 && def.s.bodyHits>0,'default reflex takes '+def.s.armHits+'/'+def.s.hits+' medium punches on the arm, '+def.s.bodyHits+' get through');
assert(def.s.armHits>=none.s.armHits*3,'reflex is real: arm hits '+none.s.armHits+' with no reflex vs '+def.s.armHits);
assert(sloppy.s.armHits<def.s.armHits,'more prediction noise blocks fewer ('+sloppy.s.armHits+')');
assert(fast.s.bodyHits>fast.s.armHits,'fast punches mostly beat the reflex ('+fast.s.bodyHits+' through, '+fast.s.armHits+' on arm)');
assert(![none,def,sloppy,fast].some(x=>x.nan),'no NaN across 192 punches incl. falls and get-ups');
// 3 blocked punch still moves him (impulse into arm and balance)
{const B=make(4); B.C.setDials(0.03,0); B.step(480); let moved=0, got=false;
 for(let i=0;i<10&&!got;i++){ const c0=B.C.com(); const h0=B.C.stats.armHits; B.swipe(1,[[110,770],[195,330]],[300,200,150][i%3]);
   if(B.C.stats.armHits>h0){got=true; let m=0; for(let k=0;k<20;k++){B.step(); const c=B.C.com(); m=Math.max(m,Math.hypot(c.x-c0.x,c.z-c0.z));} moved=m;} B.step(60);}
 assert(got&&moved>0.008,'a punch taken on the forearm still shifts his CoM ('+(moved*100).toFixed(1)+' cm; '+last(B)+')');}
// 4 trajectory: straight swipe = straight fist line, curved = hook arc
{const C1=make(5); C1.C.setDials(99,0); C1.step(480);
 const dev=tr=>{let i1=0;tr.forEach((p,i)=>{if(p.z>tr[i1].z)i1=i;});const a=tr[0],b=tr[i1];let m=0;for(let i=0;i<=i1;i++){const p=tr[i];const t=(p.z-a.z)/((b.z-a.z)||1);m=Math.max(m,Math.abs(p.x-(a.x+(b.x-a.x)*t)));}return m;};
 const jab=C1.swipe(1,[[110,770],[180,330]],200); C1.step(90);
 const hook=C1.swipe(1,[[110,770],[20,560],[90,390],[230,330]],220); C1.step(90);
 const hookR=C1.swipe(1,[[280,770],[375,560],[300,390],[160,330]],220);
 console.log('  lateral bow: jab '+dev(jab).toFixed(3)+' m, left hook '+dev(hook).toFixed(3)+' m, right hook '+dev(hookR).toFixed(3)+' m');
 assert(dev(jab)<0.06 && dev(hook)>0.15 && dev(hookR)>0.15,'fist follows the swipe shape (jab straight, hooks bow out)');}
// 5 hard hits drop him, he gets up through the physics
{const D=make(9); D.C.setDials(99,0); D.step(480); let fell=0;
 for(let i=0;i<8&&!fell;i++){D.swipe(2,[[270,780],[195,250]],70); for(let k=0;k<25;k++){D.step(); if(D.C.fallen){fell=i+1;break;}}}
 assert(fell>0,'hard head shots put him down (after hit #'+fell+')');
 const ys=[]; let up=0;
 for(let k=0;k<900;k++){D.step(); ys.push(D.C.P[D.C.idx('pelvis')].p.y); if(D.C.stats.getups>0){up=k;break;}}
 let jump=0; for(let i=1;i<ys.length;i++) jump=Math.max(jump,Math.abs(ys[i]-ys[i-1]));
 assert(up>0,'he gets back up on his own '+(up/60).toFixed(1)+' s after going down (pelvis from '+Math.min(...ys).toFixed(2)+' m)');
 assert(jump<0.08,'rise is gradual: biggest pelvis move in one frame '+(jump*100).toFixed(1)+' cm');
 D.step(480); assert(!D.C.fallen&&!D.C.rise&&ok(D.C)&&Math.abs(D.C.root.z-1.75)<0.05,'standing and walked back in 8 s later');}
// 6 soft swipes never drop him
{const s=session(99,0,[400,500],24,8); assert(s.s.falls===0,'slow 400-500 ms swipes: '+s.s.hits+' hits, 0 falls');}
// 7 cost
{const E=make(1); E.step(60); const t1=process.hrtime.bigint(); E.step(6000); const ms=Number(process.hrtime.bigint()-t1)/1e6/6000;
 assert(ms<0.5,'physics step '+(ms*1000).toFixed(0)+' us on this box (frame budget 16 700 us)');}
console.log(fails?fails+' FAILED':'ALL PASS'); process.exitCode=fails?1:0;
