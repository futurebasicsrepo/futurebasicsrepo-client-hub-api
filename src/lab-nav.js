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
    el.innerHTML = `<a class="hub" href="/#lab">← Your hub</a><a class="new" href="/lab?new=1" data-new-design>+ New design</a>` + TABS.filter(t => !t.staff).map(t => `<a href="${t.href}" class="${t.id === cur ? 'on' : ''}"${t.id === cur ? ' aria-current="page"' : ''}>${esc(t.label)}</a>`).join('');
  }
  // the step bar
  // hard goods, toys, home objects and electronics are engineered as 3D parts, not cut from a pattern: the same step, named for what it is
  const ENGINEERED = ['electronics', 'toys', 'home'];
  const hrefOf = (c, id) => ({ concept: `/lab?concept=${c.id}`, picture: `/lab/studio?concept=${c.id}&view=picture`, flats: `/lab/studio?concept=${c.id}&view=front`, pattern: `/lab/studio?concept=${c.id}&view=pattern`, techpack: c.productUrl || '' })[id];
  function steps(el, c, o = {}) {
    style(); if (!el || !c || !c.id) return;
    const up = c.planId ? { href: `/lab?plan=${c.planId}#plans`, label: c.planName || 'Its line plan', title: 'Its line plan' } : { href: '/lab#board', label: 'Concepts', title: 'Every concept' };
    el.classList.add('labsteps'); el.setAttribute('aria-label', 'This piece');
    el.innerHTML = `<a class="up" href="${esc(up.href)}" title="${esc(up.title)}">‹ <span>${esc(up.label)}</span></a><ol>${STEPS.filter(s => !(s.id === 'flats' && ENGINEERED.includes(c.category))).map((s, i) => {
      const href = hrefOf(c, s.id), todo = s.id === 'techpack' && !href;
      return `<li><a href="${esc(href || '#')}" data-step="${s.id}" title="${esc(todo ? 'Not made yet: the checklist says what it still needs, then send it to a tech pack' : s.hint)}"${s.id === o.at ? ' aria-current="step"' : ''}${todo ? ' class="todo"' : ''}><span class="n">${i + 1}</span>${esc(s.id === 'pattern' && ENGINEERED.includes(c.category) ? 'Engineering' : s.label)}</a></li>`;
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
  // ---- New design: the one way in, for a client and for staff alike. Four starts, each a press away:
  //   AI concepts from a few words (a piece is added to the room's "Quick concepts" plan and concepts are drawn for it), a sketch from the sketch pack,
  //   a blank page from scratch, or a whole line plan. Opened by anything marked [data-new-design], and by ?new=1 on any Lab page (the hub links there).
  const TOKEN = () => { try { return localStorage.getItem('fb.admin.token') || localStorage.getItem('fb.client.token') || ''; } catch { return ''; } };
  const call = async (path, body) => { const r = await fetch(path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + TOKEN(), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`); return j; };
  const NCSS = `#fbNew{border:0;padding:0;width:min(760px,100vw);max-width:100vw;max-height:min(92dvh,900px);border-radius:22px;background:#fff;color:#141416;box-shadow:0 30px 80px rgba(20,20,22,.25);font:400 14px/1.5 'Space Grotesk',system-ui,sans-serif}
#fbNew::backdrop{background:rgba(20,20,22,.4)}#fbNew[open]{animation:fbNewIn .35s cubic-bezier(.2,.8,.2,1)}@keyframes fbNewIn{from{transform:translateY(16px);opacity:0}}
#fbNew .hd{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:20px 22px 6px}#fbNew h2{margin:0;font:300 34px/1 'Space Grotesk',system-ui,sans-serif;letter-spacing:-.03em}#fbNew .x{width:40px;height:40px;border-radius:50%;border:1px solid rgba(20,20,22,.14);background:#fff;font-size:22px;cursor:pointer;flex:none}
#fbNew .sub{margin:4px 22px 14px;color:#5b5e66}#fbNew .ways{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:0 22px 22px}
#fbNew .way{border:1px solid rgba(20,20,22,.14);border-radius:18px;padding:16px;display:grid;gap:8px;align-content:start;text-decoration:none;color:inherit;background:#fff;min-width:0}#fbNew a.way:hover{border-color:#141416}
#fbNew .way.ai{grid-column:1/-1;background:#f1f1ec;border-color:transparent}#fbNew .way b{font-size:17px;font-weight:500}#fbNew .way small{color:#5b5e66;font-size:13px}#fbNew .way .go{justify-self:start;margin-top:4px}
#fbNew .k{font:500 10px 'IBM Plex Mono',monospace;letter-spacing:.14em;text-transform:uppercase;color:#5b5e66}
#fbNew .row{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) auto;gap:8px}#fbNew input,#fbNew select,#fbNew textarea{font:inherit;border:1px solid rgba(20,20,22,.18);border-radius:12px;padding:9px 12px;background:#fff;min-width:0;width:100%;box-sizing:border-box}
#fbNew textarea{min-height:64px;resize:vertical}#fbNew .btn{border:1px solid #141416;border-radius:999px;padding:10px 18px;font:600 14px 'Space Grotesk',sans-serif;cursor:pointer;background:#fff;color:#141416}#fbNew .btn.go{background:#4bff9a;border-color:#4bff9a}#fbNew .btn:disabled{opacity:.6;cursor:default}
#fbNew .msg{font-size:13px;color:#5b5e66}#fbNew .msg.bad{color:#a02a20}
@media(max-width:620px){#fbNew .fbh-tog{display:none}#fbNew{width:100vw;max-height:94dvh;margin:auto 0 0;border-radius:20px 20px 0 0}#fbNew .ways{grid-template-columns:1fr}#fbNew .row{grid-template-columns:1fr}#fbNew h2{font-size:28px}}
@media(prefers-reduced-motion:reduce){#fbNew[open]{animation:none}}
.labnav a.new{background:#4bff9a;border-color:#4bff9a}`;
  let CATS = null;
  async function openNew() {
    if (!document.getElementById('fbNewCss')) { const st = document.createElement('style'); st.id = 'fbNewCss'; st.textContent = NCSS; document.head.appendChild(st); }
    let d = document.getElementById('fbNew');
    if (!d) {
      d = document.createElement('dialog'); d.id = 'fbNew'; d.setAttribute('aria-labelledby', 'fbNewH');
      d.innerHTML = `<div class="hd"><h2 id="fbNewH">New design</h2><button class="x" type="button" data-close aria-label="Close">×</button></div>
        <p class="sub">Start a new piece, or carry on with one. Every way in ends in the Studio, then the flats, the pattern and a tech pack the factory makes it from.</p>
        <div class="ways">
          <form class="way ai" id="fbNewAi"><span class="k">With AI</span><b>Describe it, and concepts are drawn</b><small>A few words are enough. Three concepts come back, each checked against what inspired it, to open in the Studio.</small>
            <div class="row"><input name="name" required maxlength="100" placeholder="What is it? e.g. Boxy heavyweight hoodie" aria-label="What is it"><select name="category" aria-label="Category"></select><select name="count" aria-label="How many"><option value="3">3 concepts</option><option value="1">1</option><option value="2">2</option><option value="4">4</option></select></div>
            <textarea name="brief" maxlength="400" placeholder="Anything else: the feel, the fabric, a detail, who it is for (optional)" aria-label="Anything else"></textarea>
            <button class="btn go" type="submit">Draw concepts</button><span class="msg" role="status"></span></form>
          <a class="way" href="/lab/sketches"><span class="k">From a sketch</span><b>Start from a flat sketch</b><small>Pick one of our professional flats, choose its cloth and colour, and it opens in the Studio with both in place.</small></a>
          <a class="way" href="/lab/studio?start=scratch"><span class="k">From scratch</span><b>A blank page</b><small>Draw it yourself with the product's outline as a guide; its flats and pattern pieces follow.</small></a>
          <a class="way" href="/lab#plans"><span class="k">A whole line</span><b>Plan a line</b><small>Describe a season or a drop; the assistant drafts the pieces, then concepts for each.</small></a>
          <a class="way" href="/lab#board"><span class="k">Carry on</span><b>Open a concept you have</b><small>Every concept, by status and by plan.</small></a>
        </div>`;
      document.body.appendChild(d);
      d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
      d.querySelector('#fbNewAi').addEventListener('submit', async e => {
        e.preventDefault(); const f = e.target, b = f.querySelector('button[type=submit]'), m = f.querySelector('.msg'), name = f.name.value.trim(); if (!name) return;
        b.disabled = true; b.textContent = 'Drawing concepts…'; m.className = 'msg'; m.textContent = 'This takes a minute or two.';
        try {
          const plans = (await call('/v1/lab/plans')).plans || [];
          let plan = plans.find(p => p.name === 'Quick concepts' && (isClient() || !p.clientId)); // staff see every room's plans: theirs is the one with no room
          const planId = plan ? plan.id : (await call('/v1/lab/plans', { name: 'Quick concepts', brief: 'Pieces started from New design, one at a time.' })).plan.id;
          const after = await call(`/v1/lab/plans/${planId}/lines`, { category: f.category.value, name, brief: f.brief.value.trim() });
          const line = [...(after.lines || [])].reverse().find(l => l.name === name) || (after.lines || []).slice(-1)[0];
          await call(`/v1/lab/plans/${planId}/lines/${line.id}/concepts`, { count: Number(f.count.value) || 3 });
          location.href = `/lab?plan=${planId}#board`;
        } catch (x) { b.disabled = false; b.textContent = 'Draw concepts'; m.className = 'msg bad'; m.textContent = x.message; }
      });
    }
    d.showModal();
    if (!CATS) { CATS = await call('/v1/lab/overview').then(o => o.categories || []).catch(() => []); const sel = d.querySelector('select[name=category]'); sel.innerHTML = CATS.map(c => `<option value="${esc(c.id)}">${esc(c.label)}</option>`).join('') || '<option value="other">Other</option>'; }
    d.querySelector('input[name=name]').focus();
  }
  document.addEventListener('click', e => { const t = e.target.closest('[data-new-design]'); if (!t || e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); openNew(); });
  // a toolbar's old "Lab ▾" button (data-lab-menu) is gone: the step bar and the console's tabs lead everywhere it did
  function boot() {
    // arrived from the hub's New design (or any ?new=1): open it once, and take the flag off the address
    const q = new URLSearchParams(location.search); if (q.get('new') === '1' && TOKEN()) { q.delete('new'); history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash); setTimeout(openNew, 300); }
    document.querySelectorAll('nav.labnav').forEach(render); document.querySelectorAll('[data-lab-menu]').forEach(b => b.remove()); if (location.pathname === '/lab') window.addEventListener('hashchange', () => document.querySelectorAll('nav.labnav').forEach(render)); }
  window.FBLabNav = { TABS, STEPS, render, steps, isClient, openNew };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
