// The Design Lab's own navigation (served as /lab/nav.js), in two parts:
//   - the Lab's tabs: Line plans · Concepts · Studio · Assortment · Sketch pack · Graphics & techniques · Materials (· Research). For Future Basics
//     staff the work console draws them (console-nav.js, the Design Lab section's tabs), so <nav class="labnav"> stays empty; a client in their own
//     Lab has no console, so it gets the same row here, with the way back to their hub first and without Research.
//   - a piece's step bar: where a concept is in the work, each step one press away, the same on the concept, in the Studio and on the tech pack:
//       ‹ Line plan    Concept · Picture · Flats · Pattern · Tech pack
//     FBLabNav.steps(el, concept, { at, onStep }) draws it into el. `concept` needs id, name, planId, planName, productUrl; `at` is the step you
//     are on; onStep(step, event) may handle a step in place (the Studio switches its view without a page load) and returns true when it did.
(function () {
  const TABS = [
    { id: 'plans', label: 'Line plans', href: '/lab#plans' }, { id: 'board', label: 'Concepts', href: '/lab#board' }, { id: 'studio', label: 'Studio', href: '/lab/studio' },
    { id: 'assort', label: 'Assortment', href: '/lab#assort' }, { id: 'sketches', label: 'Sketch pack', href: '/lab/sketches' }, { id: 'library', label: 'Graphics & techniques', href: '/lab/library' },
    { id: 'materials', label: 'Materials', href: '/lab/materials' }, { id: 'found', label: 'Research', href: '/lab#research', staff: true }
  ];
  const STEPS = [
    { id: 'concept', label: 'Concept', hint: 'The concept: its picture, its check against what inspired it, approve it' },
    { id: 'picture', label: 'Picture', hint: 'The picture as layers: paint, type, graphics, AI changes' },
    { id: 'flats', label: 'Flats', hint: 'The measured flats, front and back, with every graphic placed in inches' },
    { id: 'pattern', label: 'Pattern', hint: 'The pattern pieces it is cut from' },
    { id: 'techpack', label: 'Tech pack', hint: 'The tech pack the factory makes it from' }
  ];
  // a client's room (signed in at their hub, not the console)
  const isClient = () => { try { return document.documentElement.dataset.labClient === '1' || (!localStorage.getItem('fb.admin.token') && Boolean(localStorage.getItem('fb.client.token'))); } catch { return false; } };
  const CSS = `.labnav{position:sticky;top:72px;z-index:12;display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;margin:0 -4px 12px;padding:10px 4px;background:var(--fog,#f5f5f2);align-items:center;font:500 13px/1.3 'Space Grotesk',system-ui,sans-serif}.labnav::-webkit-scrollbar{display:none}.labnav:empty{display:none}
.labnav a{flex:none;border:1px solid rgba(20,20,22,.14);background:#fff;border-radius:999px;padding:6px 13px;text-decoration:none;color:#141416;font-weight:600;white-space:nowrap}.labnav a:hover{background:#efefeb}.labnav a.on{background:#141416;border-color:#141416;color:#fff}.labnav a:focus-visible{outline:2px solid #141416;outline-offset:2px}
.labnav a.hub{border-color:transparent;background:none;padding-left:4px}
.labsteps{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:nowrap;font:500 13px/1.2 'Space Grotesk',system-ui,sans-serif}
.labsteps .up{flex:none;color:#141416;text-decoration:none;font-weight:600;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:6px 8px;border-radius:10px}.labsteps .up:hover{background:#efefeb}
.labsteps ol{position:relative;list-style:none;margin:0;padding:3px;display:flex;gap:2px;background:#fff;border:1px solid rgba(20,20,22,.14);border-radius:999px;overflow-x:auto;scrollbar-width:none}.labsteps ol::-webkit-scrollbar{display:none}
.labsteps li{flex:none;display:flex;align-items:center}
.labsteps li a{display:flex;align-items:center;gap:6px;padding:5px 11px;border-radius:999px;text-decoration:none;color:#141416;font-weight:600;white-space:nowrap}
.labsteps li a:hover{background:#efefeb}.labsteps li a[aria-current]{background:#141416;color:#fff}.labsteps li a:focus-visible{outline:2px solid #141416;outline-offset:1px}
.labsteps li a .n{font:500 10px 'IBM Plex Mono',monospace;opacity:.55}.labsteps li a.todo{color:#727278}.labsteps li a.todo .n:after{content:"·"}
.labsteps li+li:before{content:"";width:8px;height:1px;background:rgba(20,20,22,.2);margin:0 1px}
@media(max-width:700px){.labsteps .up span{display:none}.labsteps li a .n{display:none}.labsteps li a{padding:5px 9px}}`;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function style() { if (document.getElementById('labnav-css')) return; const s = document.createElement('style'); s.id = 'labnav-css'; s.textContent = CSS; document.head.appendChild(s); }
  const HASHES = { '#plans': 'plans', '#board': 'board', '#assort': 'assort', '#research': 'found', '#library': 'found', '#trends': 'found', '#brands': 'found', '#code': 'found' };
  const current = el => (el.dataset.lab === 'flats' ? 'studio' : el.dataset.lab) || (location.pathname === '/lab' ? HASHES[location.hash] || 'plans' : '');
  // the tab row: only a client's (staff have the console's)
  function render(el) {
    style(); if (!isClient()) { el.innerHTML = ''; el.hidden = true; return; }
    const cur = current(el); el.hidden = false; el.setAttribute('aria-label', 'Design Lab');
    el.innerHTML = `<a class="hub" href="/#lab">← Your hub</a>` + TABS.filter(t => !t.staff).map(t => `<a href="${t.href}" class="${t.id === cur ? 'on' : ''}"${t.id === cur ? ' aria-current="page"' : ''}>${esc(t.label)}</a>`).join('');
  }
  // the step bar
  const hrefOf = (c, id) => ({ concept: `/lab?concept=${c.id}`, picture: `/lab/studio?concept=${c.id}&view=picture`, flats: `/lab/studio?concept=${c.id}&view=front`, pattern: `/lab/studio?concept=${c.id}&view=pattern`, techpack: c.productUrl || '' })[id];
  function steps(el, c, o = {}) {
    style(); if (!el || !c || !c.id) return;
    const up = c.planId ? { href: `/lab?plan=${c.planId}#plans`, label: c.planName || 'Its line plan', title: 'Its line plan' } : { href: '/lab#board', label: 'Concepts', title: 'Every concept' };
    el.classList.add('labsteps'); el.setAttribute('aria-label', 'This piece');
    el.innerHTML = `<a class="up" href="${esc(up.href)}" title="${esc(up.title)}">‹ <span>${esc(up.label)}</span></a><ol>${STEPS.map((s, i) => {
      const href = hrefOf(c, s.id), todo = s.id === 'techpack' && !href;
      return `<li><a href="${esc(href || '#')}" data-step="${s.id}" title="${esc(todo ? 'Not made yet: the checklist says what it still needs, then send it to a tech pack' : s.hint)}"${s.id === o.at ? ' aria-current="step"' : ''}${todo ? ' class="todo"' : ''}><span class="n">${i + 1}</span>${esc(s.label)}</a></li>`;
    }).join('')}</ol>`;
    el.onclick = e => {
      const a = e.target.closest('a[data-step]'); if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
      if (typeof o.onStep === 'function' && o.onStep(a.dataset.step, e) === true) { e.preventDefault(); return; }
      if (a.classList.contains('todo')) e.preventDefault();
    };
    // the step you are on stays in sight when the row is narrower than the steps (a phone)
    const inView = () => { const ol = el.querySelector('ol'), cur = ol && ol.querySelector('[aria-current]'); if (cur && ol.scrollWidth > ol.clientWidth) ol.scrollLeft = Math.max(0, cur.parentElement.offsetLeft - 24); };
    el.setStep = at => { el.querySelectorAll('a[data-step]').forEach(a => { if (a.dataset.step === at) a.setAttribute('aria-current', 'step'); else a.removeAttribute('aria-current'); }); inView(); };
    requestAnimationFrame(inView);
    return el;
  }
  // a toolbar's old "Lab ▾" button (data-lab-menu) is gone: the step bar and the console's tabs lead everywhere it did
  function boot() { document.querySelectorAll('nav.labnav').forEach(render); document.querySelectorAll('[data-lab-menu]').forEach(b => b.remove()); if (location.pathname === '/lab') window.addEventListener('hashchange', () => document.querySelectorAll('nav.labnav').forEach(render)); }
  window.FBLabNav = { TABS, STEPS, render, steps, isClient };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
