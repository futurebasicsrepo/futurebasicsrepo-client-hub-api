// What the samples teach the pattern. Every sample that comes back is measured point by point against its spec (src/sample-review.js), and a
// fabric that keeps coming back the same way off the same pattern (a fleece that runs 3% short after its wash, a rib that grows across) is a
// fact about the fabric, not about one factory's day. Once two or more samples in a fabric agree, the Lab cuts the next pattern in that fabric
// to allow for it: longer along the grain, wider across it, so the made piece lands on its spec.
//
//   pomAxis(name)                      → 'length' | 'width' | null: which way a point of measure runs on the cloth (trims and ribs are skipped)
//   sampleError(pack, measured, size)  → { length, width }: one sample's error, as a fraction of its spec, with any allowance it was cut with taken out
//   learnAxis(values)                  → { n, mean, agree, ok, cut }: what a run of samples says about one direction
//   allowanceFor(groups, fabric, style) → { length, width, n, scope, fabric, measured } | null: what to cut this pattern with (counts and
//                                        percentages only: the samples behind it may be other rooms' products, so none is named)
//   allowPattern(pat, allowance)       → the pattern with its main-fabric pieces scaled along and across their grain
//   allowanceWords / allowanceOfPack   the construction line the tech pack carries, and reading it back off a reviewed pack
//   learnedGroups(pool)                every finished sample review, grouped by fabric (and by fabric and style), cached for a few minutes
//
// The pattern's construction check (src/lab-pattern-check.js) runs on the pattern as drafted, before the allowance: the spec and its tolerances
// never move. What moves is only what is cut, and the tech pack says so.

export const LEARN = {
  minSamples: 2,   // samples in a fabric before it is trusted
  minPct: .01,     // smaller than 1% is inside the noise of a tape measure
  capPct: .08,     // never more than 8% either way: past that, a sample is wrong, not the fabric
  agree: .75,      // three in four samples must run the same way
  outlier: .15,    // one point 15% off its spec is a mis-typed number or a mis-made sample, not shrinkage
  minSpec: 3,      // points under 3 in (a rib, a placket) are too short to read a percentage from
  ttlMs: 5 * 60 * 1000
};

const num = v => { const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, '')); return String(v ?? '').trim() !== '' && Number.isFinite(n) ? n : null; };
const r4 = v => Math.round(v * 1e4) / 1e4;
const key = s => String(s || '').trim().toLowerCase();

// which way a point of measure runs on the cloth. Trims (ribs, bands, collars, plackets, pockets, zips, cords, loops) have their own cloth or
// none, and a neck is shaped and finished by its rib, so they say nothing about the main fabric.
const SKIP = /\b(rib|cuff|band|collar|neck|placket|pocket|zip|zipper|drawcord|cord|loop|strap|label|logo|print|graphic|stitch|seam|pleat|dart|hood opening|tab|facing|binding|elastic)\b/i;
const LENGTH = /\b(length|inseam|outseam|rise|height|drop|hps|cb|cf)\b/i;
const WIDTH = /\b(chest|bust|waist|hip|hips|seat|sweep|hem|width|across|shoulder|shoulders|thigh|knee|opening|bicep|biceps|girth|circumference|armhole)\b/i;
export function pomAxis(name) {
  const t = String(name || ''); if (!t || SKIP.test(t)) return null;
  return LENGTH.test(t) ? 'length' : WIDTH.test(t) ? 'width' : null;
}

// the allowance a pack says its pattern was cut with (the line allowanceWords writes), as fractions: 0 when it has none
const ALLOW_AREA = /pattern allowance$/i;
export function allowanceOfPack(pack) {
  const row = (pack?.construction || []).find(r => ALLOW_AREA.test(String(r?.area || '')));
  const t = String(row?.detail || ''), out = { length: 0, width: 0 };
  const l = t.match(/(\d+(?:\.\d+)?)% (longer|shorter) along the grain/i), w = t.match(/(\d+(?:\.\d+)?)% (wider|narrower) across/i);
  if (l) out.length = (l[2].toLowerCase() === 'longer' ? 1 : -1) * Number(l[1]) / 100;
  if (w) out.width = (w[2].toLowerCase() === 'wider' ? 1 : -1) * Number(w[1]) / 100;
  return out;
}

// one sample's error in each direction, as a fraction of its spec: the mean over its points of measure that run that way. A sample cut with
// an allowance already in it is read back to what the fabric did: cut (1+a) longer and made (1+e) of spec, the fabric moved (1+e)/(1+a).
export function sampleError(pack, measured, size) {
  const cut = allowanceOfPack(pack), sums = { length: [], width: [] }, adopted = new Set((pack?.sampling || []).flatMap(r => r?.review?.adopt || []));
  for (const r of pack?.pom || []) {
    const axis = pomAxis(r.name); if (!axis) continue;
    const spec = num(r.values?.[size]), got = num(measured?.[r.code]);
    if (spec == null || got == null || Math.abs(spec) < LEARN.minSpec) continue;
    if (measured.__fromPack && adopted.has(r.code)) continue; // its spec was overwritten with what was measured: nothing to read
    const e = got / spec - 1; if (Math.abs(e) > LEARN.outlier) continue;
    sums[axis].push((1 + e) / (1 + cut[axis]) - 1);
  }
  const mean = a => (a.length ? r4(a.reduce((s, v) => s + v, 0) / a.length) : null);
  return { length: mean(sums.length), width: mean(sums.width), points: sums.length.length + sums.width.length };
}

// what a run of samples says about one direction: how many, the mean error, how many of them ran the same way, and the allowance to cut
export function learnAxis(values) {
  const v = (values || []).filter(x => x != null && Number.isFinite(x)), n = v.length;
  if (!n) return { n: 0, mean: 0, agree: 0, ok: false, cut: 0 };
  const mean = v.reduce((s, x) => s + x, 0) / n, sign = Math.sign(mean), agree = v.filter(x => Math.sign(x) === sign).length / n;
  const ok = n >= LEARN.minSamples && Math.abs(mean) >= LEARN.minPct && agree >= LEARN.agree;
  const cut = ok ? Math.max(-LEARN.capPct, Math.min(LEARN.capPct, 1 / (1 + mean) - 1)) : 0;
  return { n, mean: r4(mean), agree: r4(agree), ok, cut: r4(cut) };
}

// the main fabric of a Lab concept, and of a tech pack: keyed by its library code where it has one, else its name
export function conceptFabric(c) {
  const m = (Array.isArray(c?.spec?.materials) ? c.spec.materials : []).find(x => x?.kind === 'fabric' && x.role === 'main' && !x.part);
  return m ? { key: key(m.code || m.name), name: String(m.name || m.code || '') } : null;
}
export function packFabric(pack) {
  const r = (pack?.bom || []).find(x => /^main fabric$/i.test(String(x?.component || '').trim())) || (pack?.bom || []).find(x => /\b(shell|body|self|main)\b/i.test(String(x?.component || '')) && x.material);
  if (r && (r.ref || r.material)) return { key: key(r.ref || r.material), name: String(r.material || r.ref) };
  const s = String(pack?.style?.fabricSummary || '').trim();
  return s ? { key: key(s), name: s } : null;
}

// what to cut a pattern with: the fabric and style's own samples first, else every sample in that fabric
export function allowanceFor(groups, fabric, style) {
  if (!groups || !fabric?.key) return null;
  for (const [scope, k] of [['style', `${fabric.key}|${style || ''}`], ['fabric', `${fabric.key}|`]]) {
    if (scope === 'style' && !style) continue;
    const g = groups.get(k); if (!g) continue;
    const L = learnAxis(g.samples.map(s => s.length)), W = learnAxis(g.samples.map(s => s.width));
    if (!L.ok && !W.ok) continue;
    return { length: L.cut, width: W.cut, n: g.samples.length, scope, fabric: g.name || fabric.name, style: scope === 'style' ? style : null,
      measured: { length: L.ok ? L.mean : 0, width: W.ok ? W.mean : 0 } }; // counts only: the samples may be other rooms' products
  }
  // nothing to act on yet: say how many samples there are, so the page can tell the designer what it is waiting for
  const g = groups.get(`${fabric.key}|`);
  return g ? { length: 0, width: 0, n: g.samples.length, scope: 'waiting', fabric: g.name || fabric.name, style: null, measured: { length: 0, width: 0 } } : null;
}

// the cut pattern: every piece in the main fabric scaled about its own middle, along its grain by the length allowance and across it by the
// width allowance. Its outline, notches, grain line and marks move together; seam allowances stay as they are (they are added round the
// scaled line). Linings, ribs, trims and components are other cloth, or none: they are left alone. A piece edited by hand on the Pattern page
// was drawn on the cut pattern, so it is cut as drawn.
const MAIN = new Set(['self', 'main']);
export function allowPattern(pat, a) {
  if (!pat || !a || (!a.length && !a.width) || pat.kind !== 'garment') return pat;
  const pieces = pat.pieces.map(q => {
    if (!MAIN.has(q.fabric || 'self') || q.component || q.edited || q.added || !Array.isArray(q.sew) || q.sew.length < 3) return q; // a piece edited by hand is cut as it was drawn
    const xs = q.sew.map(p => p[0]), ys = q.sew.map(p => p[1]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const g = Array.isArray(q.grain) && q.grain.length === 2 ? [q.grain[1][0] - q.grain[0][0], q.grain[1][1] - q.grain[0][1]] : [0, 1];
    const gl = Math.hypot(g[0], g[1]) || 1, ux = g[0] / gl, uy = g[1] / gl, vx = -uy, vy = ux, kl = 1 + a.length, kw = 1 + a.width;
    const mv = p => { if (!Array.isArray(p) || p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return p;
      const dx = p[0] - cx, dy = p[1] - cy, s = (dx * ux + dy * uy) * kl, t = (dx * vx + dy * vy) * kw;
      return [r4(cx + s * ux + t * vx), r4(cy + s * uy + t * vy), ...p.slice(2)]; };
    const pts = list => (Array.isArray(list) ? list.map(mv) : list);
    return { ...q, sew: pts(q.sew), notches: pts(q.notches), grain: pts(q.grain), ...(q.shown ? { shown: pts(q.shown) } : {}), marks: pts(q.marks), allowance: { length: a.length, width: a.width } };
  });
  return { ...pat, pieces, allowance: { length: a.length, width: a.width, n: a.n, fabric: a.fabric, scope: a.scope } };
}

const pct = v => `${(Math.abs(v) * 100).toFixed(1)}%`;
// the line the tech pack carries (and allowanceOfPack reads back when the next sample is reviewed)
export function allowanceWords(a) {
  if (!a || (!a.length && !a.width)) return '';
  const cut = [a.length ? `${pct(a.length)} ${a.length > 0 ? 'longer' : 'shorter'} along the grain` : '', a.width ? `${pct(a.width)} ${a.width > 0 ? 'wider' : 'narrower'} across it` : ''].filter(Boolean).join(' and ');
  const ran = [a.measured?.length ? `${pct(a.measured.length)} ${a.measured.length < 0 ? 'short' : 'long'}` : '', a.measured?.width ? `${pct(a.measured.width)} ${a.measured.width < 0 ? 'narrow' : 'wide'}` : ''].filter(Boolean).join(' and ');
  return `Cut ${cut}, in the main fabric only. Learned from ${a.n} sample${a.n === 1 ? '' : 's'} in ${a.fabric || 'this fabric'}${a.scope === 'style' ? ' in this style' : ''}, which came back ${ran} of spec. Every measurement in this pack is the finished size.`;
}

// ---- the samples, from the database ----
let cache = null;
export const forgetLearned = () => { cache = null; };
const sampleSizeOf = pack => { const s = pack?.sizes || []; return s.includes(pack?.style?.sampleSize) ? pack.style.sampleSize : s.includes('M') ? 'M' : s[Math.floor((s.length - 1) / 2)] || ''; };

// every finished review (handed over or applied, from the sample form), and every review typed straight into a pack, each read against the
// pack version it was made to. → Map(`${fabricKey}|${style}` and `${fabricKey}|` → { name, samples: [{ length, width, product, stage }] })
export async function learnedGroups(pool, { now = Date.now() } = {}) {
  if (cache && now - cache.at < LEARN.ttlMs) return cache.groups;
  const groups = new Map(), add = (fab, style, s) => { for (const k of [`${fab.key}|${style || ''}`, ...(style ? [`${fab.key}|`] : [])]) { const g = groups.get(k) || { name: fab.name, samples: [] }; g.samples.push(s); groups.set(k, g); } };
  const q = async (sql, args = []) => (await pool.query(sql, args).catch(() => ({ rows: [] }))).rows;
  const styles = new Map((await q(`select lc.product_id, lf.params->>'style' style, lc.spec from lab_concepts lc join lab_flats lf on lf.concept_id=lc.id where lc.product_id is not null`)).map(r => [r.product_id, r]));
  const seen = new Set();
  const take = (pack, measured, size, productId, stage) => {
    const lab = styles.get(productId), fab = packFabric(pack) || conceptFabric(lab); if (!fab) return;
    const e = sampleError(pack, measured, size || sampleSizeOf(pack)); if (e.length == null && e.width == null) return;
    add(fab, lab?.style || '', { length: e.length, width: e.width, product: productId, stage });
  };
  const reviews = await q(`select sr.tech_pack_id, sr.product_id, sr.stage, sr.pack_version, sr.form, tp.data, tp.published_data, tp.version, tpv.data vdata
    from sample_reviews sr join tech_packs tp on tp.id=sr.tech_pack_id left join tech_pack_versions tpv on tpv.tech_pack_id=sr.tech_pack_id and tpv.version=sr.pack_version
    where sr.status in ('handed-over','applied') order by sr.updated_at`);
  for (const r of reviews) {
    const pack = r.vdata || (r.version === r.pack_version && r.published_data) || r.published_data || r.data; if (!pack) continue;
    seen.add(`${r.tech_pack_id}|${key(r.stage)}`);
    take(pack, r.form?.measured || {}, r.form?.sampleSize, r.product_id, r.stage);
  }
  for (const r of await q(`select id, product_id, data from tech_packs where jsonb_typeof(data->'sampling')='array' and jsonb_array_length(data->'sampling')>0`)) {
    for (const row of r.data?.sampling || []) {
      const m = row?.review?.measured; if (!m || typeof m !== 'object' || !Object.keys(m).length || !row.review.verdict) continue;
      if (seen.has(`${r.id}|${key(row.stage)}`)) continue;
      take(r.data, { ...m, __fromPack: true }, '', r.product_id, row.stage);
    }
  }
  cache = { at: now, groups };
  return groups;
}
