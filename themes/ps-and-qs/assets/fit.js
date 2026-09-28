/* ==========================================================================
   fit.js — the shopper's saved sizes, used everywhere
   - Stored in localStorage as { tops:[], bottoms:[], shoes:[] } under "pq:fit"
   - Cards ([data-card][data-sizes]) get an "In your size" flag
   - Collections get an "In my size" switch that applies the Size filter
   - Product pages pre-select the saved size when it's in stock
   - Recently viewed products are remembered for the "Picked up where you left off" rail
   ========================================================================== */
(function () {
  'use strict';
  var KEY = 'pq:fit';
  var RECENT = 'pq:recent';
  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }
  function read(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function profile() { return read(KEY, { tops: [], bottoms: [], shoes: [] }); }
  function allSizes() { var p = profile(); return [].concat(p.tops || [], p.bottoms || [], p.shoes || []); }
  function norm(s) { return String(s).trim().toLowerCase(); }
  function hasProfile() { return allSizes().length > 0; }

  /* ---- Cards ---- */
  function flagCards(root) {
    var mine = allSizes().map(norm);
    $$('[data-card]', root).forEach(function (card) {
      var sizes = (card.getAttribute('data-sizes') || '').split('|').filter(Boolean).map(norm);
      var match = mine.length && sizes.some(function (s) { return mine.indexOf(s) > -1; });
      card.classList.toggle('is-in-size', !!match);
      var flag = $('[data-fit-flag]', card); if (flag) flag.hidden = !match;
      $$('[data-size]', card).forEach(function (b) { b.classList.toggle('is-mine', mine.indexOf(norm(b.getAttribute('data-size'))) > -1); });
    });
  }

  /* ---- "In your size" rails: show only what fits, with a way back to everything ---- */
  function filterRails(root) {
    var mine = allSizes().map(norm);
    $$('[data-rail-mode="fit"]', root).forEach(function (rail) {
      var cards = $$('[data-card]', rail);
      var matches = cards.filter(function (c) { return c.classList.contains('is-in-size'); });
      var active = mine.length > 0 && matches.length > 0 && !rail.__showAll;
      cards.forEach(function (c) { c.classList.toggle('is-filtered-out', active && !c.classList.contains('is-in-size')); });
      var note = $('[data-rail-fit-note]', rail), empty = $('[data-rail-fit-empty]', rail);
      if (note) note.hidden = !active;
      if (empty) empty.hidden = mine.length > 0;
    });
  }

  /* ---- Collection "In my size" switch ---- */
  function sizeParam() {
    var el = $('[data-fit-config]');
    var name = el ? JSON.parse(el.textContent) : 'Size';
    return 'filter.v.option.' + norm(name);
  }
  function syncSwitch() {
    $$('[data-fit-switch]').forEach(function (sw) {
      var params = new URLSearchParams(window.location.search);
      var active = params.getAll(sizeParam()).length > 0;
      sw.setAttribute('aria-pressed', active ? 'true' : 'false');
      sw.hidden = false;
    });
  }
  function toggleSwitch(sw) {
    if (!hasProfile()) { openDialog(); return; }
    var params = new URLSearchParams(window.location.search);
    var key = sizeParam();
    var on = params.getAll(key).length > 0;
    params.delete(key); params.delete('page');
    if (!on) allSizes().forEach(function (s) { params.append(key, s); });
    var url = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
    if (window.themeFacets && window.themeFacets.render) window.themeFacets.render(url, true);
    else window.location.href = url;
  }

  /* ---- Product page pre-select ---- */
  function preselect() {
    var root = $('[data-product]'); if (!root) return;
    if (new URLSearchParams(window.location.search).get('variant')) return;
    var mine = allSizes().map(norm); if (!mine.length) return;
    $$('[data-option-index]', root).forEach(function (fs) {
      if (!/size/i.test(fs.getAttribute('data-option-name') || '')) return;
      var pick = $$('input[data-option]', fs).find(function (i) {
        return mine.indexOf(norm(i.value)) > -1 && !i.closest('.swatch--soldout');
      });
      if (pick && !pick.checked) { pick.checked = true; pick.dispatchEvent(new Event('change', { bubbles: true })); }
    });
  }

  /* ---- Recently viewed ---- */
  function remember() {
    var el = $('[data-recent-product]'); if (!el) return;
    var handle = el.getAttribute('data-recent-product');
    var list = read(RECENT, []).filter(function (h) { return h !== handle; });
    list.unshift(handle); write(RECENT, list.slice(0, 12));
  }
  function renderRecent() {
    $$('[data-recent-rail]').forEach(function (rail) {
      var current = ($('[data-recent-product]') || { getAttribute: function () { return ''; } }).getAttribute('data-recent-product');
      var list = read(RECENT, []).filter(function (h) { return h && h !== current; }).slice(0, 8);
      if (!list.length) return;
      var grid = $('[data-recent-grid]', rail);
      var root = (window.theme && window.theme.routes.root) || '/';
      Promise.all(list.map(function (h) {
        return fetch(root.replace(/\/$/, '') + '/products/' + encodeURIComponent(h) + '?view=card').then(function (r) { return r.ok ? r.text() : ''; }).catch(function () { return ''; });
      })).then(function (cards) {
        var html = cards.filter(Boolean).join('');
        if (!html) return;
        grid.innerHTML = html; rail.hidden = false;
        flagCards(rail);
        if (window.themeMotion) window.themeMotion.init(rail);
      });
    });
  }

  /* ---- Dialog ---- */
  function dialog() { return $('[data-fit-dialog]'); }
  function openDialog() {
    var d = dialog(); if (!d) return;
    var p = profile();
    $$('input[type="checkbox"]', d).forEach(function (i) { i.checked = (p[i.name] || []).indexOf(i.value) > -1; });
    if (d.showModal) d.showModal(); else d.setAttribute('open', '');
  }
  function save() {
    var d = dialog(); var p = { tops: [], bottoms: [], shoes: [] };
    $$('input[type="checkbox"]:checked', d).forEach(function (i) { (p[i.name] = p[i.name] || []).push(i.value); });
    write(KEY, p); apply();
    document.dispatchEvent(new CustomEvent('fit:change', { detail: p }));
  }
  function apply(root) {
    flagCards(root || document);
    filterRails(document);
    var n = allSizes().length;
    $$('[data-fit-count]').forEach(function (el) { el.textContent = n ? n : ''; el.hidden = !n; });
    $$('[data-fit-label]').forEach(function (el) {
      el.textContent = n ? (el.getAttribute('data-label-set') || 'My sizes') : (el.getAttribute('data-label-empty') || 'Set my sizes');
    });
    syncSwitch();
  }

  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-fit-open]')) { e.preventDefault(); openDialog(); return; }
    var sw = e.target.closest('[data-fit-switch]'); if (sw) { e.preventDefault(); toggleSwitch(sw); return; }
    var all = e.target.closest('[data-rail-show-all]');
    if (all) { var rail = all.closest('[data-rail]'); if (rail) { rail.__showAll = true; filterRails(document); } return; }
    if (e.target.closest('[data-fit-clear]')) { $$('input[type="checkbox"]', dialog()).forEach(function (i) { i.checked = false; }); }
  });
  document.addEventListener('submit', function (e) {
    if (e.target.matches('[data-fit-form]') && e.submitter && e.submitter.value === 'save') save();
  });
  document.addEventListener('facets:render', function (e) { apply(e.target); });
  window.addEventListener('popstate', syncSwitch);

  function init() { apply(); preselect(); remember(); renderRecent(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  window.themeFit = { profile: profile, sizes: allSizes, open: openDialog, apply: apply };
})();
