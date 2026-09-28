/* ==========================================================================
   header.js — menu drawer, Shop mega menu, search overlay + predictive search
   ========================================================================== */
(function () {
  'use strict';
  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }
  var routes = (window.theme && window.theme.routes) || {};

  /* ---- Mobile drawer ---- */
  var drawer = $('[data-menu-drawer]');
  function setDrawer(open) {
    if (!drawer) return;
    drawer.classList.toggle('is-open', open);
    drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
    document.body.classList.toggle('is-locked', open);
    $$('[data-drawer-open]').forEach(function (b) { b.setAttribute('aria-expanded', open); });
    if (open) { var f = $('a, button', drawer); if (f) f.focus(); }
  }

  /* ---- Mega menu (hover on desktop, click/keyboard everywhere) ---- */
  var megaItem = $('.nav__item--mega');
  var megaTrigger = $('[data-mega-trigger]');
  var megaT;
  function setMega(open) {
    if (!megaItem) return;
    megaItem.classList.toggle('is-open', open);
    if (megaTrigger) megaTrigger.setAttribute('aria-expanded', open);
  }
  if (megaItem) {
    megaItem.addEventListener('mouseenter', function () { clearTimeout(megaT); setMega(true); });
    megaItem.addEventListener('mouseleave', function () { megaT = setTimeout(function () { setMega(false); }, 160); });
    megaItem.addEventListener('focusout', function (e) { if (!megaItem.contains(e.relatedTarget)) setMega(false); });
    megaTrigger.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); setMega(true); var a = $('.mega a', megaItem); if (a) a.focus(); }
    });
  }

  /* ---- Search overlay ---- */
  var overlay = $('[data-search-overlay]');
  var input = $('[data-search-input]');
  var results = $('[data-search-results]');
  var idle = results ? results.innerHTML : '';
  var ctrl, t;
  function setSearch(open) {
    if (!overlay) return;
    overlay.hidden = !open;
    document.body.classList.toggle('is-searching', open);
    $$('[data-search-open]').forEach(function (b) { b.setAttribute('aria-expanded', open); });
    if (open && input) setTimeout(function () { input.focus(); }, 30);
  }
  function suggest(q) {
    if (!results) return;
    if (!q) { results.innerHTML = idle; return; }
    if (ctrl) ctrl.abort(); ctrl = new AbortController();
    var url = routes.predictiveSearch + '?q=' + encodeURIComponent(q) +
      '&resources[type]=product,collection,query&resources[limit]=6&resources[options][fields]=title,product_type,variants.title,vendor,tag&section_id=predictive-search';
    fetch(url, { signal: ctrl.signal }).then(function (r) { return r.text(); }).then(function (html) {
      var tmp = document.createElement('div'); tmp.innerHTML = html;
      var node = $('[data-predictive]', tmp);
      results.innerHTML = node ? node.outerHTML : '';
    }).catch(function () {});
  }
  if (input) input.addEventListener('input', function () { clearTimeout(t); var q = input.value.trim(); t = setTimeout(function () { suggest(q); }, 180); });

  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-drawer-open]')) { setDrawer(true); return; }
    if (e.target.closest('[data-drawer-close]')) { setDrawer(false); return; }
    if (e.target.closest('[data-search-open]')) { setSearch(true); return; }
    if (e.target.closest('[data-search-close]')) { setSearch(false); return; }
    if (megaTrigger && e.target === megaTrigger && window.matchMedia('(hover: none)').matches && !megaItem.classList.contains('is-open')) { e.preventDefault(); setMega(true); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { setDrawer(false); setSearch(false); setMega(false); }
    if (e.key === '/' && !e.target.matches('input, textarea, select, [contenteditable]')) { e.preventDefault(); setSearch(true); }
  });

  /* ---- Header shadow once scrolled ---- */
  var header = $('[data-header]');
  if (header) {
    var io = new IntersectionObserver(function (en) { header.classList.toggle('is-stuck', !en[0].isIntersecting); });
    var sentinel = document.createElement('div'); sentinel.style.cssText = 'position:absolute;top:0;height:1px;width:1px;';
    document.body.prepend(sentinel); io.observe(sentinel);
  }
})();
