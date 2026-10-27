(function(){
var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
var els=document.querySelectorAll('[data-r]');
if(reduce||!('IntersectionObserver' in window)){els.forEach(function(e){e.classList.add('vis')});}
else{var io=new IntersectionObserver(function(es){es.forEach(function(x){if(x.isIntersecting){x.target.classList.add('vis');io.unobserve(x.target)}})},{threshold:.12,rootMargin:'0px 0px -5% 0px'});els.forEach(function(e){io.observe(e)});}
if(!reduce){document.querySelectorAll('video.bgv').forEach(function(v){
 v.muted=true;v.src=v.getAttribute('data-src');v.addEventListener('canplay',function(){v.classList.add('on')},{once:true});
 if('IntersectionObserver' in window){new IntersectionObserver(function(es){es.forEach(function(x){if(x.isIntersecting){var p=v.play();if(p&&p.catch)p.catch(function(){})}else v.pause()})}).observe(v)}else v.play();
});}
var b=document.getElementById('uepCopyPrompt'),t=document.getElementById('uepAuditPrompt'),s=document.getElementById('uepCopyStatus');
if(b&&t&&s){function ok(){s.textContent='Prompt copied. Paste it into your favorite AI.';b.textContent='Prompt copied';setTimeout(function(){b.textContent='Copy the audit prompt'},3000)}
function fb(){t.focus();t.select();document.execCommand('copy');ok()}
b.addEventListener('click',function(){if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(t.value).then(ok).catch(fb)}else fb()})}
})();
