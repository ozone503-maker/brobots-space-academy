/* Factory film: muted until VOLUME is tapped. Stories play when on screen. */
(function () {
  var hero = document.querySelector('.hero-video-full video');
  var stories = Array.prototype.slice.call(document.querySelectorAll('video.scroll-play[data-story-index]'))
    .sort(function (a, b) { return Number(a.dataset.storyIndex) - Number(b.dataset.storyIndex); });
  var toggle = document.getElementById('global-volume-toggle');
  var stateLabel = toggle ? toggle.querySelector('.volume-state') : null;
  if (!toggle) return;
  var audioEnabled = false;
  var ratios = typeof Map === 'function' ? new Map() : null;
  var current = null;
  function setMuted() {
    if (hero) { hero.muted = !audioEnabled; hero.volume = 1; }
    stories.forEach(function (v) { v.muted = !audioEnabled; v.volume = 1; });
  }
  function updateButton() {
    toggle.classList.toggle('is-on', audioEnabled);
    toggle.setAttribute('aria-pressed', audioEnabled ? 'true' : 'false');
    toggle.setAttribute('aria-label', audioEnabled ? 'Turn volume off' : 'Turn volume on');
    if (stateLabel) stateLabel.textContent = audioEnabled ? 'ON' : 'OFF';
  }
  function pauseOthers(except) {
    stories.forEach(function (v) { if (v !== except) v.pause(); });
  }
  function bestStory() {
    var best = null, bestR = 0;
    stories.forEach(function (v) {
      var r = ratios ? (ratios.get(v) || 0) : 0;
      if (r > bestR) { bestR = r; best = v; }
    });
    return bestR >= 0.28 ? best : null;
  }
  function sync() {
    var v = bestStory();
    current = v;
    pauseOthers(v);
    if (!v) return;
    v.muted = !audioEnabled;
    var p = v.play();
    if (p && typeof p.catch === 'function') p.catch(function () {});
  }
  if (hero) hero.muted = true;
  setMuted();
  updateButton();
  toggle.addEventListener('click', function () {
    audioEnabled = !audioEnabled;
    setMuted();
    updateButton();
    if (audioEnabled) {
      if (hero && !hero.paused) hero.play().catch(function () {});
      if (current) current.play().catch(function () {});
    }
  });
  if (stories.length && 'IntersectionObserver' in window && ratios) {
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        ratios.set(e.target, e.isIntersecting ? e.intersectionRatio : 0);
      });
      sync();
    }, { threshold: [0, .15, .28, .45, .65, .85] });
    stories.forEach(function (v) { obs.observe(v); });
  }
})();
