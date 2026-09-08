/* אלוף הגגות - site behaviour. No dependencies, ~4KB. */
(function () {
  'use strict';

  /* ---------- mobile nav ---------- */
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('primary-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) {
        nav.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.focus();
      }
    });
  }

  /* ---------- dropdown submenus (click on touch, hover on desktop) ---------- */
  var subs = document.querySelectorAll('.has-sub > button');
  Array.prototype.forEach.call(subs, function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var open = btn.getAttribute('aria-expanded') === 'true';
      Array.prototype.forEach.call(subs, function (b) { b.setAttribute('aria-expanded', 'false'); });
      btn.setAttribute('aria-expanded', open ? 'false' : 'true');
    });
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest || !e.target.closest('.has-sub')) {
      Array.prototype.forEach.call(subs, function (b) { b.setAttribute('aria-expanded', 'false'); });
    }
  });

  /* ---------- YouTube click-to-play ---------- */
  Array.prototype.forEach.call(document.querySelectorAll('.video-facade'), function (wrap) {
    var btn = wrap.querySelector('.video-play');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var id = wrap.getAttribute('data-yt');
      if (!id) return;
      var f = document.createElement('iframe');
      f.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0';
      f.title = 'סרטון תדמית - אלוף הגגות';
      f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      f.setAttribute('allowfullscreen', '');
      f.setAttribute('frameborder', '0');
      wrap.innerHTML = '';
      wrap.appendChild(f);
    });
  });

  /* ---------- sidebar stickiness ----------
     Sticky only helps when the aside is shorter than the article and fits the
     viewport; otherwise it would strand the reader mid-column. */
  var side = document.querySelector('.layout-side');
  var mainCol = document.querySelector('.layout-main');
  if (side && mainCol) {
    var syncSticky = function () {
      var tooTall = side.offsetHeight > window.innerHeight - 100 ||
        side.offsetHeight > mainCol.offsetHeight - 80;
      side.classList.toggle('is-tall', tooTall);
    };
    syncSticky();
    window.addEventListener('resize', syncSticky, { passive: true });
    window.addEventListener('load', syncSticky);
  }

  /* ---------- lead forms ---------- */
  Array.prototype.forEach.call(document.querySelectorAll('form[data-lead]'), function (form) {
    // the handler rejects anything submitted within a few seconds of render
    var stamp = form.querySelector('input[name="t"]');
    if (stamp) stamp.value = String(Math.floor(Date.now() / 1000));

    form.addEventListener('submit', function (e) {
      var status = form.querySelector('.form-status');
      var endpoint = form.getAttribute('action') || '';
      // Honeypot: silently drop bot submissions.
      var hp = form.querySelector('input[name="botcheck"]');
      if (hp && hp.value) { e.preventDefault(); return; }
      // Submit via fetch so the visitor stays on the page.
      e.preventDefault();
      var btn = form.querySelector('[type="submit"]');
      var original = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.textContent = 'שולח…'; }
      if (status) { status.textContent = ''; status.removeAttribute('data-state'); }
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        body: new FormData(form)
      }).then(function (r) { return r.json().catch(function () { return { success: r.ok }; }); })
        .then(function (data) {
          if (data && (data.success || data.ok)) {
            form.reset();
            if (stamp) stamp.value = String(Math.floor(Date.now() / 1000));
            if (status) {
              status.textContent = (data && data.message) || 'תודה! קיבלנו את הפנייה ונחזור אליכם בהקדם.';
              status.setAttribute('data-state', 'ok');
            }
            var to = form.getAttribute('data-redirect');
            if (to) setTimeout(function () { window.location.href = to; }, 1200);
          } else if (status) {
            status.textContent = (data && data.message) || 'משהו השתבש. אפשר להתקשר אלינו: 050-565-0223';
            status.setAttribute('data-state', 'err');
          }
        }).catch(function () {
          if (status) { status.textContent = 'השליחה נכשלה. אפשר להתקשר אלינו: 050-565-0223'; status.setAttribute('data-state', 'err'); }
        }).then(function () {
          if (btn) { btn.disabled = false; btn.textContent = original; }
        });
    });
  });

  /* ---------- accessibility widget ---------- */
  var a11yBtn = document.querySelector('.a11y-btn');
  var a11yPanel = document.querySelector('.a11y-panel');
  if (a11yBtn && a11yPanel) {
    var MODES = ['contrast', 'dark', 'links', 'readable', 'bigspace', 'nomotion'];
    var KEY = 'rc-a11y';

    function readState() {
      try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
    }
    function saveState(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { } }

    function apply(state) {
      MODES.forEach(function (m) { document.documentElement.classList.toggle('a11y-' + m, !!state[m]); });
      var size = state.fontSize || 100;
      document.documentElement.style.fontSize = size === 100 ? '' : size + '%';
      Array.prototype.forEach.call(a11yPanel.querySelectorAll('[data-mode]'), function (b) {
        b.setAttribute('aria-pressed', state[b.getAttribute('data-mode')] ? 'true' : 'false');
      });
    }

    var state = readState();
    apply(state);

    a11yBtn.addEventListener('click', function () {
      var open = a11yPanel.classList.toggle('is-open');
      a11yBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) { var f = a11yPanel.querySelector('button'); if (f) f.focus(); }
    });

    a11yPanel.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      var mode = b.getAttribute('data-mode');
      var act = b.getAttribute('data-action');
      if (mode) { state[mode] = !state[mode]; }
      else if (act === 'font-up') { state.fontSize = Math.min((state.fontSize || 100) + 10, 150); }
      else if (act === 'font-down') { state.fontSize = Math.max((state.fontSize || 100) - 10, 80); }
      else if (act === 'reset') { state = {}; }
      else if (act === 'close') { a11yPanel.classList.remove('is-open'); a11yBtn.setAttribute('aria-expanded', 'false'); a11yBtn.focus(); return; }
      saveState(state); apply(state);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && a11yPanel.classList.contains('is-open')) {
        a11yPanel.classList.remove('is-open');
        a11yBtn.setAttribute('aria-expanded', 'false');
        a11yBtn.focus();
      }
    });
    document.addEventListener('click', function (e) {
      if (!a11yPanel.classList.contains('is-open')) return;
      if (a11yPanel.contains(e.target) || a11yBtn.contains(e.target)) return;
      a11yPanel.classList.remove('is-open');
      a11yBtn.setAttribute('aria-expanded', 'false');
    });
  }
})();
