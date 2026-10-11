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
  // Signed in: their account's name, email, sizes and where things ship.
  // Every search uses the sizes and ship-to (the server reads them from the
  // account); the page shows which, so it's never a guess.
  let account = null; // { sizes: { tops: 'M', … }, ship_to: 'Austin, TX' }
  const SIZE_LABEL = { tops: 'Tops', bottoms: 'Pants', shoes: 'Shoes', dresses: 'Dresses' };
  const sizeLine = (z) => Object.entries(SIZE_LABEL).filter(([k]) => z?.[k]).map(([k, l]) => l + ' ' + z[k]).join(' · ');
  function renderProfile() {
    const el = $('#profileChip');
    if (!account) {
      el.innerHTML = '<a href="/signin?next=/new">Sign in</a> so Spot shops in your sizes and ships to you';
      return;
    }
    const z = sizeLine(account.sizes);
    el.innerHTML = (z ? '✓ <b>Your sizes</b> ' + esc(z) : '<a href="/account#details">Add your sizes</a> so Spot picks the right ones') +
      (account.ship_to ? ' · ships to ' + esc(account.ship_to) : '') + (z ? ' · <a href="/account#details">edit</a>' : '');
  }
  fetch('/v1/me', { headers: { accept: 'application/json' } })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (!j?.user) return renderProfile();
      const u = j.user;
      account = { sizes: u.sizes || {}, ship_to: u.shipping?.city ? [u.shipping.city, u.shipping.state].filter(Boolean).join(', ') : '' };
      // Their name goes on links without asking again.
      if (!me.name && u.name) me = { ...me, name: u.name };
      if (!me.email && u.email) me = { ...me, email: u.email };
      renderProfile();
    })
    .catch(() => renderProfile());
  let contacts = load('spot:contacts', []);
  let draft = null; // { merchant, items, extras_cents, note, source, sold_out, in_stock }
  // What they asked for, and the product links already shown, so "find
  // another" looks for something new.
  let ask = { text: '', avoid: [] };
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
    for (const s of ['compose', 'picks', 'check', 'ready']) $('#' + s).hidden = s !== id;
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
      ask = { text: image ? '' : text, avoid: [] };
      made = null;
      if (listOf(d)) {
        $('#thread').innerHTML = '';
        turns.length = 0;
        show('picks'); // visible first, so the shelf can measure itself
        shelf(text, d);
        return;
      }
      draft = toDraft(d);
      const priced = draft.items.every((i) => i.price_cents > 0);
      // Sure of everything: make the link straight away. Anything the
      // server refuses (a gift card, over the cap, a store that doesn't take
      // direct checkout) opens the check step with the reason, to fix there.
      if (!d.needs_review && !d.sold_out && priced && draft.merchant.name && me.name && !basket.length && me.settle !== 'direct') {
        try {
          await create();
          ready();
        } catch (e) {
          check(e.message);
        }
      } else {
        check(d.warning || (priced ? '' : "I couldn't find every price. fill them in below"));
      }
    } catch (e) {
      $('#capErr').textContent = e.message;
      say('hmm, that one got away from me');
      // Don't resend a screenshot that didn't work with the next try.
      if (image) {
        image = null;
        $('#chip').hidden = true;
        $('#shot').value = '';
      }
    } finally {
      btn.disabled = false;
      btn.textContent = 'Spot it';
    }
  }

  // ─── Check ────────────────────────────────────────────────────────────────
  const blank = () => ({ title: '', variant: null, quantity: 1, price_cents: null, image_url: null, url: null });
  const toDraft = (d) => ({
    merchant: d.merchant || { name: '', url: null },
    items: d.items?.length ? d.items : [blank()],
    extras_cents: d.extras_cents || 0,
    note: '',
    source: d.source,
    sold_out: Boolean(d.sold_out),
    in_stock: Boolean(d.in_stock),
    tried: d.tried || [],
  });

  // ─── Picks ────────────────────────────────────────────────────────────────
  // A lookup: a swipeable shelf across stores, Spot's pick first, like a
  // collection page; asks for a look ("outfits for Coachella") get whole
  // outfits. More load as they swipe. Every card pays in one tap: Pay with
  // Spot (Apple Pay / Google Pay), or Let someone else pay (a link to send).
  // Each follow-up ("cheaper", "in green") adds a shelf, so it reads like a chat.
  const turns = []; // [{ kind: 'products' | 'outfits', list: [...], said, more, page, done, loading }]
  const BATCHES = 8; // up to ~100 products a shelf; then "ask for something else"
  const isApple = /iP(hone|ad|od)|Mac/.test(navigator.userAgent);
  const wallet = isApple ? ' Pay' : /Android/.test(navigator.userAgent) ? 'Google Pay' : 'Apple Pay · Google Pay';
  const spotSays = (t) => '<div class="spotsay"><i style="background-image:url(\'' + esc($('#thread').dataset.face || '') + '\')"></i><span>' + esc(t) + '</span></div>';
  const stockTag = (o) => (o.stock === 'in' ? '<span class="tag in">In stock</span>' : o.stock === 'out' ? '<span class="tag out">Sold out</span>' : '<span class="tag">Check stock</span>');
  const cssUrl = (u) => String(u).replace(/["'()\\\s]/g, (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'));
  // No photo (yet): the store's own tile, not a broken-looking placeholder.
  const hue = (name) => [...String(name || 'spot')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  const initials = (name) => String(name || '?').replace(/^the\s+/i, '').split(/[\s&’'.-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const tile = (o) => '<span class="stile" style="--h:' + hue(o.merchant.name) + '"><b>' + esc(initials(o.merchant.name)) + '</b><small>' + esc(o.merchant.name || '') + '</small></span>';
  const photo = (o, cls) => '<div class="' + cls + '" data-url="' + esc(o.item.url || '') + '">' + (o.item.image_url ? '<img src="' + esc(o.item.image_url) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '') + tile(o) + '</div>';
  const buttons = (k, sold) =>
    '<button class="btn small pay" type="button" data-act="pay" data-k="' + k + '"' + (sold ? ' disabled' : '') + '>Pay with Spot</button><div class="wallets">' + wallet + '</div>' +
    '<button class="btn ghost small" type="button" data-act="ask" data-k="' + k + '"' + (sold ? ' disabled' : '') + '>Let someone else pay</button>';
  const total = (items) => items.reduce((n, o) => n + (o.item.price_cents || 0), 0);
  // The size picked is one of theirs ("M" in "Black / M", "10.5" in "US 10.5").
  const yours = (variant) => {
    const words = new Set(String(variant).toLowerCase().split(/[^a-z0-9.]+/).filter(Boolean));
    return Object.values(account?.sizes || {}).some((v) => {
      const w = String(v).toLowerCase().split(/[^a-z0-9.]+/).filter((x) => x && x !== 'us');
      return w.length > 0 && w.every((x) => words.has(x));
    });
  };

  function productCard(o, k, top) {
    const it = o.item;
    return '<article class="pc' + (top ? ' top' : '') + (o.stock === 'out' ? ' gone' : '') + '" data-card="' + k + '">' +
      (top ? '<span class="badge">Spot’s pick</span>' : '') + photo(o, 'ph') +
      '<div class="pb"><div class="st">' + esc(o.merchant.name || '') + ' <span class="stk" data-url="' + esc(it.url || '') + '">' + stockTag(o) + '</span></div>' +
      '<div class="t">' + esc(it.title) + '</div>' + (it.variant ? '<div class="v">' + esc(it.variant) + (yours(it.variant) ? ' <span class="tag in">your size</span>' : '') + '</div>' : '') +
      (o.why ? '<div class="why">' + esc(o.why) + '</div>' : '') +
      '<div class="pr">' + (it.price_cents ? usd(it.price_cents) : 'Price at store') + '</div>' + buttons(k, o.stock === 'out') +
      '<div class="cardlinks"><button class="textlink" type="button" data-act="edit" data-k="' + k + '">Edit details</button>' +
      (it.url && /^https?:/i.test(it.url) ? '<a href="' + esc(it.url) + '" target="_blank" rel="noopener">At the store ↗</a>' : '') + '</div></div></article>';
  }
  function outfitCard(look, k, top) {
    const stores = new Set(look.items.map((o) => o.merchant.name)).size;
    return '<article class="pc look' + (top ? ' top' : '') + '" data-card="' + k + '">' + (top ? '<span class="badge">Spot’s pick</span>' : '') +
      '<div class="collage n' + Math.min(look.items.length, 4) + '">' + look.items.slice(0, 4).map((o) => photo(o, 'cell')).join('') + '</div>' +
      '<div class="pb"><div class="st">' + look.items.length + ' pieces · ' + stores + (stores > 1 ? ' stores' : ' store') + '</div><div class="t">' + esc(look.name) + '</div>' +
      (look.why ? '<div class="why">' + esc(look.why) + '</div>' : '') +
      '<ul class="pieces">' + look.items.map((o) => '<li data-url="' + esc(o.item.url || '') + '"><a href="' + esc(o.item.url || '#') + '" target="_blank" rel="noopener">' + esc(o.item.title) + (o.item.variant ? ' <i>' + esc(o.item.variant) + '</i>' : '') + '</a><span>' + esc(o.merchant.name || '') + ' · ' + (o.item.price_cents ? usd(o.item.price_cents) : '—') + '</span></li>').join('') + '</ul>' +
      '<div class="pr">' + usd(total(look.items)) + '<small> the look</small></div>' + buttons(k, false) + '</div></article>';
  }
  const skel = '<article class="pc sk"><div class="ph"></div><div class="pb"><div class="ln" style="width:50%"></div><div class="ln"></div><div class="ln" style="width:70%"></div></div></article>';
  const skeleton = () => '<div class="shelf"><div class="rail">' + skel.repeat(3) + '</div></div>';
  const urlsOf = (entry) => (entry.items ? entry.items : [entry]).map((o) => o.item.url).filter(Boolean);
  const listOf = (d) => (d.outfits?.length ? { kind: 'outfits', list: d.outfits } : d.options?.length ? { kind: 'products', list: d.options } : null);

  function shelf(said, d, el, more = '') {
    const got = listOf(d);
    const t = turns.push({ ...got, said, more, page: 1, done: false, loading: false }) - 1;
    const T = turns[t];
    for (const e of T.list) for (const u of urlsOf(e)) if (!ask.avoid.includes(u)) ask.avoid.push(u);
    const turn = el || document.createElement('div');
    turn.className = 'turn';
    turn.dataset.t = t;
    const stores = new Set(T.list.flatMap((e) => (e.items || [e]).map((o) => o.merchant.name))).size;
    const line = T.kind === 'outfits' ? (T.list.length === 1 ? 'here’s a look I put together' : T.list.length + ' looks, from ' + stores + ' stores. my favorite’s first →') :
      T.list.length === 1 ? 'here’s the one I’d get' : (t === 0 ? 'found ' + T.list.length + ' at ' + (stores > 1 ? stores + ' stores' : T.list[0].merchant.name) : 'ok, ' + T.list.length + ' more') + '. my pick’s first, swipe for more →';
    const used = d.profile ? [d.profile.sizes && 'In your sizes', d.profile.ship_to && 'ships to ' + d.profile.ship_to].filter(Boolean).join(' · ') : '';
    turn.innerHTML = '<div class="me">' + esc(said) + '</div>' + spotSays(line) + (used ? '<p class="used" title="' + esc(d.profile.sizes || '') + '">✓ ' + esc(used) + '</p>' : '') + '<div class="shelf' + (T.kind === 'outfits' ? ' looks' : '') + '"><div class="rail" tabindex="0" role="region" aria-roledescription="carousel" aria-label="' + (T.kind === 'outfits' ? 'Outfits' : 'Picks') + '">' +
      T.list.map((e, i) => (T.kind === 'outfits' ? outfitCard : productCard)(e, t + ':' + i, i === 0)).join('') + '</div><div class="railnav"><button type="button" data-step="-1" aria-label="Previous">‹</button><span class="at"></span><button type="button" data-step="1" aria-label="Next">›</button></div></div>';
    if (!el) $('#thread').appendChild(turn);
    const rail = turn.querySelector('.rail');
    const step = () => rail.firstElementChild.offsetWidth + 12;
    const sync = () => {
      const i = Math.min(Math.round(rail.scrollLeft / step()), T.list.length - 1);
      turn.querySelector('.at').textContent = i + 1 + ' of ' + T.list.length + (T.done ? '' : '+');
      turn.querySelector('[data-step="-1"]').disabled = rail.scrollLeft < 4;
      turn.querySelector('[data-step="1"]').disabled = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 4;
      // Near the end: load the next batch, so the shelf never runs out.
      if (!T.done && !T.loading && rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - step() * 2) loadMore(t, turn);
    };
    T.sync = sync;
    rail.addEventListener('scroll', sync, { passive: true });
    addEventListener('resize', sync, { passive: true });
    turn.querySelector('.railnav').addEventListener('click', (e) => {
      const s = +e.target.dataset.step;
      if (s) rail.scrollBy({ left: s * step(), behavior: 'smooth' });
    });
    rail.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') rail.scrollBy({ left: (e.key === 'ArrowRight' ? 1 : -1) * step(), behavior: 'smooth' });
    });
    sync();
    say(T.list.length > 1 ? 'swipe for more →' : 'here’s what I found');
    turn.scrollIntoView({ behavior: 'smooth', block: 'start' });
    details(T.list);
  }

  // The next batch, from stores not shown yet, onto the end of the shelf.
  async function loadMore(t, turn) {
    const T = turns[t];
    T.loading = true;
    const rail = turn.querySelector('.rail');
    rail.insertAdjacentHTML('beforeend', skel);
    try {
      const d = await api('/v1/capture', { text: ask.text, more: T.more || (T.kind === 'outfits' ? 'more looks like these' : 'more like these, from other stores'), avoid: ask.avoid.slice(-60) });
      const got = listOf(d);
      const fresh = got && got.kind === T.kind ? got.list : [];
      rail.querySelector('.sk')?.remove();
      if (!fresh.length) T.done = true;
      for (const e of fresh) {
        for (const u of urlsOf(e)) if (!ask.avoid.includes(u)) ask.avoid.push(u);
        const i = T.list.push(e) - 1;
        rail.insertAdjacentHTML('beforeend', (T.kind === 'outfits' ? outfitCard : productCard)(e, t + ':' + i, false));
      }
      details(fresh);
      if (++T.page >= BATCHES) T.done = true;
    } catch {
      rail.querySelector('.sk')?.remove();
      T.done = true;
    } finally {
      T.loading = false;
      T.sync();
    }
  }

  // Photos and stock for stores that don't let Spot read their pages: asked
  // after the shelf shows, then filled in where they are.
  const asked = new Set();
  async function details(list) {
    const need = list.flatMap((e) => e.items || [e]).filter((o) => o.item.url && (!o.item.image_url || o.stock === 'unknown') && !asked.has(o.item.url));
    for (let i = 0; i < need.length; i += 8) {
      const chunk = need.slice(i, i + 8);
      for (const o of chunk) asked.add(o.item.url);
      api('/v1/capture/details', { urls: chunk.map((o) => ({ url: o.item.url, variant: o.item.variant || '' })) })
        .then((r) => {
          for (const p of r.pages || []) {
            for (const o of chunk.filter((x) => x.item.url === p.url)) {
              if (p.image_url && !o.item.image_url) o.item.image_url = p.image_url;
              if (p.stock !== 'unknown') o.stock = p.stock;
              if (p.price_cents && !o.item.price_cents) o.item.price_cents = p.price_cents;
            }
            const o = chunk.find((x) => x.item.url === p.url);
            if (!o) continue;
            for (const ph of document.querySelectorAll('#thread [data-url="' + CSS.escape(p.url) + '"]')) {
              if (ph.classList.contains('stk')) ph.innerHTML = stockTag(o);
              else if (ph.tagName === 'LI') ph.classList.toggle('gone', o.stock === 'out');
              else if (p.image_url && !ph.querySelector('img')) ph.insertAdjacentHTML('afterbegin', '<img src="' + esc(p.image_url) + '" alt="" referrerpolicy="no-referrer">');
            }
            if (o.stock === 'out') for (const c of document.querySelectorAll('#thread .pc:not(.look) [data-url="' + CSS.escape(p.url) + '"]')) {
              const card = c.closest('.pc');
              card.classList.add('gone');
              for (const b of card.querySelectorAll('[data-act="pay"],[data-act="ask"]')) b.disabled = true;
            }
          }
        })
        .catch(() => {});
    }
  }
  // A photo that won't load shows the store's tile underneath instead.
  $('#thread').addEventListener('error', (e) => e.target.tagName === 'IMG' && e.target.remove(), true);

  const entryOf = (k) => {
    const [t, i] = String(k).split(':').map(Number);
    return { T: turns[t], e: turns[t].list[i] };
  };
  // One tap from the shelf: the link is made right here (a look from several
  // stores is one link, one payment); then either they pay it themselves, or
  // it's ready to send.
  async function oneTap(act, k, btn) {
    const { T, e } = entryOf(k);
    const pieces = (e.items || [e]).filter((o) => o.stock !== 'out');
    if (!(await ensureName())) return;
    const byStore = new Map();
    for (const o of pieces) {
      const key = o.merchant.url || o.merchant.name;
      if (!byStore.has(key)) byStore.set(key, { merchant: o.merchant, items: [], extras_cents: 0 });
      byStore.get(key).items.push({ ...o.item, quantity: o.item.quantity || 1 });
    }
    const stores = [...byStore.values()];
    const last = stores.pop();
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = act === 'pay' ? 'opening checkout…' : 'making your link…';
    say(act === 'pay' ? 'one sec, getting checkout ready…' : 'making your link…');
    const settle = me.settle;
    me.settle = 'card'; // Spot buys it, whoever pays
    try {
      basket = stores;
      draft = { merchant: last.merchant, items: last.items, extras_cents: 0, note: '', source: 'lookup', fromPicks: true };
      made = null;
      await create();
      if (act === 'pay') {
        if (made.bundle) location.href = made.link;
        else {
          await api('/v1/carts/' + made.token + '/manage/pay-yourself', { k: made.key });
          location.href = made.manage;
        }
        return;
      }
      ready();
    } catch (err) {
      // Something to fix first (a missing price, a store Spot can't buy
      // from): the details screen, with the reason.
      basket = [];
      renderBasket();
      draft = { ...toDraft({ source: 'lookup', merchant: last.merchant, items: last.items }), fromPicks: true };
      check(err.message);
    } finally {
      me.settle = settle;
      btn.disabled = false;
      btn.textContent = label;
    }
  }
  // Their name goes on the link ("Kyle asked for…"): asked once, remembered.
  function ensureName() {
    if (me.name) return Promise.resolve(true);
    const sheet = $('#nameSheet');
    sheet.hidden = false;
    $('#sheetName').focus();
    return new Promise((done) => {
      sheet.onsubmit = (ev) => {
        ev.preventDefault();
        const name = $('#sheetName').value.trim();
        if (!name) return $('#sheetName').focus();
        me = { ...me, name };
        save('spot:me', me);
        sheet.hidden = true;
        done(true);
      };
      $('#sheetX').onclick = () => {
        sheet.hidden = true;
        done(false);
      };
    });
  }
  $('#thread').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'edit') {
      const { e } = entryOf(b.dataset.k);
      draft = { ...toDraft({ source: 'lookup', merchant: e.merchant, items: [{ ...e.item }], in_stock: e.stock === 'in' }), fromPicks: true };
      made = null;
      return check(e.stock === 'in' ? '' : 'I couldn’t check stock at ' + (e.merchant.name || 'that store') + '. Tap “At the store” to make sure it’s there');
    }
    oneTap(b.dataset.act, b.dataset.k, b);
  });
  async function askMore(e) {
    e?.preventDefault();
    const more = $('#more2').value.trim();
    if (!more) return $('#more2').focus();
    const btn = $('#askGo');
    btn.disabled = true;
    const turn = document.createElement('div');
    turn.className = 'turn';
    turn.innerHTML = '<div class="me">' + esc(more) + '</div>' + spotSays('looking around…') + skeleton();
    $('#thread').appendChild(turn);
    turn.scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#more2').value = '';
    say('on it, looking around…');
    try {
      const d = await api('/v1/capture', { text: ask.text, more, avoid: ask.avoid.slice(-60) });
      if (listOf(d)) shelf(more, d, turn, more);
      else {
        turn.innerHTML = '<div class="me">' + esc(more) + '</div>' + spotSays(d.warning || 'I couldn’t find anything new for that. Try saying it another way.');
        say('hmm, nothing new for that one');
      }
    } catch (err) {
      turn.innerHTML = '<div class="me">' + esc(more) + '</div><p class="err">' + esc(err.message) + '</p>';
      say('hmm, that one got away from me');
    } finally {
      btn.disabled = false;
    }
  }
  $('#askMore').addEventListener('submit', askMore);
  $('#picksOver').onclick = () => {
    turns.length = 0;
    $('#thread').innerHTML = '';
    q.value = '';
    show('compose');
    say('what do you want?');
  };
  $('#picksManual').onclick = () => {
    draft = toDraft({ source: 'text', items: [{ ...blank(), title: ask.text }] });
    made = null;
    check('');
  };
  $('#backPicks').onclick = () => {
    show('picks');
    for (const T of turns) T.sync?.();
    say('swipe for more →');
  };

  // "Not quite": what they say about this find, and everything shown so far,
  // go back for another look (a sold-out find is never offered again).
  async function findAnother() {
    const more = $('#more').value.trim();
    const top = draft.items[0] || {};
    for (const u of [top.url, ...(draft.tried || [])]) if (u && !ask.avoid.includes(u)) ask.avoid.push(u);
    ask.avoid = ask.avoid.slice(-10);
    // A pasted link or a screenshot has no words to search with: use what it was.
    const base = ask.text && !/https?:\/\//.test(ask.text) ? ask.text : [top.title, draft.merchant.name && 'from ' + draft.merchant.name].filter(Boolean).join(' ');
    if (!base) return $('#more').focus();
    const btn = $('#moreGo');
    btn.disabled = true;
    btn.textContent = 'looking…';
    $('#checkErr').textContent = '';
    say(draft.sold_out ? 'on it, finding one that’s in stock…' : 'on it, looking again…');
    try {
      const d = await api('/v1/capture', { text: base, more: more || (draft.sold_out ? 'that one is sold out, find one in stock' : 'show me a different one'), avoid: ask.avoid });
      if (!ask.text) ask.text = base;
      const keep = { note: $('#note').value.trim() };
      draft = { ...toDraft(d), ...keep };
      $('#more').value = '';
      check(d.warning || '');
    } catch (e) {
      $('#checkErr').textContent = e.message;
      say('hmm, that one got away from me');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Find another';
    }
  }
  $('#moreGo').onclick = findAnother;
  $('#more').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      findAnother();
    }
  });

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
    // What it found, with the photo, so a lookup is easy to sanity-check.
    const top = draft.items.length === 1 && draft.items[0];
    $('#found').hidden = !(top && top.image_url);
    if (top && top.image_url) {
      const img = String(top.image_url).replace(/["'()\\]/g, (c) => '%' + c.charCodeAt(0).toString(16));
      $('#found').innerHTML = '<div class="thumb" style="background-image:url(\'' + esc(img) + '\')"></div><div><div class="t">' + (draft.sold_out ? '<span class="tag out">Sold out</span> ' : draft.in_stock ? '<span class="tag in">In stock</span> ' : '') + esc(top.title) + '</div><div class="v">' + esc([top.variant, draft.merchant.name].filter(Boolean).join(' · ')) + '</div>' +
        (top.url && /^https?:/i.test(top.url) ? '<a href="' + esc(top.url) + '" target="_blank" rel="noopener">See it at the store ↗</a>' : '') + '</div>';
    }
    // Something found for them (or sold out): they can ask for another.
    $('#backPicks').hidden = Boolean(made) || !draft.fromPicks || !turns.length;
    $('#refine').hidden = Boolean(made) || Boolean(draft.fromPicks) || !(draft.sold_out || draft.source === 'lookup' || draft.source === 'text');
    $('#refineQ').textContent = draft.sold_out ? 'Sold out. What else would work?' : 'Not quite? Tell me what to change.';
    $('#moreGo').className = draft.sold_out ? 'btn small' : 'btn ghost small';
    $('#note').value = draft.note || '';
    $('#saveCheck').textContent = made ? 'Save changes' : 'Looks good →';
    delete $('#saveCheck').dataset.sure;
    renderItems();
    show('check');
    say(made ? 'what should I fix?' : draft.sold_out ? 'aw, that one’s sold out' : 'quick check before we send it');
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
      draft.sold_out = false;
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
  // Same as cart.js spotFee: $2 plus card processing on everything charged.
  const feeOf = (goods, room, first) => {
    const p = CFG.cardPct / 10000;
    const fixed = first ? (goods * CFG.feeBps) / 10000 + CFG.feeFixed + CFG.cardFixed : 0;
    return Math.ceil(((goods + room) * p + fixed) / (1 - p));
  };
  const cushionOf = (goods) => Math.min(Math.round((goods * CFG.cushionBps) / 10000), CFG.cushionMax);
  function totals() {
    const sub = draft.items.reduce((s, it) => s + (it.price_cents || 0) * it.quantity, 0);
    const cart = sub + (toCents($('#extras').value) || 0);
    const card = $('#settle').value === 'card';
    const all = [...basket.map(goodsOf), cart];
    const goods = all.reduce((n, g) => n + g, 0);
    const fee = card ? all.reduce((n, g, i) => n + feeOf(g, cushionOf(g), i === 0), 0) : 0;
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
    if (draft.sold_out && !made && !btn.dataset.sure) {
      btn.dataset.sure = '1';
      btn.textContent = 'Send anyway →';
      return ($('#checkErr').textContent = 'The store shows this as sold out, so it may not be orderable. Find another above, or tap again to send it anyway.');
    }
    delete btn.dataset.sure;
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
    // Multi-store asks are bought by Spot, and Spot can't buy from Amazon.
    if (/^amazon\b/i.test(draft.merchant.name) || draft.items.some((i) => { try { return /(^|\.)(amazon|amzn)\.[a-z.]+$/i.test(new URL(i.url).hostname); } catch (e) { return false; } })) return ($('#checkErr').textContent = 'Amazon can’t be part of a multi-store ask. Send it as its own link, straight to your Venmo or Cash App.');
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
    turns.length = 0;
    $('#thread').innerHTML = '';
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
