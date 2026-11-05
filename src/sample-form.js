// The sample corrections form: what a team fills in around the table at a sample review, made from the tech pack the sample was made to,
// and how it turns into the pack's next version.
//
// The form is built from the pack itself, so nothing is typed twice: every point of measure (at the sample size, with its tolerance), every callout
// pinned on the flats, every artwork placement, every material and trim, every colourway, every construction line and every label becomes a line
// to tick OK, Fix or Not on this sample. A "Fix" carries a note, how much it matters (must fix / should fix) and, if wanted, a photo. Anything
// the pack does not name is marked by tapping the flat: a pin with a note.
//
// Handing it over writes it into the pack as the sample's review (the shape src/sample-review.js reads), so the existing "Make the next version"
// path applies it: measurements the team accepts become the spec, every Fix and every pin becomes a correction line, pins become callouts on the
// flat the factory sees (in its own language once the pack is translated), and the next sample is asked for.
//
// Shared by the page (/sample-form.js, globalThis.FBSampleForm) and the service, so neither needs the DOM nor Node. It reads globalThis.FBSample.
(function (root) {
  const str = (v, n) => String(v ?? '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim().slice(0, n);
  const one = (v, n) => str(v, n).replace(/\s+/g, ' ');
  const IMAGE = /^data:image\/(png|jpeg|jpg|webp);base64,[a-z0-9+/=]+$/i;
  const img = (v, max) => (typeof v === 'string' && v.length <= max && IMAGE.test(v) ? v : '');
  const unit = v => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(1, Math.round(n * 10000) / 10000)) : null; };
  const slug = v => one(v, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const STATES = ['ok', 'fix', 'na'];
  const PRIORITIES = ['must', 'should'];
  // the verdict the room reaches; "approved with changes" is approved for production, with the fixes still written into the pack
  const VERDICTS = ['approved', 'approved-with-changes', 'revise', 'rejected'];
  const VERDICT_WORDS = { approved: 'Approved', 'approved-with-changes': 'Approved with changes', revise: 'Needs another sample', rejected: 'Rejected' };
  const LIMITS = { items: 400, note: 600, reviewers: 160, photos: 8, itemPhotos: 16, pins: 30, photoChars: 900_000 };
  const FIX_TAG = 'Fix · '; // the callouts a review adds to a flat: replaced, not stacked, when the same stage is applied again
  const LAST = 'Last sample’s corrections';

  // ---- the lines to check, read from the pack -------------------------------------------------------------------------------------------------
  // → [{ key, group, title, detail, sketchId?, x?, y? }] in the order the pack reads. Keys carry the position and a slug of the name, so a line
  // keeps its answer while the pack it was made from stays the same version (the form records that version).
  function checklist(pack) {
    const p = pack && typeof pack === 'object' ? pack : {}, out = [];
    const add = (key, group, title, detail, extra = {}) => { if (title) out.push({ key: key.slice(0, 80), group, title: one(title, 160), detail: one(detail, 300), ...extra }); };
    // what the last sample was asked to fix comes first: the first thing a room checks on a corrected sample is whether it was done
    (p.construction || []).forEach((r, i) => { if (/^Correction · /.test(r.area || '') && !/: Marked on the .* · pin \d+$/.test(r.area)) add(`r:${i}:${slug(r.area)}`, LAST, r.area.replace(/^Correction · /, ''), r.detail); });
    for (const s of p.sketches || []) for (const c of s.callouts || []) if (String(c.label || '').startsWith(FIX_TAG))
      add(`r:${s.id}:${c.n}`, LAST, `${c.n}. ${c.label.slice(FIX_TAG.length)} · on the ${s.view || 'flat'}`, [c.spec, c.note].filter(Boolean).join(' · '), { sketchId: s.id, view: s.view || '', x: c.x ?? null, y: c.y ?? null });
    for (const s of p.sketches || []) for (const c of s.callouts || []) {
      if (String(c.label || '').startsWith(FIX_TAG)) continue;
      add(`c:${s.id}:${c.n}`, 'Callouts', `${c.n}. ${c.label || 'Callout'}`, [c.spec, c.note].filter(Boolean).join(' · '), { sketchId: s.id, view: s.view || '', x: c.x ?? null, y: c.y ?? null });
    }
    (p.artwork || []).forEach((a, i) => {
      const inks = (a.pantones || []).map(x => x.code || x.name).filter(Boolean).join(', ');
      const places = a.placements || [];
      // a picture kept with the artwork for reference (a flat, a spec sheet) has no inks and no place on the garment: nothing to check on a sample
      if (!places.length && !inks) return;
      if (!places.length) add(`a:${i}:${slug(a.name)}`, 'Artwork', a.name || `Artwork ${i + 1}`, [a.note, inks && `Inks: ${inks}`].filter(Boolean).join(' · '));
      places.forEach((pl, j) => {
        const sk = (p.sketches || []).find(s => s.id === pl.sketchId);
        add(`a:${i}:${j}:${slug(a.name)}`, 'Artwork', `${a.name || `Artwork ${i + 1}`}${pl.label ? ` · ${pl.label}` : sk?.view ? ` · ${sk.view}` : ''}`, [pl.widthIn ? `${pl.widthIn} in wide` : '', inks && `Inks: ${inks}`, a.note].filter(Boolean).join(' · '), { sketchId: pl.sketchId, x: pl.x ?? null, y: pl.y ?? null });
      });
    });
    (p.bom || []).forEach((r, i) => add(`m:${i}:${slug(r.component || r.material)}`, 'Materials and trims', r.component || r.material, [r.component ? r.material : '', r.color, r.placement, r.spec].filter(Boolean).join(' · ')));
    (p.colorways || []).forEach((r, i) => add(`w:${i}:${slug(r.name)}`, 'Colourways', r.name, [r.code, r.notes].filter(Boolean).join(' · ')));
    (p.construction || []).forEach((r, i) => { if (!/^Correction · /.test(r.area || '')) add(`k:${i}:${slug(r.area)}`, 'Construction', r.area || `Construction ${i + 1}`, r.detail); });
    (p.labels || []).forEach((r, i) => add(`l:${i}:${slug(r.item)}`, 'Labels and trims', r.item, [r.spec, r.placement].filter(Boolean).join(' · ')));
    return out.slice(0, LIMITS.items);
  }
  const GROUPS = [LAST, 'Callouts', 'Artwork', 'Materials and trims', 'Colourways', 'Construction', 'Labels and trims'];

  // ---- the form, cleaned ----------------------------------------------------------------------------------------------------------------------
  function normalize(input, pack) {
    const f = input && typeof input === 'object' ? input : {}, keys = new Set(checklist(pack).map(x => x.key));
    const pomCodes = new Set((pack?.pom || []).map(r => r.code).filter(Boolean)), sizes = pack?.sizes || [];
    const measured = Object.fromEntries(Object.entries(f.measured && typeof f.measured === 'object' ? f.measured : {}).filter(([k, v]) => pomCodes.has(k) && one(v, 24)).map(([k, v]) => [k, one(v, 24)]));
    let photosLeft = LIMITS.itemPhotos;
    const items = {};
    for (const [k, v] of Object.entries(f.items && typeof f.items === 'object' ? f.items : {})) {
      if (!keys.has(k) || !v || !STATES.includes(v.s)) continue;
      const it = { s: v.s };
      if (v.s === 'fix') { it.note = str(v.note, LIMITS.note); it.priority = PRIORITIES.includes(v.priority) ? v.priority : 'must'; const ph = photosLeft > 0 ? img(v.photo, LIMITS.photoChars) : ''; if (ph) { it.photo = ph; photosLeft--; } }
      items[k] = it;
    }
    const sketchIds = new Set((pack?.sketches || []).map(s => s.id));
    const pins = (Array.isArray(f.pins) ? f.pins : []).map(p => ({ id: one(p?.id, 24) || Math.random().toString(36).slice(2, 10), sketchId: sketchIds.has(p?.sketchId) ? p.sketchId : '', x: unit(p?.x), y: unit(p?.y), note: str(p?.note, LIMITS.note), priority: PRIORITIES.includes(p?.priority) ? p.priority : 'must' }))
      .filter(p => p.sketchId && p.x != null && p.y != null).slice(0, LIMITS.pins);
    const photos = (Array.isArray(f.photos) ? f.photos : []).map(p => ({ image: img(p?.image, LIMITS.photoChars), label: one(p?.label, 80) })).filter(p => p.image).slice(0, LIMITS.photos);
    const adopt = [...new Set((Array.isArray(f.adopt) ? f.adopt : []).map(c => one(c, 8)))].filter(c => measured[c]);
    return {
      at: /^\d{4}-\d{2}-\d{2}$/.test(String(f.at || '')) ? f.at : '',
      reviewers: one(f.reviewers, LIMITS.reviewers),
      sampleSize: sizes.includes(f.sampleSize) ? f.sampleSize : '',
      measured, adopt, items, pins, photos,
      verdict: VERDICTS.includes(f.verdict) ? f.verdict : '',
      notes: str(f.notes, 2000)
    };
  }

  // the pack with its sample size set to the one the room measured, so the shared tolerance check (src/sample-review.js) reads the right column
  const sizedPack = (pack, form) => (form?.sampleSize && (pack.sizes || []).includes(form.sampleSize) ? { ...pack, style: { ...(pack.style || {}), sampleSize: form.sampleSize } } : pack);

  // ---- the measurements against the spec ------------------------------------------------------------------------------------------------------
  function measurements(pack, form) {
    const F = root.FBSample, p = sizedPack(pack, form), i = 0;
    const probe = { ...p, sampling: [{ stage: 'review', review: { measured: form?.measured || {} } }] };
    return F.check(probe, i).map(x => ({ ...x, adopted: (form?.adopt || []).includes(x.code) }));
  }

  // ---- where the review stands ----------------------------------------------------------------------------------------------------------------
  function summary(pack, form) {
    const list = checklist(pack), items = form?.items || {}, ms = measurements(pack, form);
    const count = s => list.filter(x => items[x.key]?.s === s).length;
    const fixes = corrections(pack, form);
    const out = ms.filter(m => m.out && !m.adopted).length, measured = ms.filter(m => m.measured != null).length;
    const checked = list.filter(x => items[x.key]).length;
    return {
      total: list.length, checked, ok: count('ok'), fix: count('fix'), na: count('na'), pins: (form?.pins || []).length,
      poms: ms.length, measured, out, adopted: ms.filter(m => m.adopted).length,
      must: fixes.filter(c => c.priority === 'must').length, should: fixes.filter(c => c.priority === 'should').length,
      verdict: form?.verdict || '', verdictWords: VERDICT_WORDS[form?.verdict] || 'No verdict yet',
      complete: checked === list.length && measured === ms.length && Boolean(form?.verdict)
    };
  }

  // ---- what has to change, in words the pack and the factory read -----------------------------------------------------------------------------
  // → [{ area, change, priority, ref }]: every Fix line, then every pin. Measurements are not here: src/sample-review.js writes those itself.
  function corrections(pack, form) {
    const list = checklist(pack), items = form?.items || {}, out = [];
    for (const x of list) {
      const it = items[x.key]; if (it?.s !== 'fix') continue;
      out.push({ area: one(`${x.group}: ${x.title}`, 120), change: it.note || (x.detail ? `Not to spec. The pack says: ${x.detail}` : 'Not to spec'), priority: it.priority || 'must', ref: x.key });
    }
    const views = new Map((pack?.sketches || []).map(s => [s.id, s.view || s.label || 'flat']));
    (form?.pins || []).forEach((p, k) => out.push({ area: one(`Marked on the ${views.get(p.sketchId) || 'flat'} · pin ${k + 1}`, 120), change: p.note || 'See the pin on the flat', priority: p.priority || 'must', ref: `pin:${p.id}` }));
    return out;
  }

  // ---- into the pack --------------------------------------------------------------------------------------------------------------------------
  // the review in the shape the pack keeps on a sample (src/techpack.js sampleReview): approved with changes counts as approved
  function toReview(pack, form, { by = '' } = {}) {
    const v = form?.verdict;
    return {
      verdict: v === 'approved' || v === 'approved-with-changes' ? 'approved' : v ? 'revise' : '',
      at: form?.at || '', by: one(form?.reviewers || by, 80),
      measured: { ...(form?.measured || {}) }, adopt: [...(form?.adopt || [])],
      corrections: corrections(pack, form).slice(0, 30).map(c => ({ area: c.area, change: one(`${c.priority === 'must' ? 'Must fix: ' : 'Should fix: '}${c.change}`, 600) })),
      photos: (form?.photos || []).slice(0, 4), compare: null
    };
  }

  // The draft's sample row for this stage, made if the pack does not list it yet. → its index
  function stageIndex(pack, stage) {
    pack.sampling = Array.isArray(pack.sampling) ? pack.sampling : [];
    let i = pack.sampling.findIndex(r => r.stage === stage);
    if (i < 0 && pack.sampling.length < 12) { pack.sampling.push({ stage: one(stage, 60), qty: '', due: '', status: 'received', notes: '', tracking: '', review: null }); i = pack.sampling.length - 1; }
    return i;
  }

  // Hand-over: the review sits on the draft's sample, ready for "Make the next version". → a new pack
  function handOver(draft, form, stage, opts = {}) {
    const out = JSON.parse(JSON.stringify(draft || {})), i = stageIndex(out, stage); if (i < 0) return out;
    if (form?.sampleSize && (out.sizes || []).includes(form.sampleSize)) out.style = { ...(out.style || {}), sampleSize: form.sampleSize };
    out.sampling[i].review = toReview(draft, form, opts);
    return out;
  }

  // Apply: the review written into the pack (measurements, corrections, the next sample, via src/sample-review.js), and every pin made a callout
  // on its flat so the factory sees where. The reviewed pack (the version the sample was made to) supplies the words; the draft takes the changes.
  function applyToPack(draft, reviewed, form, stage, opts = {}) {
    const F = root.FBSample, staged = handOver(draft, form, stage, opts), i = stageIndex(staged, stage);
    if (i < 0) return staged;
    // the correction lines are worded from the reviewed pack, so they read the same even if the draft has moved on since
    staged.sampling[i].review = toReview(reviewed || draft, form, opts);
    const out = F.apply(staged, i), tag = one(`${FIX_TAG}${stage}`, 80);
    for (const s of out.sketches || []) s.callouts = (s.callouts || []).filter(c => c.label !== tag);
    (form?.pins || []).forEach((p, k) => {
      const s = (out.sketches || []).find(x => x.id === p.sketchId); if (!s) return;
      if ((s.callouts || []).length >= 40) return;
      const n = Math.min(99, Math.max(0, ...(s.callouts || []).map(c => Number(c.n) || 0)) + 1);
      s.callouts = [...(s.callouts || []), { n, label: tag, spec: p.priority === 'should' ? 'Should fix' : 'Must fix', note: one(p.note || `Pin ${k + 1} from the ${stage} review`, 600), photo: '', x: p.x, y: p.y, hphoto: '', hx: null, hy: null }];
    });
    return out;
  }

  root.FBSampleForm = { checklist, normalize, measurements, summary, corrections, toReview, handOver, applyToPack, stageIndex, GROUPS, STATES, PRIORITIES, VERDICTS, VERDICT_WORDS, LIMITS, FIX_TAG };
})(globalThis);
