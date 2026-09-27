/* ==========================================================================
   product.js — variant selection, media switching, zoom, recommendations
   ========================================================================== */
(function () {
  'use strict';
  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }
  var root = $('[data-product]');
  var strings = (window.theme && window.theme.strings) || {};

  if (root) {
    var variants = JSON.parse(($('[data-variants]', root) || {}).textContent || '[]');
    var mediaMap = JSON.parse(($('[data-media-map]', root) || {}).textContent || '{}');
    var form = $('[data-product-form]', root);
    var idInput = $('[data-variant-id]', root);
    var atc = $('[data-atc]', root);
    var atcText = $('[data-atc-text]', root);
    var priceEl = $('[data-price]', root);
    var skuEl = $('[data-sku]', root);

    function money(cents) {
      var fmt = (window.theme && window.theme.moneyFormat) || '${{amount}}';
      var amount = (cents / 100).toFixed(2);
      return fmt.replace(/\{\{\s*amount\s*\}\}/, amount.replace(/\B(?=(\d{3})+(?!\d))/g, ',')).replace(/\{\{\s*amount_no_decimals\s*\}\}/, Math.round(cents / 100)).replace(/<[^>]+>/g, '');
    }

    function selected() {
      var opts = $$('[data-option-index]', root).map(function (fs) { var c = $('input:checked', fs); return c ? c.value : null; });
      return variants.find(function (v) { return v.options.every(function (o, i) { return o === opts[i]; }); }) || null;
    }

    function showMedia(id) {
      if (!id) return;
      $$('.product__slide', root).forEach(function (s) { var on = s.getAttribute('data-media-id') === String(id); s.hidden = !on; s.classList.toggle('is-active', on); });
      $$('[data-thumb]', root).forEach(function (t) { var on = t.getAttribute('data-media-id') === String(id); t.classList.toggle('is-active', on); t.setAttribute('aria-selected', on); });
    }

    function update() {
      var v = selected();
      if (!v) { if (atc) { atc.disabled = true; } if (atcText) atcText.textContent = strings.unavailable || 'Unavailable'; return; }
      if (idInput) idInput.value = v.id;
      if (atc) atc.disabled = !v.available;
      if (atcText) atcText.textContent = v.available ? (strings.addToCart || 'Add to bag') : (strings.soldOut || 'Sold out');
      if (priceEl) {
        var html = '<div class="price' + (v.compare_at_price > v.price ? ' price--on-sale' : '') + (v.available ? '' : ' price--sold-out') + '"><span class="price__current">' + money(v.price) + '</span>' + (v.compare_at_price > v.price ? '<s class="price__compare">' + money(v.compare_at_price) + '</s>' : '') + '</div>';
        priceEl.innerHTML = html;
      }
      if (skuEl) skuEl.textContent = v.sku || '';
      if (mediaMap[v.id]) showMedia(mediaMap[v.id]);
      var url = new URL(window.location.href); url.searchParams.set('variant', v.id); history.replaceState({}, '', url.toString());
    }

    root.addEventListener('change', function (e) { if (e.target.matches('[data-option]')) update(); });
    root.addEventListener('click', function (e) {
      var t = e.target.closest('[data-thumb]'); if (t) { showMedia(t.getAttribute('data-media-id')); return; }
      var z = e.target.closest('[data-zoom]');
      if (z) {
        z.classList.toggle('is-zoomed');
        if (z.classList.contains('is-zoomed')) { var r = z.getBoundingClientRect(); z.style.transformOrigin = ((e.clientX - r.left) / r.width * 100) + '% ' + ((e.clientY - r.top) / r.height * 100) + '%'; }
      }
    });
    root.addEventListener('mousemove', function (e) {
      var z = e.target.closest('[data-zoom].is-zoomed');
      if (z) { var r = z.getBoundingClientRect(); z.style.transformOrigin = ((e.clientX - r.left) / r.width * 100) + '% ' + ((e.clientY - r.top) / r.height * 100) + '%'; }
    });
    // Keyboard: arrow keys flip through media
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (e.target.matches('input, textarea, select')) return;
      var thumbs = $$('[data-thumb]', root); if (thumbs.length < 2) return;
      var i = thumbs.findIndex(function (t) { return t.classList.contains('is-active'); });
      var n = (i + (e.key === 'ArrowRight' ? 1 : -1) + thumbs.length) % thumbs.length;
      showMedia(thumbs[n].getAttribute('data-media-id'));
    });
    if (form) update();
  }

  /* Related products: fetch recommendations section */
  var rec = $('[data-recommendations]');
  if (rec) {
    fetch(rec.getAttribute('data-url')).then(function (r) { return r.text(); }).then(function (html) {
      var tmp = document.createElement('div'); tmp.innerHTML = html;
      var inner = tmp.querySelector('.related');
      var section = rec.closest('.related');
      if (inner && section) { section.innerHTML = inner.innerHTML; if (window.themeMotion) window.themeMotion.init(section); }
    }).catch(function () {});
  }
})();
