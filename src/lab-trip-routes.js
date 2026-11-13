// The flats and the picture in real use (the page is src/lab-trip.html at /lab/trip, staff only): what each picture drawn from the flats left
// out, what a Draw it again put back, what a picture read into flats got wrong (taken off the flats by hand), and a real miss as a test case.
//   GET /v1/lab/trip/stats?days=30     the counts by detail and by garment, the latest misses, and the ratchet (src/lab-trip-baseline.json)
//   GET /v1/lab/trip/cases/:id         one concept's flats, what was missed on it and its picture, as a test case for test/fixtures/trip-cases
//                                      (no concept name and no client: the garment, its flats and its picture)
// The events are recorded by src/lab-flats-routes.js through recordCheck, recordRead and recordCorrection; a failure to record never stops the
// work it records. No AI calls here: the counts are what the app already checked.
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { STYLES, templateOf } from './lab-flats.js';
import { flatDetails, tripStats, readRemoved } from './lab-trip.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uid = v => UUID.test(String(v || '')) ? String(v) : null;
export const tripBaseline = () => { try { return JSON.parse(readFileSync(new URL('./lab-trip-baseline.json', import.meta.url), 'utf8')); } catch { return null; } };
const quiet = (log, what) => e => log?.warn?.({ err: e.message }, `trip ${what} not recorded`);

// a picture drawn from the flats, checked: what it kept, left out and could not tell, and what a Draw it again insisted on
export function recordCheck(pool, { conceptId, params, check, insist = [], by = null, log = null }) {
  if (!check) return Promise.resolve();
  return pool.query(`insert into lab_trip_events(concept_id, kind, style, template, kept, missing, unsure, insist, labels, created_by) values($1,'check',$2,$3,$4,$5,$6,$7,$8,$9)`,
    [conceptId, params?.style || null, params?.template || null, check.kept || [], check.missing || [], check.unsure || [], insist, JSON.stringify(check.labels || {}), uid(by)]).catch(quiet(log, 'check'));
}
// a picture read into flats: what the read put on them (once per picture: ref is the picture's hash)
export function recordRead(pool, { conceptId, ref, params, details = [], log = null }) {
  if (!ref) return Promise.resolve();
  return pool.query(`insert into lab_trip_events(concept_id, kind, ref, style, template, labels, details) values($1,'read',$2,$3,$4,$5,$6)
    on conflict (concept_id, kind, ref) where kind in ('read', 'correction') do nothing`,
  [conceptId, ref, params?.style || null, params?.template || null, JSON.stringify(Object.fromEntries(details.map(d => [d.key, d.label]))), JSON.stringify(details)]).catch(quiet(log, 'read'));
}
// the flats saved after a read: what of the read was taken off by hand, kept as one row per read (the latest save says it)
export async function recordCorrection(pool, { conceptId, params, by = null, log = null }) {
  try {
    const r = (await pool.query(`select ref, style, details from lab_trip_events where concept_id=$1 and kind='read' order by created_at desc limit 1`, [conceptId])).rows[0]; if (!r) return;
    const read = Array.isArray(r.details) ? r.details : [], removed = readRemoved(read, flatDetails(params), { readStyle: r.style, savedStyle: params?.style });
    if (!removed.length) { await pool.query(`delete from lab_trip_events where concept_id=$1 and kind='correction' and ref=$2`, [conceptId, r.ref]); return; }
    const labels = Object.fromEntries(removed.map(k => [k, k === 'kind' ? `Garment type: read as ${STYLES[r.style]?.label.toLowerCase() || r.style}, made a ${STYLES[params.style]?.label.toLowerCase() || params.style}` : read.find(d => d.key === k)?.label || k]));
    await pool.query(`insert into lab_trip_events(concept_id, kind, ref, style, template, missing, labels, created_by) values($1,'correction',$2,$3,$4,$5,$6,$7)
      on conflict (concept_id, kind, ref) where kind in ('read', 'correction') do update set missing=excluded.missing, labels=excluded.labels, style=excluded.style, template=excluded.template, created_by=excluded.created_by, created_at=now()`,
    [conceptId, r.ref, params?.style || null, params?.template || null, removed, JSON.stringify(labels), uid(by)]);
  } catch (e) { quiet(log, 'correction')(e); }
}

export function registerLabTripRoutes(app, { pool, authenticate, adminOnly }) {
  const pre = [authenticate, adminOnly], bad = (reply, error, code = 422) => reply.code(code).send({ error });
  const styleLabel = s => STYLES[s]?.label || s || 'Unknown';

  app.get('/v1/lab/trip/stats', { preHandler: pre }, async req => {
    const days = [7, 30, 90, 365].includes(Number(req.query?.days)) ? Number(req.query.days) : 30;
    const rows = (await pool.query(`select e.kind, e.concept_id, e.style, e.template, e.kept, e.missing, e.unsure, e.insist, e.labels, e.details, e.created_at, c.name concept
      from lab_trip_events e left join lab_concepts c on c.id=e.concept_id where e.created_at > now() - make_interval(days => $1) order by e.created_at desc limit 5000`, [days])).rows;
    const s = tripStats(rows);
    const recent = rows.filter(r => r.kind !== 'read' && r.missing.length).slice(0, 20).map(r => ({ kind: r.kind, conceptId: r.concept_id, concept: r.concept || 'A deleted concept', style: styleLabel(r.style),
      sketch: templateOf({ style: r.style, template: r.template })?.label || '', at: r.created_at, missing: r.missing.map(k => r.labels?.[k] || k), redo: r.insist.length > 0 }));
    return { days, ...s, styles: s.styles.map(x => ({ ...x, label: styleLabel(x.style) })), recent, baseline: tripBaseline() };
  });

  app.get('/v1/lab/trip/cases/:id', { preHandler: pre }, async (req, reply) => {
    const id = uid(req.params.id); if (!id) return bad(reply, 'Not found', 404);
    const c = (await pool.query(`select c.image, c.image_note, f.params, f.placements from lab_concepts c join lab_flats f on f.concept_id=c.id where c.id=$1`, [id])).rows[0];
    if (!c) return bad(reply, 'Save the flats first: a case is the flats and what was missed on them', 404);
    const ev = (await pool.query(`select kind, kept, missing, insist, labels from lab_trip_events where concept_id=$1 and kind in ('check','correction') order by created_at desc limit 20`, [id])).rows;
    const check = ev.find(e => e.kind === 'check'), corr = ev.find(e => e.kind === 'correction'), pick = (e, keys) => Object.fromEntries(keys.map(k => [k, e.labels?.[k] || k]));
    // the drawn views and hand markup are pictures kept in the app, not in the case: the case is the flats as built
    const { drawn, markup, ...flat } = c.params || {};
    const picture = c.image ? `data:image/jpeg;base64,${(await sharp(c.image).resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 78 }).toBuffer()).toString('base64')}` : null;
    const slug = `${flat.style}-${id.slice(0, 8)}`;
    const body = { id: slug, source: 'real use', saved: new Date().toISOString().slice(0, 10), style: flat.style, template: flat.template || null, flat, placements: c.placements || [],
      missed: check ? { keys: check.missing, labels: pick(check, check.missing), redo: check.insist } : null,
      readRemoved: corr ? { keys: corr.missing, labels: pick(corr, corr.missing) } : null,
      picture, pictureFrom: c.image ? (c.image_note === 'Drawn from the flats' ? 'flats' : 'concept') : null };
    return reply.header('content-disposition', `attachment; filename="${slug}.json"`).header('cache-control', 'no-store').type('application/json').send(JSON.stringify(body, null, 2));
  });
}
