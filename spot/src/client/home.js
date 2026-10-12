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
      loadWatches();
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

  let screen = 'compose';
  const show = (id) => {
    // Into a pick's details from the shelf: a step in the history, so going
    // back (a swipe, the back button) lands on the shelf, not off the page.
    if (screen === 'picks' && (id === 'check' || id === 'ready') && !history.state?.spot) history.pushState({ spot: id }, '');
    screen = id;
    for (const s of ['compose', 'picks', 'check', 'ready', 'shop']) $('#' + s).hidden = s !== id;
    $('#mine').hidden = id !== 'compose' || !load('spot:mine', []).length;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  // ─── Spot, the mascot ─────────────────────────────────────────────────────
  // The live 3D plush (assets/spot3d.js, as on the website) once it loads;
  // the stills until then, or on Save-Data. He has opinions: he leans in while
  // he searches, hops when the first pick lands, gets flustered when he comes
  // up empty, and is thrilled when you choose the pick he recommended.
  const buddyEl = $('#buddy');
  const sayEl = $('#say');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let s3 = null;
  const speak = (t) => {
    if (sayEl.textContent === t) return;
    sayEl.textContent = t;
    sayEl.classList.remove('pop');
    void sayEl.offsetWidth;
    sayEl.classList.add('pop');
  };
  // A quip holds the bubble for a moment; whatever Spot meant to say next
  // follows right after.
  let quipUntil = 0;
  let queued = null;
  let quipT = 0;
  const say = (t) => (Date.now() < quipUntil ? (queued = t) : speak(t));
  const quip = (t, ms = 2200) => {
    if (!t) return;
    if (Date.now() >= quipUntil) queued = sayEl.textContent;
    speak(t);
    quipUntil = Date.now() + ms;
    clearTimeout(quipT);
    quipT = setTimeout(() => {
      quipUntil = 0;
      if (queued != null) speak(queued);
      queued = null;
    }, ms);
  };
  const LINES = {
    mine: ['ooh, that’s MY pick! 😍', 'yesss, the one I’d get 🧡', 'great minds 🤝', 'you’ve got taste 😌', 'my favorite too!! 🥹'],
    other: ['ooh, nice one 👌', 'good eye!', 'love that 💛', 'solid choice'],
    paidMine: ['you got my pick!! 🎉 ordering it…', 'best. choice. ordering it… 🧡'],
    back: ['that one’s still my fave 👀', 'just saying, my pick’s right here 😇'],
    found: ['ooh, found good stuff 🤩', 'look what I found!', 'okay these are good 👀'],
    empty: ['hmm 😕', 'oof, nothing yet'],
    poke: ['boop!', 'hehe', 'eep!', 'that tickles 😆'],
    dizzy: ['whoa… 💫'],
    shy: ['oh! hi… 🙈'],
    yawn: ['*yaaawn* 🥱'],
    wake: ['oh! I’m up 👀'],
    back_tab: ['you’re back! 👋'],
  };
  const said = {};
  const line = (k) => {
    const a = LINES[k] || [];
    said[k] = (said[k] ?? Math.floor(Math.random() * a.length)) + 1;
    return a[said[k] % a.length] || '';
  };
  // The stills' version of a mood, when the 3D one isn't there.
  const still = (cls, ms) => {
    if (!buddyEl) return;
    buddyEl.classList.remove('joy', 'think', 'hop', 'oh');
    void buddyEl.offsetWidth;
    if (cls) buddyEl.classList.add(cls);
    if (cls && ms) setTimeout(() => buddyEl.classList.remove(cls), ms);
  };
  function confetti(n = 34) {
    if (reduceMotion || !buddyEl) return;
    const c = document.createElement('div');
    c.className = 'confetti';
    const cols = ['#ff5a36', '#ffb347', '#1d8a52', '#4b7bff', '#ffd23f', '#ff8fb1'];
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i');
      const a = Math.random() * Math.PI * 2;
      const d = 60 + Math.random() * 150;
      p.style.cssText = '--dx:' + (Math.cos(a) * d).toFixed(0) + 'px;--dy:' + (Math.sin(a) * d - 50).toFixed(0) + 'px;--r:' + (Math.random() * 720 - 360).toFixed(0) + 'deg;background:' + cols[i % cols.length];
      c.appendChild(p);
    }
    buddyEl.appendChild(c);
    setTimeout(() => c.remove(), 1500);
  }
  // Where they're looking: the card they chose gets its own happy Spot, who
  // pops up over the photo with his line (and hearts, for his own pick).
  function cardCheer(card, mine, text) {
    if (!card) return;
    card.querySelector('.cardspot')?.remove();
    const yay = buddyEl?.querySelector('img.joy')?.getAttribute('src') || '';
    const c = document.createElement('div');
    c.className = 'cardspot' + (mine ? ' mine' : '');
    c.setAttribute('aria-hidden', 'true');
    c.innerHTML = '<span class="cs-say">' + esc(text) + '</span><img src="' + esc(yay) + '" alt="" width="320" height="358">' + (mine && !reduceMotion ? '<b>💛</b><b>🧡</b><b>💛</b><b>✨</b>' : '');
    (card.querySelector('.ph') || card).appendChild(c);
    setTimeout(() => c.classList.add('bye'), mine ? 2300 : 1500);
    setTimeout(() => c.remove(), mine ? 2800 : 2000);
  }
  // The small Spot by his line in the thread hops along with the big one.
  const nod = () => {
    const f = [...document.querySelectorAll('#thread .spotsay i')].at(-1);
    if (!f || reduceMotion) return;
    f.classList.remove('hop');
    void f.offsetWidth;
    f.classList.add('hop');
  };
  let thinkT = 0;
  let thinkStop = 0;
  const spot = {
    // Searching: he leans in and looks around until the first pick lands.
    think(on) {
      clearInterval(thinkT);
      clearTimeout(thinkStop);
      if (on) thinkStop = setTimeout(() => spot.think(false), 30000); // never looks around forever
      if (s3) {
        s3.anticipate(on);
        if (on) thinkT = setInterval(() => s3.play(['glance', 'tilt', 'glance', 'peek'][Math.floor(Math.random() * 4)]), 2600);
      } else still(on ? 'think' : null);
    },
    perk() {
      spot.think(false);
      nod();
      if (s3) {
        s3.hop();
        s3.happy(true);
        setTimeout(() => s3?.happy(false), 1100);
      } else still('hop', 700);
    },
    // You chose something: over the moon if it's the one he recommended.
    cheer(mine) {
      spot.think(false);
      nod();
      if (s3) {
        s3.hop();
        s3.happy(true);
        if (mine) setTimeout(() => s3?.hop(), 520), setTimeout(() => s3?.play('wiggle'), 1100);
        setTimeout(() => s3?.happy(false), mine ? 2600 : 1400);
      } else still(mine ? 'joy' : 'hop', mine ? 2400 : 700);
      if (mine) confetti();
    },
    oops() {
      spot.think(false);
      if (s3) {
        s3.pose('oh');
        setTimeout(() => s3?.pose(null), 1500);
      } else still('oh', 1500);
    },
  };
  if (buddyEl) {
    buddyEl.addEventListener('click', (e) => {
      if (s3) {
        const r = buddyEl.getBoundingClientRect();
        return s3.poke((e.clientX - (r.left + r.width / 2)) / (r.width / 2));
      }
      still('hop', 700);
      quip(line('poke'), 1400);
    });
    const src = $('#hero')?.dataset.spot3d;
    if (src && !navigator.connection?.saveData)
      setTimeout(
        () =>
          import(src)
            .then((m) => {
              s3 = m.mountSpot3D(buddyEl, { onCue: (c) => quip(line(c === 'back' ? 'back_tab' : c), 1800) });
              if (!s3) return;
              buddyEl.classList.add('has3d');
              if (screen === 'compose') setTimeout(() => s3?.play('wave'), 600);
            })
            .catch(() => {}),
        300,
      );
  }

  // ─── Compose ──────────────────────────────────────────────────────────────
  const q = $('#q');
  // He leans in while you type.
  q.addEventListener('focus', () => s3?.anticipate(true));
  q.addEventListener('blur', () => s3?.anticipate(false));
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
    spot.think(true), say(image ? 'ooh, let me look at that…' : /https?:\/\//.test(text) ? 'grabbing it…' : 'looking it up…');
    try {
      // Typed: the shelf opens right away and fills as the AI finds things.
      if (!image && !/https?:\/\//.test(text)) {
        forgetShelf();
        ask = { text, avoid: [] };
        made = null;
        $('#thread').innerHTML = '';
        turns.length = 0;
        show('picks'); // visible first, so the shelf can measure itself
        const T = openTurn(text);
        let done = null;
        try {
          ({ done } = await fill(T, { text }));
        } catch (err) {
          if (T.list.length) return;
          throw err;
        }
        if (!T.list.length) {
          turns.length = 0;
          $('#thread').innerHTML = '';
          show('compose');
          notFound(done?.warning || 'I couldn’t find that one. Try different words, or paste a link', text);
        }
        return;
      }
      const d = await api('/v1/capture', image ? { image } : { text });
      ask = { text: image ? '' : text, avoid: [] };
      made = null;
      if (listOf(d)) {
        $('#thread').innerHTML = '';
        turns.length = 0;
        show('picks');
        shelfFrom(text, d);
        return;
      }
      if (d.not_found) return notFound(d.warning, text);
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
      spot.oops(), say('hmm, that one got away from me');
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

  // Nothing found: stay right here, say so, keep what they typed. Never a
  // cart with no product in it (and never a fee for nothing).
  function notFound(warning, text) {
    show('compose');
    $('#capErr').innerHTML = esc(warning) + ' <button class="textlink" type="button" id="capRetry">Try again</button> · <button class="textlink" type="button" id="capManual">type it in myself</button>';
    spot.oops(), say('hmm, I came up empty on that one');
    $('#capRetry').onclick = go;
    $('#capManual').onclick = () => {
      draft = toDraft({ source: 'text', items: [{ ...blank(), title: text }] });
      made = null;
      check('');
    };
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
    (sold ? '' : '<div class="wpay" data-k="' + k + '" hidden></div>') +
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
      (it.url ? '<div class="facts" data-facts="' + esc(it.url) + '" data-k="' + k + '">' + factsHtml(o, k) + '</div>' : '') +
      (it.url && /^https?:/i.test(it.url) ? '<div class="rv" data-rv="' + esc(it.url) + '" data-k="' + k + '">' + reviewsHtml(o, k) + '</div>' : '') +
      '<div class="pr" data-pr="' + esc(it.url || '') + '">' + priceHtml(o, k) + '</div>' + buttons(k, o.stock === 'out') +
      '<div class="cardlinks"><button class="textlink" type="button" data-act="edit" data-k="' + k + '">Edit details</button>' + (it.url && /^https?:/i.test(it.url) ? watchBtn(it.url, k) : '') +
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
  const urlsOf = (entry) => (entry.items ? entry.items : [entry]).map((o) => o.item.url).filter(Boolean);
  const listOf = (d) => (d.outfits?.length ? { kind: 'outfits', list: d.outfits } : d.options?.length ? { kind: 'products', list: d.options } : null);

  // The search, streamed: one line of JSON per event, as the server has it
  // (a pick the moment the AI has written it, a store check as it lands).
  async function streamed(body, on) {
    const r = await fetch('/v1/capture/stream', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok || !r.body) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.error || 'Error ' + r.status);
    }
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (value) buf += dec.decode(value, { stream: true });
      for (let i; (i = buf.indexOf('\n')) >= 0; ) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line) {
          try {
            on(JSON.parse(line));
          } catch {}
        }
      }
      if (done) break;
    }
  }

  // A turn: what they said, Spot's reply, and a shelf that fills as picks arrive.
  function openTurn(said, more = '', el) {
    const t = turns.push({ kind: null, list: [], said, more, page: 1, done: false, loading: false, profile: null }) - 1;
    const T = turns[t];
    const turn = el || document.createElement('div');
    turn.className = 'turn';
    turn.dataset.t = t;
    turn.innerHTML = '<div class="me">' + esc(said) + '</div>' + spotSays('looking around…') + '<p class="used" hidden></p><div class="shelf"><div class="rail" tabindex="0" role="region" aria-roledescription="carousel" aria-label="Picks">' + skel.repeat(2) + '</div><div class="railnav"><button type="button" data-step="-1" aria-label="Previous">‹</button><span class="at"></span><button type="button" data-step="1" aria-label="Next">›</button></div></div>';
    if (!el) $('#thread').appendChild(turn);
    T.el = turn;
    const rail = (T.rail = turn.querySelector('.rail'));
    const step = () => (rail.firstElementChild?.offsetWidth || 280) + 12;
    T.sync = () => {
      if (turns[t] !== T) return; // a shelf from before "start over"
      const n = T.list.length;
      const at = n ? Math.min(Math.round(rail.scrollLeft / step()), n - 1) : 0;
      turn.querySelector('.at').textContent = n ? at + 1 + ' of ' + n + (T.done ? '' : '+') : '';
      // Back to his pick after a look around: he'd like a word.
      T.far = Math.max(T.far || 0, at);
      if (at === 0 && T.far >= 3 && !T.nudged && T.kind === 'products') (T.nudged = true), quip(line('back'), 2200), s3?.play('bounce');
      turn.querySelector('[data-step="-1"]').disabled = rail.scrollLeft < 4;
      turn.querySelector('[data-step="1"]').disabled = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 4;
      // Near the end: load the next batch, so the shelf never runs out.
      if (n && !T.done && !T.loading && rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - step() * 2) loadMore(t);
    };
    rail.addEventListener('scroll', T.sync, { passive: true });
    addEventListener('resize', T.sync, { passive: true });
    turn.querySelector('.railnav').addEventListener('click', (e) => {
      const s = +e.target.dataset.step;
      if (s) rail.scrollBy({ left: s * step(), behavior: 'smooth' });
    });
    rail.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') rail.scrollBy({ left: (e.key === 'ArrowRight' ? 1 : -1) * step(), behavior: 'smooth' });
    });
    T.sync();
    turn.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return T;
  }
  // Spot's reply, once there's something on the shelf.
  function headline(T) {
    const first = turns.indexOf(T) === 0;
    const stores = new Set(T.list.flatMap((e) => (e.items || [e]).map((o) => o.merchant.name))).size;
    const n = T.list.length;
    const line = T.kind === 'outfits' ? (n === 1 ? 'here’s a look I put together' : n + ' looks, from ' + stores + ' stores. my favorite’s first →') :
      n === 1 ? 'here’s my first pick. more coming →' : (first ? 'found ' + n + ' at ' + (stores > 1 ? stores + ' stores' : T.list[0].merchant.name) : 'ok, ' + n + ' more') + '. my pick’s first, swipe for more →';
    T.el.querySelector('.spotsay span').textContent = line;
  }
  function showUsed(T) {
    const p = T.profile;
    const used = p ? [p.sizes && 'In your sizes', p.ship_to && 'ships to ' + p.ship_to].filter(Boolean).join(' · ') : '';
    const el = T.el.querySelector('.used');
    el.hidden = !used;
    el.textContent = used ? '✓ ' + used : '';
    el.title = p?.sizes || '';
  }
  function addEntry(T, kind, e) {
    if (!T.kind) {
      T.kind = kind;
      T.el.querySelector('.shelf').classList.toggle('looks', kind === 'outfits');
      T.rail.setAttribute('aria-label', kind === 'outfits' ? 'Outfits' : 'Picks');
    }
    if (kind !== T.kind) return false;
    for (const u of urlsOf(e)) if (!ask.avoid.includes(u)) ask.avoid.push(u);
    if (!restoring) rememberSeen(e, T.said);
    const t = turns.indexOf(T);
    const i = T.list.push(e) - 1;
    const html = (kind === 'outfits' ? outfitCard : productCard)(e, t + ':' + i, i === 0);
    const sk = T.rail.querySelector('.sk');
    if (sk) sk.insertAdjacentHTML('beforebegin', html);
    else T.rail.insertAdjacentHTML('beforeend', html);
    if (i === 0) T.rail.scrollLeft = 0; // the first pick in view, not the placeholder it pushed along
    headline(T);
    T.sync();
    walletWatch();
    keepShelf();
    return true;
  }
  // A store check, or the AI's read of a page Spot couldn't open, came back:
  // fill in that product wherever it is. `own` = the store's own page photo,
  // which beats the one search turned up.
  function applyPage(p, own = false) {
    if (p.new_url) return moved(p);
    const hits = turns.flatMap((T) => T.list.flatMap((e) => e.items || [e])).filter((o) => o.item.url === p.url);
    if (!hits.length) return;
    const swap = p.image_url && (own || !hits[0].item.image_url);
    for (const o of hits) {
      if (swap) o.item.image_url = p.image_url;
      if (p.stock && p.stock !== 'unknown') o.stock = p.stock;
      if (p.price_cents && !o.item.price_cents) o.item.price_cents = p.price_cents;
    }
    const o = hits[0];
    for (const el of document.querySelectorAll('#thread [data-url="' + CSS.escape(p.url) + '"]')) {
      if (el.classList.contains('stk')) el.innerHTML = stockTag(o);
      else if (el.tagName === 'LI') el.classList.toggle('gone', o.stock === 'out');
      else if (swap) {
        el.querySelector('img')?.remove();
        el.insertAdjacentHTML('afterbegin', '<img src="' + esc(p.image_url) + '" alt="" referrerpolicy="no-referrer">');
      }
    }
    keepShelf();
    if (o.stock === 'out') for (const c of document.querySelectorAll('#thread .pc:not(.look) [data-url="' + CSS.escape(p.url) + '"]')) {
      const card = c.closest('.pc');
      card.classList.add('gone');
      for (const b of card.querySelectorAll('[data-act="pay"],[data-act="ask"]')) b.disabled = true;
    }
  }
  // The link was a category or search page and Spot found the product on it:
  // the product's own link, name, price and photo, and the card drawn again.
  function moved(p) {
    turns.forEach((T, t) => {
      if (!T) return;
      T.list.forEach((e, i) => {
        const hits = (e.items || [e]).filter((o) => o.item.url === p.url);
        if (!hits.length) return;
        for (const o of hits) {
          Object.assign(o.item, { url: p.new_url, title: p.title || o.item.title });
          if (p.price_cents) (o.item.price_cents = p.price_cents), o.why && (o.why = o.why.replace(/\s*\(?est(?:imated|\.)? price\)?/i, '').trim() || null);
          if (p.image_url) o.item.image_url = p.image_url;
          if (p.stock && p.stock !== 'unknown') o.stock = p.stock;
        }
        const i0 = ask.avoid.indexOf(p.url);
        if (i0 >= 0) ask.avoid[i0] = p.new_url;
        const el = T.rail.querySelector('[data-card="' + t + ':' + i + '"]');
        if (el) el.outerHTML = (e.items ? outfitCard : productCard)(e, t + ':' + i, i === 0);
      });
    });
    walletWatch();
    keepShelf();
  }
  // One batch into a turn, card by card as it streams.
  async function fill(T, body) {
    T.loading = true;
    const added = [];
    let done = null;
    try {
      await streamed(body, (e) => {
        if (e.type === 'profile') (T.profile = e.profile), showUsed(T);
        else if (e.type === 'searching') say(T.list.length ? 'finding more…' : 'searching stores…'), !T.list.length && spot.think(true);
        else if (e.type === 'checking') !T.list.length && (say('found some. getting their photos…'), spot.think(true));
        else if (e.type === 'pick' || e.type === 'outfit') {
          const entry = e.option || e.outfit;
          if (addEntry(T, e.type === 'pick' ? 'products' : 'outfits', entry)) added.push(entry);
          if (T.list.length === 1) say(T.kind === 'outfits' ? 'first look’s up. more coming →' : 'first pick’s up. more coming →'), spot.perk(), quip(line('found'), 1600);
        } else if (e.type === 'update') applyPage(e, true), photoFor(e.new_url || e.url);
        else if (e.type === 'done') done = e;
      });
    } finally {
      T.loading = false;
      spot.think(false);
      for (const sk of T.rail.querySelectorAll('.sk')) sk.remove();
      if (!added.length || ++T.page > BATCHES) T.done = true;
      T.sync();
      keepShelf();
    }
    if (T.list.length > 1) say('swipe for more →');
    details(added);
    wantFacts(added);
    if (T.kind === 'products' && T.list[0] && added.includes(T.list[0])) loadReviews(T.list[0]);
    return { added, done };
  }
  // The next batch, from stores not shown yet, onto the end of the shelf.
  async function loadMore(t) {
    const T = turns[t];
    if (!T) return;
    T.rail.insertAdjacentHTML('beforeend', skel);
    try {
      await fill(T, { text: ask.text, more: T.more || (T.kind === 'outfits' ? 'more looks like these' : 'more like these, from other stores'), avoid: ask.avoid.slice(-60), count: 8 });
    } catch {
      T.done = true;
      T.sync();
    }
  }
  // The shelf survives leaving the page (into a store, checkout, a swipe
  // back, the app closed): kept on this phone for a few hours, so they can
  // keep shopping it and ask for more.
  const SHELF = 'spot:shelf';
  const SHELF_TTL = 6 * 3600e3;
  function keepShelf() {
    const kept = turns.filter((T) => T?.list.length).map((T) => ({ kind: T.kind, list: T.list, said: T.said, more: T.more, page: T.page, done: T.done, profile: T.profile }));
    if (kept.length) save(SHELF, { at: Date.now(), ask, turns: kept });
  }
  function forgetShelf() {
    try {
      localStorage.removeItem(SHELF);
    } catch {}
  }
  let restoring = false;
  function restoreShelf() {
    const s = load(SHELF, null);
    if (!s || !Array.isArray(s.turns) || !s.turns.length || !(Date.now() - s.at < SHELF_TTL)) return false;
    ask = { text: String(s.ask?.text || ''), avoid: Array.isArray(s.ask?.avoid) ? s.ask.avoid : [] };
    $('#thread').innerHTML = '';
    turns.length = 0;
    show('picks');
    for (const t of s.turns) {
      const T = openTurn(t.said, t.more || '');
      T.profile = t.profile || null;
      showUsed(T);
      for (const sk of T.rail.querySelectorAll('.sk')) sk.remove();
      restoring = true;
      try {
        for (const e of t.list || []) addEntry(T, t.kind, e);
      } finally {
        restoring = false;
      }
      T.page = t.page || 1;
      T.done = Boolean(t.done);
      T.sync();
    }
    window.scrollTo({ top: 0 });
    say('your picks are still here. swipe, or ask for more ↓');
    return true;
  }

  // A whole answer at once (a link or a screenshot that came back as several).
  function shelfFrom(said, d) {
    const got = listOf(d);
    const T = openTurn(said);
    T.profile = d.profile || null;
    showUsed(T);
    for (const sk of T.rail.querySelectorAll('.sk')) sk.remove();
    for (const e of got.list) addEntry(T, got.kind, e);
    T.done = true;
    T.sync();
    details(T.list);
    wantFacts(T.list);
  }

  // Photos and stock for stores that don't let Spot read their pages: asked
  // after the shelf shows, then filled in where they are.
  const asked = new Set();
  function details(list) {
    const need = list.flatMap((e) => e.items || [e]).filter((o) => o.item.url && (!o.item.image_url || o.stock === 'unknown') && !asked.has(o.item.url));
    for (let i = 0; i < need.length; i += 8) {
      const chunk = need.slice(i, i + 8);
      for (const o of chunk) asked.add(o.item.url);
      api('/v1/capture/details', { urls: chunk.map((o) => ({ url: o.item.url, variant: o.item.variant || '', title: o.item.title || '' })) })
        .then((r) => (r.pages || []).forEach((p) => applyPage(p)))
        .catch(() => {});
    }
  }
  // A store check that came back without a photo (the store doesn't let
  // Spot read its pages): the AI reads that page now, not after the search.
  function photoFor(url) {
    const hits = turns.flatMap((T) => (T ? T.list : [])).filter((e) => (e.items || [e]).some((o) => o.item.url === url && !o.item.image_url));
    if (hits.length) details(hits);
  }
  // ─── Fit and reviews ─────────────────────────────────────────────────────
  // What buyers say, read by AI: the rating, how it fits (and the size Spot
  // would get them, from their saved sizes), what people love and don't.
  // Spot's own pick and the Shop page's open card load it right away; the
  // rest on a tap, since each new product is a fresh read.
  const reviewsBy = new Map();
  function reviewsHtml(o, k) {
    const d = reviewsBy.get(o.item.url);
    if (d === 'loading') return '<div class="rvl wait">Reading what buyers say…</div>';
    if (!d) return '<button class="textlink rvgo" type="button" data-act="reviews" data-k="' + k + '">⭐ Fit &amp; reviews</button>';
    if (d.none || d.error) return '<div class="rvl muted">' + (d.error ? 'Couldn’t read reviews just now.' : 'No reviews Spot could find for this one yet.') + '</div>';
    const out = [];
    const fit = d.fit === 'small' ? 'Runs small' : d.fit === 'large' ? 'Runs large' : d.fit === 'true' ? 'True to size' : '';
    const size = d.your_size && d.saved_size && d.your_size !== d.saved_size ? ': we’d get <b>' + esc(d.your_size) + '</b> for you (your usual ' + esc(d.saved_size) + ')' : d.your_size && d.fit === 'true' ? ': your usual <b>' + esc(d.your_size) + '</b>' : d.fit_note ? ': ' + esc(d.fit_note) : '';
    out.push('<div class="rvl">' + (d.rating ? '<b class="stars">★ ' + d.rating.toFixed(1) + '</b>' + (d.count ? ' <span class="muted">(' + d.count.toLocaleString() + ')</span>' : '') : '') + (fit ? (d.rating ? ' · ' : '') + '<span class="fit">' + fit + size + '</span>' : '') + '</div>');
    if (d.pros?.length) out.push('<div class="rvl">👍 ' + d.pros.map(esc).join(' · ') + '</div>');
    if (d.cons?.length) out.push('<div class="rvl">👎 ' + d.cons.map(esc).join(' · ') + '</div>');
    if (d.source_url) out.push('<div class="rvl"><a href="' + esc(d.source_url) + '" target="_blank" rel="noopener">reviews ↗</a></div>');
    return out.join('');
  }
  function paintReviews(url) {
    for (const el of document.querySelectorAll('.rv[data-rv="' + CSS.escape(url) + '"]')) {
      const o = entryAt(el.dataset.k, url);
      if (o) el.innerHTML = reviewsHtml(o, el.dataset.k);
    }
  }
  async function loadReviews(o) {
    const url = o?.item?.url;
    if (!url || reviewsBy.has(url)) return;
    reviewsBy.set(url, 'loading');
    paintReviews(url);
    try {
      const r = await api('/v1/reviews', { url, title: o.item.title || '', store: o.merchant?.name || '' });
      reviewsBy.set(url, r.reviews || { error: true });
      // His own pick, and buyers love it: he's chuffed.
      if (r.reviews?.rating >= 4.5 && r.reviews.count >= 50) quip('people love this one ⭐', 1800);
    } catch {
      reviewsBy.set(url, { error: true });
    }
    paintReviews(url);
  }

  // ─── Watch this ─────────────────────────────────────────────────────────
  // 👀 on any card: Spot checks the store twice a day and texts or emails
  // them when the price drops or their size is back (watches.js). Signed in
  // only, so alerts go to their own account.
  const watched = new Map();
  async function loadWatches() {
    if (!account) return;
    const r = await api('/v1/me/watches').catch(() => null);
    if (!r) return;
    watched.clear();
    for (const w of r.watches || []) watched.set(w.url, w);
    for (const u of new Set([...document.querySelectorAll('[data-watch]')].map((b) => b.dataset.watch))) paintWatch(u);
  }
  const watchBtn = (url, k) => '<button class="textlink watch' + (watched.has(url) ? ' on' : '') + '" type="button" data-act="watch" data-k="' + k + '" data-watch="' + esc(url) + '">' + (watched.has(url) ? '👀 Watching ✓' : '👀 Watch price') + '</button>';
  function paintWatch(url) {
    for (const b of document.querySelectorAll('[data-watch="' + CSS.escape(url) + '"]')) {
      b.classList.toggle('on', watched.has(url));
      b.textContent = watched.has(url) ? '👀 Watching ✓' : '👀 Watch price';
    }
  }
  async function toggleWatch(b) {
    const url = b.dataset.watch;
    if (!account) {
      quip('sign in and I’ll watch it for you 👀', 2600);
      keepShelf();
      return (location.href = '/signin?next=' + encodeURIComponent('/new'));
    }
    const { e } = entryOf(b.dataset.k);
    const o = (e?.items || [e]).find((x) => x?.item?.url === url);
    b.disabled = true;
    try {
      const had = watched.get(url);
      if (had) {
        await api('/v1/me/watches/' + encodeURIComponent(had.id) + '/stop', {});
        watched.delete(url);
        quip('okay, I’ll stop watching it', 1800);
      } else {
        const r = await api('/v1/me/watches', { url, title: o?.item.title || '', image_url: o?.item.image_url || '', variant: o?.item.variant || '', price_cents: o?.item.price_cents || null, store: o?.merchant?.name || '', store_url: o?.merchant?.url || '', stock: o?.stock || '' });
        watched.set(url, r.watch);
        quip(r.watch.stock === 'out' ? 'I’ll tell you the second it’s back 👀' : 'I’ll keep an eye on the price 👀', 2400);
        s3?.play('peek');
      }
      paintWatch(url);
      if (screen === 'shop') renderShop();
    } catch (err) {
      quip(err.message, 2600);
    } finally {
      b.disabled = false;
    }
  }

  // ─── Card facts ─────────────────────────────────────────────────────────
  // What the store's own data and Spot's AI add to a card, asked for after it
  // shows (/v1/facts): sizes and colours in stock, the store's price now and
  // its sale price, the lowest price Spot has seen, and the store's price-
  // adjustment and return policy (read off its own policy page).
  const factsBy = new Map();
  const factsWanted = new Map();
  let factsTimer = null;
  function wantFacts(list, again = false) {
    for (const o of list.flatMap((e) => e.items || [e])) {
      const u = o?.item?.url;
      if (!u || !/^https?:/i.test(u) || (!again && (factsBy.has(u) || factsWanted.has(u)))) continue;
      factsWanted.set(u, { url: u, variant: o.item.variant || '', store: o.merchant?.name || '' });
    }
    clearTimeout(factsTimer);
    factsTimer = setTimeout(askFacts, 250);
  }
  const factsTries = new Map();
  function askFacts() {
    const all = [...factsWanted.values()];
    factsWanted.clear();
    for (let i = 0; i < all.length; i += 12) {
      api('/v1/facts', { items: all.slice(i, i + 12) })
        .then((r) => {
          const pending = [];
          for (const f of r.facts || []) {
            factsBy.set(f.url, f);
            paintFacts(f.url);
            // A store Spot hasn't read the policy of yet: ask again in a bit.
            const n = factsTries.get(f.url) || 0;
            if (f.policy_pending && n < 3) factsTries.set(f.url, n + 1), pending.push(all.find((x) => x.url === f.url));
          }
          if (pending.length) setTimeout(() => (pending.forEach((x) => factsWanted.set(x.url, x)), askFacts()), 15000);
        })
        .catch(() => {});
    }
  }
  const optWords = (s) => new Set(String(s || '').toLowerCase().split(/[^a-z0-9.]+/).filter(Boolean));
  function factsHtml(o, k) {
    const f = factsBy.get(o.item.url);
    if (!f) return '';
    const out = [];
    const picked = optWords(o.item.variant);
    for (const op of (f.options || []).slice(0, 2)) {
      const vals = op.values.slice(0, 10);
      const chosen = (v) => picked.size && [...optWords(v.value)].every((w) => picked.has(w));
      out.push('<div class="opts"><b>' + esc(op.name) + '</b>' + vals.map((v) => '<span class="' + (chosen(v) ? 'on' : '') + (v.in ? '' : ' no') + '"' + (v.in ? '' : ' title="Sold out"') + '>' + esc(v.value) + '</span>').join('') + (op.values.length > vals.length ? '<span class="more">+' + (op.values.length - vals.length) + '</span>' : '') + '</div>');
    }
    const now = f.now_cents || o.item.price_cents;
    const seen = f.seen;
    if (seen && seen.days >= 3 && now && now <= seen.low_cents) out.push('<div class="fl good">↓ Lowest price Spot has seen since ' + new Date(seen.since).toLocaleDateString([], { month: 'short', day: 'numeric' }) + '</div>');
    else if (seen && seen.days >= 3 && seen.low_cents < now) out.push('<div class="fl">Spot has seen it for ' + usd(seen.low_cents) + (seen.high_cents > seen.low_cents ? '–' + usd(seen.high_cents) : '') + '</div>');
    const p = f.policy;
    const store = esc(o.merchant?.name || 'The store');
    const src = p?.source_url ? ' <a href="' + esc(p.source_url) + '" target="_blank" rel="noopener">policy ↗</a>' : '';
    if (p?.price_adjustment === true) out.push('<div class="fl shield">🛡️ Price drop protection' + (p.adjustment_days ? ' for ' + p.adjustment_days + ' days' : '') + '. Pay with Spot and Spot watches the price and asks ' + store + ' for the difference.' + src + '</div>');
    else if (p?.price_adjustment === false) out.push('<div class="fl">No price adjustments at ' + store + '.' + src + '</div>');
    if (p && (p.returns_days || p.free_returns)) out.push('<div class="fl">↩︎ ' + (p.free_returns ? 'Free returns' : 'Returns') + (p.returns_days ? ' within ' + p.returns_days + ' days' : '') + (p.price_adjustment == null ? src : '') + '</div>');
    else if (!p && f.policy_pending) out.push('<div class="fl wait">Reading ' + store + '’s price and return policy…</div>');
    return out.join('');
  }
  // The store's own price beats the estimate a search gave; on the Shop
  // page, how it moved since Spot showed it to them.
  function priceHtml(o, k) {
    const f = factsBy.get(o.item.url);
    const was = o.item.price_cents;
    const now = f?.now_cents || was;
    if (!now) return 'Price at store';
    let h = usd(now);
    if (f?.was_cents && f.was_cents > now) h += ' <s>' + usd(f.was_cents) + '</s> <span class="tag sale">Sale</span>';
    if (String(k).startsWith('s:') && was && f?.now_cents && Math.abs(f.now_cents - was) >= 100) h += '<small class="moved ' + (f.now_cents < was ? 'down' : 'up') + '">' + (f.now_cents < was ? '↓ ' + usd(was - f.now_cents) + ' less' : '↑ ' + usd(f.now_cents - was) + ' more') + ' than when you saw it</small>';
    return h;
  }
  function paintFacts(url) {
    const f = factsBy.get(url);
    const sel = (a) => '[' + a + '="' + CSS.escape(url) + '"]';
    for (const el of document.querySelectorAll('.facts' + sel('data-facts'))) {
      const o = entryAt(el.dataset.k, url);
      if (o) el.innerHTML = factsHtml(o, el.dataset.k);
    }
    for (const el of document.querySelectorAll('.pr' + sel('data-pr'))) {
      const card = el.closest('[data-card]');
      const o = card && entryAt(card.dataset.card, url);
      if (o) el.innerHTML = priceHtml(o, card.dataset.card);
    }
    // Paying uses the store's price, not the search's guess (not on the Shop
    // page, where the price they saw is kept to compare).
    if (f?.now_cents) for (const o of turns.flatMap((T) => (T ? T.list : [])).flatMap((e) => e.items || [e])) if (o.item.url === url) o.item.price_cents = f.now_cents;
  }
  const entryAt = (k, url) => {
    try {
      const { e } = entryOf(k);
      return e && (e.items || [e]).find((o) => o.item.url === url);
    } catch {
      return null;
    }
  };

  // A photo that won't load shows the store's tile underneath instead.
  $('#thread').addEventListener('error', (e) => e.target.tagName === 'IMG' && e.target.remove(), true);
  $('#shop').addEventListener('error', (e) => e.target.tagName === 'IMG' && e.target.remove(), true);

  const entryOf = (k) => {
    if (String(k).startsWith('s:')) return { T: null, e: shopList[Number(String(k).slice(2))] };
    const [t, i] = String(k).split(':').map(Number);
    return { T: turns[t], e: turns[t].list[i] };
  };

  // ─── Shop ────────────────────────────────────────────────────────────────
  // Every product Spot has shown them, as a collection page: from their
  // account when signed in (any device), and from this phone either way.
  const SEEN = 'spot:seen';
  const SEEN_KEEP = 300;
  let shopList = [];
  let lastScreen = 'compose';
  function rememberSeen(e, said) {
    const fresh = (e.items || [e]).filter((o) => o.item?.url && o.item.image_url);
    if (!fresh.length) return;
    const now = Date.now();
    const urls = new Set(fresh.map((o) => o.item.url));
    const kept = load(SEEN, []).filter((o) => o?.item?.url && !urls.has(o.item.url));
    save(SEEN, [...fresh.map((o) => ({ merchant: o.merchant, item: o.item, stock: o.stock, why: o.why || null, asked: said || '', seen_at: now })), ...kept].slice(0, SEEN_KEEP));
  }
  async function loadShop() {
    const mine = account ? await api('/v1/me/shop').then((r) => r.products || []).catch(() => []) : [];
    const byUrl = new Map();
    for (const o of [...mine, ...load(SEEN, [])]) {
      if (!o?.item?.url || !o.item.image_url) continue;
      const had = byUrl.get(o.item.url);
      if (!had || (o.seen_at || 0) > (had.seen_at || 0)) byUrl.set(o.item.url, o);
    }
    shopList = [...byUrl.values()].sort((a, b) => (b.seen_at || 0) - (a.seen_at || 0));
  }
  const shopTile = (o, i) => {
    const w = watched.get(o.item.url);
    const moved = w && w.start_cents && w.now_cents && w.now_cents < w.start_cents ? '<div class="wdrop">↓ ' + usd(w.start_cents - w.now_cents) + ' since you started watching</div>' : '';
    return '<button class="tile" type="button" data-i="' + i + '"><div class="ph"><img src="' + esc(o.item.image_url) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' + tile(o) + (w ? '<span class="wtag" title="Watching">👀</span>' : '') + '</div>' +
      '<div class="tb"><div class="st">' + esc(o.merchant?.name || '') + '</div><div class="t">' + esc(o.item.title) + '</div><div class="pr">' + (o.item.price_cents ? usd(o.item.price_cents) : 'Price at store') + '</div>' + moved + '</div></button>';
  };
  let shopFilter = 'all';
  function renderShop() {
    const grid = $('#shopGrid');
    // Watching: what they asked Spot to keep an eye on, as Spot last saw it.
    if (shopFilter === 'watch') {
      const seen = new Map(shopList.map((o) => [o.item.url, o]));
      shopList = [...watched.values()].map((w) => ({ ...(seen.get(w.url) || {}), merchant: { name: w.store || seen.get(w.url)?.merchant?.name || '' }, item: { ...(seen.get(w.url)?.item || {}), title: w.title, url: w.url, image_url: w.image_url || seen.get(w.url)?.item?.image_url, variant: w.variant, price_cents: w.now_cents || seen.get(w.url)?.item?.price_cents || null, quantity: 1 }, stock: w.stock, seen_at: w.at })).filter((o) => o.item.image_url);
    }
    grid.innerHTML = shopList.map(shopTile).join('');
    $('#shopEmpty').hidden = shopList.length > 0 || shopFilter === 'watch';
    $('#fWatch').textContent = '👀 Watching' + (watched.size ? ' ' + watched.size : '');
    $('#fAll').setAttribute('aria-pressed', String(shopFilter === 'all'));
    $('#fWatch').setAttribute('aria-pressed', String(shopFilter === 'watch'));
    $('#shopSub').textContent = shopFilter === 'watch'
      ? (watched.size ? 'Spot checks these twice a day and tells you when the price drops or your size is back.' : account ? 'Tap 👀 Watch price on anything, and Spot tells you when it drops or comes back.' : 'Sign in, then tap 👀 Watch price on anything.')
      : shopList.length ? shopList.length + (shopList.length === 1 ? ' thing' : ' things') + ' Spot has shown you, newest first.' : 'Everything Spot has shown you.';
  }
  $('#fAll').onclick = () => ((shopFilter = 'all'), loadShop().then(renderShop));
  $('#fWatch').onclick = () => ((shopFilter = 'watch'), loadWatches().then(renderShop));
  function setView(v) {
    $('#shopGrid').classList.toggle('one', v === 'one');
    $('#viewGrid').setAttribute('aria-pressed', String(v !== 'one'));
    $('#viewOne').setAttribute('aria-pressed', String(v === 'one'));
    save('spot:shopView', v);
  }
  function setMode(mode) {
    const shop = mode === 'shop';
    $('#modeSpot').setAttribute('aria-selected', String(!shop));
    $('#modeShop').setAttribute('aria-selected', String(shop));
    document.body.classList.toggle('shopping', shop);
    if (shop) {
      if (screen !== 'shop') lastScreen = screen;
      show('shop');
      renderShop();
      loadShop().then(renderShop);
    } else {
      $('#shopSheet').hidden = true;
      show(lastScreen === 'shop' ? 'compose' : lastScreen);
      for (const T of turns) T?.sync?.();
    }
  }
  $('#modeShop').onclick = () => setMode('shop');
  $('#modeSpot').onclick = () => setMode('spot');
  $('#viewGrid').onclick = () => setView('grid');
  $('#viewOne').onclick = () => setView('one');
  setView(load('spot:shopView', 'grid'));
  $('#shopStart').onclick = () => (setMode('spot'), show(turns.length ? 'picks' : 'compose'), q.focus());
  $('#shopGrid').addEventListener('click', (ev) => {
    const b = ev.target.closest('.tile');
    if (!b) return;
    const i = Number(b.dataset.i);
    $('#shopCard').innerHTML = productCard(shopList[i], 's:' + i, false);
    wantFacts([shopList[i]]);
    loadReviews(shopList[i]);
    $('#shopSheet').hidden = false;
    walletWatch();
  });
  $('#shopSheetX').onclick = () => ($('#shopSheet').hidden = true);
  document.addEventListener('keydown', (e) => e.key === 'Escape' && ($('#shopSheet').hidden = true));
  // Paying or making a link from here carries on in Spot, as from the shelf.
  $('#shopCard').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'watch' || b.dataset.act === 'reviews') return actOn(b);
    $('#shopSheet').hidden = true;
    document.body.classList.remove('shopping');
    $('#modeSpot').setAttribute('aria-selected', 'true');
    $('#modeShop').setAttribute('aria-selected', 'false');
    actOn(b);
  });
  // One tap from the shelf: the link is made right here (a look from several
  // stores is one link, one payment); then either they pay it themselves, or
  // it's ready to send.
  // A card's pieces, a cart per store (sold-out ones left out).
  function storesOf(e) {
    const byStore = new Map();
    for (const o of (e.items || [e]).filter((x) => x.stock !== 'out')) {
      const key = o.merchant.url || o.merchant.name;
      if (!byStore.has(key)) byStore.set(key, { merchant: o.merchant, items: [], extras_cents: 0 });
      byStore.get(key).items.push({ ...o.item, quantity: o.item.quantity || 1 });
    }
    return [...byStore.values()];
  }
  async function oneTap(act, k, btn) {
    const { T, e } = entryOf(k);
    if (!(await ensureName())) return;
    const stores = storesOf(e);
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
  // ─── Apple Pay / Google Pay on the card ──────────────────────────────────
  // A card in view gets the wallet's own button: one tap, the wallet has the
  // address, Spot prices it for that ZIP, makes the order and charges exactly
  // what the sheet said. Pay with card stays for everyone else.
  // The card is watched (the slot itself has no size until a wallet shows).
  const seenCards = 'IntersectionObserver' in window ? new IntersectionObserver((xs) => xs.forEach((x) => x.isIntersecting && mountWallet(x.target)), { threshold: 0.5 }) : null;
  function walletWatch() {
    if (!seenCards || !window.spotWallet) return;
    for (const slot of document.querySelectorAll('#thread .wpay:not([data-on]), #shopCard .wpay:not([data-on])')) (slot.dataset.on = '1'), seenCards.observe(slot.closest('.pc'));
  }
  async function mountWallet(card) {
    seenCards.unobserve(card);
    const slot = card.querySelector('.wpay');
    if (!slot) return;
    const k = slot.dataset.k;
    const stores = () => storesOf(entryOf(k).e);
    if (!stores().length) return;
    let q;
    try {
      q = await api('/v1/quote', { stores: stores() });
      if (!q.publishable_key || !q.orderable) return;
      await window.spotStripe();
    } catch {
      return;
    }
    window.spotWallet({
      el: slot,
      pk: q.publishable_key,
      amount: q.total_cents,
      quote: (a) => api('/v1/quote', { stores: stores(), shipping: a }),
      pay: (sh, id) => walletOrder(stores(), sh, id),
      done: async (p) => {
        say(pickedMine ? line('paidMine') : 'paid! ordering it…');
        spot.cheer(pickedMine);
        await api(p.paid, {}).catch(() => {});
        location.href = p.manage;
      },
      // Checkout came to another total: its own page shows it, one more tap pays.
      failed: (m, p) => (p ? (location.href = p.manage) : say(m)),
      shown: (yes) => {
        slot.hidden = !yes;
        const pay = card?.querySelector('[data-act="pay"]');
        if (pay && yes) (pay.textContent = 'Pay with card'), pay.classList.add('ghost');
        const w = card?.querySelector('.wallets');
        if (w) w.hidden = yes;
      },
    });
  }
  // The order behind a wallet payment: a cart (or one per store), for them,
  // shipped where the wallet said, priced as the sheet showed.
  async function walletOrder(stores, ship, quoteId) {
    if (!me.name) (me = { ...me, name: String(ship.name || '').split(' ')[0] || 'Me' }), save('spot:me', me);
    const requester = { name: me.name, email: me.email || ship.email };
    const mine = load('spot:mine', []);
    if (stores.length > 1) {
      const r = await api('/v1/bundles', { requester, note: '', stores, for: 'self' });
      mine.unshift({ token: r.bundle.token, manage: r.manage_link, title: r.bundle.items[0].title + ' +' + (r.bundle.items.length - 1), merchant: r.bundle.stores.length + ' stores', total: r.bundle.cart_cents, at: Date.now() });
      save('spot:mine', mine.slice(0, 20));
      const b = '/v1/bundles/' + r.bundle.token;
      await api(b + '/manage/prepare', { k: r.manage_key, shipping: ship });
      const c = await api(b + '/pay', {});
      return { client_secret: c.client_secret, total_cents: r.bundle.total_cents, manage: r.manage_link, paid: b + '/paid' };
    }
    const st = stores[0];
    const r = await api('/v1/carts', { requester, merchant: st.merchant, items: st.items, extras_cents: 0, settle: 'card', for: 'self', note: '' });
    mine.unshift({ token: r.cart.token, manage: r.manage_link, title: st.items[0].title, merchant: st.merchant.name, total: r.cart.cart_cents, at: Date.now() });
    save('spot:mine', mine.slice(0, 20));
    const c = '/v1/carts/' + r.cart.token;
    await api(c + '/manage/prepare', { k: r.manage_key, shipping: ship, quote_id: quoteId });
    const p = await api(c + '/pay', {});
    return { client_secret: p.client_secret, total_cents: p.total_cents, manage: r.manage_link, paid: c + '/paid' };
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
    if (b) actOn(b);
  });
  function actOn(b) {
    if (b.dataset.act === 'watch') return toggleWatch(b);
    if (b.dataset.act === 'reviews') {
      const { e } = entryOf(b.dataset.k);
      return loadReviews((e?.items || [e])[0]);
    }
    if (b.dataset.act === 'edit') {
      const { e } = entryOf(b.dataset.k);
      draft = { ...toDraft({ source: 'lookup', merchant: e.merchant, items: [{ ...e.item }], in_stock: e.stock === 'in' }), fromPicks: true };
      made = null;
      return check(e.stock === 'in' ? '' : 'I couldn’t check stock at ' + (e.merchant.name || 'that store') + '. Tap “At the store” to make sure it’s there');
    }
    // Choosing one: Spot's pick (the first card of a shelf) delights him.
    const mine = /^\d+:0$/.test(String(b.dataset.k));
    if (b.dataset.act === 'pay' || b.dataset.act === 'ask') {
      pickedMine = mine;
      const l = line(mine ? 'mine' : 'other');
      spot.cheer(mine);
      quip(l, mine ? 2400 : 1600);
      cardCheer(b.closest('.pc'), mine, l);
    }
    oneTap(b.dataset.act, b.dataset.k, b);
  }
  let pickedMine = false;
  async function askMore(e) {
    e?.preventDefault();
    const more = $('#more2').value.trim();
    if (!more) return $('#more2').focus();
    const btn = $('#askGo');
    btn.disabled = true;
    $('#more2').value = '';
    say('on it, looking around…');
    const T = openTurn(more, more);
    try {
      const { done } = await fill(T, { text: ask.text, more, avoid: ask.avoid.slice(-60) });
      if (!T.list.length) {
        T.el.innerHTML = '<div class="me">' + esc(more) + '</div>' + spotSays(done?.warning || 'I couldn’t find anything new for that. Try saying it another way.');
        spot.oops(), say('hmm, nothing new for that one');
      }
    } catch (err) {
      if (!T.list.length) T.el.innerHTML = '<div class="me">' + esc(more) + '</div><p class="err">' + esc(err.message) + '</p>';
      spot.oops(), say('hmm, that one got away from me');
    } finally {
      btn.disabled = false;
    }
  }
  $('#askMore').addEventListener('submit', askMore);
  $('#picksOver').onclick = () => {
    forgetShelf();
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
  function toPicks() {
    show('picks');
    for (const T of turns) T.sync?.();
    say('swipe for more →');
  }
  $('#backPicks').onclick = () => (history.state?.spot ? history.back() : toPicks());
  addEventListener('popstate', () => screen !== 'picks' && turns.some((T) => T?.list.length) && toPicks());

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
      spot.oops(), say('hmm, that one got away from me');
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
    if (!goods) {
      $('#totals').innerHTML = '<p class="small muted" style="margin:0">Add a price to see what they’ll pay.</p>';
      return;
    }
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
  } else if (restoreShelf()) {
    // Back to the shelf they were shopping.
  } else if (me.name) {
    say('hey ' + me.name + '! what do you want?');
  }
})();
