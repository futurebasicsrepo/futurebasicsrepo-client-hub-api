// Studio, the font browser (served as /lab/studio-type.js; shares the Studio's globals). The type layer's own words, set in every font, so a
// designer picks by eye: the Studio's faces, the open-source library by kind (src/lab-fonts.js) and the room's uploaded fonts, with a search.
(function () {
  const $ = s => document.querySelector(s);
  let CAT = 'All', Q = '';
  const css = document.createElement('style');
  css.textContent = `
  .fontbtn{flex:1;min-width:0;text-align:left;border:1px solid var(--line);border-radius:10px;background:#fff;padding:6px 10px;font-size:17px;line-height:1.2;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-height:38px}
  #fontDlg{width:min(560px,94vw);max-height:86vh;padding:0;border:1px solid var(--line);border-radius:16px}#fontDlg::backdrop{background:rgba(20,20,22,.35)}
  #fontDlg .fh{display:grid;gap:8px;padding:14px 14px 10px;border-bottom:1px solid var(--line);position:sticky;top:0;background:#fff;z-index:1}
  #fontDlg .fcats{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none}#fontDlg .fcats::-webkit-scrollbar{display:none}
  #fontDlg .fcats button{flex:none;border:1px solid var(--line);background:#fff;border-radius:999px;padding:5px 11px;font:600 12.5px inherit;cursor:pointer;min-height:32px}
  #fontDlg .fcats button[aria-pressed=true]{background:var(--ink);color:#fff;border-color:var(--ink)}
  #fontDlg .flist{overflow-y:auto;max-height:calc(86vh - 130px);padding:6px}
  #fontDlg .frow{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px;width:100%;border:0;background:none;text-align:left;padding:10px 10px;border-radius:10px;cursor:pointer}
  #fontDlg .frow:hover,#fontDlg .frow:focus-visible{background:#f3f3f1}#fontDlg .frow[aria-current=true]{background:#e9f9ef;box-shadow:inset 0 0 0 1px #17603a}
  #fontDlg .frow b{font-weight:400;font-size:26px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #fontDlg .frow small{font:500 10px 'IBM Plex Mono',monospace;letter-spacing:.06em;text-transform:uppercase;color:var(--dim);text-align:right;white-space:nowrap}`;
  document.head.appendChild(css);
  const dlg = document.createElement('dialog'); dlg.id = 'fontDlg'; dlg.setAttribute('aria-label', 'Fonts');
  dlg.innerHTML = `<div class="fh"><div class="row" style="justify-content:space-between"><b>Fonts</b><button class="btn sm q" type="button" data-fclose>Close</button></div><input class="t" id="fontQ" type="search" placeholder="Search fonts" autocomplete="off"><div class="fcats" role="group" aria-label="Kind"></div></div><div class="flist" role="listbox" aria-label="Fonts"></div>`;
  document.body.appendChild(dlg);
  const kindOf = (k, f) => (k.startsWith('f_') ? 'Uploaded' : k.startsWith('g_') ? f[2] || 'Library' : 'Studio');
  const cats = () => ['All', 'Studio', ...(window.FBFONT_CATEGORIES || []), ...(Object.keys(FONTS).some(k => k.startsWith('f_')) ? ['Uploaded'] : [])];
  let LAYER = null;
  function paint() {
    const words = String(LAYER?.text || 'Future Basics').split('\n')[0].slice(0, 28) || 'Future Basics', q = Q.trim().toLowerCase();
    dlg.querySelector('.fcats').innerHTML = cats().map(c => `<button type="button" data-fcat="${esc(c)}" aria-pressed="${c === CAT}">${esc(c)}</button>`).join('');
    const rows = Object.entries(FONTS).filter(([k, f]) => (CAT === 'All' || kindOf(k, f) === CAT) && (!q || f[0].toLowerCase().includes(q) || kindOf(k, f).toLowerCase().includes(q)));
    dlg.querySelector('.flist').innerHTML = rows.length ? rows.map(([k, f]) => `<button type="button" class="frow" role="option" data-fk="${k}" aria-current="${k === LAYER?.font}" title="${esc(f[0])}"><b style="font-family:${esc(f[1])}">${esc(caseOf(words, LAYER?.case))}</b><small>${esc(f[0])}<br>${esc(kindOf(k, f))}</small></button>`).join('') : '<p class="note" style="padding:14px">No font by that name.</p>';
  }
  async function pick(k) {
    const l = LAYER; if (!l || !FONTS[k]) return; dlg.close();
    try { await Promise.all(['400', '700'].map(w => document.fonts?.load(`${w} 40px ${FONTS[k][1]}`))); } catch {}
    l.font = k; l._pk = null; l._pc = null; commit(); paintLayers(); draw();
  }
  dlg.addEventListener('click', e => {
    if (e.target === dlg || e.target.closest('[data-fclose]')) { dlg.close(); return; }
    const c = e.target.closest('[data-fcat]'); if (c) { CAT = c.dataset.fcat; paint(); return; }
    const r = e.target.closest('[data-fk]'); if (r) pick(r.dataset.fk);
  });
  dlg.querySelector('#fontQ').addEventListener('input', e => { Q = e.target.value; paint(); });
  document.addEventListener('click', e => { if (!e.target.closest('[data-fontpick]')) return; LAYER = selected(); if (!LAYER || LAYER.kind !== 'text') return; Q = ''; dlg.querySelector('#fontQ').value = ''; paint(); dlg.showModal(); dlg.querySelector('[aria-current=true]')?.scrollIntoView({ block: 'center' }); });
  window.TYPE = {
    button: l => { const f = FONTS[l.font] || FONTS.grotesk; return `<button type="button" class="fontbtn" data-fontpick style="font-family:${esc(f[1])}" title="Choose the font">${esc(f[0])}</button>`; }
  };
})();
