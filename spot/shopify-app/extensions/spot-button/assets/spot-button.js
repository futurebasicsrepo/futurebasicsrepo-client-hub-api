// Spot "Ask someone to pay": sends the shopper's cart (variant ids and
// quantities only; Spot prices them from the store) and opens it in Spot.
(function () {
  if (window.__spotAsk) return;
  window.__spotAsk = true;

  function root() {
    return (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
  }

  // The product form the theme keeps up to date as the shopper picks a size.
  function productForm(wrap) {
    var scopes = [wrap.closest('.shopify-section'), document];
    for (var i = 0; i < scopes.length; i++) {
      var s = scopes[i];
      if (!s) continue;
      var f = s.querySelector('product-form form[action*="/cart/add"], form[action*="/cart/add"][id^="product-form"], form[action*="/cart/add"]');
      if (f) return f;
    }
    return null;
  }

  function lines(wrap) {
    if (wrap.getAttribute('data-mode') === 'cart') {
      return fetch(root() + 'cart.js', { headers: { accept: 'application/json' }, credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (c) {
          return (c.items || []).map(function (i) { return { variant_id: i.variant_id, quantity: i.quantity }; });
        });
    }
    var form = productForm(wrap);
    var idEl = form && form.querySelector('[name="id"]');
    var qEl = form && form.querySelector('[name="quantity"]');
    var id = (idEl && idEl.value) || wrap.getAttribute('data-variant');
    var q = parseInt((qEl && qEl.value) || '1', 10);
    return Promise.resolve(id ? [{ variant_id: id, quantity: q > 0 ? q : 1 }] : []);
  }

  function ask(wrap, btn) {
    var msg = wrap.querySelector('.spot-ask__msg');
    msg.textContent = '';
    // Open the tab now, while the tap still counts, or popup blockers stop it.
    var win = window.open('about:blank', '_blank');
    btn.setAttribute('aria-busy', 'true');
    btn.disabled = true;
    lines(wrap)
      .then(function (ls) {
        if (!ls.length) throw new Error('Your cart is empty');
        return fetch(wrap.getAttribute('data-api') + '/v1/shopify/asks', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ shop: wrap.getAttribute('data-shop'), lines: ls, from: wrap.getAttribute('data-mode') }),
        });
      })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) throw new Error(j.error || 'Spot is unavailable right now');
          return j;
        });
      })
      .then(function (j) {
        if (win) win.location.href = j.url;
        else window.location.href = j.url;
      })
      .catch(function (err) {
        if (win) win.close();
        msg.textContent = err.message || 'Something went wrong';
      })
      .then(function () {
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
      });
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-spot-shopify] .spot-ask__btn');
    if (!btn) return;
    e.preventDefault();
    ask(btn.closest('[data-spot-shopify]'), btn);
  });
})();
