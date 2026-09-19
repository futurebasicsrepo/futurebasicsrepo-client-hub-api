/* ==========================================================================
   cart.js — AJAX cart drawer (add, change, remove) with section re-render
   ========================================================================== */
(function () {
  'use strict';
  var routes = (window.theme && window.theme.routes) || {};
  var strings = (window.theme && window.theme.strings) || {};
  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }

  var drawer = $('[data-cart-drawer]');
  var overlay = $('[data-cart-overlay]');

  function open() {
    if (!drawer) return;
    drawer.classList.add('is-open'); drawer.setAttribute('aria-hidden', 'false');
    if (overlay) { overlay.hidden = false; requestAnimationFrame(function () { overlay.classList.add('is-open'); }); }
    document.body.classList.add('is-locked');
    var c = $('[data-cart-close]', drawer); if (c) c.focus();
  }
  function close() {
    if (!drawer) return;
    drawer.classList.remove('is-open'); drawer.setAttribute('aria-hidden', 'true');
    if (overlay) { overlay.classList.remove('is-open'); setTimeout(function () { overlay.hidden = true; }, 250); }
    document.body.classList.remove('is-locked');
  }

  function bumpCount(count) {
    $$('[data-cart-count]').forEach(function (el) {
      el.textContent = count; el.classList.toggle('is-empty', count === 0);
      el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
    });
  }

  /* Re-render the drawer from the Section Rendering API */
  function refresh(openAfter) {
    return fetch(window.location.pathname + '?sections=cart-drawer', { headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var html = data['cart-drawer'];
        if (!html || !drawer) return;
        var tmp = document.createElement('div'); tmp.innerHTML = html;
        var fresh = $('[data-cart-drawer]', tmp);
        if (fresh) {
          drawer.innerHTML = fresh.innerHTML;
          if (window.themeMotion) window.themeMotion.init(drawer);
        }
        return fetch(routes.cart + '.js').then(function (r) { return r.json(); }).then(function (cart) { bumpCount(cart.item_count); if (openAfter) open(); });
      });
  }

  function add(formData, button) {
    var text = button && button.querySelector('[data-atc-text]');
    var orig = text ? text.textContent : (button ? button.textContent : '');
    if (button) { button.disabled = true; if (text) text.textContent = strings.adding || 'Adding…'; else button.textContent = strings.adding || 'Adding…'; }
    return fetch(routes.cartAdd + '.js', { method: 'POST', body: formData, headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' } })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw j; return j; }); })
      .then(function () {
        if (button) { button.classList.add('is-added'); if (text) text.textContent = strings.added || 'Added ✓'; else button.textContent = strings.added || 'Added ✓'; }
        return refresh(true);
      })
      .catch(function (err) {
        var msg = (err && (err.description || err.message)) || 'Could not add to bag.';
        alert(msg);
      })
      .then(function () {
        setTimeout(function () { if (button) { button.disabled = false; button.classList.remove('is-added'); if (text) text.textContent = orig; else button.textContent = orig; } }, 1400);
      });
  }

  function change(line, quantity) {
    return fetch(routes.cartChange + '.js', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify({ line: line, quantity: quantity }) })
      .then(function () { return refresh(false); });
  }

  /* ---- Events ---- */
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-cart-open]')) { e.preventDefault(); refresh(true); return; }
    if (e.target.closest('[data-cart-close]')) { close(); return; }
    var rm = e.target.closest('[data-line-remove]');
    if (rm) { var li = rm.closest('.cart-line'); if (li) li.classList.add('is-removing'); change(parseInt(rm.getAttribute('data-index'), 10), 0); }
  });
  if (overlay) overlay.addEventListener('click', close);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && drawer && drawer.classList.contains('is-open')) close(); });

  document.addEventListener('change', function (e) {
    var input = e.target.closest('[data-cart-drawer] [data-qty-input]');
    if (input) change(parseInt(input.getAttribute('data-index'), 10), Math.max(0, parseInt(input.value, 10) || 0));
  });

  document.addEventListener('submit', function (e) {
    var form = e.target.closest('[data-quick-add], [data-product-form]');
    if (!form) return;
    e.preventDefault();
    var fd = new FormData(form);
    add(fd, form.querySelector('[type="submit"]'));
  });

  window.themeCart = { open: open, close: close, refresh: refresh, add: add };
})();
