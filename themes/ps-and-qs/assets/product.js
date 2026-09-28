/* ==========================================================================
   product.js — variant selection, gallery, zoom, pickup availability,
   and lazy-loaded recommendation rails
   ========================================================================== */
(function () {
  'use strict';
  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }
  var strings = (window.theme && window.theme.strings) || {};
  var root = $('[data-product]');

  function money(cents) {
    var fmt = (window.theme && window.theme.moneyFormat) || '${{amount}}';
    var amount = (cents / 100).toFixed(2);
    return fmt.replace(/\{\{\s*amount\s*\}\}/, amount.replace(/\B(?=(\d{3})+(?!\d))/g, ','))
      .replace(/\{\{\s*amount_no_decimals\s*\}\}/, String(Math.round(cents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ','))
      .replace(/<[^>]+>/g, '');
  }

  if (root) {
    var variants = JSON.parse(($('[data-variants]', root) || {}).textContent || '[]');
    var idInput = $('[data-variant-id]', root);
    var atc = $('[data-atc]', root);
    var atcText = $('[data-atc-text]', root);
    var priceEl = $('[data-price]', root);
    var skuEl = $('[data-sku]', root);
    var pickup = $('[data-pickup]', root);
    var track = $('[data-media-track]', root);

    function selected() {
      var opts = $$('[data-option-index]', root).map(function (fs) { var c = $('input:checked', fs); return c ? c.value : null; });
      return variants.find(function (v) { return v.options.every(function (o, i) { return o === opts[i]; }); }) || null;
    }

    function showMedia(id) {
      var slide = id && $('.pdp__slide[data-media-id="' + id + '"]', root);
      if (!slide || !track) return;
      if (window.matchMedia('(min-width: 990px)').matches) {
        var top = slide.getBoundingClientRect().top + window.scrollY - 90;
        if (Math.abs(window.scrollY - top) > 40 && slide.getBoundingClientRect().top > window.innerHeight) window.scrollTo({ top: top, behavior: 'smooth' });
      } else {
        track.scrollTo({ left: slide.offsetLeft - track.offsetLeft, behavior: 'smooth' });
      }
    }

    function loadPickup(v) {
      if (!pickup || !v) return;
      var base = pickup.getAttribute('data-root') || '/';
      fetch(base.replace(/\/$/, '') + '/variants/' + v.id + '/?section_id=pickup-availability')
        .then(function (r) { return r.text(); })
        .then(function (html) {
          var tmp = document.createElement('div'); tmp.innerHTML = html;
          var c = $('[data-pickup-content]', tmp);
          pickup.innerHTML = c ? c.outerHTML : '';
        }).catch(function () { pickup.innerHTML = ''; });
    }

    function update(fromUser) {
      $$('[data-option-index]', root).forEach(function (fs) {
        var c = $('input:checked', fs); var out = $('[data-option-value]', fs); if (c && out) out.textContent = c.value;
      });
      var v = selected();
      if (!v) { if (atc) atc.disabled = true; if (atcText) atcText.textContent = strings.unavailable || 'Unavailable'; return; }
      if (idInput) idInput.value = v.id;
      if (atc) atc.disabled = !v.available;
      if (atcText) atcText.textContent = v.available ? (strings.addToCart || 'Add to bag') : (strings.soldOut || 'Sold out');
      if (priceEl) {
        var sale = v.compare_at_price > v.price;
        priceEl.innerHTML = '<div class="price' + (sale ? ' price--on-sale' : '') + (v.available ? '' : ' price--sold-out') + '"><span class="price__current">' + money(v.price) + '</span>' + (sale ? '<s class="price__compare">' + money(v.compare_at_price) + '</s>' : '') + '</div>';
      }
      if (skuEl) skuEl.textContent = v.sku || '';
      if (fromUser && v.featured_media) showMedia(v.featured_media.id);
      loadPickup(v);
      if (fromUser) { var url = new URL(window.location.href); url.searchParams.set('variant', v.id); history.replaceState({}, '', url.toString()); }
    }

    root.addEventListener('change', function (e) { if (e.target.matches('[data-option]')) update(true); });

    /* Zoom: click to toggle, pointer pans */
    root.addEventListener('click', function (e) {
      var z = e.target.closest('[data-zoom]'); if (!z) return;
      z.classList.toggle('is-zoomed');
      pan(z, e);
    });
    root.addEventListener('pointermove', function (e) { var z = e.target.closest('[data-zoom].is-zoomed'); if (z) pan(z, e); });
    function pan(z, e) {
      var img = $('img', z); if (!img) return;
      var r = z.getBoundingClientRect();
      img.style.transformOrigin = ((e.clientX - r.left) / r.width * 100) + '% ' + ((e.clientY - r.top) / r.height * 100) + '%';
    }

    /* Mobile carousel dots */
    var dots = $$('.pdp__dot', root);
    if (track && dots.length) {
      track.addEventListener('scroll', function () {
        var i = Math.round(track.scrollLeft / track.clientWidth);
        dots.forEach(function (d, n) { d.classList.toggle('is-active', n === i); });
      }, { passive: true });
    }

    update(false);
  }

  /* Recommendation rails (any page) */
  $$('[data-recs]').forEach(function (sec) {
    var load = function () {
      fetch(sec.getAttribute('data-url')).then(function (r) { return r.text(); }).then(function (html) {
        var tmp = document.createElement('div'); tmp.innerHTML = html;
        var fresh = $('[data-recs]', tmp);
        if (fresh && fresh.innerHTML.trim()) {
          sec.innerHTML = fresh.innerHTML;
          if (window.themeFit) window.themeFit.apply(sec);
          if (window.themeMotion) window.themeMotion.init(sec);
        }
      }).catch(function () {});
    };
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { io.disconnect(); load(); } }, { rootMargin: '600px' });
      io.observe(sec);
    } else load();
  });
})();
