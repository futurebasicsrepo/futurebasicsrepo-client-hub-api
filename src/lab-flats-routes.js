// Design Lab flats and placement (the page is src/lab-flats.html at /lab/flats; the drawing is src/lab-flats.js, shared with the page):
//   GET  /v1/lab/concepts/:id/flats             the piece as flats: saved, or worked out from the concept (style, fit, where its logo and graphics go)
//   PUT  /v1/lab/concepts/:id/flats             save {style, fit, m, options, placements} and check it
//   POST /v1/lab/concepts/:id/flats/check       check without saving
//   GET  /v1/lab/concepts/:id/flats/sheet.svg   the spec sheet: front and back flats, every placement measured, points of measure graded, the check
//   POST /v1/lab/concepts/:id/flats/tech-pack   put the flats and the spec sheet on the concept's tech pack
// The check ("can it be made"): every placement is on the piece and clear of seams, ribs, zips, pockets and collars (the drawing alone); within the
// technique's size; and its artwork, at the size it is placed, holds the technique's finest line, needs no more inks than the technique is priced for,
// has no smooth shading a screen cannot print, and, for embroidery, how many stitches it takes.
import sharp from 'sharp';
import { logoSvg } from './brand-kit.js';
import { cleanRules } from './lab-library.js';
import { ensureBranding } from './lab-concepts.js';
import { STYLES, FITS, SIZES, detectStyle, defaultParams, defaultPlacement, cleanFlat, placementChecks, overlapChecks, boxesMeet, describe, renderSvg, pomTable, measurementsFor, fmt, fmtCm } from './lab-flats.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// the logo's way of being made, in the words the concept uses, → the technique family it belongs to
const LOGO_BASE = { embroidered: 'embroidery', 'woven patch': 'woven jacquard', 'screen print': 'screen print', 'rubber print': 'rubber print', 'heat transfer': 'heat transfer', debossed: 'debossed', 'metal plaque': 'debossed' };
const PREFERRED = { embroidery: 'satin-embroidery', 'screen print': 'plastisol', 'puff print': 'puff-print', 'heat transfer': 'glossy-transfer', 'woven jacquard': 'woven-patch', 'chenille patch': 'chenille', 'rubber print': 'rubber-patch', debossed: 'deboss' };

// ---- the artwork, measured at the size it is placed ----
// opening (erode then dilate) with a square of side 2r+1: what disappears is finer than about 2r+1 pixels
function opened(mask, W, H, r) {
  const run = (src, horiz, keepIf) => { const out = new Uint8Array(W * H), n = horiz ? W : H, m = horiz ? H : W;
    for (let j = 0; j < m; j++) { const pre = new Int32Array(n + 1); for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + src[horiz ? j * W + i : i * W + j];
      for (let i = 0; i < n; i++) { const a = Math.max(0, i - r), b = Math.min(n - 1, i + r), s = pre[b + 1] - pre[a]; out[horiz ? j * W + i : i * W + j] = keepIf(s, b - a + 1, i - r < 0 || i + r > n - 1) ? 1 : 0; } }
    return out; };
  const erode = s => run(run(s, true, (sum, len, edge) => sum === len && !edge), false, (sum, len, edge) => sum === len && !edge);
  const dilate = s => run(run(s, true, sum => sum > 0), false, sum => sum > 0);
  return dilate(erode(mask));
}
export async function artInfo(buf, wIn, hIn, rules) {
  const mmPerPx = Math.max(.2, (wIn * 25.4) / 900), W = Math.max(8, Math.round(wIn * 25.4 / mmPerPx)), H = Math.max(8, Math.round(hIn * 25.4 / mmPerPx));
  const { data } = await sharp(buf).ensureAlpha().resize(W, H, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(W * H), bins = new Map(); let ink = 0;
  for (let i = 0; i < W * H; i++) if (data[i * 4 + 3] > 127) { mask[i] = 1; ink++; const k = (data[i * 4] >> 4) << 8 | (data[i * 4 + 1] >> 4) << 4 | (data[i * 4 + 2] >> 4); bins.set(k, (bins.get(k) || 0) + 1); }
  if (!ink) return { coverage: 0, inks: 0, gradient: false, fine: 0, holds: null, mmPerPx };
  const shares = [...bins.values()].map(n => n / ink).sort((a, b) => b - a), inks = shares.filter(s => s >= .02).length;
  // smooth shading: flat inks change only at their edges, a gradient or a photo changes a little almost everywhere (compared a few pixels apart)
  let soft = 0, pairs = 0; const st = 3;
  for (let y = 0; y < H; y += 2) for (let x = 0; x + st < W; x += 2) { const i = y * W + x, j = i + st; if (!mask[i] || !mask[j]) continue; pairs++; const dd = Math.max(Math.abs(data[i * 4] - data[j * 4]), Math.abs(data[i * 4 + 1] - data[j * 4 + 1]), Math.abs(data[i * 4 + 2] - data[j * 4 + 2])); if (dd >= 2 && dd <= 40) soft++; }
  const gradient = pairs > 50 && soft / pairs > .3;
  const lostAt = r => { const o = opened(mask, W, H, r); let lost = 0; for (let i = 0; i < W * H; i++) if (mask[i] && !o[i]) lost++; return lost / ink; };
  const need = Math.max(1, Math.round(rules.minLineMm / 2 / mmPerPx)), fine = lostAt(need);
  let holds = null; // the finest line the artwork keeps at this size, in mm
  if (fine > .03) { for (let r = need - 1; r >= 1; r--) if (lostAt(r) <= .03) { holds = (2 * r + 1) * mmPerPx; break; } if (holds == null) holds = mmPerPx; }
  return { coverage: ink / (W * H), inks, gradient, fine, holds, mmPerPx };
}
const pct = x => `${Math.round(x * 100)}%`;
function artFindings(q, info, rules, tech) {
  const out = [], name = q.name, emb = tech.base === 'embroidery';
  if (info.fine > .03) {
    const scale = info.holds ? rules.minLineMm / info.holds : 2, bigger = Math.min(q.w * scale, rules.maxW);
    out.push({ level: info.fine > .15 ? 'fail' : 'warn', code: 'FINE_DETAIL', text: `About ${pct(info.fine)} of ${name} is finer than ${rules.minLineMm} mm at ${fmt(q.w)} wide, so it will ${emb ? 'not hold stitches' : 'fill in or break up'}. ${bigger > q.w * 1.05 && bigger <= rules.maxW ? `Make it at least ${fmt(bigger)} wide, ` : ''}thicken the thin lines, or choose a technique that holds finer detail${emb ? ' (a woven patch or a print)' : ' (a heat transfer)'}.` });
  }
  if (rules.maxColors && info.inks > rules.maxColors) out.push({ level: 'warn', code: 'INKS', text: `${name} has about ${info.inks} ${emb ? 'thread' : 'ink'} colours; ${tech.name} is usually priced for up to ${rules.maxColors}. Each extra ${emb ? 'thread is another change' : 'ink is another screen'} and costs more.` });
  if (info.gradient && tech.base === 'screen print' && tech.finish?.effect !== 'halftone') out.push({ level: 'warn', code: 'GRADIENT', text: `${name} has smooth shading or many tones. A screen prints flat colours, so it needs halftone dots (the Halftone print technique) or a heat transfer.` });
  if (emb) { const st = Math.round(info.coverage * q.w * q.h * (rules.density || 1800) / 100) * 100; out.push({ level: st > 30000 ? 'warn' : 'info', code: 'STITCHES', text: `About ${st.toLocaleString('en-US')} stitches${st > 30000 ? ': heavy and stiff on a garment. Lower the fill or the size.' : '.'}` }); }
  if (q.w < .75 || q.h < .3) out.push({ level: 'warn', code: 'TINY', text: `${name} is very small (${fmt(q.w)} × ${fmt(q.h)}). Check it reads at that size.` });
  return out;
}

export function registerLabFlatsRoutes(app, d) {
  const { pool, authenticate, adminOnly, attachArtwork, log = console } = d;
  const pre = [authenticate, adminOnly], bad = (reply, error, code = 422, extra = {}) => reply.code(code).send({ error, ...extra });
  const actorOf = req => (UUID.test(String(req.auth?.sub || '')) ? req.auth.sub : null);
  const concept = async id => (UUID.test(String(id)) ? (await pool.query('select id, name, category, status, spec, twist, product_id from lab_concepts where id=$1', [id])).rows[0] : null);
  const techniques = async () => (await pool.query('select id, key, kind, name, base, finish, rules from lab_techniques where not archived order by builtin desc, name')).rows.map(t => ({ ...t, rules: cleanRules(t.rules || {}, t.base) }));
  const techFor = (list, q) => list.find(t => t.id === q.techniqueId) || list.find(t => t.key === PREFERRED[q.technique]) || list.find(t => t.base === q.technique) || list.find(t => t.key === 'plastisol') || { name: q.technique || 'screen print', base: q.technique || 'screen print', rules: cleanRules({}, q.technique) };
  const marks = new Map();
  const markPng = async mark => { if (!marks.has(mark)) marks.set(mark, await sharp(Buffer.from(logoSvg(mark))).resize({ width: 1200 }).png().toBuffer()); return marks.get(mark); };
  const pngOf = async q => q.art ? (await pool.query('select png from lab_art where id=$1', [q.art])).rows[0]?.png || null : q.mark ? markPng(q.mark) : null;
  const aspectOf = async q => { const b = await pngOf(q); if (!b) return 1; const m = await sharp(b).metadata(); return (m.width || 1) / (m.height || 1); };

  // where the piece starts: its style, fit and details from its words, and its logo and graphics where the concept said they go
  async function initial(c) {
    const det = detectStyle(c); if (!det) return null;
    const params = defaultParams(det.style, det.fit, det.options), spec = ensureBranding(c.spec || {}, c.category), placements = [], list = await techniques();
    const logo = spec.branding?.logo || {};
    if (logo.mark && logo.mark !== 'none') { const mark = logo.mark === 'cue' ? 'mark' : logo.mark, base = LOGO_BASE[logo.technique] || 'embroidery', aspect = await aspectOf({ mark }); const t = techFor(list, { technique: base });
      placements.push({ id: 'logo', name: 'Future Basics logo', source: 'logo', mark, technique: base, techniqueId: t.id, ...defaultPlacement('logo', params, { aspect, label: logo.placement || '' }) }); }
    for (const [i, g] of (spec.graphics || []).entries()) { if (!g.art) continue; const aspect = await aspectOf({ art: g.art }), t = techFor(list, { techniqueId: g.finish?.id, technique: g.technique });
      placements.push({ id: 'g' + i, name: g.name || `Graphic ${i + 1}`, source: 'graphic', art: g.art, technique: t.base, techniqueId: t.id, ...defaultPlacement('graphic', params, { aspect, label: g.placement || '' }) }); }
    // a logo that would sit on a graphic goes to the back neck instead
    const lg = placements.find(q => q.source === 'logo');
    if (lg && placements.some(q => q !== lg && boxesMeet(lg, q))) Object.assign(lg, defaultPlacement('logo', params, { aspect: lg.w / lg.h, label: 'back neck' }));
    return { ...params, placements };
  }
  // the check: { findings: {placementId: [..]}, summary: {fail, warn}, at }
  async function check(params, placements) {
    const list = await techniques(), findings = {}, over = overlapChecks(placements); let fail = 0, warn = 0;
    for (const q of placements) {
      const t = techFor(list, q), rules = { ...t.rules, techniqueName: t.name }, f = [...placementChecks(q, params, rules), ...(over[q.id] || [])];
      try { const b = await pngOf(q); if (b) f.push(...artFindings(q, await artInfo(b, q.w, q.h, rules), rules, t)); } catch (e) { log.warn?.({ err: e.message }, 'flats artwork check failed'); }
      findings[q.id] = f; fail += f.filter(x => x.level === 'fail').length; warn += f.filter(x => x.level === 'warn').length;
    }
    return { findings, summary: { fail, warn, placements: placements.length }, at: new Date().toISOString() };
  }
  const shape = (c, row, extra = {}) => ({ concept: { id: c.id, name: c.name, category: c.category, status: c.status, productId: c.product_id, locked: c.status === 'tech_pack' && !c.product_id }, ...extra,
    styles: Object.fromEntries(Object.entries(STYLES).map(([k, v]) => [k, { label: v.label, kind: v.kind, oneSize: Boolean(v.oneSize) }])), fits: FITS, sizes: SIZES, flat: row });

  app.get('/v1/lab/concepts/:id/flats', { preHandler: pre }, async (req, reply) => {
    const c = await concept(req.params.id); if (!c) return bad(reply, 'Not found', 404);
    const r = (await pool.query('select style, params, placements, check_result, checked_at, updated_at from lab_flats where concept_id=$1', [c.id])).rows[0];
    const list = (await techniques()).map(t => ({ id: t.id, name: t.name, kind: t.kind, base: t.base, rules: t.rules }));
    if (r) return shape(c, { ...r.params, placements: r.placements, check: r.check_result, saved: true, updatedAt: r.updated_at }, { techniques: list });
    const init = await initial(c);
    if (!init) return shape(c, null, { techniques: list, unsupported: `Flats are not drawn for ${c.category} yet. They cover tops, hoodies, sweatshirts, jackets, pants, shorts, caps, beanies and totes.` });
    return shape(c, { ...init, check: await check(init, init.placements), saved: false }, { techniques: list });
  });
  const take = async (req, reply) => {
    const c = await concept(req.params.id); if (!c) return bad(reply, 'Not found', 404), null;
    const { params, placements, error } = cleanFlat(req.body || {}); if (error) return bad(reply, error), null;
    for (const q of placements) if (q.art && !(await pool.query('select 1 from lab_art where id=$1', [q.art])).rowCount) return bad(reply, `${q.name}: that graphic is not in the library`, 422), null;
    return { c, params, placements };
  };
  app.post('/v1/lab/concepts/:id/flats/check', { preHandler: pre }, async (req, reply) => { const t = await take(req, reply); if (!t) return; const ck = await check(t.params, t.placements); return { check: ck, where: Object.fromEntries(t.placements.map(q => [q.id, describe(q, t.params)])) }; });
  app.put('/v1/lab/concepts/:id/flats', { preHandler: pre }, async (req, reply) => {
    const t = await take(req, reply); if (!t) return;
    if (t.c.status === 'tech_pack' && !t.c.product_id) return bad(reply, 'This concept is already a tech pack', 409);
    const ck = await check(t.params, t.placements);
    await pool.query(`insert into lab_flats(concept_id, style, params, placements, check_result, checked_at, updated_by) values($1,$2,$3,$4,$5,now(),$6)
      on conflict(concept_id) do update set style=excluded.style, params=excluded.params, placements=excluded.placements, check_result=excluded.check_result, checked_at=now(), updated_by=excluded.updated_by, updated_at=now()`,
    [t.c.id, t.params.style, t.params, JSON.stringify(t.placements), ck, actorOf(req)]);
    return { ok: true, check: ck, where: Object.fromEntries(t.placements.map(q => [q.id, describe(q, t.params)])) };
  });

  // ---- the spec sheet ----
  async function sheet(c, { size } = {}) {
    const r = (await pool.query('select params, placements, check_result from lab_flats where concept_id=$1', [c.id])).rows[0]; if (!r) return null;
    const p = { ...r.params, size: SIZES.includes(size) ? size : r.params.size || 'M' }, pl = r.placements, list = await techniques(), hrefs = {};
    for (const q of pl) { const b = await pngOf(q); if (b) hrefs[q.id] = `data:image/png;base64,${(await sharp(b).resize({ width: 600, height: 600, fit: 'inside', withoutEnlargement: true }).png().toBuffer()).toString('base64')}`; }
    const ck = r.check_result || { findings: {}, summary: { fail: 0, warn: 0 } };
    const views = STYLES[p.style].kind === 'cap' || STYLES[p.style].kind === 'top' || STYLES[p.style].kind === 'bottom' ? ['front', 'back'] : ['front'];
    const svgs = views.map(v => renderSvg(p, v, { placements: pl, hrefs, findings: ck.findings, showPom: true, scale: 0 }));
    // one page, 17 × 11 in at 100 units an inch: the flats across the top, the placements and the measurements under them
    const W = 1700, T = (x, y, s, t, o = {}) => `<text x="${x}" y="${y}" font-size="${s}" font-family="Space Grotesk, Helvetica, Arial, sans-serif" font-weight="${o.w || 400}" fill="${o.c || '#141416'}"${o.a ? ` text-anchor="${o.a}"` : ''}>${esc(t)}</text>`;
    const colW = (W - 120) / svgs.length; let y = 150;
    let body = svgs.map((s, i) => s.replace('<svg ', `<svg x="${60 + i * colW}" y="120" width="${colW - 20}" height="520" preserveAspectRatio="xMidYMid meet" `)).join('');
    y = 680; body += T(60, y, 20, 'Placements', { w: 600 }); y += 12;
    const lv = q => (ck.findings[q.id] || []).some(f => f.level === 'fail') ? ['Cannot be made as drawn', '#a02a20'] : (ck.findings[q.id] || []).some(f => f.level === 'warn') ? ['Check', '#8a5a00'] : ['Ready', '#17603a'];
    pl.forEach((q, i) => { const t = techFor(list, q); y += 30; body += T(60, y, 14, `${i + 1}. ${q.name}`, { w: 600 }) + T(360, y, 14, `${t.name} · ${fmtCm(q.w)} × ${fmtCm(q.h)}`) + T(1640, y, 13, lv(q)[0], { a: 'end', c: lv(q)[1], w: 600 }); y += 20; body += T(76, y, 13, `${q.view === 'back' ? 'Back' : 'Front'}: ${describe(q, p)}`, { c: '#45454c' }); });
    if (!pl.length) { y += 30; body += T(60, y, 14, 'Nothing placed on this piece.', { c: '#727278' }); }
    const pom = pomTable(p), cols = pom[0].values.map(v => v.size), cx = 1040; let py = 680;
    body += T(cx, py, 20, `Points of measure (inches) · sample size ${STYLES[p.style].oneSize ? 'one size' : 'M'}`, { w: 600 }); py += 30;
    body += T(cx, py, 12, 'Point', { w: 600, c: '#727278' }) + cols.map((s, i) => T(cx + 330 + i * 52, py, 12, s, { w: 600, c: s === 'M' ? '#141416' : '#727278', a: 'end' })).join('') + T(cx + 330 + cols.length * 52 + 20, py, 12, 'Tol ±', { w: 600, c: '#727278', a: 'end' });
    for (const row of pom) { py += 22; body += T(cx, py, 12, `${row.code} ${row.name}`.slice(0, 48)) + row.values.map((v, i) => T(cx + 330 + i * 52, py, 12, String(v.value), { a: 'end', w: v.size === 'M' ? 600 : 400 })).join('') + T(cx + 330 + cols.length * 52 + 20, py, 12, String(row.tolerance), { a: 'end', c: '#727278' }); }
    const head = `${T(60, 62, 30, c.name, { w: 600 })}${T(60, 92, 15, `${STYLES[p.style].label} · ${FITS[p.fit] || p.fit} fit · Future Basics Design Lab · ${new Date().toISOString().slice(0, 10)}`, { c: '#727278' })}${T(1640, 62, 15, ck.summary.fail ? `${ck.summary.fail} problem${ck.summary.fail === 1 ? '' : 's'} to fix before it can be made` : ck.summary.warn ? `${ck.summary.warn} thing${ck.summary.warn === 1 ? '' : 's'} to check` : 'Ready to make', { a: 'end', w: 600, c: ck.summary.fail ? '#a02a20' : ck.summary.warn ? '#8a5a00' : '#17603a' })}`;
    const H = Math.max(y, py) + 60;
    return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#ffffff"/><rect x="0" y="0" width="${W}" height="6" fill="#4bff9a"/>${head}${body}</svg>`, p, pl, hrefs, svgs, views };
  }
  app.get('/v1/lab/concepts/:id/flats/sheet.svg', { preHandler: pre }, async (req, reply) => {
    const c = await concept(req.params.id); if (!c) return bad(reply, 'Not found', 404);
    const s = await sheet(c, { size: req.query?.size }); if (!s) return bad(reply, 'Save the flats first', 404);
    return reply.header('content-type', 'image/svg+xml; charset=utf-8').header('cache-control', 'private, no-cache').header('content-disposition', `inline; filename="${c.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-spec.svg"`).send(s.svg);
  });
  // the files that go on a tech pack: the spec sheet and each flat, as pictures
  async function files(c) {
    const s = await sheet(c); if (!s) return [];
    const png = async (svg, width) => `data:image/png;base64,${(await sharp(Buffer.from(svg), { density: 150 }).resize({ width }).flatten({ background: '#ffffff' }).png().toBuffer()).toString('base64')}`;
    const out = [{ name: 'Spec sheet · flats, placements and measurements', image: await png(s.svg, 2400) }];
    for (const v of s.views) out.push({ name: `Technical flat · ${v}`, image: await png(renderSvg(s.p, v, { placements: s.pl, hrefs: s.hrefs, scale: 60 }), 1800) });
    return out;
  }
  app.post('/v1/lab/concepts/:id/flats/tech-pack', { preHandler: pre }, async (req, reply) => {
    const c = await concept(req.params.id); if (!c) return bad(reply, 'Not found', 404);
    if (!c.product_id) return bad(reply, 'This concept has no tech pack yet. Approve it and send it to a tech pack first.', 409);
    if (!attachArtwork) return bad(reply, 'Files cannot be added to tech packs on this service', 501);
    const items = await files(c); if (!items.length) return bad(reply, 'Save the flats first', 409);
    const n = await attachArtwork(c.product_id, items);
    return { ok: true, files: n, productId: c.product_id };
  });
  return { files: async id => { const c = await concept(id); return c ? files(c) : []; } };
}
