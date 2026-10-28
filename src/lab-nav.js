// One navigation for every Design Lab page (served as /lab/nav.js). Three groups, in the order the work happens:
//   Make        line plans → concepts → studio → flats → assortment board
//   Libraries   the sketch pack, graphics and techniques, materials, trims and tags
//   Research    the pieces we found, what's moving, the brands we watch, the brand code
// A page puts <nav class="labnav" data-lab="studio"></nav> where the bar goes (data-lab names the current item); a toolbar page can put
// <button data-lab-menu> instead and get the same groups as a drop-down.
(function () {
  const GROUPS = [
    { label: 'Make', items: [{ id: 'plans', label: 'Line plans', href: '/lab#plans' }, { id: 'board', label: 'Concepts', href: '/lab#board' }, { id: 'studio', label: 'Studio', href: '/lab/studio', hint: 'Finish a concept by hand and with AI' }, { id: 'flats', label: 'Flats', href: '/lab/flats', hint: 'Measured front and back, placements in inches' }, { id: 'assort', label: 'Assortment board', href: '/lab#assort' }] },
    { label: 'Libraries', items: [{ id: 'sketches', label: 'Sketch pack', href: '/lab/sketches', hint: '382 flat sketches and their parts' }, { id: 'library', label: 'Graphics & techniques', href: '/lab/library' }, { id: 'materials', label: 'Materials, trims & tags', href: '/lab/materials' }] },
    { label: 'Research', items: [{ id: 'found', label: 'Pieces we found', href: '/lab#library' }, { id: 'trends', label: "What's moving", href: '/lab#trends' }, { id: 'brands', label: 'Brands we watch', href: '/lab#brands' }, { id: 'code', label: 'Brand code', href: '/lab#code' }] }
  ];
  // a client's room (signed in at their hub, not the console): the research side is Future Basics only, and the way back is their hub
  const isClient = () => { try { return document.documentElement.dataset.labClient === '1' || (!localStorage.getItem('fb.admin.token') && Boolean(localStorage.getItem('fb.client.token'))); } catch { return false; } };
  const FLOW = ['Line plan', 'Concepts', 'Studio', 'Flats', 'Tech pack', 'Factory', 'Samples'];
  const CSS = `.labnav{position:sticky;top:72px;z-index:12;display:flex;gap:18px;overflow-x:auto;margin:12px -4px 0;padding:8px 4px 10px;background:var(--fog,#f5f5f2);scrollbar-width:none;align-items:flex-start}.labnav::-webkit-scrollbar{display:none}
.labnav .g{display:grid;gap:5px;flex:none}.labnav .g>span{font:500 10px 'IBM Plex Mono',monospace;letter-spacing:.14em;text-transform:uppercase;color:#727278;padding-left:4px}.labnav .g div{display:flex;gap:6px}
.labnav a{flex:none;border:1px solid rgba(20,20,22,.14);background:#fff;border-radius:999px;padding:6px 13px;text-decoration:none;color:inherit;font-weight:600;font-size:13px;white-space:nowrap;line-height:1.3}.labnav a:hover{background:#efefeb}.labnav a.on{background:#141416;border-color:#141416;color:#fff}.labnav a:focus-visible{outline:2px solid #141416;outline-offset:2px}
.labnav .flow{flex:none;display:grid;gap:5px;margin-left:auto;padding-left:12px;border-left:1px solid rgba(20,20,22,.14)}.labnav .flow>span{font:500 10px 'IBM Plex Mono',monospace;letter-spacing:.14em;text-transform:uppercase;color:#727278}.labnav .flow div{font-size:12px;color:#727278;white-space:nowrap}.labnav .flow b{color:#141416}
@media(max-width:900px){.labnav .flow{display:none}}
.labmenu{position:relative}.labmenu .pop{position:absolute;left:0;top:calc(100% + 6px);background:#fff;border:1px solid rgba(20,20,22,.14);border-radius:14px;box-shadow:0 12px 40px rgba(20,20,22,.18);padding:10px 12px;z-index:40;display:grid;gap:10px;min-width:260px}.labmenu .pop[hidden]{display:none}.labmenu .pop>span{font:500 10px 'IBM Plex Mono',monospace;letter-spacing:.14em;text-transform:uppercase;color:#727278}.labmenu .pop a{display:block;padding:5px 8px;border-radius:8px;text-decoration:none;color:inherit;font-size:13px}.labmenu .pop a:hover{background:#f5f5f2}.labmenu .pop a.on{background:#141416;color:#fff}.labmenu .pop small{display:block;color:#727278;font-size:11px}`;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const HASHES = { '#plans': 'plans', '#board': 'board', '#assort': 'assort', '#library': 'found', '#trends': 'trends', '#brands': 'brands', '#code': 'code' };
  const current = el => el.dataset.lab || (location.pathname === '/lab' ? HASHES[location.hash] || '' : '');
  const flowStep = cur => ({ plans: 0, board: 1, studio: 2, flats: 3 })[cur];
  function style() { if (document.getElementById('labnav-css')) return; const s = document.createElement('style'); s.id = 'labnav-css'; s.textContent = CSS; document.head.appendChild(s); }
  function render(el) {
    style(); const cur = current(el), step = flowStep(cur);
    const CLIENT = isClient(), SHOWN = CLIENT ? GROUPS.filter(g => g.label !== 'Research') : GROUPS;
    el.innerHTML = (CLIENT ? `<div class="g"><span>Your room</span><div><a href="/#lab">← Your hub</a></div></div>` : '') + SHOWN.map(g => `<div class="g"><span>${g.label}</span><div>${g.items.map(i => `<a href="${i.href}" class="${i.id === cur ? 'on' : ''}" ${i.hint ? `title="${esc(i.hint)}"` : ''} ${i.id === cur ? 'aria-current="page"' : ''}>${esc(i.label)}</a>`).join('')}</div></div>`).join('')
      + `<div class="flow" aria-label="How the work flows"><span>The flow</span><div>${FLOW.map((f, i) => (i === step ? `<b>${f}</b>` : f)).join(' → ')}</div></div>`;
    el.setAttribute('aria-label', 'Design Lab');
  }
  function menu(btn) {
    style(); const wrap = document.createElement('div'); wrap.className = 'labmenu'; btn.parentNode.insertBefore(wrap, btn); wrap.appendChild(btn);
    const pop = document.createElement('div'); pop.className = 'pop'; pop.hidden = true; pop.setAttribute('role', 'menu'); const cur = btn.dataset.lab || '';
    const CLIENT = isClient(), SHOWN = CLIENT ? GROUPS.filter(g => g.label !== 'Research') : GROUPS;
    pop.innerHTML = (CLIENT ? `<div><span>Your room</span><a href="/#lab" role="menuitem">← Your hub</a></div>` : '') + SHOWN.map(g => `<div><span>${g.label}</span>${g.items.map(i => `<a href="${i.href}" role="menuitem" class="${i.id === cur ? 'on' : ''}">${esc(i.label)}${i.hint ? `<small>${esc(i.hint)}</small>` : ''}</a>`).join('')}</div>`).join('');
    wrap.appendChild(pop); btn.setAttribute('aria-haspopup', 'true'); btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', () => { pop.hidden = !pop.hidden; btn.setAttribute('aria-expanded', String(!pop.hidden)); });
    document.addEventListener('click', e => { if (!wrap.contains(e.target)) { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); } });
  }
  function boot() { document.querySelectorAll('nav.labnav').forEach(render); document.querySelectorAll('[data-lab-menu]').forEach(menu); if (location.pathname === '/lab') window.addEventListener('hashchange', () => document.querySelectorAll('nav.labnav').forEach(render)); }
  window.FBLabNav = { GROUPS, FLOW, render, menu };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
