// fight3d/hud.js: HUD bars/timer/meter (updateHUD), banners, and the ?debug=1 overlay (dbg, window.__dbgLines).
// The build stamp (#build) is static in fight3d.html.
import { $, qs } from './util.js?v=894c647';
import { T } from './moves.js?v=894c647';
import { F, G } from './combat.js?v=894c647';

const DEBUG = qs.has('debug'); let dbgEl = null; const dbgLines = [];
function dbg(t) { if (!DEBUG) return; if (!dbgEl) { dbgEl = document.createElement('pre'); dbgEl.id = 'dbg'; document.getElementById('app').appendChild(dbgEl); }
  dbgLines.push((performance.now() / 1000).toFixed(1) + ' ' + t); if (dbgLines.length > 14) dbgLines.shift(); dbgEl.textContent = dbgLines.join('\n'); }
window.__dbgLines = dbgLines;

// ---------------- flow ----------------
function showBanner(t, frames) { G.banner = t; G.bannerT = frames; const b = $('banner'); b.textContent = t; b.classList.add('show'); }
function updateHUD() {
  for (let i = 0; i < 2; i++) {
    $('hp' + i).style.width = (F[i].hp / T.hp * 100) + '%'; $('bal' + i).style.width = (Math.max(0, F[i].bal) / T.balMax * 100) + '%';
    $('pip' + i).innerHTML = '<b></b>'.repeat(F[i].wins);
  }
  $('timer').textContent = G.timer; $('rnd').textContent = 'ROUND ' + G.round;
  $('sup0').style.width = (F[0].superUsed ? 0 : F[0].meter) + '%';
  $('sup0').parentNode.parentNode.classList.toggle('ready', F[0].meter >= 100 && !F[0].superUsed);
}

export { dbg, showBanner, updateHUD };
