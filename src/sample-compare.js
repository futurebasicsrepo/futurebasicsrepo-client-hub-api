// The physical sample held up against the approved design: photographs of the sample go to the vision model next to the pack's own pictures
// (the hero or the flats, the artwork placements in inches, the colourways with their Pantones, the construction lines), and what comes
// back is a list of differences a person can act on: placement off, wrong thread colour, wash too dark, a detail missing. The findings can
// be turned into corrections on the sample review, which the next version carries to the factory.
import { callJson, CHECK_MODEL } from './check.js';
import { dataUrlToImageBlock } from './ai.js';

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
export const FINDING_KINDS = ['placement', 'colour', 'wash', 'construction', 'measurement', 'material', 'artwork', 'label', 'other'];
export const SAMPLE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['score', 'verdict', 'summary', 'findings'],
  properties: {
    score: { type: 'integer', description: '0-100: how closely the sample matches the approved design' },
    verdict: { type: 'string', enum: ['matches', 'close', 'differs', 'cannot-judge'] },
    summary: { type: 'string', description: 'Two sentences for the person who reviews the sample: what is right and what is not' },
    findings: { type: 'array', maxItems: 12, items: { type: 'object', additionalProperties: false, required: ['area', 'kind', 'severity', 'what', 'expected', 'found'],
      properties: { area: { type: 'string', description: 'where on the garment, e.g. left chest, hem, neck rib' }, kind: { type: 'string', enum: FINDING_KINDS }, severity: { type: 'string', enum: ['ok', 'minor', 'major'] },
        what: { type: 'string', description: 'the difference in one line, with a number when one can be read, e.g. "logo sits about 1 in lower than the spec"' }, expected: { type: 'string', description: 'what the design says' }, found: { type: 'string', description: 'what the sample shows' } } } }
  }
};
const SYSTEM = `You are a garment technologist checking a physical sample against the approved design before it is accepted. You are given the approved design (its pictures and its written spec) and photographs of the sample a factory made.
List every difference a person should act on: artwork or logo placement (estimate inches from the visible seams and the spec's own numbers), colour and wash (too dark, too light, wrong shade, thread colour), construction (a seam, stitch, rib, pocket or closure that differs or is missing), labels and tags, material and surface, proportions you can read from the photo. Say "ok" findings only for the things that plainly match and matter. Be specific and measured: numbers where you can read them, and the words "appears" or "about" where you are reading a photo. If the photos do not show enough, say so in the summary and keep the score honest.`;

const designPictures = pack => {
  const hero = (pack.renderings || []).map(r => r.image).filter(Boolean).slice(0, 1);
  const front = (pack.sketches || []).filter(s => s.image && !/photo|reference/i.test(s.label || '')).sort((a, b) => (a.view === 'front' ? -1 : 0) - (b.view === 'front' ? -1 : 0)).map(s => s.image);
  return [...hero, ...front].slice(0, 2);
};
export function designWords(pack) {
  const sk = Object.fromEntries((pack.sketches || []).map(s => [s.id, s]));
  const art = (pack.artwork || []).flatMap(a => a.placements.map(p => `${a.name} on the ${sk[p.sketchId]?.view || 'front'}${p.widthIn ? ` ${p.widthIn} in wide` : ''}, at ${Math.round(p.x * 100)}% across and ${Math.round(p.y * 100)}% down the view${p.label ? ` (${p.label})` : ''}`));
  const cw = (pack.colorways || []).map(c => `${c.name}${c.code ? ` ${c.code}` : ''}${c.swatch ? ` ${c.swatch}` : ''}`);
  const con = (pack.construction || []).slice(0, 30).map(c => `${c.area}: ${c.detail}`);
  const labels = (pack.labels || []).slice(0, 10).map(l => `${l.item}: ${l.spec}${l.placement ? ` (${l.placement})` : ''}`);
  const bom = (pack.bom || []).filter(r => /fabric|main|body|rib/i.test(`${r.component} ${r.material}`)).slice(0, 6).map(r => `${r.component}: ${r.material}${r.spec ? `, ${r.spec}` : ''}${r.color ? `, ${r.color}` : ''}`);
  return [art.length ? `Artwork and logos: ${art.join('; ')}` : '', cw.length ? `Colourways: ${cw.join('; ')}` : '', bom.length ? `Materials: ${bom.join('; ')}` : '', con.length ? `Construction: ${con.join('; ')}` : '', labels.length ? `Labels: ${labels.join('; ')}` : ''].filter(Boolean).join('\n');
}
export function normalizeCompare(raw, model = '') {
  const r = raw && typeof raw === 'object' ? raw : {}, score = Math.max(0, Math.min(100, Math.round(Number(r.score) || 0)));
  const findings = (Array.isArray(r.findings) ? r.findings : []).slice(0, 12).map(f => ({ area: clip(f?.area, 80), kind: FINDING_KINDS.includes(f?.kind) ? f.kind : 'other', severity: ['ok', 'minor', 'major'].includes(f?.severity) ? f.severity : 'minor', what: clip(f?.what, 400), expected: clip(f?.expected, 300), found: clip(f?.found, 300) })).filter(f => f.what);
  return { at: new Date().toISOString(), model: clip(model, 80), score, verdict: ['matches', 'close', 'differs', 'cannot-judge'].includes(r.verdict) ? r.verdict : score >= 80 ? 'matches' : score >= 55 ? 'close' : 'differs', summary: clip(r.summary, 1200), findings };
}
const fixture = stage => ({ score: 68, verdict: 'close', summary: `Test fixture: the ${stage} is close to the design. The left chest logo appears about 1 in lower than the spec and the body reads darker than the colourway.`,
  findings: [{ area: 'left chest', kind: 'placement', severity: 'major', what: 'Logo sits about 1 in lower than the spec', expected: 'Logo centred 3.5 in below the HPS', found: 'Logo appears about 4.5 in below the HPS' }, { area: 'body', kind: 'wash', severity: 'minor', what: 'Wash reads darker than the colourway', expected: 'Washed black, slightly greyed', found: 'A flat, deeper black' }, { area: 'neck rib', kind: 'construction', severity: 'ok', what: 'Neck rib as drawn', expected: '2x2 rib, 1 in finished', found: 'Matches' }] });

// → the comparison for sampling row `stage`, from the sample photos (data URLs) and the pack
export async function compareSampleToDesign({ pack, stage = 'Sample', photos = [], env = process.env }) {
  const pics = designPictures(pack), words = designWords(pack);
  if (!photos.length) return normalizeCompare({ score: 0, verdict: 'cannot-judge', summary: 'There is no photograph of the sample to compare yet.', findings: [] }, 'none');
  if (env.AI_FIXTURE) return normalizeCompare(fixture(stage), 'fixture');
  if (!env.ANTHROPIC_API_KEY) throw Object.assign(new Error('The vision model is not connected (no Anthropic key), so the sample cannot be compared'), { status: 503 });
  const content = [{ type: 'text', text: `(A) The approved design${pics.length ? ':' : ' has no picture; use the written spec.'}` }];
  for (const url of pics) { const b = dataUrlToImageBlock(url); if (b) content.push(b); }
  content.push({ type: 'text', text: `(B) The written spec:\n${words || '(none)'}` });
  content.push({ type: 'text', text: `(C) Photographs of the ${stage} the factory made:` });
  for (const url of photos.slice(0, 4)) { const b = dataUrlToImageBlock(url); if (b) content.push(b); }
  const { obj, model } = await callJson(SYSTEM, content, { model: CHECK_MODEL(), schema: SAMPLE_SCHEMA });
  return normalizeCompare(obj, model);
}
// what a reviewer adopts: the findings that are not "ok", as corrections for the factory
export const findingsToCorrections = findings => (findings || []).filter(f => f.severity !== 'ok').map(f => ({ area: f.area, change: `${f.what}${f.expected ? ` (spec: ${f.expected}${f.found ? `; sample: ${f.found}` : ''})` : ''}`.slice(0, 600) }));
