// A sample, reviewed: each point of measure taken off the sample against the spec and its tolerance, the corrections asked for, and the verdict.
// Turning a review into the next version: measurements the team accepts become the spec (the size run shifts with them), the corrections become
// construction lines the factory reads in "what changed", and the next sample is asked for. Shared by the tech pack page (as /sample-review.js,
// globalThis.FBSample) and the service, so neither needs the DOM nor Node.
(function (root) {
  const num = v => { const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, '')); return String(v ?? '').trim() !== '' && Number.isFinite(n) ? n : null; };
  const tolOf = t => { const n = num(String(t || '').replace(/[±+]/g, '')); return n == null ? 0.5 : Math.abs(n); };
  const sampleSizeOf = pack => { const s = pack.sizes || []; return s.includes(pack.style?.sampleSize) ? pack.style.sampleSize : s.includes('M') ? 'M' : s[Math.floor((s.length - 1) / 2)] || ''; };
  const r2 = v => Math.round(v * 100) / 100;

  // → [{ code, name, spec, measured, diff, tolerance, out }] for the review of sampling row i
  function check(pack, i) {
    const row = (pack.sampling || [])[i], m = row?.review?.measured || {}, size = sampleSizeOf(pack);
    return (pack.pom || []).map(r => { const spec = num(r.values?.[size]), got = num(m[r.code]), tol = tolOf(r.tolerance), diff = spec != null && got != null ? r2(got - spec) : null;
      return { code: r.code, name: r.name, spec, measured: got, diff, tolerance: tol, out: diff != null && Math.abs(diff) > tol + 1e-9 }; });
  }

  // → a new pack: the review of sampling row i applied
  function apply(pack, i) {
    const out = JSON.parse(JSON.stringify(pack)), row = out.sampling?.[i]; if (!row) return out;
    const rv = row.review || {}, size = sampleSizeOf(out), adopt = new Set(rv.adopt || []);
    for (const r of out.pom || []) {
      if (!adopt.has(r.code)) continue; const got = num(rv.measured?.[r.code]), spec = num(r.values?.[size]); if (got == null) continue;
      const d = spec == null ? 0 : got - spec;
      r.values = Object.fromEntries(Object.entries(r.values || {}).map(([s, v]) => [s, s === size ? String(got) : num(v) == null ? v : String(r2(num(v) + d))]));
    }
    const tag = `Correction · ${row.stage}`;
    out.construction = [...(out.construction || []).filter(c => !String(c.area).startsWith(tag)), ...(rv.corrections || []).filter(c => c.change).map(c => ({ area: `${tag}${c.area ? `: ${c.area}` : ''}`.slice(0, 120), detail: String(c.change).slice(0, 600) }))];
    const measuredOut = check(out, i).filter(x => x.out && !adopt.has(x.code)).map(x => `${x.code} ${x.name}: ${x.measured} against ${x.spec} (±${x.tolerance})`);
    if (measuredOut.length) out.construction.push({ area: `${tag}: measurements to correct`, detail: measuredOut.join('; ').slice(0, 600) });
    row.status = rv.verdict === 'approved' ? 'approved' : 'revise';
    if (rv.verdict !== 'approved') {
      const why = `Corrections from the ${row.stage} review${rv.at ? ` (${rv.at})` : ''}`, next = out.sampling.findIndex((r, j) => j > i && r.status === 'planned');
      if (next >= 0) { out.sampling[next].status = 'requested'; out.sampling[next].notes = [why, out.sampling[next].notes].filter(Boolean).join('. ').slice(0, 400); }
      else if (out.sampling.length < 12 && !out.sampling.some(r => r.stage === `${row.stage} (corrected)`)) out.sampling.splice(i + 1, 0, { stage: `${row.stage} (corrected)`.slice(0, 60), qty: row.qty, due: '', status: 'requested', notes: why.slice(0, 400), tracking: '', review: null });
    }
    return out;
  }
  // ---- time and action: when each sample is due, what is late ----
  // the usual days each step takes after the one before (the proto from the day the pack goes out; a corrected sample from its review)
  const LEADS = { 'Proto sample': 14, 'Fit sample': 12, 'Pre-production sample': 14, 'Top of production': 7 };
  const leadOf = stage => { const s = String(stage || ''); for (const k of Object.keys(LEADS)) if (s.startsWith(k)) return /corrected/i.test(s) ? Math.round(LEADS[k] * .7) : LEADS[k]; return 10; };
  const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const dayDiff = (a, b) => Math.round((new Date(a + 'T00:00:00Z') - new Date(b + 'T00:00:00Z')) / 86400000);
  // → a new pack: every sample without a date is dated in order from `start` (the day the pack goes to the factory); dated ones are kept unless `all`
  function planDates(pack, start, { all = false } = {}) {
    const out = JSON.parse(JSON.stringify(pack)); let last = start;
    for (const r of out.sampling || []) { if (all || !r.due) r.due = addDays(last, leadOf(r.stage)); last = r.due; }
    return out;
  }
  // → [{ stage, due, status, sentAt, reviewedAt, state: 'done'|'late'|'soon'|'on-track'|'undated', daysLate, daysLeft }] plus a bulk row when an ETA is given
  function calendar(pack, { today = new Date().toISOString().slice(0, 10), bulkEta = null, bulkStatus = '' } = {}) {
    const rows = (pack.sampling || []).map(r => {
      const rv = r.review || null, done = r.status === 'approved' || (rv && rv.verdict) || r.status === 'revise';
      const late = !done && r.due && dayDiff(today, r.due) > 0, left = r.due ? dayDiff(r.due, today) : null;
      return { stage: r.stage, due: r.due || '', status: r.status, sentAt: r.sentAt || '', reviewedAt: rv?.at || '', state: done ? 'done' : late ? 'late' : !r.due ? 'undated' : left <= 7 ? 'soon' : 'on-track', daysLate: late ? dayDiff(today, r.due) : 0, daysLeft: !done && r.due ? left : null };
    });
    if (bulkEta) { const late = !['complete', 'delivered'].includes(bulkStatus) && dayDiff(today, bulkEta) > 0; rows.push({ stage: 'Bulk delivery', due: bulkEta, status: bulkStatus || 'planned', sentAt: '', reviewedAt: '', state: ['complete', 'delivered'].includes(bulkStatus) ? 'done' : late ? 'late' : dayDiff(bulkEta, today) <= 7 ? 'soon' : 'on-track', daysLate: late ? dayDiff(today, bulkEta) : 0, daysLeft: dayDiff(bulkEta, today), bulk: true }); }
    return rows;
  }
  root.FBSample = { check, apply, sampleSizeOf, tolOf, planDates, calendar, LEADS, leadOf };
})(typeof globalThis !== 'undefined' ? globalThis : this);
