/* Shared campus sticky nav — mobile toggle + contact routing + console link */
(function () {
  function init() {
    document.querySelectorAll('a[href^="mailto:brobots.space@gmail.com"]').forEach(function (a) {
      var label = (a.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (a.classList.contains('contact') || label === 'contact' || label === 'brobots.space@gmail.com') {
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

    if (!nav.querySelector('a[href="faq.html"]')) {
      var faq = document.createElement('a');
      faq.href = 'faq.html';
      faq.textContent = 'FAQ';
      if ((location.pathname || '').indexOf('faq') !== -1) {
        faq.className = 'current';
        faq.setAttribute('aria-current', 'page');
        nav.querySelectorAll('a.current').forEach(function (x) {
          if (x !== faq) { x.classList.remove('current'); x.removeAttribute('aria-current'); }
        });
      }
      var cta = nav.querySelector('a.contact');
      if (cta) nav.insertBefore(faq, cta);
      else nav.appendChild(faq);
    }

    if (!nav.querySelector('a[href="search-visibility"]')) {
      var sv = document.createElement('a');
      sv.href = 'search-visibility';
      sv.textContent = 'Search + AI';
      var svc = nav.querySelector('a[href="services.html"]');
      if (svc && svc.nextSibling) svc.parentNode.insertBefore(sv, svc.nextSibling);
      else nav.insertBefore(sv, nav.querySelector('a.contact'));
    }

    if (!nav.querySelector('a[href="/factory-floor"]')) {
      var ff = document.createElement('a');
      ff.href = '/factory-floor';
      ff.textContent = 'Factory floor';
      if ((location.pathname || '').indexOf('factory-floor') !== -1) {
        ff.className = 'current';
        ff.setAttribute('aria-current', 'page');
        nav.querySelectorAll('a.current').forEach(function (x) {
          if (x !== ff) { x.classList.remove('current'); x.removeAttribute('aria-current'); }
        });
      }
      var bots = nav.querySelector('a[href="/bots"]') || nav.querySelector('a[href="bots.html"]');
      var faqA = nav.querySelector('a[href="faq.html"]');
      if (bots && bots.nextSibling) bots.parentNode.insertBefore(ff, bots.nextSibling);
      else if (faqA) nav.insertBefore(ff, faqA);
      else nav.insertBefore(ff, nav.querySelector('a.contact'));
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
