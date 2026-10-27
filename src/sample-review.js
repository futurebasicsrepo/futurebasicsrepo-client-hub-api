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
  root.FBSample = { check, apply, sampleSizeOf, tolOf };
})(typeof globalThis !== 'undefined' ? globalThis : this);
