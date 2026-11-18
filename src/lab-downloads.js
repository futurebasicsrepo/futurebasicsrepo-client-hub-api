// Downloads for a piece, from any Lab page (served as /lab/lab-downloads.js): the picture and its turns, the flats, the spec and decoration
// sheets, each graphic's artwork, vector, separations or stitch files, and the pattern, one at a time or all in one zip. It lists what the
// server says the piece has (GET /v1/lab/concepts/:id/downloads), so a page never offers a file that cannot be made.
//   FBDownloads.open({ conceptId, name, token, save?, focus? })
//     token  the sign-in token (the page's TOKEN())
//     save   (blob, filename, label) → handled?: a page installed on an iPad's home screen opens the file in its share sheet instead
//     focus  a group key to scroll to and mark ('sketch', 'graphic-2', 'pattern')
(function () {
  if (window.FBDownloads) return;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const css = `
.fbd{border:0;border-radius:18px;padding:0;width:min(720px,96vw);max-height:88vh;overflow:hidden;color:#141414;background:#fff;box-shadow:0 24px 80px rgba(0,0,0,.28)}
.fbd::backdrop{background:rgba(10,10,12,.45)}
.fbd-in{display:flex;flex-direction:column;max-height:88vh}
.fbd-hd{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:18px 20px 12px;border-bottom:1px solid #ececec}
.fbd-hd h3{margin:0;font-size:17px;line-height:1.25}.fbd-hd p{margin:4px 0 0;color:#6a6a70;font-size:13px}
.fbd-x{border:0;background:#f2f2f2;border-radius:999px;width:32px;height:32px;font-size:18px;line-height:1;cursor:pointer;flex:0 0 auto}
.fbd-body{overflow:auto;padding:6px 20px 16px}
.fbd-g{padding:12px 0;border-bottom:1px solid #f1f1f1}.fbd-g:last-child{border-bottom:0}
.fbd-g.on{background:linear-gradient(90deg,rgba(75,255,154,.16),transparent 70%);margin:0 -20px;padding:12px 20px}
.fbd-g h4{margin:0 0 2px;font-size:14px}.fbd-g .sub{margin:0 0 8px;color:#6a6a70;font-size:12px}
.fbd-items{display:grid;gap:6px;grid-template-columns:repeat(auto-fill,minmax(250px,1fr))}
.fbd-it{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;text-align:left;border:1px solid #e6e6e6;background:#fafafa;border-radius:12px;padding:9px 12px;cursor:pointer;font:inherit;color:inherit}
.fbd-it:hover{border-color:#141414;background:#fff}.fbd-it:focus-visible{outline:2px solid #141414;outline-offset:2px}
.fbd-it b{font-size:13.5px;font-weight:600}.fbd-it small{display:block;color:#6a6a70;font-size:12px;margin-top:1px}
.fbd-it .go{font-size:12px;color:#6a6a70;white-space:nowrap}.fbd-it[aria-busy=true] .go{color:#141414}
.fbd-ft{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 20px;border-top:1px solid #ececec;background:#fcfcfc}
.fbd-ft small{color:#6a6a70;font-size:12px}
.fbd-all{border:0;border-radius:999px;background:#141414;color:#fff;font:inherit;font-weight:600;font-size:13.5px;padding:10px 16px;cursor:pointer;white-space:nowrap}
.fbd-all[disabled]{opacity:.55;cursor:default}
.fbd-msg{padding:22px 0;color:#6a6a70;font-size:14px}.fbd-err{color:#b3261e}
@media (prefers-reduced-motion:no-preference){.fbd[open]{animation:fbdIn .16s ease-out}@keyframes fbdIn{from{opacity:0;transform:translateY(6px)}}}`;
  let dlg = null;
  function ensure() {
    if (dlg) return dlg;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    dlg = document.createElement('dialog'); dlg.className = 'fbd'; dlg.setAttribute('aria-labelledby', 'fbdTitle');
    dlg.innerHTML = `<div class="fbd-in"><div class="fbd-hd"><div><h3 id="fbdTitle">Download</h3><p id="fbdSub"></p></div><button type="button" class="fbd-x" aria-label="Close">×</button></div><div class="fbd-body" id="fbdBody"></div><div class="fbd-ft"><small id="fbdCount"></small><button type="button" class="fbd-all" id="fbdAll">Download everything (.zip)</button></div></div>`;
    dlg.querySelector('.fbd-x').onclick = () => dlg.close();
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    document.body.appendChild(dlg); return dlg;
  }
  async function fetchBlob(url, token) {
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'The file could not be made');
    return r.blob();
  }
  function saveBlob(blob, filename) {
    const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 8000);
  }
  async function run(btn, url, filename, label, o) {
    if (btn.getAttribute('aria-busy') === 'true') return;
    const go = btn.querySelector('.go'), was = go ? go.textContent : btn.textContent;
    btn.setAttribute('aria-busy', 'true'); if (go) go.textContent = 'Making it…'; else { btn.disabled = true; btn.textContent = 'Making the zip…'; }
    try { const b = await fetchBlob(url, o.token); if (!(o.save && o.save(b, filename, label))) saveBlob(b, filename); if (go) go.textContent = 'Downloaded'; else btn.textContent = was; }
    catch (e) { if (go) { go.textContent = e.message; go.classList.add('fbd-err'); } else { btn.textContent = was; dlg.querySelector('#fbdCount').innerHTML = `<span class="fbd-err">${esc(e.message)}</span>`; } }
    finally { btn.removeAttribute('aria-busy'); btn.disabled = false; if (go) setTimeout(() => { go.textContent = was; go.classList.remove('fbd-err'); }, 4000); }
  }
  async function open(o) {
    const d = ensure(), body = d.querySelector('#fbdBody'), all = d.querySelector('#fbdAll');
    d.querySelector('#fbdTitle').textContent = `Download${o.name ? ': ' + o.name : ''}`;
    d.querySelector('#fbdSub').textContent = 'Any file, as last saved. Nothing here waits for the tech pack.';
    body.innerHTML = '<div class="fbd-msg">Finding the files…</div>'; d.querySelector('#fbdCount').textContent = ''; all.disabled = true;
    if (!d.open) d.showModal();
    let r;
    try { const res = await fetch(`/v1/lab/concepts/${o.conceptId}/downloads`, { headers: { Authorization: 'Bearer ' + o.token } }); r = await res.json(); if (!res.ok) throw new Error(r.error || 'The files could not be listed'); }
    catch (e) { body.innerHTML = `<div class="fbd-msg fbd-err">${esc(e.message)}</div>`; return; }
    if (!r.groups.length) { body.innerHTML = '<div class="fbd-msg">Nothing to download yet. Make the picture, or save the flats, and the files appear here.</div>'; return; }
    body.innerHTML = r.groups.map(g => `<section class="fbd-g" data-g="${esc(g.key)}"><h4>${esc(g.title)}</h4>${g.sub ? `<p class="sub">${esc(g.sub)}</p>` : ''}<div class="fbd-items">${g.items.map(i => `<button type="button" class="fbd-it" data-url="${esc(i.url)}" data-name="${esc(i.filename)}" data-label="${esc(i.label)}"><span><b>${esc(i.label)}</b>${i.hint ? `<small>${esc(i.hint)}</small>` : ''}</span><span class="go">${esc((i.filename.split('.').pop() || '').toUpperCase())}</span></button>`).join('')}</div></section>`).join('');
    body.querySelectorAll('.fbd-it').forEach(b => { b.onclick = () => run(b, b.dataset.url, b.dataset.name, b.dataset.label, o); });
    d.querySelector('#fbdCount').textContent = `${r.count} file${r.count === 1 ? '' : 's'} · the zip can take a minute`;
    all.disabled = false; all.onclick = () => run(all, r.zip.url, r.zip.filename, 'Everything', o);
    if (o.focus) { const g = body.querySelector(`[data-g="${CSS.escape(o.focus)}"]`) || body.querySelector(`[data-g^="${CSS.escape(o.focus)}"]`); if (g) { g.classList.add('on'); g.scrollIntoView({ block: 'nearest' }); } }
  }
  window.FBDownloads = { open };
})();
