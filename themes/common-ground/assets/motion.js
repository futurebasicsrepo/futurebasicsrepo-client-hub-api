/* ==========================================================================
   motion.js — Common Ground Rewind
   Reveal-on-scroll, marquee timing, 3D tilt, sticker cursor, mega nav,
   mobile menu, header state, parallax hero, view transitions.
   Everything respects prefers-reduced-motion and the theme "motion_level".
   ========================================================================== */
(function () {
  'use strict';
  var html = document.documentElement;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var level = reduced ? 'off' : (html.getAttribute('data-motion') || 'full');
  if (reduced) html.setAttribute('data-motion', 'off');
  var FULL = level === 'full';
  var ANY = level !== 'off';

  /* ---- helpers ---- */
  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }
  function lock(on) { document.body.classList.toggle('is-locked', !!on); }

  /* ---- Reveal on scroll ---- */
  function initReveal(root) {
    var els = $$('.reveal:not(.is-in)', root);
    if (!els.length) return;
    if (!ANY || !('IntersectionObserver' in window)) { els.forEach(function (e) { e.classList.add('is-in'); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    els.forEach(function (e) { io.observe(e); });
  }

  /* ---- Marquee: duration from data-speed ---- */
  function initMarquee(root) {
    $$('[data-marquee]', root).forEach(function (m) {
      var s = parseFloat(m.getAttribute('data-speed') || '40');
      m.style.setProperty('--dur', s + 's');
    });
  }

  /* ---- 3D tilt on cards ---- */
  function initTilt(root) {
    if (!FULL || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    $$('[data-tilt]', root).forEach(function (el) {
      if (el.__tilt) return; el.__tilt = true;
      var max = parseFloat(el.getAttribute('data-tilt-max') || '7');
      var raf = null;
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width - 0.5;
        var y = (e.clientY - r.top) / r.height - 0.5;
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(function () {
          el.style.transform = 'perspective(800px) rotateX(' + (-y * max) + 'deg) rotateY(' + (x * max) + 'deg) translateY(-4px)';
        });
      });
      el.addEventListener('pointerleave', function () { if (raf) cancelAnimationFrame(raf); el.style.transform = ''; });
    });
  }

  /* ---- Sticker cursor ---- */
  function initCursor() {
    var c = $('.cursor-sticker');
    if (!c || !FULL) return;
    var glyphs = ['★', '✦', '☺', '♥', '✿', '☆'];
    var i = 0;
    document.addEventListener('pointermove', function (e) {
      c.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)';
    }, { passive: true });
    document.addEventListener('pointerover', function (e) {
      var t = e.target.closest('a, button, .product-card, .ctile, [data-tilt]');
      if (t) { c.classList.add('is-hover'); c.textContent = glyphs[i++ % glyphs.length]; }
      else c.classList.remove('is-hover');
    });
  }

  /* ---- Header: scrolled state, search toggle, mega nav, mobile menu ---- */
  function initHeader() {
    var header = $('[data-header]');
    if (!header) return;
    var onScroll = function () { header.classList.toggle('is-scrolled', window.scrollY > 8); };
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

    var st = $('[data-search-toggle]'), sf = $('[data-search]');
    if (st && sf) st.addEventListener('click', function () { sf.classList.toggle('is-open'); if (sf.classList.contains('is-open')) sf.querySelector('input').focus(); });

    var trig = $('[data-mega-trigger]');
    var item = trig && trig.closest('.nav__item--mega');
    if (trig && item) {
      trig.addEventListener('click', function (e) {
        // First tap/click on touch opens the panel; second navigates.
        if (window.matchMedia('(hover: none)').matches && !item.classList.contains('is-open')) { e.preventDefault(); item.classList.add('is-open'); trig.setAttribute('aria-expanded', 'true'); }
      });
      trig.addEventListener('keydown', function (e) { if (e.key === 'ArrowDown') { e.preventDefault(); item.classList.add('is-open'); var f = item.querySelector('.mega a'); if (f) f.focus(); } });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { item.classList.remove('is-open'); trig.setAttribute('aria-expanded', 'false'); } });
      document.addEventListener('click', function (e) { if (!item.contains(e.target)) { item.classList.remove('is-open'); trig.setAttribute('aria-expanded', 'false'); } });
    }

    var menu = $('[data-mobile-menu]'), ov = $('[data-overlay]');
    function openMenu() { menu.classList.add('is-open'); menu.setAttribute('aria-hidden', 'false'); ov.hidden = false; requestAnimationFrame(function () { ov.classList.add('is-open'); }); lock(true); var b = $('[data-menu-open]'); if (b) b.setAttribute('aria-expanded', 'true'); }
    function closeMenu() { menu.classList.remove('is-open'); menu.setAttribute('aria-hidden', 'true'); ov.classList.remove('is-open'); setTimeout(function () { ov.hidden = true; }, 250); lock(false); var b = $('[data-menu-open]'); if (b) b.setAttribute('aria-expanded', 'false'); }
    if (menu && ov) {
      $$('[data-menu-open]').forEach(function (b) { b.addEventListener('click', openMenu); });
      $$('[data-menu-close]').forEach(function (b) { b.addEventListener('click', closeMenu); });
      ov.addEventListener('click', closeMenu);
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && menu.classList.contains('is-open')) closeMenu(); });
    }
  }

  /* ---- Parallax hero / banner ---- */
  function initParallax() {
    if (!FULL) return;
    var els = $$('[data-parallax]');
    if (!els.length) return;
    var ticking = false;
    function update() {
      els.forEach(function (el) {
        var r = el.parentElement.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) return;
        var p = Math.min(1, Math.max(0, -r.top / r.height));
        el.style.transform = 'translateY(' + (p * 22) + '%) scale(1.08)';
      });
      ticking = false;
    }
    window.addEventListener('scroll', function () { if (!ticking) { requestAnimationFrame(update); ticking = true; } }, { passive: true });
    update();
  }

  /* ---- View transitions between pages ---- */
  function initViewTransitions() {
    if (!FULL || !document.startViewTransition) return;
    // CSS-only cross-document transitions (Chrome 126+). Opt-in via @view-transition.
    var style = document.createElement('style');
    style.textContent = '@view-transition { navigation: auto; }';
    document.head.appendChild(style);
  }

  /* ---- Quantity steppers (shared) ---- */
  function initQty(root) {
    $$('[data-qty]', root).forEach(function (q) {
      if (q.__qty) return; q.__qty = true;
      var input = q.querySelector('[data-qty-input]');
      q.addEventListener('click', function (e) {
        var b = e.target.closest('[data-qty-minus],[data-qty-plus]');
        if (!b || !input) return;
        var v = parseInt(input.value || '1', 10) || 1;
        var min = parseInt(input.min || '0', 10);
        v = b.hasAttribute('data-qty-plus') ? v + 1 : Math.max(min, v - 1);
        input.value = v;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
  }

  /* ---- VCR timecode on the hero OSD ---- */
  function initTimecode() {
    var els = $$('[data-timecode]');
    if (!els.length || !ANY) return;
    var start = Date.now();
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    setInterval(function () {
      var s = Math.floor((Date.now() - start) / 1000);
      var t = pad(Math.floor(s / 3600)) + ':' + pad(Math.floor(s / 60) % 60) + ':' + pad(s % 60);
      els.forEach(function (e) { e.textContent = t; });
    }, 1000);
  }

  /* ---- Whatnot "Channel 12": countdown to next show ---- */
  function initCountdown(root) {
    $$('[data-countdown]', root).forEach(function (el) {
      if (el.__cd) return; el.__cd = true;
      var target = Date.parse(el.getAttribute('data-countdown'));
      if (isNaN(target)) { el.textContent = el.getAttribute('data-fallback') || ''; return; }
      var d = $('[data-cd-d]', el), h = $('[data-cd-h]', el), mi = $('[data-cd-m]', el), s = $('[data-cd-s]', el);
      function pad(n) { return (n < 10 ? '0' : '') + n; }
      function tick() {
        var diff = Math.max(0, target - Date.now()) / 1000;
        if (d) d.textContent = pad(Math.floor(diff / 86400));
        if (h) h.textContent = pad(Math.floor(diff / 3600) % 24);
        if (mi) mi.textContent = pad(Math.floor(diff / 60) % 60);
        if (s) s.textContent = pad(Math.floor(diff) % 60);
        if (diff <= 0) el.classList.add('is-due');
      }
      tick(); setInterval(tick, 1000);
    });
  }

  /* ---- Public re-init hook for AJAX-rendered content ---- */
  window.themeMotion = { init: function (root) { initReveal(root); initMarquee(root); initTilt(root); initQty(root); initCountdown(root); } };

  document.addEventListener('DOMContentLoaded', function () {
    initReveal(); initMarquee(); initTilt(); initCursor(); initHeader(); initParallax(); initViewTransitions(); initQty(); initTimecode(); initCountdown();
  });
  // Theme editor: re-run when sections load/reorder
  document.addEventListener('shopify:section:load', function (e) { window.themeMotion.init(e.target); });
})();
