/* ==========================================================================
   facets.js — AJAX filtering + sorting via Section Rendering API
   - Any checkbox / price / sort change updates the grid without reload
   - URL is kept in sync (back/forward works, links are shareable)
   - Drawer open/close for mobile
   ========================================================================== */
(function () {
  'use strict';
  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }

  var wrap = $('[data-collection]');
  if (!wrap) return;
  var sectionId = wrap.getAttribute('data-section-id');
  var debounceT = null;
  var controller = null;

  function drawer() { return $('[data-facets-drawer]', wrap); }
  function openDrawer() { var d = drawer(); if (!d) return; d.classList.add('is-open'); document.body.classList.add('is-locked'); var t = $('[data-facets-open]', wrap); if (t) t.setAttribute('aria-expanded', 'true'); }
  function closeDrawer() { var d = drawer(); if (!d) return; d.classList.remove('is-open'); document.body.classList.remove('is-locked'); var t = $('[data-facets-open]', wrap); if (t) t.setAttribute('aria-expanded', 'false'); }

  function buildUrl() {
    var form = $('[data-facets-form]', wrap);
    var fd = new FormData(form);
    var params = new URLSearchParams();
    fd.forEach(function (v, k) { if (v !== '' && v != null) params.append(k, v); });
    var base = window.location.pathname;
    return base + (params.toString() ? '?' + params.toString() : '');
  }

  function render(url, push) {
    var results = $('[data-results]', wrap);
    if (results) results.classList.add('is-loading');
    if (controller) controller.abort();
    controller = new AbortController();
    var sep = url.indexOf('?') > -1 ? '&' : '?';
    fetch(url + sep + 'section_id=' + sectionId, { signal: controller.signal })
      .then(function (r) { return r.text(); })
      .then(function (html) {
        var tmp = document.createElement('div'); tmp.innerHTML = html;
        var fresh = $('[data-collection]', tmp);
        if (!fresh) { window.location.href = url; return; }
        // Preserve open/closed state of facet groups + scroll position of drawer
        var openState = {};
        $$('.facet', wrap).forEach(function (f) { openState[f.getAttribute('data-facet-index')] = f.open; });
        var wasOpen = drawer() && drawer().classList.contains('is-open');
        wrap.innerHTML = fresh.innerHTML;
        $$('.facet', wrap).forEach(function (f) { var k = f.getAttribute('data-facet-index'); if (k in openState) f.open = openState[k]; });
        if (wasOpen) openDrawer();
        if (push) history.pushState({ facets: true }, '', url);
        if (window.themeMotion) window.themeMotion.init(wrap);
        var grid = $('[data-results]', wrap);
        var top = wrap.getBoundingClientRect().top + window.scrollY - 90;
        if (push && window.scrollY > top) window.scrollTo({ top: top, behavior: 'smooth' });
        if (grid) grid.classList.remove('is-loading');
      })
      .catch(function (err) { if (err.name !== 'AbortError') window.location.href = url; });
  }

  function onChange() {
    clearTimeout(debounceT);
    debounceT = setTimeout(function () { render(buildUrl(), true); }, 250);
  }

  wrap.addEventListener('change', function (e) {
    if (e.target.closest('[data-facets-form]')) onChange();
  });
  wrap.addEventListener('input', function (e) {
    if (e.target.matches('[data-facets-form] input[type="number"]')) { clearTimeout(debounceT); debounceT = setTimeout(function () { render(buildUrl(), true); }, 600); }
  });
  wrap.addEventListener('submit', function (e) { if (e.target.closest('[data-facets-form]')) { e.preventDefault(); render(buildUrl(), true); } });
  wrap.addEventListener('click', function (e) {
    if (e.target.closest('[data-facets-open]')) { e.preventDefault(); openDrawer(); return; }
    if (e.target.closest('[data-facets-close]')) { e.preventDefault(); closeDrawer(); return; }
    var link = e.target.closest('[data-facet-remove], [data-facet-clear], .pagination a');
    if (link) { e.preventDefault(); render(link.getAttribute('href'), true); }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); });
  window.addEventListener('popstate', function () { render(window.location.pathname + window.location.search, false); });
})();
