/* ==========================================================================
   motion.js — the press
   - Mirror: the hero's p and q turn into each other as you scroll; pointer drifts
     the photography inside the letterforms
   - Set type: headline words rise into place like a composing stick
   - Off-register: headings print with red + jade passes out of line, then register
   - Press-roll reveals, type-case "printing" on touch, scrubbed mirror glyphs
   - Composing-stick marquee reverses with scroll direction
   - Type-sort cursor, drag-to-scroll proof sheet, rail arrows, qty steppers,
     live "open now" for the shop
   Motion level (Theme settings) and prefers-reduced-motion are respected throughout.
   ========================================================================== */
(function () {
  'use strict';
  var html = document.documentElement;
  var level = html.getAttribute('data-motion') || 'full';
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var FULL = level === 'full' && !reduced;
  var ANY = level !== 'off' && !reduced;
  var coarse = window.matchMedia('(hover: none), (pointer: coarse)').matches;
  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  /* ---- Reveal ---- */
  function initReveal(root) {
    var els = $$('.reveal:not(.is-in)', root);
    if (!ANY || !('IntersectionObserver' in window)) { els.forEach(function (e) { e.classList.add('is-in'); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    els.forEach(function (e) { io.observe(e); });
  }

  /* ---- Off-register headings ---- */
  function initOffreg(root) {
    $$('[data-offreg]', root).forEach(function (el) {
      if (el.__offreg) return; el.__offreg = true;
      el.setAttribute('data-text', el.textContent.trim());
      if (!FULL) { el.classList.add('is-registered'); return; }
      var io = new IntersectionObserver(function (en) {
        if (en[0].isIntersecting) { setTimeout(function () { el.classList.add('is-registered'); }, 450); io.disconnect(); }
      }, { threshold: .6 });
      io.observe(el);
      el.addEventListener('pointerenter', function () { el.classList.remove('is-registered'); });
      el.addEventListener('pointerleave', function () { el.classList.add('is-registered'); });
    });
  }

  /* ---- Set type (hero headline) ---- */
  function initSetType(root) {
    $$('[data-set-type]', root).forEach(function (el) {
      if (el.__set) return; el.__set = true;
      var words = el.textContent.trim().split(/\s+/);
      el.setAttribute('aria-label', el.textContent.trim());
      el.innerHTML = words.map(function (w, i) { return '<span class="w" aria-hidden="true" style="--wi:' + i + '"><span>' + w.replace(/[<>&]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]; }) + '</span></span>'; }).join(' ');
      requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.add('is-set'); }); });
    });
  }

  /* ---- Scroll-linked: mirror hero, scrubbed glyphs, marquee direction ---- */
  function initScroll() {
    var mirror = $('[data-mirror]');
    var scrubs = $$('[data-mirror-scrub]');
    var sticks = $$('[data-scroll-velocity]');
    if (!ANY) return;
    var lastY = window.scrollY, ticking = false;
    function frame() {
      ticking = false;
      var y = window.scrollY, vh = window.innerHeight;
      if (mirror && FULL) {
        var h = mirror.offsetHeight;
        mirror.style.setProperty('--flip', clamp(y / (h * .75), 0, 1).toFixed(3));
      }
      if (FULL) scrubs.forEach(function (el) {
        var r = el.getBoundingClientRect();
        var p = clamp(1 - (r.top + r.height / 2) / vh, 0, 1);
        el.style.setProperty('--flip', clamp((p - .25) * 2, 0, 1).toFixed(3));
      });
      var dir = y < lastY ? 'reverse' : 'normal';
      if (Math.abs(y - lastY) > 2) sticks.forEach(function (s) { s.style.setProperty('--dir', dir); });
      lastY = y;
    }
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }, { passive: true });
    frame();

    if (mirror && FULL && !coarse) {
      var raf;
      mirror.addEventListener('pointermove', function (e) {
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(function () {
          var r = mirror.getBoundingClientRect();
          mirror.style.setProperty('--px', ((e.clientX - r.left) / r.width - .5).toFixed(3));
          mirror.style.setProperty('--py', ((e.clientY - r.top) / r.height - .5).toFixed(3));
        });
      });
    }
  }

  /* ---- Type case on touch: the compartment in the middle of the screen prints ---- */
  function initCase(root) {
    if (!coarse || !ANY || !('IntersectionObserver' in window)) return;
    var cells = $$('.case__cell', root);
    if (!cells.length) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { en.target.classList.toggle('is-centered', en.isIntersecting); });
    }, { rootMargin: '-42% 0px -42% 0px' });
    cells.forEach(function (c) { io.observe(c); });
  }

  /* ---- Type-sort cursor ---- */
  function initCursor() {
    var cur = $('.type-cursor');
    if (!cur || !FULL || coarse) return;
    document.addEventListener('pointermove', function (e) {
      cur.style.setProperty('--cx', e.clientX + 'px'); cur.style.setProperty('--cy', e.clientY + 'px');
      cur.classList.add('is-active');
    }, { passive: true });
    document.addEventListener('pointerover', function (e) {
      cur.classList.toggle('is-link', !!e.target.closest('a, button, label, summary, [role="button"], input[type="submit"]'));
    });
    document.documentElement.addEventListener('pointerleave', function () { cur.classList.remove('is-active'); });
  }

  /* ---- Rails: arrow buttons ---- */
  function initRails(root) {
    $$('[data-rail]', root).forEach(function (rail) {
      if (rail.__rail) return; rail.__rail = true;
      var track = $('[data-rail-track]', rail); if (!track) return;
      function step(d) { var card = track.firstElementChild; var w = card ? card.getBoundingClientRect().width + 16 : 300; track.scrollBy({ left: d * w * 2, behavior: ANY ? 'smooth' : 'auto' }); }
      var prev = $('[data-rail-prev]', rail), next = $('[data-rail-next]', rail);
      if (prev) prev.addEventListener('click', function () { step(-1); });
      if (next) next.addEventListener('click', function () { step(1); });
    });
  }

  /* ---- Drag to scroll (proof sheet) ---- */
  function initDrag(root) {
    $$('[data-drag-scroll]', root).forEach(function (el) {
      if (el.__drag || coarse) return; el.__drag = true;
      var down = false, sx = 0, sl = 0, moved = false;
      el.addEventListener('pointerdown', function (e) { if (e.pointerType !== 'mouse') return; down = true; moved = false; sx = e.clientX; sl = el.scrollLeft; });
      window.addEventListener('pointermove', function (e) { if (!down) return; var dx = e.clientX - sx; if (Math.abs(dx) > 4) { moved = true; el.classList.add('is-dragging'); } el.scrollLeft = sl - dx; });
      window.addEventListener('pointerup', function () { down = false; el.classList.remove('is-dragging'); });
      el.addEventListener('click', function (e) { if (moved) { e.preventDefault(); e.stopPropagation(); } }, true);
    });
  }

  /* ---- Quantity steppers ---- */
  function initQty(root) {
    $$('[data-qty]', root).forEach(function (q) {
      if (q.__qty) return; q.__qty = true;
      var input = $('[data-qty-input]', q);
      q.addEventListener('click', function (e) {
        var b = e.target.closest('[data-qty-minus],[data-qty-plus]'); if (!b || !input) return;
        var min = parseInt(input.min || '0', 10), v = parseInt(input.value || '0', 10) || 0;
        v = b.hasAttribute('data-qty-plus') ? v + 1 : Math.max(min, v - 1);
        input.value = v; input.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
  }

  /* ---- Visit: live open/closed from Theme settings hours (store's local time) ---- */
  function initOpenStatus(root) {
    $$('[data-visit]', root).forEach(function (v) {
      var status = $('[data-open-status]', v), text = $('[data-open-text]', v); if (!status) return;
      var parse = function (s) { var m = (s || '').split('-'); if (m.length !== 2) return null; return m.map(function (t) { var p = t.trim().split(':'); return (+p[0]) * 60 + (+p[1] || 0); }); };
      var wk = parse(v.getAttribute('data-hours-weekday')), su = parse(v.getAttribute('data-hours-sunday'));
      var now;
      try { now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })); } catch (e) { now = new Date(); }
      var todays = now.getDay() === 0 ? su : wk; if (!todays) return;
      var mins = now.getHours() * 60 + now.getMinutes();
      var fmt = function (m) { var h = Math.floor(m / 60), mm = m % 60, ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12; return h + (mm ? ':' + String(mm).padStart(2, '0') : '') + ap; };
      var open = mins >= todays[0] && mins < todays[1];
      var next = open ? todays[1] : (mins < todays[0] ? todays[0] : (now.getDay() === 6 ? (su || wk)[0] : wk[0]));
      var when = (open || mins < todays[0] ? '' : (v.getAttribute('data-t-tomorrow') || 'tomorrow') + ' ') + fmt(next);
      var tpl = v.getAttribute(open ? 'data-t-open' : 'data-t-closed') || (open ? 'Open now · until %t' : 'Closed · opens %t');
      text.textContent = tpl.replace('%t', when);
      status.classList.toggle('is-open', open); status.hidden = false;
    });
  }

  function init(root) {
    root = root || document;
    initReveal(root); initOffreg(root); initSetType(root); initCase(root);
    initRails(root); initDrag(root); initQty(root); initOpenStatus(root);
  }

  function boot() { init(document); initScroll(); initCursor(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  window.themeMotion = { init: init };
})();
