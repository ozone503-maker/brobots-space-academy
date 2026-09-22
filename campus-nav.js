/* Shared campus sticky nav — mobile toggle */
(function () {
  function init() {
    var mast = document.querySelector('.campus-mast');
    if (!mast) return;
    var btn = mast.querySelector('.campus-nav-toggle');
    var nav = mast.querySelector('.campus-nav');
    if (!btn || !nav) return;

    function setOpen(open) {
      mast.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.textContent = open ? 'Close' : 'Menu';
    }

    btn.addEventListener('click', function () {
      setOpen(!mast.classList.contains('is-open'));
    });

    nav.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        if (window.matchMedia('(max-width:860px)').matches) setOpen(false);
      });
    });

    window.addEventListener('resize', function () {
      if (!window.matchMedia('(max-width:860px)').matches) setOpen(false);
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
