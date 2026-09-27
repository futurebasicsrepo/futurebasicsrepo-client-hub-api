/* ==========================================================================
   make-offer.js — PDP "Make an offer" modal + the buyer's offer ticket page
   Talks to the Future Basics hub API:
     POST {api}/v1/public/offers                    JSON → { token, checkout_url, offer }
     GET  {api}/v1/public/offers/{token}             → { offer }
     POST {api}/v1/public/offers/{token}/respond     { action, note } → { checkout_url, offer }
   ========================================================================== */
(function () {
  'use strict';
  function money(c) { return '$' + (Math.round(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]; }); }

  /* ---------- PDP modal: open with an offer ---------- */
  var root = document.querySelector('[data-make-offer]');
  if (root) {
    var api = (root.getAttribute('data-api') || '').replace(/\/$/, '');
    var variantId = root.getAttribute('data-variant-id');
    var minPercent = parseInt(root.getAttribute('data-min-percent') || '50', 10);
    var listPrice = parseInt(root.getAttribute('data-list-price') || '0', 10);
    var dialog = root.querySelector('[data-offer-dialog]');
    var form = root.querySelector('[data-offer-form]');
    var errorBox = root.querySelector('[data-offer-error]');
    var floorHint = root.querySelector('[data-offer-floor-hint]');
    var floorCents = Math.ceil(listPrice * minPercent / 100);
    if (floorHint) floorHint.textContent = 'Offers below ' + money(floorCents) + ' (' + minPercent + '% of ' + money(listPrice) + ') won’t be accepted.';

    root.querySelector('[data-offer-open]').addEventListener('click', function () {
      var variantInput = document.querySelector('[data-variant-id]');
      if (variantInput && variantInput.value) variantId = variantInput.value;
      dialog.showModal();
    });
    root.querySelector('[data-offer-close]').addEventListener('click', function () { dialog.close(); });
    dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      errorBox.hidden = true;
      var fd = new FormData(form);
      var amountDollars = parseFloat(fd.get('amount'));
      if (!(amountDollars > 0)) { errorBox.hidden = false; errorBox.textContent = 'Enter an offer amount.'; return; }
      var submitBtn = root.querySelector('[data-offer-submit]');
      submitBtn.disabled = true;
      var originalText = submitBtn.textContent;
      submitBtn.textContent = 'Sending…';
      fetch(api + '/v1/public/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variant_id: variantId, quantity: 1, amount: amountDollars,
          buyer_name: fd.get('buyer_name'), buyer_email: fd.get('buyer_email'), buyer_phone: fd.get('buyer_phone'),
          note: fd.get('note'), company_fax: fd.get('company_fax')
        })
      })
        .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Something went wrong.'); return d; }); })
        .then(function (d) {
          if (d.checkout_url) { window.location.href = d.checkout_url; return; }
          submitBtn.disabled = false; submitBtn.textContent = originalText;
          errorBox.hidden = false; errorBox.textContent = 'Offer received, but no checkout link came back — check your email.';
        })
        .catch(function (err) {
          submitBtn.disabled = false; submitBtn.textContent = originalText;
          errorBox.hidden = false; errorBox.textContent = err.message || 'Something went wrong. Try again.';
        });
    });
  }

  /* ---------- Offer ticket page (?t=token) ---------- */
  var ticketRoot = document.querySelector('[data-offer-ticket]');
  if (!ticketRoot) return;
  var tApi = (ticketRoot.getAttribute('data-api') || '').replace(/\/$/, '');
  var token = new URLSearchParams(window.location.search).get('t');
  var STATE = { awaiting_payment: 'Awaiting checkout', pending_review: 'With the shop', countered: 'Counter-offer sent', accepted: 'Deal ✓', declined: 'Declined', expired: 'Expired', cancelled: 'Cancelled' };

  function load() {
    if (!token) { ticketRoot.querySelector('[data-offer-empty]').hidden = false; return; }
    fetch(tApi + '/v1/public/offers/' + encodeURIComponent(token)).then(function (r) { if (!r.ok) throw new Error('nf'); return r.json(); })
      .then(function (d) { render(d.offer); })
      .catch(function () { ticketRoot.querySelector('[data-offer-empty]').hidden = false; });
  }

  function render(o) {
    var t = ticketRoot.querySelector('[data-ticket]');
    t.hidden = false;
    ticketRoot.querySelector('[data-offer-empty]').hidden = true;
    ticketRoot.querySelector('[data-ticket-title]').textContent = o.product_title + (o.variant_title && o.variant_title !== 'Default Title' ? ' — ' + o.variant_title : '');
    ticketRoot.querySelector('[data-ticket-state]').textContent = STATE[o.status] || o.status;
    ticketRoot.querySelector('[data-ticket-state]').className = 'ticket__state chip' + (o.status === 'accepted' ? ' chip--on' : '');
    ticketRoot.querySelector('[data-ticket-amount]').textContent = money(o.current_amount_cents) + ' vs list ' + money(o.list_price_cents);
    var img = ticketRoot.querySelector('[data-ticket-image]');
    if (o.image_url) { img.src = o.image_url; img.hidden = false; }

    var thread = ticketRoot.querySelector('[data-ticket-offers]');
    thread.innerHTML = o.moves.map(function (m) {
      var side = m.by === 'store' ? 'store' : 'seller';
      var who = m.by === 'store' ? 'The shop' : m.by === 'buyer' ? 'You' : 'System';
      var verb = { offer: 'offered', paid: 'checkout completed', counter: 'countered', accept: 'accepted', decline: 'declined', expire: 'expired', cancel: 'cancelled' }[m.kind] || m.kind;
      return '<div class="offer offer--' + side + '"><span class="offer__who">' + esc(who) + '</span><span class="offer__amt">' + (m.amount_cents ? money(m.amount_cents) : verb) + '</span>' +
        (m.amount_cents ? '<span class="small">' + esc(verb) + '</span>' : '') + (m.note ? '<span class="small">' + esc(m.note) + '</span>' : '') + '</div>';
    }).join('');

    var respond = ticketRoot.querySelector('[data-ticket-respond]');
    if (o.status === 'countered') {
      respond.hidden = false;
      ticketRoot.querySelector('[data-ticket-latest]').textContent = money(o.current_amount_cents);
    } else {
      respond.hidden = true;
    }
    ticketRoot.querySelector('[data-ticket-foot]').textContent = o.status === 'pending_review' ? 'We’ll respond within 24 hours.' : o.status === 'countered' ? 'Respond within 24 hours or this expires.' : '';
  }

  ticketRoot.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-respond]');
    if (!btn) return;
    var action = btn.getAttribute('data-respond');
    if (!['accept', 'decline'].includes(action)) return;
    btn.disabled = true;
    fetch(tApi + '/v1/public/offers/' + encodeURIComponent(token) + '/respond', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: action })
    })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Something went wrong.'); return d; }); })
      .then(function (d) {
        if (action === 'accept' && d.checkout_url) { window.location.href = d.checkout_url; return; }
        btn.disabled = false;
        render(d.offer);
      })
      .catch(function (err) { btn.disabled = false; alert(err.message || 'Something went wrong.'); });
  });

  load();
})();
