// The cut-and-sew proof: every library garment and bag drafted, laid on its cloth, and sewn together on paper, as one page.
// For each piece: the block (front, back, sleeve, legs…) with the two sides of every seam drawn in the same colour and numbered; the seams
// walked against each other and the made garment measured against its spec (src/lab-pattern-check.js); then every piece laid on the cutting
// table at the cloth's width, with the yardage and how much of the cloth is used. A strip of sizes says which sizes pass the same check.
// No AI and no picture: the same page every run.
//
//   node scripts/pattern-proof.mjs [--size M] [--style tee,pants] [--only id,…] [--out dir]   → <out>/pattern-proof.html (and proof.json)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FLAT_TEMPLATES } from '../src/lab-flat-templates.js';
import { BAG_TEMPLATES } from '../src/lab-bag-templates.js';
import { defaultParams, fitToTemplate, measurementsFor, STYLES, SIZES } from '../src/lab-flats.js';
import { garmentPattern, bagPattern, plushPattern } from '../src/lab-pattern.js';
import { PLUSH_PRESETS } from '../src/lab-plush-parts.js';
import { constructionCheck } from '../src/lab-pattern-check.js';
import { proofCard, proofPage, proveSizes } from '../src/lab-pattern-proof.js';

const arg = (k, d = '') => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1] || d; };
const list = v => (v ? String(v).split(',').map(s => s.trim()).filter(Boolean) : []);
const SIZE = arg('size', 'M'), STY = list(arg('style')), ONLY = list(arg('only')), OUT = arg('out', 'pattern-proof');

const cards = [], json = []; let gN = 0, gOk = 0, sN = 0, sOk = 0, seamsN = 0, measN = 0;
const KINDS = ['top', 'bottom', 'cap', 'beanie', 'tote'];
const T = [...FLAT_TEMPLATES, ...Object.keys(STYLES).filter(k => ['cap', 'beanie', 'tote'].includes(STYLES[k].kind) && !FLAT_TEMPLATES.some(t => t.style === k)).map(k => ({ id: k, style: k, label: STYLES[k].label, template: null }))]
  .filter(t => KINDS.includes(STYLES[t.style]?.kind) && (!STY.length || STY.includes(t.style)) && (!ONLY.length || ONLY.includes(t.id)));
for (const t of T) {
  const one = STYLES[t.style].oneSize, p = t.template === null ? defaultParams(t.style) : fitToTemplate({ ...defaultParams(t.style), template: t.id }), pat = garmentPattern(p, one ? 'One size' : SIZE); if (!pat) continue;
  const c = constructionCheck(pat, { m: measurementsFor(p, one ? 'M' : SIZE), style: t.style, edges: true });
  const sizes = one ? [] : proveSizes(z => garmentPattern(p, z), z => measurementsFor(p, z), t.style, SIZES); sN += sizes.length; sOk += sizes.filter(z => z.ok).length;
  gN++; if (c.ok) gOk++; seamsN += c.seams.filter(s => s.ok !== null).length; measN += c.meas.filter(s => s.ok !== null).length;
  const kd = STYLES[t.style].kind; cards.push({ order: kd === 'top' ? 0 : kd === 'bottom' ? 1 : 2, html: proofCard({ id: t.id, label: t.label, style: STYLES[t.style]?.label || t.style, kind: ['cap', 'beanie', 'tote'].includes(kd) ? 'acc' : kd, pat, c, sizes, size: one ? 'One size' : SIZE }) });
  json.push({ id: t.id, style: t.style, ok: c.ok, passed: c.passed, made: c.made, sizes: sizes.map(z => [z.size, z.ok]), yards: c.table.map(q => [q.fabric, q.yards, q.efficiency]) });
}
let bN = 0, bOk = 0;
if (!STY.length || STY.includes('bag')) for (const t of BAG_TEMPLATES) { if (ONLY.length && !ONLY.includes(t.id)) continue;
  const [w, h, d] = String(t.size).match(/[\d.]+/g).map(Number), pat = bagPattern({ type: t.type, w, h, d }), c = constructionCheck(pat, { edges: true });
  bN++; if (c.ok) bOk++; seamsN += c.seams.filter(s => s.ok !== null).length; measN += c.meas.filter(s => s.ok !== null).length;
  cards.push({ order: 3, html: proofCard({ id: t.id, label: t.label, style: `Bag · ${t.size}`, kind: 'bag', pat, c, sizes: [] }) });
  json.push({ id: t.id, style: 'bag', ok: c.ok, passed: c.passed, made: c.made, yards: c.table.map(q => [q.fabric, q.yards, q.efficiency]) });
}
// plush built from parts: each of the library's plush to start from, at 12 in
let pN = 0, pOk = 0;
if (!STY.length || STY.includes('plush')) for (const [id, pr] of Object.entries(PLUSH_PRESETS)) { if (ONLY.length && !ONLY.includes(id)) continue;
  const pat = plushPattern({ shape: 'build', height: 12, build: pr.build }), c = constructionCheck(pat); pN++; if (c.ok) pOk++; seamsN += c.seams.filter(s => s.ok !== null).length; measN += c.meas.filter(s => s.ok !== null).length;
  cards.push({ order: 4, html: proofCard({ id: 'plush-' + id, label: pr.name, style: `Plush built from parts · ${pat.size}`, kind: 'plush', pat, c, sizes: [] }) });
  json.push({ id: 'plush-' + id, style: 'plush', ok: c.ok, passed: c.passed, made: c.made, yards: c.table.map(q => [q.fabric, q.yards, q.efficiency]) }); }
cards.sort((a, b) => a.order - b.order);

const html = proofPage({ title: 'Cut and Sew Proof', lede: `Every garment and bag in the sketch library, drafted at size ${SIZE}, checked by measurement: the two sides of every seam walked against each other (collars, stands and hoods against the neckline), the finished piece measured against its spec, every component its features call for present, and every piece laid on its cloth. No pictures are judged and no AI is used. Each strip of sizes shows the same check run from XS to XXL.`,
  totals: [[`${gOk}/${gN}`, `garments pass at ${SIZE}`], [`${sOk}/${sN}`, 'garment sizes pass'], [`${bOk}/${bN}`, 'bags pass'], [`${pOk}/${pN}`, 'plush pass'], [seamsN.toLocaleString(), 'seams walked'], [measN.toLocaleString(), 'measurements checked']],
  how: `<div class="how"><div><b>Seams.</b> Two edges sewn together must be the same length within ⅛ in, or eased within the range a factory sews: a sleeve cap ¼ to 1½ in into its armhole, a rib stretched 8 to 22% onto a neckline.</div><div><b>Measurements.</b> Taken off the pieces as sewn (chest 1 in below the armhole, length from the high point of the shoulder, rise and inseam along their seams) against the spec in <code>docs/measurement-sources.md</code>, within factory tolerances.</div><div><b>Cutting table.</b> Every piece cut, pairs turned over, laid at the cloth's width (58 in unless the material says otherwise) with the grain line, the yardage and how much of the cloth is used.</div></div>`, cards: cards.map(x => x.html), filters: true });
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'pattern-proof.html'), html);
writeFileSync(join(OUT, 'proof.json'), JSON.stringify({ size: SIZE, garments: [gOk, gN], sizes: [sOk, sN], bags: [bOk, bN], seams: seamsN, measurements: measN, items: json }, null, 1));
console.log(`garments ${gOk}/${gN} at ${SIZE} · sizes ${sOk}/${sN} · bags ${bOk}/${bN} · plush ${pOk}/${pN} · ${seamsN} seams, ${measN} measurements → ${join(OUT, 'pattern-proof.html')} (${Math.round(html.length / 1024)} KB)`);
// exits non-zero when anything does not pass, so a run can gate a release
if (gOk < gN || sOk < sN || bOk < bN || pOk < pN) process.exitCode = 1;
