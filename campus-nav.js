/* Shared campus sticky nav — mobile toggle + contact routing + console link */
(function () {
  function init() {
    document.querySelectorAll('a[href^="mailto:hello@brobots.space"]').forEach(function (a) {
      var label = (a.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (a.classList.contains('contact') || label === 'contact' || label === 'hello@brobots.space') {
        a.setAttribute('href', 'index.html#talk');
      }
    });

    var mast = document.querySelector('.campus-mast');
    if (!mast) return;
    var btn = mast.querySelector('.campus-nav-toggle');
    var nav = mast.querySelector('.campus-nav');
    if (!nav) return;

    if (!nav.querySelector('a[href="console.html"]')) {
      var grads = nav.querySelector('a[href="dossiers.html"]');
      var a = document.createElement('a');
      a.href = 'console.html';
      a.textContent = 'Console';
      var here = (location.pathname || '').indexOf('console') !== -1;
      if (here) {
        a.className = 'current';
        a.setAttribute('aria-current', 'page');
        nav.querySelectorAll('a.current').forEach(function (x) {
          if (x !== a) { x.classList.remove('current'); x.removeAttribute('aria-current'); }
        });
      }
      if (grads && grads.nextSibling) grads.parentNode.insertBefore(a, grads.nextSibling);
      else if (grads) grads.parentNode.appendChild(a);
      else nav.insertBefore(a, nav.querySelector('a.contact'));
    }

    if (!btn) return;

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
