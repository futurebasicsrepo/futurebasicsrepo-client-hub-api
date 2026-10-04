// Inches are what a tech pack stores; Chinese and European factories read metric, so the page shows both:
// lengths in centimetres, tolerances in millimetres. Text that is not a plain number (ranges, words, already metric) shows no conversion.
// Served at /tp-units.js and read by techpack.html through window.FBTP_UNITS.
(function () {
  const trim1 = n => { const r = Math.round(n * 10) / 10; return Number.isInteger(r) ? String(r) : r.toFixed(1); };
  const UNIT = '\\s*(?:in|inch|inches|")?$';
  const RE = [
    [new RegExp('^(\\d+)[\\s-]+(\\d+)\\/(\\d+)' + UNIT, 'i'), m => (+m[3] ? +m[1] + +m[2] / +m[3] : null)], // 10 1/2, 10-1/2
    [new RegExp('^(\\d+)\\/(\\d+)' + UNIT, 'i'), m => (+m[2] ? +m[1] / +m[2] : null)],                         // 1/8
    [new RegExp('^(\\d*\\.?\\d+)' + UNIT, 'i'), m => +m[1]]                                                    // 10.5, .5, 0.5 in
  ];
  // "10.5", "10 1/2", "1/8", "±0.125", "+/-0.25", "0.5 in" → inches; anything else → null
  function parseIn(x) {
    if (x == null) return null;
    const t = String(x).trim().replace(/^(\+\/-|±|\+|-|–)\s*/, '');
    for (const [re, f] of RE) { const m = re.exec(t); if (m) { const n = f(m); return n == null || !Number.isFinite(n) ? null : n; } }
    return null;
  }
  // kind 'len' → "26.7 cm"; kind 'tol' → "±3.2 mm" (the ± is kept when the source had one)
  function metricOf(x, kind) {
    const n = parseIn(x);
    if (n == null || !(n > 0)) return '';
    return kind === 'tol' ? (/^\s*(±|\+)/.test(String(x)) ? '±' : '') + trim1(n * 25.4) + ' mm' : trim1(n * 2.54) + ' cm';
  }
  // a stored inch number shown as both: 12" / 30.5 cm
  const inch = v => (v == null || v === '' ? '—' : Math.round(Number(v) * 100) / 100 + '" / ' + trim1(Number(v) * 2.54) + ' cm');
  window.FBTP_UNITS = { parseIn, metricOf, inch, trim1 };
})();
