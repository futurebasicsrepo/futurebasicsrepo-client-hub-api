// Every button says what it is doing. Loaded on every page (as /feedback.js, before the page's own scripts) so no press goes unanswered:
//   - the moment it is pressed, the button gives a little;
//   - a request the press starts shows on the button while it runs (a spinner, "Working…" for screen readers), then a tick when it worked
//     or a red mark when it did not, with a note at the bottom of the screen that says what failed and why, in the service's own words;
//   - a press whose work fails without saying so (an error nobody caught) is reported the same way.
// Pages can say more themselves: FBN.toast(text, 'ok' | 'err' | 'info'), and FBN.run(button, async () => …, { done, failed }) for work that
// is not a request. A button with data-fb="off" is left alone (one that already shows its own progress).
(function () {
  if (window.FBN) return;
  const css = `
.fbn-stack{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483000;display:grid;gap:8px;justify-items:center;pointer-events:none;width:min(560px,calc(100vw - 32px))}
.fbn-toast{pointer-events:none;display:flex;gap:10px;align-items:flex-start;background:#141416;color:#fff;border-radius:12px;padding:10px 14px;font:500 14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.22);max-width:100%;animation:fbnIn .18s ease-out}
.fbn-toast.err{background:#7a1f17}.fbn-toast.info{background:#1f2a44}
.fbn-toast b{font-weight:700}.fbn-toast button{all:unset;pointer-events:auto;cursor:pointer;opacity:.75;font-size:16px;line-height:1;padding:0 2px}.fbn-toast button:hover{opacity:1}
.fbn-toast .ic{flex:none;width:18px;height:18px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:700;background:#4bff9a;color:#141416}
.fbn-toast.err .ic{background:#ffb4a8;color:#7a1f17}.fbn-toast.info .ic{background:#9fb6ff;color:#1f2a44}
.fbn-busy{cursor:progress!important;opacity:.85}
.fbn-busy::after{content:"";display:inline-block;width:.85em;height:.85em;margin-left:.45em;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;vertical-align:-.1em;animation:fbnSpin .7s linear infinite}
.fbn-ok::after{content:"✓";margin-left:.4em;font-weight:700;color:#17a34a}
.fbn-err{box-shadow:0 0 0 2px #c0392b!important;animation:fbnShake .3s}
.fbn-press{transform:scale(.97);transition:transform .08s}
@keyframes fbnSpin{to{transform:rotate(360deg)}}@keyframes fbnIn{from{opacity:0;transform:translateY(6px)}}
@keyframes fbnShake{25%{transform:translateX(-3px)}75%{transform:translateX(3px)}}
@media (prefers-reduced-motion:reduce){.fbn-busy::after{animation-duration:2s}.fbn-toast,.fbn-err{animation:none}.fbn-press{transform:none}}
@media print{.fbn-stack{display:none}}`;
  // the words, in the page's language when it sets window.FBN_STRINGS (the factory page does)
  const EN = { working: 'Working…', done: 'done', failed: 'did not work', offline: 'could not reach the service. Check your connection and try again.', wrong: 'Something went wrong', dismiss: 'Dismiss' };
  const words = new Proxy(EN, { get: (o, k) => (window.FBN_STRINGS || {})[k] || o[k] });
  let stack = null;
  const ready = () => {
    if (stack) return stack;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    stack = document.createElement('div'); stack.className = 'fbn-stack'; stack.setAttribute('aria-live', 'polite'); document.body.appendChild(stack);
    return stack;
  };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // a note at the bottom of the screen; the same note twice in a row is shown once
  let lastNote = '', lastAt = 0;
  function toast(text, kind = 'ok', ms) {
    if (!document.body) return;
    const t = String(text || '').slice(0, 400); if (!t) return;
    if (t === lastNote && Date.now() - lastAt < 2500) return; lastNote = t; lastAt = Date.now();
    const box = ready(), el = document.createElement('div');
    el.className = `fbn-toast ${kind}`; el.setAttribute('role', kind === 'err' ? 'alert' : 'status');
    el.innerHTML = `<span class="ic" aria-hidden="true">${kind === 'err' ? '!' : kind === 'info' ? 'i' : '✓'}</span><span>${esc(t)}</span><button type="button" aria-label="${esc(words.dismiss)}">×</button>`;
    el.querySelector('button').onclick = () => el.remove();
    box.appendChild(el); while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => el.remove(), ms || (kind === 'err' ? 9000 : 2600));
  }
  const labelOf = b => String(b.getAttribute('aria-label') || b.dataset.fbLabel || b.textContent || b.value || b.title || '').replace(/\s+/g, ' ').trim().slice(0, 48);
  // the button's state while its work runs
  const pending = new WeakMap();
  function begin(b) {
    if (!b || b.dataset.fb === 'off') return;
    pending.set(b, (pending.get(b) || 0) + 1);
    b.classList.remove('fbn-ok', 'fbn-err'); b.classList.add('fbn-busy'); b.setAttribute('aria-busy', 'true');
    if (!b.dataset.fbTitle) { b.dataset.fbTitle = b.getAttribute('title') || ''; b.setAttribute('title', words.working); }
  }
  function end(b, ok) {
    if (!b || b.dataset.fb === 'off') return;
    const n = (pending.get(b) || 1) - 1; pending.set(b, n); if (n > 0) return;
    b.classList.remove('fbn-busy'); b.removeAttribute('aria-busy');
    if (b.dataset.fbTitle !== undefined) { if (b.dataset.fbTitle) b.setAttribute('title', b.dataset.fbTitle); else b.removeAttribute('title'); delete b.dataset.fbTitle; }
    const cls = ok ? 'fbn-ok' : 'fbn-err'; b.classList.add(cls); setTimeout(() => b.classList.remove(cls), ok ? 1400 : 1800);
  }
  // the button pressed last: a request that starts within a moment of the press belongs to it
  let last = null;
  const pressable = 'button, [role="button"], a.btn, input[type="submit"], input[type="button"], summary';
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest(pressable); if (!b || b.disabled) return;
    last = { b, label: labelOf(b), at: Date.now() };
    b.classList.add('fbn-press'); setTimeout(() => b.classList.remove('fbn-press'), 120);
  }, true);
  document.addEventListener('submit', e => { const b = e.submitter || e.target.querySelector('[type="submit"]'); if (b) last = { b, label: labelOf(b), at: Date.now() }; }, true);
  const owner = () => (last && Date.now() - last.at < 1500 ? last : null);
  // a press that asks first (confirm, prompt) starts its work when the question is answered, not when the button was pressed
  for (const k of ['confirm', 'prompt', 'alert']) { const f = window[k]; if (typeof f === 'function') window[k] = function () { const r = f.apply(window, arguments); if (last && Date.now() - last.at < 600000) last.at = Date.now(); return r; }; }
  // what the service said went wrong (its JSON error, or a line of its text)
  async function reason(r) {
    try { const j = await r.clone().json(); if (j && (j.error || j.message)) return String(j.error || j.message); } catch { /* not JSON */ }
    try { const t = (await r.clone().text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); if (t && t.length < 160) return t; } catch { /* no body */ }
    return r.status === 401 ? 'you are signed out: sign in again' : r.status === 403 ? 'you do not have access to this' : r.status === 404 ? 'it was not found (it may have been removed)' : r.status === 413 ? 'the file is too large' : r.status === 429 ? 'too many tries: wait a moment and try again' : r.status >= 500 ? `the service had a problem (${r.status}); try again in a moment` : `${words.failed} (${r.status})`;
  }
  const realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase(), who = owner();
    if (!who || (init && init.headers && (init.headers['x-fb'] === 'off'))) return realFetch(input, init);
    begin(who.b);
    return realFetch(input, init).then(async r => {
      end(who.b, r.ok);
      if (!r.ok) toast(`${who.label ? who.label + ': ' : ''}${await reason(r)}`, 'err');
      else if (method !== 'GET' && who.b.dataset.fbDone !== 'off') toast(who.b.dataset.fbDone || `${who.label || 'That'}: ${words.done}`, 'ok');
      return r;
    }, err => {
      end(who.b, false);
      if (!(err && err.name === 'AbortError')) toast(`${who.label ? who.label + ': ' : ''}${words.offline}`, 'err');
      throw err;
    });
  };
  // a press whose work failed and nobody caught it
  window.addEventListener('unhandledrejection', e => {
    const err = e.reason; if (err && err.name === 'AbortError') return;
    const who = owner() || (last && Date.now() - last.at < 60000 ? last : null); if (!who) return;
    toast(`${who.label ? who.label + ': ' : ''}${(err && err.message) || words.wrong}`, 'err');
  });
  window.addEventListener('error', e => { const who = owner(); if (!who || !e.message) return; toast(`${who.label ? who.label + ': ' : ''}${words.wrong} (${String(e.message).replace(/^Uncaught\s+/, '').slice(0, 120)})`, 'err'); });
  // for work that is not a request: FBN.run(button, async () => …, { done: 'Copied', failed: 'Could not copy' })
  async function run(b, fn, o = {}) {
    begin(b);
    try { const v = await fn(); end(b, true); if (o.done) toast(o.done, 'ok'); return v; }
    catch (err) { end(b, false); toast(`${o.failed || (b && labelOf(b)) || words.wrong}: ${(err && err.message) || words.failed}`, 'err'); throw err; }
  }
  window.FBN = { toast, run, begin, end };
})();
