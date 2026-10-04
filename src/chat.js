// The one chat thread, used wherever people talk: the Message Center, a client room's project thread in the work console, and a project's
// messages in the client hub. Grouped bubbles, day stamps, quoted replies, an attach button, a round send button, small centred update
// lines, live refresh. Pages give it data and a few functions (send, download, refresh); it does the rest, so the three can never drift apart.
//
//   const chat = FBChat.mount(element, { id: 'mc', viewer: 'admin', canCompose: true, placeholder: 'Message Studio Maya',
//     send: async ({ body, file, replyToId }) => { ... }, refresh: async () => ({ messages, events }), download: (fileId, name) => ..., openProduct: id => ... });
//   chat.update({ messages, events }, { toBottom: true });
//
// A message: { id, author_role, author_name, body, created_at, reply_to_id, files: [{ id, original_name, size_bytes }], tag?, noReply? }
// An event:  { id, title, createdAt, unread, productId }
(function (root) {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = {
    clip: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5l-8.6 8.6a5 5 0 01-7.1-7.1l8.9-8.9a3.3 3.3 0 014.7 4.7l-8.9 8.9a1.7 1.7 0 01-2.4-2.4l8.2-8.2"/></svg>',
    up: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5.5 11.5L12 5l6.5 6.5"/></svg>'
  };
  const same = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
  const day = d => same(d, new Date()) ? 'Today' : same(d, new Date(Date.now() - 864e5)) ? 'Yesterday' : new Date(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const time = d => new Date(d).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const bytes = n => { n = Number(n || 0); return n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB'; };
  const GAP = 20 * 60000; // a pause this long gets a new time stamp and starts a new group of bubbles

  // Old failure signals carried the raw API reply ("400 {"type":"error",…}"): show the sentence, not the JSON.
  function clean(t) {
    t = String(t); const i = t.search(/\s?\d{3}\s*\{/); if (i < 0) return t;
    const j = t.lastIndexOf('}'), m = /"message":"(.*?)(?:"|$)/.exec(t.slice(i));
    return (t.slice(0, i).replace(/:\s*$/, '') + ': ' + (m ? m[1].replace(/\.?$/, '.') : 'API error.') + (j > i ? t.slice(j + 1) : '')).replace(/\s+/g, ' ').trim();
  }

  // Messages and updates in time order, each told whether it opens a new time stamp and whether it joins the bubble before or after it.
  // Pure, so it can be tested without a page.
  function layout(messages, events) {
    const items = [...(messages || []).map(m => ({ k: 'm', at: m.created_at, m })), ...(events || []).map(e => ({ k: 'e', at: e.createdAt, e }))].sort((a, b) => new Date(a.at) - new Date(b.at));
    const byId = new Map((messages || []).map(m => [m.id, m]));
    return items.map((it, i) => {
      const before = items[i - 1], after = items[i + 1];
      const stamp = !before || new Date(it.at) - new Date(before.at) > GAP || !same(it.at, before.at);
      if (it.k === 'e') return { ...it, stamp };
      const joinsPrev = Boolean(before && before.k === 'm' && before.m.author_role === it.m.author_role && !stamp);
      const joinsNext = Boolean(after && after.k === 'm' && after.m.author_role === it.m.author_role && new Date(after.at) - new Date(it.at) <= GAP && same(after.at, it.at));
      return { ...it, stamp, joinsPrev, joinsNext, parent: it.m.reply_to_id ? byId.get(it.m.reply_to_id) || null : null };
    });
  }

  function mount(el, o) {
    o = o || {};
    const id = o.id || 'chat', viewer = o.viewer || 'client', canCompose = o.canCompose !== false && typeof o.send === 'function';
    const S = { reply: null, file: null, data: { messages: [], events: [] }, sig: '', timer: null, busy: false };
    const $ = s => el.querySelector('#' + id + s);
    el.classList.add('fbchat');
    el.innerHTML = `<div class="mc-msgs" id="${id}Msgs" tabindex="0" aria-label="Messages"></div>` + (canCompose
      ? `<form class="mc-compose" id="${id}Form"><div class="mc-replybar hidden" id="${id}ReplyBar"><span id="${id}ReplyText"></span><button type="button" data-x="reply" aria-label="Cancel reply">×</button></div><div class="mc-filebar hidden" id="${id}FileBar"><span id="${id}FileName"></span><button type="button" data-x="file" aria-label="Remove file">×</button></div><div class="mc-inputrow"><label class="mc-attach" title="Attach a file" aria-label="Attach a file">${icon.clip}<input type="file" id="${id}File" hidden></label><textarea id="${id}Text" rows="1" placeholder="${esc(o.placeholder || 'Message')}" aria-label="Message"></textarea><button type="submit" class="mc-send" id="${id}SendBtn" aria-label="Send" disabled>${icon.up}</button></div><span class="mc-status" id="${id}Status" aria-live="polite"></span></form>`
      : o.noComposeText ? `<div class="mc-compose mc-general">${esc(o.noComposeText)}</div>` : '');
    const box = $('Msgs'), text = $('Text'), send = $('SendBtn'), status = $('Status');
    box.innerHTML = '<div class="mc-empty"><span>Loading messages…</span></div>'; // until the first data arrives

    function fill(toBottom) {
      const d = S.data, sig = (d.messages || []).map(m => m.id).join() + '|' + (d.events || []).map(e => e.id + (e.unread ? 'u' : '')).join() + '|' + (d.messages || []).map(m => (m.files || []).length).join('');
      if (!toBottom && S.sig === sig) return; // a poll that found nothing new leaves the thread (and any tapped bubble) alone
      const picked = new Set([...box.querySelectorAll('.mc-msg.sel')].map(x => x.dataset.id)); S.sig = sig;
      const near = box.scrollHeight - box.scrollTop - box.clientHeight < 80; let html = '';
      for (const it of layout(d.messages, d.events)) {
        if (it.stamp) html += `<div class="mc-stamp"><b>${esc(day(it.at))}</b> ${esc(time(it.at))}</div>`;
        if (it.k === 'e') { const e = it.e; html += `<div class="mc-event ${e.unread ? 'new' : ''}"><span class="mc-etext">${esc(clean(e.title))}</span>${e.productId && o.openProduct ? `<button type="button" class="mc-eopen" data-product="${esc(e.productId)}">Open product →</button>` : ''}</div>`; continue; }
        const m = it.m, out = m.author_role === viewer, p = it.parent;
        html += `<div class="mc-msg ${out ? 'out' : 'in'} ${it.joinsPrev ? '' : 'first'} ${it.joinsNext ? '' : 'last'}" data-id="${esc(m.id)}">${!out && !it.joinsPrev && m.author_name ? `<span class="mc-from">${esc(m.author_name)}</span>` : ''}<div class="mc-bub">${m.tag ? `<div class="mc-tag">${esc(m.tag)}</div>` : ''}${p ? `<div class="mc-quote"><b>${esc(p.author_role === viewer ? 'You' : p.author_name || 'They')}</b> ${esc(String(p.body || '').slice(0, 90))}${String(p.body || '').length > 90 ? '…' : ''}</div>` : ''}<span class="mc-text">${esc(m.body)}</span>${(m.files || []).map(f => `<button type="button" class="mc-file" data-file="${esc(f.id)}" data-name="${esc(f.original_name)}">${icon.clip}<span>${esc(f.original_name)}</span><small>${esc(bytes(f.size_bytes))}</small></button>`).join('')}</div>${canCompose && !m.noReply ? `<div class="mc-acts"><button type="button" data-reply="${esc(m.id)}">Reply</button></div>` : ''}</div>`;
      }
      box.innerHTML = html || `<div class="mc-empty"><b>${esc(o.emptyTitle || 'No messages yet')}</b><span>${esc(o.emptyText || 'Say hello.')}</span></div>`;
      picked.forEach(i => box.querySelector(`.mc-msg[data-id="${i}"]`)?.classList.add('sel'));
      if (toBottom || near) box.scrollTop = box.scrollHeight;
    }
    const canSend = () => { if (send) send.disabled = S.busy || !(text.value.trim() || S.file); };
    function setReply(mid) {
      S.reply = mid || null; const bar = $('ReplyBar'); if (!bar) return;
      const m = mid && (S.data.messages || []).find(x => x.id === mid); bar.classList.toggle('hidden', !m);
      if (m) $('ReplyText').textContent = `Replying to ${m.author_role === viewer ? 'yourself' : m.author_name || 'them'}: ${String(m.body || '').slice(0, 80)}`;
      text.focus();
    }
    function pick(file) {
      S.file = file || null; const input = $('File'); if (!file && input) input.value = '';
      $('FileBar').classList.toggle('hidden', !S.file); $('FileName').textContent = S.file ? S.file.name : ''; canSend();
    }
    const grow = () => { text.style.height = 'auto'; text.style.height = Math.min(text.scrollHeight, 130) + 'px'; canSend(); };
    async function reload(toBottom) { if (!o.refresh) return; try { const d = await o.refresh(); if (d && el.isConnected) { S.data = { messages: d.messages || [], events: d.events || [] }; fill(Boolean(toBottom)); } } catch { /* the next poll tries again */ } }

    el.addEventListener('click', e => {
      const bub = e.target.closest('.mc-bub'), file = e.target.closest('.mc-file'), rep = e.target.closest('[data-reply]'), ev = e.target.closest('.mc-event'), prod = e.target.closest('.mc-eopen'), x = e.target.closest('[data-x]');
      if (file) { e.stopPropagation(); if (o.download) Promise.resolve(o.download(file.dataset.file, file.dataset.name)).catch(err => alert(err.message)); return; }
      if (prod) { e.stopPropagation(); o.openProduct && o.openProduct(prod.dataset.product); return; }
      if (rep) { setReply(rep.dataset.reply); return; }
      if (x) { if (x.dataset.x === 'reply') setReply(null); else pick(null); return; }
      if (bub) { bub.parentElement.classList.toggle('sel'); return; }
      if (ev) ev.classList.toggle('open');
    });
    if (canCompose) {
      text.addEventListener('input', grow);
      text.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('Form').requestSubmit(); } });
      $('File').addEventListener('change', e => pick(e.target.files && e.target.files[0]));
      $('Form').addEventListener('submit', async e => {
        e.preventDefault(); const body = text.value.trim(), file = S.file; if (!body && !file) return;
        S.busy = true; canSend(); status.textContent = file ? 'Uploading…' : '';
        try {
          await o.send({ body, file, replyToId: S.reply });
          text.value = ''; text.style.height = 'auto'; setReply(null); pick(null); status.textContent = '';
          S.busy = false; canSend(); await reload(true);
        } catch (err) { status.textContent = err.message || 'Could not send'; S.busy = false; canSend(); }
      });
    }
    // Live: while the tab is showing, look for new messages every so often.
    const every = Number(root.FBCHAT_POLL_MS) || 20000;
    if (o.refresh && o.poll !== false) S.timer = setInterval(() => { if (!el.isConnected) { clearInterval(S.timer); return; } if (!document.hidden && !S.busy) reload(false); }, every);

    return {
      update(d, opt) { S.data = { messages: (d && d.messages) || [], events: (d && d.events) || [] }; fill(Boolean(opt && opt.toBottom)); },
      reload, setReply, focus() { text && text.focus(); }, destroy() { clearInterval(S.timer); },
      get data() { return S.data; }
    };
  }

  const api = { mount, layout, clean, day, time, bytes, esc, icon };
  root.FBChat = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
