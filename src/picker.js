// "From your files": pick pictures already saved in the room (this product, this project, anything sent to the room) instead of uploading them again.
// Shared by the tech pack editor and the hub. The page says where the list comes from and how to fetch a file (its own sign-in); the picker hands back real File
// objects, so whatever handles a file chosen from a computer handles these too.
(() => {
  const css = `.fbpk{border:0;border-radius:20px;padding:0;width:min(760px,94vw);max-height:88vh;box-shadow:0 30px 100px rgba(0,0,0,.35);background:var(--paper,#fff);color:var(--ink,#16171a);font:14px/1.45 inherit}
.fbpk::backdrop{background:rgba(20,22,28,.6);backdrop-filter:blur(6px)}.fbpk form{display:grid;grid-template-rows:auto minmax(0,1fr) auto;max-height:88vh}
.fbpk header{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid var(--line,#e3e3df)}.fbpk header b{font-size:16px;font-weight:600}
.fbpk .x{border:0;background:none;font-size:22px;line-height:1;cursor:pointer;color:inherit}.fbpk .body{overflow:auto;padding:6px 20px 18px}
.fbpk h4{margin:16px 0 8px;font:500 11px/1 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--dim,#6b6d73)}
.fbpk .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px}
.fbpk .it{position:relative;display:grid;grid-template-rows:110px auto;gap:6px;padding:6px;border:1px solid var(--line,#e3e3df);border-radius:12px;background:var(--fog,#f6f6f3);cursor:pointer;text-align:left;font:inherit;color:inherit}
.fbpk .it[aria-pressed=true]{outline:2px solid var(--ink,#16171a);background:#fff}.fbpk .it .th{display:grid;place-items:center;overflow:hidden;border-radius:8px;background:repeating-conic-gradient(#ececea 0 25%,#f8f8f6 0 50%) 0 0/14px 14px}
.fbpk .it img{max-width:100%;max-height:100%;object-fit:contain}.fbpk .it .nm{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fbpk .it .ck{position:absolute;top:10px;right:10px;width:20px;height:20px;border-radius:50%;background:var(--ink,#16171a);color:#fff;display:none;place-items:center;font-size:12px}.fbpk .it[aria-pressed=true] .ck{display:grid}
.fbpk footer{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 20px;border-top:1px solid var(--line,#e3e3df)}.fbpk .empty,.fbpk .err{padding:26px 0;text-align:center;color:var(--dim,#6b6d73)}
.fbpk button.go{border:0;border-radius:999px;padding:10px 20px;background:var(--ink,#16171a);color:#fff;font:inherit;cursor:pointer}.fbpk button.go[disabled]{opacity:.4;cursor:default}`;
  const el = (tag, attrs = {}, kids = []) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) k === 'text' ? n.textContent = v : n.setAttribute(k, v); kids.forEach(c => n.append(c)); return n; };
  let open = null;

  // opts: { title, multiple, load: () => Promise<[{id,name,label,mime,where,url}]>, fetchBlob: url => Promise<Blob>, onPick: File[] => void }
  function pick(opts) {
    if (open) return;
    if (!document.getElementById('fbpkCss')) document.head.append(el('style', { id: 'fbpkCss', text: css }));
    const dlg = el('dialog', { class: 'fbpk', 'aria-label': opts.title || 'Choose from your files' }), chosen = new Map(), urls = [];
    const body = el('div', { class: 'body' }, [el('p', { class: 'empty', text: 'Loading your files…' })]);
    const go = el('button', { type: 'submit', class: 'go', disabled: '', text: 'Use' }), note = el('span', { class: 'meta', text: opts.multiple ? 'Pick one or more' : 'Pick one' });
    const close = () => { urls.forEach(u => URL.revokeObjectURL(u)); open = null; dlg.close(); dlg.remove(); };
    const x = el('button', { type: 'button', class: 'x', 'aria-label': 'Close', text: '×' });
    x.onclick = close; dlg.addEventListener('cancel', e => { e.preventDefault(); close(); });
    const form = el('form', { method: 'dialog' }, [el('header', {}, [el('b', { text: opts.title || 'Choose from your files' }), x]), body, el('footer', {}, [note, go])]);
    dlg.append(form); document.body.append(dlg); dlg.showModal(); open = dlg;
    const sync = () => { go.disabled = !chosen.size; go.textContent = chosen.size > 1 ? `Use ${chosen.size}` : 'Use'; };
    form.onsubmit = async e => {
      e.preventDefault(); if (!chosen.size) return; go.disabled = true; go.textContent = 'Getting…';
      try {
        const files = [];
        for (const it of chosen.values()) { const blob = await opts.fetchBlob(it.url); files.push(new File([blob], it.name || 'picture', { type: blob.type || it.mime || 'image/png' })); }
        close(); opts.onPick(files);
      } catch (err) { go.disabled = false; go.textContent = 'Use'; note.textContent = (err && err.message) || 'That file could not be opened'; }
    };
    const queue = []; let busy = 0;
    const pump = () => { while (busy < 4 && queue.length) { const job = queue.shift(); busy++; job().finally(() => { busy--; pump(); }); } };
    Promise.resolve(opts.load()).then(items => {
      body.textContent = '';
      if (!items.length) { body.append(el('p', { class: 'empty', text: 'Nothing saved yet. Pictures you send to your room, and the ones in this product\'s files, show up here.' })); return; }
      const groups = [...new Set(items.map(i => i.where))];
      for (const g of groups) {
        const grid = el('div', { class: 'grid' }); body.append(el('h4', { text: g }), grid);
        for (const it of items.filter(i => i.where === g)) {
          const img = el('img', { alt: '' }), th = el('span', { class: 'th' }, [img]);
          const b = el('button', { type: 'button', class: 'it', 'aria-pressed': 'false', title: it.name }, [th, el('span', { class: 'nm', text: it.label || it.name }), el('span', { class: 'ck', 'aria-hidden': 'true', text: '✓' })]);
          b.onclick = () => {
            const on = b.getAttribute('aria-pressed') !== 'true';
            if (!opts.multiple) { chosen.clear(); body.querySelectorAll('.it[aria-pressed=true]').forEach(n => n.setAttribute('aria-pressed', 'false')); }
            b.setAttribute('aria-pressed', String(on)); on ? chosen.set(it.id, it) : chosen.delete(it.id); sync();
          };
          grid.append(b);
          queue.push(() => opts.fetchBlob(it.url).then(blob => { const u = URL.createObjectURL(blob); urls.push(u); img.src = u; }).catch(() => { th.textContent = '—'; }));
        }
      }
      pump();
    }).catch(err => { body.textContent = ''; body.append(el('p', { class: 'err', text: (err && err.message) || 'Your files could not be loaded' })); });
  }
  window.FBPick = { pick };
})();
