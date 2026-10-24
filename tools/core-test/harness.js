const fs=require('fs');
const src=fs.readFileSync(require('path').join(__dirname,'../../core.html'),'utf8').match(/<script>([\s\S]*)<\/script>/)[1];
function make(seed){
  let t=0; const handlers={};
  const noop=new Proxy(function(){},{get:(o,k)=>k==='canvas'?{}:noop,apply:()=>noop,set:()=>true});
  const el=()=>({innerHTML:'',onclick:null,textContent:'',classList:{toggle(){}}});
  const els={};
  const cv={getContext:()=>noop,addEventListener:(k,f)=>handlers[k]=f,setPointerCapture(){},width:0,height:0};
  const doc={getElementById:id=>id==='cv'?cv:(els[id]||(els[id]=el()))};
  let s=seed; const rnd=()=>{s=(s*16807)%2147483647;return s/2147483647;};
  const M=Object.create(Math); M.random=rnd;
  const win={innerWidth:390,innerHeight:844,addEventListener(){}};
  const perf={now:()=>t};
  const f=new Function('document','window','performance','requestAnimationFrame','addEventListener','innerWidth','innerHeight','Math',src+';return window.CORE;');
  const C=f(doc,win,perf,()=>{},()=>{},390,844,M);
  const api={C,handlers,get log(){return els.log},
    step(n=1){for(let i=0;i<n;i++){t+=1000/60;C.stepSim(1/60);}},
    // swipe: list of screen points over durMs, sampled each 8ms; returns fist trace
    swipe(id,pts,durMs,hold=false){
      const trace=[]; const N=Math.max(2,Math.round(durMs/8));
      const at=u=>{const k=u*(pts.length-1),i=Math.min(pts.length-2,Math.floor(k)),f=k-i;return [pts[i][0]+(pts[i+1][0]-pts[i][0])*f,pts[i][1]+(pts[i+1][1]-pts[i][1])*f];};
      let [x,y]=at(0); handlers.pointerdown({pointerId:id,clientX:x,clientY:y});
      let acc=0;
      for(let k=1;k<=N;k++){ t+=8; acc+=8; [x,y]=at(k/N); handlers.pointermove({pointerId:id,clientX:x,clientY:y});
        while(acc>=1000/60){acc-=1000/60; C.stepSim(1/60); trace.push({...C.fists[x<195?0:1].p});}}
      handlers.pointerup({pointerId:id,clientX:x,clientY:y});
      for(let k=0;k<40;k++){api.step(); trace.push({...C.fists[x<195?0:1].p});}
      return trace;
    }};
  return api;
}
module.exports=make;
