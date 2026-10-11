// The work console's left-hand navigation, shared by every staff page (/admin, /sales, /builds/admin).
// A page adds <script src="/console-nav.js" defer></script> and nothing else: this file draws the sidebar, shifts the page over, and on a phone turns it into a drawer
// opened from a button in the page's header. It only shows once the page itself is signed in (the page's sign-in panel hides it).
(() => {
  if (window.fbNav) return;
  const KEY = 'fb.nav.collapsed';
  const I = {
    home: '<path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M16 5.2a3.2 3.2 0 010 6M18 14.2c1.7.7 3 2.4 3 5.8"/>',
    box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10"/>',
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>'
  };
  // Grouped by what the work is for, not by which page it lives on. Nothing is merged that does different jobs.
  const NAV = [
    { id: 'home', label: 'Home', href: '/home', icon: 'home' },
    { id: 'inbox', label: 'Inbox', href: '/admin#inbox', icon: 'chat', badge: '#mcCount' },
    { id: 'customers', label: 'Customers', icon: 'users', items: [
      { label: 'Clients', href: '/admin#clientsHead' },
      { label: 'Sales today', href: '/sales#today' },
      { label: 'Contacts', href: '/sales#contacts' },
      { label: 'Pipeline', href: '/sales#pipeline' },
      { label: 'Tasks', href: '/sales#tasks', badge: '#taskCount' },
      { label: 'Opportunities', href: '/sales#opportunities', badge: '#oppCount' },
      { label: 'Chats', href: '/sales#chats', badge: '#chatCount' },
      { label: 'Press', href: '/sales#press' },
      { label: 'Automations', href: '/sales#automations' }] },
    { id: 'production', label: 'Production', icon: 'box', items: [
      { label: 'Factories', href: '/admin#partnersSection' },
      { label: 'Waiting on approval', href: '/admin#approvals' },
      { label: 'Production attention', href: '/admin#production' },
      { label: 'Assistant learning', href: '/admin#assistantLearning' }] },
    { id: 'showcase', label: 'Builds showcase', icon: 'grid', items: [
      { label: 'Builds', href: '/builds/admin#builds' },
      { label: 'What’s new', href: '/builds/admin#updates', badge: '#newCount' },
      { label: 'Invites', href: '/builds/admin#invites' },
      { label: 'Who looked', href: '/builds/admin#activity' }] },
    { id: 'settings', label: 'Settings', icon: 'gear', items: [
      { label: 'Platform health', href: '/platform', key: 'platform' },
      { label: 'Connections', href: '/admin#connections' },
      { label: 'Payment gate', href: '/admin#accessPanel' }] }
  ];
  const DEFAULT_HASH = { '/sales': 'today', '/builds/admin': 'builds' };
  const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const svg = n => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]}</svg>`;
  const pathOf = () => { const p = location.pathname.replace(/\/$/, '') || '/'; return p === '/' || p === '/home' ? '/home' : p.startsWith('/clients/') ? '/admin' : p; };
  const split = href => { const [p, h = ''] = href.split('#'); return { p, h }; };
  let collapsed = false; try { const v = localStorage.getItem(KEY); collapsed = v === '1'; } catch {}
  const chosen = () => { try { return localStorage.getItem(KEY) !== null; } catch { return false; } };

  const css = `
.fbside{position:fixed;left:0;top:72px;bottom:0;width:var(--fbw,236px);background:#fff;border-right:1px solid rgba(20,20,22,.14);z-index:15;display:flex;flex-direction:column;overflow-y:auto;overflow-x:hidden;font:400 14px/1.35 'Space Grotesk',system-ui,sans-serif;color:#141416;transition:width .2s}
body.fbnav{--fbw:236px}body.fbnav.fbcollapsed{--fbw:64px}
body.fbnav{padding-left:var(--fbw);transition:padding-left .2s}
body.fbnav>header{margin-left:calc(var(--fbw) * -1);padding-left:clamp(18px,2.4vw,30px)}
body.fbnav:has(#auth:not(.hidden)),body.fbnav:has(#needSignin:not(.hidden)){padding-left:0}
body.fbnav:has(#auth:not(.hidden))>header,body.fbnav:has(#needSignin:not(.hidden))>header{margin-left:0}
body.fbnav:has(#auth:not(.hidden)) .fbside,body.fbnav:has(#needSignin:not(.hidden)) .fbside,body.fbnav:has(#auth:not(.hidden)) .fbburger,body.fbnav:has(#needSignin:not(.hidden)) .fbburger{display:none}
.fbside nav{padding:14px 10px 8px;display:grid;gap:2px;flex:1;align-content:start}
.fbside a{display:flex;align-items:center;gap:11px;color:inherit;text-decoration:none;border-radius:10px;padding:8px 10px;position:relative;white-space:nowrap}
.fbside a:hover{background:#f5f5f2}.fbside a:focus-visible{outline:2px solid #141416;outline-offset:1px}
.fbside a.on{background:#141416;color:#fff}
.fbside a svg{flex:none}
.fbside .grp{margin-top:14px}.fbside .grp>span{display:block;padding:0 10px 4px;font:500 10px 'IBM Plex Mono',monospace;letter-spacing:.12em;text-transform:uppercase;color:#727278}
.fbside .grp a{padding:6px 10px 6px 14px;font-size:13.5px}
.fbside .grp a:before{content:"";width:5px;height:5px;border-radius:50%;background:#c9c9c4;flex:none}.fbside .grp a.on:before{background:#4bff9a}
.fbside .gicon{display:none}
.fbside .bdg{margin-left:auto;background:#d8451f;color:#fff;border-radius:999px;font:500 10px 'IBM Plex Mono',monospace;padding:1px 7px;min-width:20px;text-align:center}
.fbside .foot{padding:8px 10px 14px;border-top:1px solid rgba(20,20,22,.14)}
.fbside .foot button{display:flex;align-items:center;gap:10px;width:100%;border:0;background:none;cursor:pointer;color:#727278;font:inherit;font-size:13px;padding:8px 10px;border-radius:10px}.fbside .foot button:hover{background:#f5f5f2;color:#141416}
.fbside .foot svg{transition:transform .2s}
body.fbcollapsed .fbside .grp>span,body.fbcollapsed .fbside .grp a,body.fbcollapsed .fbside .lbl,body.fbcollapsed .fbside .bdg,body.fbcollapsed .fbside .foot b{display:none}
body.fbcollapsed .fbside .grp a.gicon{display:flex;margin-top:0}
body.fbcollapsed .fbside .grp{margin-top:0}
body.fbcollapsed .fbside a{justify-content:center;padding:10px}body.fbcollapsed .fbside .foot svg{transform:rotate(180deg)}body.fbcollapsed .fbside .foot button{justify-content:center}
.fbburger{display:none;border:1px solid rgba(255,255,255,.3);background:transparent;color:#fff;border-radius:10px;width:40px;height:40px;cursor:pointer;align-items:center;justify-content:center;flex:none}
.fbscrim{display:none}
@media(max-width:900px){
 body.fbnav{padding-left:0}body.fbnav>header{margin-left:0}
 .fbburger{display:inline-flex}
 .fbside{top:0;width:min(300px,86vw);transform:translateX(-102%);transition:transform .22s;z-index:40;box-shadow:0 20px 60px rgba(20,20,22,.3)}
 body.fbopen .fbside{transform:none}
 body.fbopen .fbscrim{display:block;position:fixed;inset:0;background:rgba(20,20,22,.5);z-index:35}
 body.fbcollapsed .fbside .grp>span,body.fbcollapsed .fbside .grp a,body.fbcollapsed .fbside .lbl{display:revert}
 body.fbcollapsed .fbside .grp>span{display:block}body.fbcollapsed .fbside .grp a{display:flex}body.fbcollapsed .fbside .grp a.gicon{display:none}body.fbcollapsed .fbside a{justify-content:flex-start;padding:8px 10px}body.fbcollapsed .fbside .grp a{padding:6px 10px 6px 14px}
 .fbside .foot{display:none}
 body.fbcollapsed .fbside .bdg{display:inline-block}
}
@media(prefers-reduced-motion:reduce){.fbside,body.fbnav{transition:none}}
`;

  function render() {
    const links = [];
    const item = (it, cls = '') => { links.push(it); return `<a href="${esc(it.href)}" data-nav="${esc(it.key || it.id || it.label)}" data-href="${esc(it.href)}" ${cls ? `class="${cls}"` : ''} title="${esc(it.label)}">${it.icon ? svg(it.icon) : ''}<span class="lbl">${esc(it.label)}</span>${it.badge ? `<span class="bdg" data-badge="${esc(it.badge)}" hidden></span>` : ''}</a>`; };
    return `<nav aria-label="Work console">${NAV.map(n => n.items
      ? `<div class="grp"><span>${esc(n.label)}</span><a class="gicon" href="${esc(n.items[0].href)}" data-href="${esc(n.items[0].href)}" data-group="${n.id}" title="${esc(n.label)}">${svg(n.icon)}</a>${n.items.map(it => item(it)).join('')}</div>`
      : item(n)).join('')}</nav>
    <div class="foot"><button type="button" id="fbCollapse" aria-label="Collapse the menu"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 6l-6 6 6 6"/></svg><b style="font-weight:400">Collapse</b></button></div>`;
  }

  let activeFromScroll = '';
  function paintActive() {
    const p = pathOf(), h = (location.hash || '').slice(1) || DEFAULT_HASH[p] || activeFromScroll || (p === '/admin' ? 'clientsHead' : ''); // the old home is now the clients and production page: its top is Clients
    let any = false;
    document.querySelectorAll('.fbside a[data-href]').forEach(a => {
      const t = split(a.dataset.href), tp = t.p === '/platform' ? '/platform' : t.p;
      let on;
      if (a.dataset.group) on = false;
      else if (p === '/platform' || (p === '/admin' && document.getElementById('platformPage') && !document.getElementById('platformPage').classList.contains('hidden'))) on = t.p === '/platform';
      else on = tp === p && (t.h ? t.h === h : !h && !activeFromScroll);
      a.classList.toggle('on', on); if (on) { a.setAttribute('aria-current', 'page'); any = true; } else a.removeAttribute('aria-current');
    });
    document.querySelectorAll('.fbside a[data-group]').forEach(a => { const g = NAV.find(n => n.id === a.dataset.group); a.classList.toggle('on', Boolean(g && [...document.querySelectorAll('.fbside .grp a.on')].some(x => g.items.some(i => i.href === x.dataset.href)))); });
    return any;
  }

  function spy() {
    const ids = NAV.flatMap(n => n.items || [n]).map(i => split(i.href)).filter(x => x.p === '/admin' && x.h).map(x => x.h);
    if (pathOf() !== '/admin' || !ids.length || !('IntersectionObserver' in window)) return;
    const seen = new Map();
    const io = new IntersectionObserver(es => {
      for (const e of es) seen.set(e.target.id, e.isIntersecting ? e.boundingClientRect.top : Infinity);
      const top = [...seen].filter(([, t]) => t !== Infinity && t < innerHeight * .6).sort((a, b) => a[1] - b[1])[0];
      const next = top ? top[0] : ''; if (next !== activeFromScroll && !location.hash) { activeFromScroll = next; paintActive(); }
    }, { rootMargin: '-80px 0px -45% 0px', threshold: [0, .1] });
    const watch = () => ids.forEach(id => { const el = document.getElementById(id); if (el && !el.dataset.fbspy) { el.dataset.fbspy = '1'; io.observe(el); } });
    watch(); setInterval(watch, 2000);
  }

  function go(e) {
    const a = e.target.closest('a[data-href]'); if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    closeDrawer();
    const t = split(a.dataset.href), here = pathOf();
    if (t.p === '/platform' && typeof window.openPlatform === 'function') { e.preventDefault(); window.openPlatform(e); return; }
    if (t.p === '/admin' && here === '/admin' && document.getElementById('app')) {
      e.preventDefault();
      if (typeof window.closePlatform === 'function' && document.getElementById('platformPage') && !document.getElementById('platformPage').classList.contains('hidden')) window.closePlatform();
      if (typeof window.closeClientPage === 'function' && document.getElementById('clientPage') && !document.getElementById('clientPage').classList.contains('hidden')) window.closeClientPage();
      const el = t.h && document.getElementById(t.h); if (el && el.tagName === 'DETAILS') el.open = true; el ? el.scrollIntoView({ behavior: 'smooth', block: 'start' }) : scrollTo({ top: 0, behavior: 'smooth' });
      activeFromScroll = t.h || ''; try { history.replaceState(history.state, '', location.pathname + location.search); } catch {} paintActive(); return;
    }
    if (t.p === here && t.h) { e.preventDefault(); history.pushState(null, '', '#' + t.h); window.dispatchEvent(new HashChangeEvent('hashchange')); }
  }

  function badges() {
    document.querySelectorAll('.fbside [data-badge]').forEach(b => {
      const src = document.querySelector(b.dataset.badge), txt = src ? (src.textContent || '').trim() : '';
      const n = /^\d+$/.test(txt) ? txt : (/\d+/.exec(txt) || [''])[0]; b.textContent = n; b.hidden = !n || n === '0';
    });
  }

  const setCollapsed = (v, persist) => { collapsed = v; document.body.classList.toggle('fbcollapsed', v); if (persist) { try { localStorage.setItem(KEY, v ? '1' : '0'); } catch {} } const b = document.getElementById('fbCollapse'); if (b) b.setAttribute('aria-label', v ? 'Expand the menu' : 'Collapse the menu'); };
  const autoCollapse = () => { if (!chosen()) setCollapsed(location.pathname.startsWith('/clients/'), false); }; // a client's own room has its own rail: give it the width
  function closeDrawer() { document.body.classList.remove('fbopen'); const b = document.querySelector('.fbburger'); if (b) b.setAttribute('aria-expanded', 'false'); }

  function mount() {
    const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
    document.body.classList.add('fbnav');
    const side = document.createElement('aside'); side.className = 'fbside'; side.id = 'fbSide'; side.innerHTML = render(); document.body.appendChild(side);
    const scrim = document.createElement('div'); scrim.className = 'fbscrim'; scrim.addEventListener('click', closeDrawer); document.body.appendChild(scrim);
    const head = document.querySelector('body > header');
    if (head) { const b = document.createElement('button'); b.className = 'fbburger'; b.type = 'button'; b.setAttribute('aria-label', 'Menu'); b.setAttribute('aria-controls', 'fbSide'); b.setAttribute('aria-expanded', 'false'); b.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>'; b.addEventListener('click', () => { const o = document.body.classList.toggle('fbopen'); b.setAttribute('aria-expanded', String(o)); }); head.prepend(b); }
    side.addEventListener('click', go);
    document.getElementById('fbCollapse').addEventListener('click', () => setCollapsed(!collapsed, true));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });
    setCollapsed(collapsed, false); autoCollapse(); paintActive(); badges(); spy();
    for (const m of ['pushState', 'replaceState']) { const orig = history[m]; history[m] = function () { const r = orig.apply(this, arguments); window.dispatchEvent(new Event('fb:nav')); return r; }; }
    for (const ev of ['hashchange', 'popstate', 'fb:nav']) window.addEventListener(ev, () => { autoCollapse(); paintActive(); });
    setInterval(() => { badges(); paintActive(); }, 1500); // the pages draw their own counts and open sub-pages themselves
    // arriving from another page at /admin#inbox: the section only exists once the page has loaded its data, so wait for it
    const want = (location.hash || '').slice(1);
    if (want && pathOf() === '/admin') {
      let n = 0, touched = false; for (const ev of ['wheel', 'touchstart', 'keydown', 'mousedown']) window.addEventListener(ev, () => { touched = true; }, { once: true, passive: true });
      const t = setInterval(() => {
        const el = document.getElementById(want);
        if ((el && el.offsetParent) || ++n > 40) {
          clearInterval(t);
          if (el && el.offsetParent) { // the lists above it fill in after the page opens and push it down: keep it in view until they settle, unless the person has started scrolling
            let k = 0; const hold = () => { if (touched) return; const top = el.getBoundingClientRect().top; if (top < 20 || top > 160) el.scrollIntoView({ block: 'start' }); if (++k < 10) setTimeout(hold, 400); };
            hold();
          }
        }
      }, 250);
    }
  }
  window.fbNav = { badge: badges };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
