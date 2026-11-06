// The form for what the material check could not see (src/lab-fabric-fit.js `asks`): a fabric with no weight, a sole with no hardness, a safety
// eye with no standard. The Studio's materials window and the Pattern page show it under the check; Save fills the detail in on the piece
// (PUT /v1/lab/concepts/:id/materials/:mid/spec), and on the library's own material when the person may change it.
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const ASK_FIELDS = {
  construction: { label: 'What it is', ph: 'jersey, fleece, twill, denim…' },
  weightGsm: { label: 'Weight (gsm)', type: 'number', min: 10, max: 2000, step: 1, ph: '240' },
  thicknessMm: { label: 'Thickness (mm)', type: 'number', min: .1, max: 30, step: .1, ph: '1.2' },
  stretch: { label: 'Stretch', options: [['', 'Choose…'], ['none', 'None'], ['mechanical', 'A little (mechanical)'], ['2-way', 'Two-way'], ['4-way', 'Four-way']] },
  composition: { label: 'Made of', ph: '92% cotton, 8% elastane' },
  thicknessMm: { label: 'Thickness (mm)', type: 'number', min: .1, max: 200, step: .1, ph: '1.4' },
  hardness: { label: 'Hardness (Shore A)', type: 'number', min: 5, max: 100, step: 1, ph: '65' },
  pileMm: { label: 'Pile (mm)', type: 'number', min: .5, max: 80, step: .5, ph: '3' },
  safety: { label: 'Safety standard', ph: 'EN71-1, ASTM F963, 3+' }
};
// one ask → its form (or just its words, when there is nothing on the piece to fill in yet, like "choose the sole too")
export function askHtml(a, i = 0) {
  const fields = (a.fields || []).filter(f => ASK_FIELDS[f]);
  if (!a.id || !fields.length) return `<p class="fitask note">${esc(a.msg)}</p>`;
  return `<form class="fitask" data-ask="${i}" data-mid="${esc(a.id)}" data-part="${esc(a.part || '')}"><p>${esc(a.msg)}</p><div class="fitaskf">${fields.map(f => { const d = ASK_FIELDS[f];
    return `<label><span>${esc(d.label)}</span>${d.options ? `<select name="${f}">${d.options.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select>` : `<input name="${f}" ${d.type ? `type="${d.type}" min="${d.min}" max="${d.max}" step="${d.step}" inputmode="decimal"` : 'maxlength="120"'} placeholder="${esc(d.ph || '')}">`}</label>`; }).join('')}</div>
    <button class="btn sm go" type="submit">Save</button></form>`;
}
// the filled-in form → the body for the route (empty fields left out)
export function askBody(form) { const b = {}; for (const el of form.querySelectorAll('[name]')) if (String(el.value).trim()) b[el.name] = el.value.trim(); return b; }
export const askCss = '.fitask{display:grid;gap:6px;margin:6px 0 0;padding:8px 10px;border:1px dashed rgba(20,20,22,.22);border-radius:10px;background:#fff}.fitask p{margin:0;font-size:12.5px;line-height:1.4}.fitaskf{display:flex;flex-wrap:wrap;gap:6px}.fitaskf label{display:grid;gap:2px;font-size:11px;color:#5b5e66;flex:1 1 120px}.fitaskf input,.fitaskf select{border:1px solid rgba(20,20,22,.18);border-radius:8px;padding:6px 8px;font:inherit;font-size:13px;min-height:34px;background:#fff;color:#141416}.fitask .btn{justify-self:start}';
