// fight3d/main.js: entry point. Round/match flow (start/end round, tick), window.FIGHT test hook,
// fixed 60Hz loop and adaptive quality.
import * as THREE from 'three';
import { $, AUTO, qs } from './util.js?v=079d986';
import { DIFF, T } from './moves.js?v=079d986';
import { ac, camera, composer, renderer, resize, scene, setPR, setUseBloom, sfx, sun, useBloom } from './stage.js?v=079d986';
import { OJ, fists } from './fighters.js?v=079d986';
import { showBanner, updateHUD } from './hud.js?v=079d986';
import { F, G, resetPositions, separate, stepFighter } from './combat.js?v=079d986';
import { think } from './cpu.js?v=079d986';
import { applyPose, curPose, updateVisuals } from './anim.js?v=079d986';
import { PI, drawTrails, readPlayer } from './input.js?v=079d986';

window.FIGHT = { G, F, THREE, camera, get fists() { return fists; }, get PI() { return PI; }, get fps() { return G.fps; } };
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

// ---------------- loop + adaptive quality ----------------
let last = performance.now(), acc = 0, fpsAcc = 0, fpsN = 0, slowStreak = 0, qLevel = useBloom ? 2 : 1;
function setQuality(q) {
  qLevel = q;
  if (q < 2) setUseBloom(false);
  if (q < 1) { setPR(1); renderer.setPixelRatio(1); renderer.shadowMap.enabled = false; sun.castShadow = false; scene.traverse(o => { if (o.material) o.material.needsUpdate = true; }); }
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


export { endRound, last };
