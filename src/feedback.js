// Every button says what it is doing. Loaded on every page (as /feedback.js, before the page's own scripts) so no press goes unanswered:
//   - the moment it is pressed, the button gives a little;
//   - a request the press starts shows on the button while it runs (a sheen and a creeping green line, "Working…" for screen readers),
//     then the line runs home with a green glow when it worked, or turns red with a shake when it did not, with a note at the bottom of the screen that says what failed and why, in the service's own words;
//   - a press whose work fails without saying so (an error nobody caught) is reported the same way.
// Pages can say more themselves: FBN.toast(text, 'ok' | 'err' | 'info'), and FBN.run(button, async () => …, { done, failed }) for work that
// is not a request. A button with data-fb="off" is left alone (one that already shows its own progress).
(function () {
  if (window.FBN) return;
  // the look: no spinner. While the work runs the button keeps its words and a light sheen sweeps across it over a thin green line that
  // creeps forward along its bottom edge; done, the line runs home and the button glows green for a moment; failed, the line turns red and
  // the button shakes. Notes rise from the bottom as dark glass with a hairline that drains while they stay.
  const css = `
.fbn-stack{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:2147483000;display:grid;gap:10px;justify-items:center;pointer-events:none;width:min(560px,calc(100vw - 32px))}
.fbn-toast{--fbn-c:#4bff9a;--fbn-ms:2600ms;position:relative;overflow:hidden;pointer-events:none;display:flex;gap:12px;align-items:center;color:#f4f4f2;background:rgba(20,20,22,.86);-webkit-backdrop-filter:blur(14px) saturate(1.4);backdrop-filter:blur(14px) saturate(1.4);border:1px solid rgba(255,255,255,.09);border-radius:18px;padding:10px 12px 10px 10px;font:500 14px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.005em;box-shadow:0 18px 40px -12px rgba(0,0,0,.45),0 0 0 1px rgba(0,0,0,.04);max-width:100%;animation:fbnRise .42s cubic-bezier(.2,1.3,.4,1) both}
.fbn-toast.err{--fbn-c:#ff6b5a;--fbn-ms:9000ms}.fbn-toast.info{--fbn-c:#8fb0ff}
.fbn-toast::after{content:"";position:absolute;left:18px;right:18px;bottom:0;height:2px;border-radius:2px;background:var(--fbn-c);opacity:.7;transform-origin:left;animation:fbnDrain var(--fbn-ms) linear forwards}
.fbn-toast .ic{flex:none;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:800;background:var(--fbn-c);color:#141416;box-shadow:0 0 14px -2px var(--fbn-c);animation:fbnPop .5s .08s cubic-bezier(.3,1.6,.5,1) both}
.fbn-toast b{font-weight:700}.fbn-toast button{all:unset;pointer-events:auto;cursor:pointer;opacity:.55;font-size:17px;line-height:1;padding:2px 6px;border-radius:50%}.fbn-toast button:hover{opacity:1;background:rgba(255,255,255,.1)}
.fbn-toast.out{animation:fbnSink .28s ease-in forwards}
.fbn-busy{position:relative!important;overflow:hidden!important;isolation:isolate;cursor:progress!important}
.fbn-busy::before{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;background:linear-gradient(105deg,transparent 30%,rgba(255,255,255,.55) 48%,rgba(75,255,154,.35) 52%,transparent 70%);background-size:250% 100%;mix-blend-mode:soft-light;animation:fbnSheen 1.15s cubic-bezier(.45,.05,.35,1) infinite}
.fbn-busy::after{content:"";position:absolute;left:14%;right:14%;bottom:4px;height:3px;border-radius:3px;z-index:2;pointer-events:none;background:linear-gradient(90deg,#17a34a,#4bff9a);box-shadow:0 0 8px #4bff9a;transform-origin:left;animation:fbnCreep 9s cubic-bezier(.08,.75,.2,1) forwards}
.fbn-ok{position:relative;overflow:hidden;animation:fbnGlow .9s ease-out}
.fbn-ok::after{content:"";position:absolute;left:14%;right:14%;bottom:4px;height:3px;border-radius:3px;pointer-events:none;background:#4bff9a;box-shadow:0 0 10px #4bff9a;transform-origin:left;animation:fbnHome .55s cubic-bezier(.3,.9,.3,1) forwards}
.fbn-err{position:relative;overflow:hidden;animation:fbnShake .42s cubic-bezier(.36,.07,.19,.97);box-shadow:0 0 0 2px rgba(255,107,90,.9),0 0 18px -4px #ff6b5a!important}
.fbn-err::after{content:"";position:absolute;left:14%;right:14%;bottom:4px;height:3px;border-radius:3px;pointer-events:none;background:#ff6b5a;box-shadow:0 0 8px #ff6b5a}
.fbn-press{transform:scale(.965);transition:transform .09s cubic-bezier(.3,.7,.4,1.4)}
@keyframes fbnSheen{from{background-position:120% 0}to{background-position:-120% 0}}
@keyframes fbnCreep{from{transform:scaleX(0)}to{transform:scaleX(.92)}}
@keyframes fbnHome{0%{transform:scaleX(.6);opacity:1}55%{transform:scaleX(1);opacity:1}100%{transform:scaleX(1);opacity:0}}
@keyframes fbnGlow{0%{box-shadow:0 0 0 0 rgba(75,255,154,.75)}100%{box-shadow:0 0 0 12px rgba(75,255,154,0)}}
@keyframes fbnShake{10%,90%{transform:translateX(-1px)}20%,80%{transform:translateX(3px)}30%,50%,70%{transform:translateX(-5px)}40%,60%{transform:translateX(5px)}}
@keyframes fbnRise{from{opacity:0;transform:translateY(18px) scale(.94)}}
@keyframes fbnSink{to{opacity:0;transform:translateY(10px) scale(.97)}}
@keyframes fbnPop{from{transform:scale(0) rotate(-45deg)}}
@keyframes fbnDrain{from{transform:scaleX(1)}to{transform:scaleX(0)}}
@media (prefers-reduced-motion:reduce){.fbn-busy::before{animation:none;background:rgba(75,255,154,.12)}.fbn-busy::after{animation:none;transform:scaleX(.5)}.fbn-toast,.fbn-toast .ic,.fbn-toast.out,.fbn-err,.fbn-ok,.fbn-ok::after{animation:none}.fbn-press{transform:none}}
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
    const life = ms || (kind === 'err' ? 9000 : 2600); el.style.setProperty('--fbn-ms', life + 'ms');
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, life);
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
    const cls = ok ? 'fbn-ok' : 'fbn-err'; b.classList.add(cls); setTimeout(() => b.classList.remove(cls), ok ? 1000 : 1800);
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
