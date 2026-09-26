/* ==========================================================================
   consign.js — Sell-to-us form (multipart upload) + trade-in ticket (offers)
   Talks to the Future Basics hub API:
     POST {api}/v1/public/consignments            multipart → { id, token, status_url }
     GET  {api}/v1/public/consignments/{token}    → { consignment }
     POST {api}/v1/public/consignments/{token}/respond { action, amount_cents, note }
   ========================================================================== */
(function () {
  'use strict';
  var root = document.querySelector('[data-sell]');
  if (!root) return;
  var api = (root.getAttribute('data-api') || '').replace(/\/$/, '');
  var maxImages = parseInt(root.getAttribute('data-max-images') || '5', 10);
  function $(s, c) { return (c || root).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || root).querySelectorAll(s)); }
  function money(c) { return '$' + (Math.round(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]; }); }
  function when(iso) { try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } }

  /* ---------- ticket view ---------- */
  var token = new URLSearchParams(window.location.search).get('t');
  var STATE = { submitted: 'Received', reviewing: 'Reviewing', offered: 'Offer on the table', countered: 'Counter sent', accepted: 'Deal ✓', declined: 'Passed', withdrawn: 'Withdrawn', paid: 'Paid ✓' };
  var COND = { deadstock: 'Deadstock', like_new: 'Like new', used_good: 'Used · good', used_fair: 'Used · fair' };

  function renderTicket(c) {
    $('[data-ticket-id]').textContent = '#' + String(c.id).slice(0, 8).toUpperCase();
    var st = $('[data-ticket-state]'); st.textContent = STATE[c.status] || c.status; st.className = 'ticket__state chip chip--' + (c.status === 'accepted' || c.status === 'paid' ? 'live' : c.status === 'declined' ? 'off' : 'on');
    $('[data-ticket-brand]').textContent = c.brand || '';
    $('[data-ticket-title]').textContent = c.item_title;
    $('[data-ticket-meta]').textContent = [c.size ? 'Size ' + c.size : null, COND[c.condition] || c.condition, c.deal_type === 'either' ? 'Cash or consignment' : c.deal_type].filter(Boolean).join(' · ');
    $('[data-ticket-asking]').textContent = c.asking_cents ? money(c.asking_cents) : 'open to offers';
    $('[data-ticket-images]').innerHTML = (c.images || []).map(function (im) { return '<a href="' + esc(im.url) + '" target="_blank" rel="noopener"><img src="' + esc(im.url) + '" alt="" loading="lazy"></a>'; }).join('');
    var offers = c.offers || [];
    $('[data-ticket-offers]').innerHTML = offers.length ? offers.map(function (o) {
      var who = o.by === 'store' ? 'Common Ground' : 'You';
      var label = o.kind === 'accept' ? 'accepted' : o.kind === 'decline' ? 'passed' : o.kind === 'counter' ? 'countered' : 'offered';
      return '<div class="offer offer--' + esc(o.by) + (o.status === 'superseded' ? ' offer--old' : '') + '"><div class="offer__who">' + who + ' <span class="small">' + label + ' · ' + when(o.created_at) + '</span></div>' + (o.amount_cents ? '<div class="offer__amt">' + money(o.amount_cents) + '</div>' : '') + (o.note ? '<p class="offer__note">' + esc(o.note) + '</p>' : '') + '</div>';
    }).join('') : '<p class="small">No offers yet. We usually respond within 48 hours.</p>';
    var open = null;
    for (var i = offers.length - 1; i >= 0; i--) { if (offers[i].status === 'open') { open = offers[i]; break; } }
    var canRespond = open && open.by === 'store' && (c.status === 'offered');
    var form = $('[data-ticket-respond]'); form.hidden = !canRespond;
    if (canRespond) $('[data-ticket-latest]').textContent = money(open.amount_cents);
    var foot = $('[data-ticket-foot]');
    foot.textContent = c.status === 'accepted' ? 'Deal agreed at ' + money(c.agreed_cents) + '. We\'ll email you drop-off or shipping details.' : c.status === 'countered' ? 'Your counter is with the shop. We\'ll email you when they respond.' : c.status === 'declined' ? 'This one didn\'t work out. Feel free to submit something else.' : '';
  }

  function loadTicket() {
    $('[data-sell-form-wrap]').hidden = true; $('[data-sell-status]').hidden = false;
    fetch(api + '/v1/public/consignments/' + encodeURIComponent(token)).then(function (r) { if (!r.ok) throw new Error('nf'); return r.json(); })
      .then(function (d) { renderTicket(d.consignment); })
      .catch(function () { $('[data-ticket]').innerHTML = '<p class="h3">¯\\_(ツ)_/¯</p><p>We couldn\'t find that ticket. Check the link from your email.</p>'; });
  }

  function respond(action, amount, note) {
    var body = { action: action };
    if (amount) body.amount_cents = Math.round(parseFloat(amount) * 100);
    if (note) body.note = note;
    $$('[data-respond]').forEach(function (b) { b.disabled = true; });
    fetch(api + '/v1/public/consignments/' + encodeURIComponent(token) + '/respond', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Could not send'); return j; }); })
      .then(function (d) { renderTicket(d.consignment); })
      .catch(function (e) { alert(e.message); })
      .then(function () { $$('[data-respond]').forEach(function (b) { b.disabled = false; }); });
  }

  root.addEventListener('click', function (e) {
    var b = e.target.closest('[data-respond]'); if (!b) return;
    var a = b.getAttribute('data-respond');
    if (a === 'counter-toggle') { var box = $('[data-counter-box]'); box.hidden = !box.hidden; if (!box.hidden) box.querySelector('input').focus(); return; }
    if (a === 'counter') { var amt = $('[name="counter_amount"]').value; if (!amt || Number(amt) <= 0) { alert('Enter a counter amount.'); return; } respond('counter', amt, $('[name="counter_note"]').value); return; }
    if (a === 'decline' && !confirm('Pass on this offer? You can still submit the item again later.')) return;
    respond(a);
  });

  /* ---------- submission form ---------- */
  var files = [];
  var input = $('[data-file-input]'), previews = $('[data-previews]'), zone = $('[data-dropzone]');
  function addFiles(list) {
    Array.prototype.slice.call(list).forEach(function (f) {
      if (!/^image\//.test(f.type) && !/\.heic$/i.test(f.name)) return;
      if (files.length >= maxImages) return;
      files.push(f);
    });
    renderPreviews();
  }
  function renderPreviews() {
    previews.innerHTML = '';
    files.forEach(function (f, i) {
      var li = document.createElement('li'); li.className = 'dropzone__preview';
      var img = document.createElement('img'); img.alt = ''; li.appendChild(img);
      if (/^image\//.test(f.type) && !/heic/i.test(f.type)) { var r = new FileReader(); r.onload = function () { img.src = r.result; }; r.readAsDataURL(f); } else { li.classList.add('dropzone__preview--noimg'); }
      var rm = document.createElement('button'); rm.type = 'button'; rm.className = 'dropzone__rm'; rm.setAttribute('aria-label', 'Remove'); rm.textContent = '×';
      rm.addEventListener('click', function () { files.splice(i, 1); renderPreviews(); });
      li.appendChild(rm); previews.appendChild(li);
    });
    zone.classList.toggle('is-full', files.length >= maxImages);
  }
  if (input) {
    input.addEventListener('change', function () { addFiles(input.files); input.value = ''; });
    ['dragenter', 'dragover'].forEach(function (ev) { zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add('is-over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove('is-over'); }); });
    zone.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files); });
  }

  var form = $('[data-sell-form]');
  if (form) form.addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('[data-sell-error]'); err.hidden = true;
    if (!form.reportValidity()) return;
    if (!files.length) { err.textContent = 'Add at least one photo so we can make a real offer.'; err.hidden = false; return; }
    var fd = new FormData();
    $$('input[name], select[name], textarea[name]', form).forEach(function (el) { if (el.type === 'file') return; fd.append(el.name, el.value); });
    var asking = form.querySelector('[name="asking"]').value; if (asking) fd.set('asking_cents', String(Math.round(parseFloat(asking) * 100)));
    files.forEach(function (f) { fd.append('images', f, f.name); });
    var btn = $('[data-sell-submit]'); btn.disabled = true; var orig = btn.innerHTML; btn.textContent = 'Sending…';
    fetch(api + '/v1/public/consignments', { method: 'POST', body: fd })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Something went wrong. Try again.'); return j; }); })
      .then(function (d) {
        var link = window.location.pathname + '?t=' + encodeURIComponent(d.token);
        $('[data-done-link]').setAttribute('href', link);
        $('[data-done-email]').textContent = form.querySelector('[name="seller_email"]').value;
        $('[data-sell-form-wrap]').hidden = true; $('[data-sell-done]').hidden = false;
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (window.themeMotion) window.themeMotion.init(root);
      })
      .catch(function (e2) { err.textContent = e2.message; err.hidden = false; btn.disabled = false; btn.innerHTML = orig; });
  });

  if (token) loadTicket();
})();
