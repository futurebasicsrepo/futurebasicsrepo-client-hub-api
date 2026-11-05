// Who else is here: a page with a tech pack, a sample review or a concept open tells the service every 15 seconds, and shows the others on it as
// round initials (green ring: looking; amber ring: changing something). When someone else is changing it, onOthers lets the page warn before
// anyone's edits are overwritten. Used by the tech pack, the sample review and the Studio; the workspace page reads the same heartbeats.
//
//   const p = FBPresence.watch({ type: 'tech-pack', id: productId, el: document.querySelector('#people'), token: () => TOKEN, onOthers: list => ... });
//   p.editing(true)   // once the person has changed something;  p.stop() when the page closes the thing
(function (root) {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const EVERY = 15000;
  const tokenGuess = () => { try { const host = location.hostname.toLowerCase(), q = new URLSearchParams(location.search); const work = host.startsWith('work.') || q.get('as') === 'work' || ((host === 'localhost' || host === '127.0.0.1') && localStorage.getItem('fb.admin.token') && q.get('as') !== 'client'); return localStorage.getItem(work ? 'fb.admin.token' : 'fb.client.token') || ''; } catch { return ''; } };
  // who is on what, as words: "Maya is editing", "Maya and Dan are here"
  function sentence(list) {
    const ed = list.filter(p => p.mode === 'editing').map(p => p.name), here = list.filter(p => p.mode !== 'editing').map(p => p.name);
    const join = a => a.length <= 2 ? a.join(' and ') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
    if (ed.length) return `${join(ed)} ${ed.length === 1 ? 'is' : 'are'} changing this right now`;
    if (here.length) return `${join(here)} ${here.length === 1 ? 'is' : 'are'} here too`;
    return '';
  }
  function watch(o) {
    const token = typeof o.token === 'function' ? o.token : tokenGuess;
    let mode = 'viewing', timer = null, stopped = false, last = [];
    const draw = list => {
      last = list;
      if (o.el) o.el.innerHTML = list.slice(0, 5).map(p => `<span title="${esc(p.name)}${p.mode === 'editing' ? ' · changing it' : ' · looking'}" style="${p.mode === 'editing' ? 'border-color:#ffc94d' : ''}">${esc(p.initials)}</span>`).join('') + (list.length > 5 ? `<span title="${list.length - 5} more">+${list.length - 5}</span>` : '');
      if (o.el) o.el.setAttribute('aria-label', sentence(list) || 'Nobody else is here');
      try { o.onOthers?.(list, sentence(list)); } catch {}
    };
    async function beat() {
      if (stopped) return; clearTimeout(timer);
      if (!document.hidden) {
        try {
          const r = await fetch('/v1/workspace/presence', { method: 'POST', headers: { Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' }, body: JSON.stringify({ type: o.type, id: o.id, mode }) });
          if (r.ok) draw((await r.json()).others || []); else if (r.status === 404 || r.status === 401) { stopped = true; return; }
        } catch {}
      }
      timer = setTimeout(beat, EVERY);
    }
    const leave = () => { try { fetch('/v1/workspace/presence/leave', { method: 'POST', keepalive: true, headers: { Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' }, body: JSON.stringify({ type: o.type, id: o.id }) }); } catch {} };
    addEventListener('pagehide', leave);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) beat(); });
    beat();
    return {
      editing(on) { const next = on ? 'editing' : 'viewing'; if (next !== mode) { mode = next; beat(); } },
      others: () => last,
      stop() { stopped = true; clearTimeout(timer); removeEventListener('pagehide', leave); leave(); if (o.el) o.el.innerHTML = ''; }
    };
  }
  root.FBPresence = { watch, sentence };
})(globalThis);
