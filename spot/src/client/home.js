// The composer: one box → a link that's already on its way.
//
//   compose ──Spot it──▶ reading ──confident + known requester──▶ ready (send)
//                                 └─otherwise──▶ check (edit, name) ──▶ ready
//
// The requester's name, payout handles and favourite people are remembered
// on this device, so after the first time a link is: paste, Spot it, Send.
(() => {
  const CFG = window.SPOT;
  const $ = (s, r = document) => r.querySelector(s);
  const usd = (c) => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const toCents = (v) => {
    const m = String(v || '').replace(/[,\s$]/g, '').match(/^\d+(\.\d{0,2})?$/);
    return m ? Math.round(parseFloat(m[0]) * 100) : null;
  };
  async function api(path, body) {
    const r = await fetch(path, { method: body ? 'POST' : 'GET', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Error ' + r.status);
    return j;
  }
  // Device memory. Every access is guarded: private mode or blocked storage
  // just means Spot asks again next time.
  const load = (k, d) => {
    try {
      const v = JSON.parse(localStorage.getItem(k));
      return v ?? d;
    } catch {
      return d;
    }
  };
  const save = (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  };

  let me = load('spot:me', {});
  let contacts = load('spot:contacts', []);
  let draft = null; // { merchant, items, extras_cents, note }
  let made = null; // { token, key, link, manage, rev }
  let image = null; // { data, media_type, name }
  // Carts from other stores, waiting to go in the same link (a multi-store ask).
  let basket = []; // [{ merchant, items, extras_cents }]
  const goodsOf = (st) => st.items.reduce((n, i) => n + (i.price_cents || 0) * i.quantity, 0) + (st.extras_cents || 0);
  function renderBasket() {
    const b = $('#basket');
    b.hidden = !basket.length;
    b.innerHTML = basket.length
      ? '<p class="small muted" style="margin:0 0 6px">In this Spot so far (one link, one payment):</p>' +
        basket.map((st, i) => '<div class="sum"><span>🛍️ ' + esc(st.merchant.name) + ' · ' + esc(st.items[0].title) + (st.items.length > 1 ? ' +' + (st.items.length - 1) : '') + '</span><span>' + usd(goodsOf(st)) + ' <button class="textlink" data-unbasket="' + i + '" aria-label="Remove">×</button></span></div>').join('') +
        '<p class="small muted" style="margin:6px 0 0">Paste a link from the next store.</p>'
      : '';
  }
  $('#basket').addEventListener('click', (e) => {
    const i = e.target.dataset.unbasket;
    if (i != null) {
      basket.splice(+i, 1);
      renderBasket();
    }
  });

  const show = (id) => {
    for (const s of ['compose', 'check', 'ready']) $('#' + s).hidden = s !== id;
    $('#mine').hidden = id !== 'compose' || !load('spot:mine', []).length;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const say = (t) => ($('#say').textContent = t);

  // ─── Compose ──────────────────────────────────────────────────────────────
  const q = $('#q');
  q.addEventListener('input', () => {
    q.style.height = 'auto';
    q.style.height = Math.min(q.scrollHeight, 180) + 'px';
  });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      go();
    }
  });
  $('#go').onclick = go;
  $('#shot').onchange = () => $('#shot').files[0] && attach($('#shot').files[0]);
  document.addEventListener('paste', (e) => {
    const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/'));
    if (f) {
      e.preventDefault();
      attach(f);
    }
  });
  const box = $('#box');
  box.addEventListener('dragover', (e) => {
    e.preventDefault();
    box.classList.add('drop');
  });
  box.addEventListener('dragleave', () => box.classList.remove('drop'));
  box.addEventListener('drop', (e) => {
    e.preventDefault();
    box.classList.remove('drop');
    const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('image/'));
    if (f) attach(f);
  });

  async function attach(f) {
    $('#capErr').textContent = '';
    if (f.size > 6e6) return ($('#capErr').textContent = 'Screenshot must be under 6 MB');
    const data = await new Promise((ok, no) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result).split(',')[1]);
      r.onerror = no;
      r.readAsDataURL(f);
    });
    image = { data, media_type: f.type, name: f.name || 'screenshot' };
    $('#chip').hidden = false;
    $('#chipName').textContent = '📷 ' + image.name;
    go();
  }
  $('#chipX').onclick = () => {
    image = null;
    $('#chip').hidden = true;
    $('#shot').value = '';
  };

  async function go() {
    const text = q.value.trim();
    if (!image && !text) return q.focus();
    $('#capErr').textContent = '';
    const btn = $('#go');
    btn.disabled = true;
    btn.textContent = 'reading…';
    say(image ? 'ooh, let me look at that…' : /https?:\/\//.test(text) ? 'grabbing it…' : 'looking it up…');
    try {
      const d = await api('/v1/capture', image ? { image } : { text });
      draft = { merchant: d.merchant || { name: '', url: null }, items: d.items?.length ? d.items : [blank()], extras_cents: d.extras_cents || 0, note: '' };
      made = null;
      const priced = draft.items.every((i) => i.price_cents > 0);
      if (!d.needs_review && priced && draft.merchant.name && me.name && !basket.length) {
        await create();
        ready();
      } else {
        check(d.warning || (priced ? '' : "I couldn't find every price. fill them in below"));
      }
    } catch (e) {
      $('#capErr').textContent = e.message;
      say('hmm, that one got away from me');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Spot it';
    }
  }

  // ─── Check ────────────────────────────────────────────────────────────────
  const blank = () => ({ title: '', variant: null, quantity: 1, price_cents: null, image_url: null, url: null });

  function check(msg) {
    $('#checkMsg').textContent = msg || '';
    $('#merchant').value = draft.merchant.name || '';
    $('#extras').value = draft.extras_cents ? (draft.extras_cents / 100).toFixed(2) : '';
    $('#nameRow').hidden = Boolean(me.name);
    $('#name').value = me.name || '';
    $('#email').value = me.email || '';
    $('#venmo').value = me.venmo ? '@' + me.venmo : '';
    $('#cashtag').value = me.cashtag ? '$' + me.cashtag : '';
    $('#settle').value = me.settle === 'handoff' ? 'handoff' : 'card';
    // Several stores: paid on Spot in one payment, so no other options.
    $('#settle').disabled = basket.length > 0;
    if (basket.length) $('#settle').value = 'card';
    $('#addStore').hidden = Boolean(made) || basket.length >= 4;
    // Stores with agent checkout (UCP): the payer can pay the store directly.
    $('#optDirect').hidden = true;
    const storeUrl = draft.merchant && (draft.merchant.url || (draft.items.find((i) => i.url) || {}).url);
    // Stores that don't allow AI checkout (Amazon): Spot can't buy there, so
    // the money goes to your Venmo / Cash App instead (same rule as cart.js).
    const noAgent = /^amazon\b/i.test(draft.merchant.name || '') || [storeUrl].concat(draft.items.map((i) => i.url)).some((u) => { try { return /(^|\.)(amazon|amzn)\.[a-z.]+$/i.test(new URL(u).hostname); } catch (e) { return false; } });
    if (noAgent && !basket.length) {
      $('#settle').value = 'handoff';
      $('#checkMsg').textContent = (draft.merchant.name || 'This store') + ' doesn’t allow AI checkout, so this one goes straight to your Venmo or Cash App and you buy it yourself.';
    }
    if (storeUrl && !basket.length && !noAgent) {
      fetch('/v1/stores/check?url=' + encodeURIComponent(storeUrl)).then((r) => r.json()).then((r) => {
        if (!r.pay_at_store) return;
        $('#optDirect').hidden = false;
        if (me.settle !== 'handoff') $('#settle').value = 'direct';
        totals();
      }).catch(() => {});
    }
    $('#note').value = draft.note || '';
    $('#saveCheck').textContent = made ? 'Save changes' : 'Looks good →';
    renderItems();
    show('check');
    say(made ? 'what should I fix?' : 'quick check before we send it');
  }

  function renderItems() {
    $('#items').innerHTML =
      draft.items
        .map(
          (it, i) =>
            '<div class="edit-item"><input aria-label="Item" data-i="' + i + '" data-f="title" value="' + esc(it.title) + (it.variant ? ' (' + esc(it.variant) + ')' : '') +
            '" placeholder="What is it?"><input aria-label="Price" data-i="' + i + '" data-f="price" inputmode="decimal" value="' + (it.price_cents != null ? (it.price_cents / 100).toFixed(2) : '') +
            '" placeholder="Price"><input aria-label="Qty" data-i="' + i + '" data-f="qty" inputmode="numeric" value="' + it.quantity + '"><button class="x" data-del="' + i + '" aria-label="Remove">×</button></div>',
        )
        .join('') || '<p class="muted small">No items yet.</p>';
    totals();
  }
  $('#items').addEventListener('input', (e) => {
    const el = e.target;
    const it = draft.items[+el.dataset.i];
    if (!it) return;
    if (el.dataset.f === 'title') {
      it.title = el.value;
      it.variant = null;
    }
    if (el.dataset.f === 'price') it.price_cents = toCents(el.value);
    if (el.dataset.f === 'qty') it.quantity = Math.max(1, parseInt(el.value) || 1);
    totals();
  });
  $('#items').addEventListener('click', (e) => {
    const d = e.target.dataset.del;
    if (d != null) {
      draft.items.splice(+d, 1);
      renderItems();
    }
  });
  $('#addItem').onclick = () => {
    draft.items.push(blank());
    renderItems();
  };
  $('#extras').oninput = totals;
  $('#settle').onchange = totals;

  // Same math as the server (cart.js computeTotals): when Spot buys it, the
  // payer adds the fee (once per ask, however many stores) and a refundable
  // allowance per store for tax and price changes, so "They pay" matches the
  // pay page.
  const feeOf = (goods) => Math.round((goods * CFG.feeBps) / 10000) + CFG.feeFixed;
  const cushionOf = (goods) => Math.min(Math.round((goods * CFG.cushionBps) / 10000), CFG.cushionMax);
  function totals() {
    const sub = draft.items.reduce((s, it) => s + (it.price_cents || 0) * it.quantity, 0);
    const cart = sub + (toCents($('#extras').value) || 0);
    const card = $('#settle').value === 'card';
    const all = [...basket.map(goodsOf), cart];
    const goods = all.reduce((n, g) => n + g, 0);
    const fee = card ? feeOf(all[0]) : 0;
    const room = card ? all.reduce((n, g) => n + cushionOf(g), 0) : 0;
    const prev = basket.length;
    $('#totals').innerHTML =
      (prev ? basket.map((st) => '<div class="sum"><span>' + esc(st.merchant.name) + '</span><span>' + usd(goodsOf(st)) + '</span></div>').join('') + '<div class="sum"><span>This store</span><span>' + usd(cart) + '</span></div>' : '') +
      (card ? '<div class="sum"><span>' + (prev ? 'Everything' : 'Items + shipping') + '</span><span>' + usd(goods) + '</span></div>' + (room ? '<div class="sum"><span>Tax and price changes (unused goes back to them)</span><span>' + usd(room) + '</span></div>' : '') + '<div class="sum"><span>Spot fee (they pay it)</span><span>' + usd(fee) + '</span></div>' : '') +
      '<div class="sum total"><span>They pay</span><span>' + usd(goods + fee + room) + '</span></div>' +
      (goods > CFG.max ? '<div class="err">Spots are capped at ' + usd(CFG.max) + ' for now' + (prev ? ', across all stores' : '') + '.</div>' : '');
  }

  $('#saveCheck').onclick = async () => {
    const btn = $('#saveCheck');
    $('#checkErr').textContent = '';
    const name = $('#name').value.trim();
    if (!name) return ($('#checkErr').textContent = "what's your name? so they know who's asking"), $('#name').focus();
    me = {
      name,
      email: $('#email').value.trim(),
      venmo: $('#venmo').value.trim().replace(/^@/, ''),
      cashtag: $('#cashtag').value.trim().replace(/^\$/, ''),
      settle: basket.length ? me.settle : $('#settle').value,
    };
    save('spot:me', me);
    draft.merchant = { ...draft.merchant, name: $('#merchant').value.trim() };
    draft.items = draft.items.filter((i) => i.title || i.price_cents);
    draft.extras_cents = toCents($('#extras').value) || 0;
    draft.note = $('#note').value.trim();
    btn.disabled = true;
    try {
      if (made) {
        const r = await api('/v1/carts/' + made.token + '/manage/edit', { k: made.key, cart: body() });
        made.rev = r.cart.rev;
      } else {
        await create();
      }
      ready();
    } catch (e) {
      $('#checkErr').textContent = e.message;
    } finally {
      btn.disabled = false;
    }
  };

  function body() {
    return {
      requester: { name: me.name, email: me.email, venmo: me.venmo, cashtag: me.cashtag },
      merchant: draft.merchant,
      items: draft.items,
      extras_cents: draft.extras_cents,
      settle: me.settle || 'card',
      ...(me.settle === 'direct' && draft.merchant && !draft.merchant.url ? { merchant: { ...draft.merchant, url: (draft.items.find((i) => i.url) || {}).url } } : {}),
      note: draft.note,
      // The store's cart as sent; once edited it's just a cart.
      ...(draft.draft_id && draft.orig === JSON.stringify(draft.items) ? { draft_id: draft.draft_id } : {}),
    };
  }

  // Keep this store's cart and go get the next one.
  $('#addStore').onclick = () => {
    $('#checkErr').textContent = '';
    draft.merchant = { ...draft.merchant, name: $('#merchant').value.trim() };
    draft.items = draft.items.filter((i) => i.title || i.price_cents);
    draft.extras_cents = toCents($('#extras').value) || 0;
    if (!draft.merchant.name) return ($('#checkErr').textContent = 'Which store is this from?');
    if (!draft.items.length || draft.items.some((i) => !i.title || !(i.price_cents > 0))) return ($('#checkErr').textContent = 'Give every item a name and a price first');
    // Keep what they typed about themselves for the next store's check.
    const nm = $('#name').value.trim();
    if (nm) {
      me = { ...me, name: nm, email: $('#email').value.trim() || me.email };
      save('spot:me', me);
    }
    draft.note = $('#note').value.trim() || draft.note;
    basket.push({ merchant: draft.merchant, items: draft.items, extras_cents: draft.extras_cents, note: draft.note });
    draft = image = null;
    q.value = '';
    $('#chip').hidden = true;
    renderBasket();
    show('compose');
    say('got it! what’s from the next store?');
    q.focus();
  };

  async function create() {
    if (basket.length) {
      // One link for every store: Spot buys each store's cart, one payment.
      const b = body();
      const r = await api('/v1/bundles', { requester: b.requester, note: b.note || basket.map((st) => st.note).find(Boolean) || '', stores: [...basket, { merchant: draft.merchant, items: draft.items, extras_cents: draft.extras_cents }] });
      made = { token: r.bundle.token, key: r.manage_key, link: r.link, manage: r.manage_link, rev: 1, total: r.bundle.total_cents, bundle: r.bundle.stores.length };
      const mine = load('spot:mine', []);
      mine.unshift({ token: made.token, manage: made.manage, title: r.bundle.items[0].title + ' +' + (r.bundle.items.length - 1), merchant: r.bundle.stores.length + ' stores', total: r.bundle.cart_cents, at: Date.now() });
      save('spot:mine', mine.slice(0, 20));
      basket = [];
      renderBasket();
      return;
    }
    const r = await api('/v1/carts', body());
    made = { token: r.cart.token, key: r.manage_key, link: r.link, manage: r.manage_link, rev: r.cart.rev || 1, total: r.cart.total_cents };
    const mine = load('spot:mine', []).filter((m) => m.token !== made.token);
    mine.unshift({ token: made.token, manage: made.manage, title: draft.items[0].title, merchant: draft.merchant.name, total: r.cart.cart_cents, at: Date.now() });
    save('spot:mine', mine.slice(0, 20));
  }

  // ─── Ready: send it ───────────────────────────────────────────────────────
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const message = () => {
    const first = draft.items[0]?.title || 'something';
    if (made.bundle) return 'psst… can you spot me? 👀 ' + first + ' + more from ' + made.bundle + ' stores\n' + made.link;
    return 'psst… can you spot me? 👀 ' + first + (draft.merchant.name ? ' from ' + draft.merchant.name : '') + '\n' + made.link;
  };
  const sms = (phone) => 'sms:' + (phone || '') + (isIOS ? '&' : '?') + 'body=' + encodeURIComponent(message());

  function ready() {
    $('#card').src = made.link.replace(/^https?:\/\/[^/]+/, '') + '/card.png?v=' + made.rev;
    $('#linkText').textContent = made.link;
    $('#manageLink').href = made.manage;
    $('#shipNudge').hidden = me.settle !== 'direct' || Boolean(made.bundle);
    $('#edit').hidden = Boolean(made.bundle);
    $('#shipLink').href = made.manage;
    renderPeople();
    $('#wa').href = 'https://wa.me/?text=' + encodeURIComponent(message());
    $('#txt').href = sms('');
    show('ready');
    say('ready! who should I ask?');
  }

  function renderPeople() {
    $('#people').innerHTML =
      contacts.map((c, i) => '<a class="chip" href="' + esc(sms(c.phone)) + '" data-i="' + i + '">Ask ' + esc(c.name) + '</a>').join('') +
      '<button class="chip ghost" id="addPerson" type="button">+ someone</button>';
    $('#addPerson').onclick = addPerson;
  }

  async function addPerson() {
    // Android Chrome can open the real contact list; everywhere else, type it.
    if ('contacts' in navigator && 'select' in navigator.contacts) {
      try {
        const [c] = await navigator.contacts.select(['name', 'tel'], { multiple: false });
        if (c?.tel?.[0]) return remember((c.name?.[0] || 'them').split(' ')[0], c.tel[0]);
      } catch {}
    }
    $('#personForm').hidden = false;
    $('#pName').focus();
  }
  $('#personForm').onsubmit = (e) => {
    e.preventDefault();
    const name = $('#pName').value.trim();
    const phone = $('#pPhone').value.replace(/[^\d+]/g, '');
    if (!name || phone.length < 7) return;
    remember(name, phone);
    $('#personForm').hidden = true;
    $('#personForm').reset();
  };
  function remember(name, phone) {
    contacts = [{ name, phone }, ...contacts.filter((c) => c.phone !== phone)].slice(0, 6);
    save('spot:contacts', contacts);
    renderPeople();
  }

  $('#send').onclick = async () => {
    const text = message();
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return say('sent! I’ll let you know when they spot you');
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    }
    copy();
  };
  $('#copy').onclick = copy;
  async function copy() {
    try {
      await navigator.clipboard.writeText(message());
      $('#copy').textContent = 'Copied ✓';
      setTimeout(() => ($('#copy').textContent = 'Copy'), 1800);
    } catch {
      prompt('Copy your link', made.link);
    }
  }
  $('#edit').onclick = () => check('');
  $('#notMe').onclick = () => {
    $('#nameRow').hidden = false;
    $('#name').select();
  };
  $('#again').onclick = () => {
    draft = made = image = null;
    basket = [];
    renderBasket();
    q.value = '';
    $('#chip').hidden = true;
    renderMine();
    show('compose');
    say('what do you want?');
    q.focus();
  };

  // ─── My Spots ─────────────────────────────────────────────────────────────
  function renderMine() {
    const mine = load('spot:mine', []);
    $('#mineList').innerHTML = mine
      .slice(0, 6)
      .map((m) => '<a class="mine-row" href="' + esc(m.manage) + '"><span><b>' + esc(m.title) + '</b><br><span class="muted small">' + esc(m.merchant) + ' · ' + new Date(m.at).toLocaleDateString() + '</span></span><span>' + usd(m.total) + '</span></a>')
      .join('');
  }

  // Mascot eyes follow the pointer, like it's watching what you're doing.
  const buddy = $('#buddy');
  const pupils = buddy?.querySelector('.pupils');
  addEventListener(
    'pointermove',
    (e) => {
      if (!pupils) return;
      const r = buddy.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(7, d / 30);
      pupils.setAttribute('transform', 'translate(' + ((dx / d) * k).toFixed(1) + ' ' + ((dy / d) * k).toFixed(1) + ')');
    },
    { passive: true },
  );

  // Arriving from the bookmarklet, a share target or a Shortcut.
  renderMine();
  show('compose');
  const p = new URLSearchParams(location.search);
  const incoming = p.get('url') || p.get('text');
  if (p.get('draft')) {
    // From a store's "Ask someone to pay" button: its cart, ready to send.
    api('/v1/merchant/drafts/' + encodeURIComponent(p.get('draft')))
      .then((d) => {
        draft = { merchant: d.merchant, items: d.items, extras_cents: d.extras_cents || 0, note: '', draft_id: p.get('draft'), verified: d.verified, orig: JSON.stringify(d.items) };
        made = null;
        check((d.verified ? '✓ ' : '') + 'your ' + d.merchant.name + ' cart. who should pay for it?');
      })
      .catch((e) => {
        $('#capErr').textContent = e.message;
      });
  } else if (incoming) {
    q.value = incoming;
    go();
  } else if (me.name) {
    say('hey ' + me.name + '! what do you want?');
  }
})();
