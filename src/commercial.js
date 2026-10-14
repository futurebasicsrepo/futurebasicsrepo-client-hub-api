// The commercial facts a product needs to be sold, as data: SKU and barcode for every size and colour, price, weight, packed size, HS code, country of origin.
// One plain script that both the server (src/techpack.js) and the page (/commercial.js) read, so the editor, the checks, the diff and the Shopify export agree.
// Two audiences, two views: the retail price is the client's business and never goes to a factory; everything else (SKU, barcode, weight, HS code, origin) is what a
// factory prints on a label and a carton, so it does.
(function (root) {
  const COUNTRIES = { CN: 'China', VN: 'Vietnam', BD: 'Bangladesh', IN: 'India', ID: 'Indonesia', TR: 'Turkey', PT: 'Portugal', MX: 'Mexico', US: 'United States', KH: 'Cambodia', PK: 'Pakistan', LK: 'Sri Lanka', TH: 'Thailand', MY: 'Malaysia', IT: 'Italy', ES: 'Spain', PL: 'Poland', MA: 'Morocco', EG: 'Egypt', JP: 'Japan', KR: 'South Korea', TW: 'Taiwan', HK: 'Hong Kong', PH: 'Philippines', MM: 'Myanmar', ET: 'Ethiopia', HN: 'Honduras', GT: 'Guatemala', SV: 'El Salvador', CA: 'Canada', GB: 'United Kingdom', DE: 'Germany', FR: 'France', RO: 'Romania', BG: 'Bulgaria', TN: 'Tunisia', JO: 'Jordan', NP: 'Nepal', AU: 'Australia' };
  const ALIASES = { prc: 'CN', 'peoples republic of china': 'CN', 'people\'s republic of china': 'CN', 'viet nam': 'VN', usa: 'US', 'united states of america': 'US', america: 'US', uk: 'GB', 'great britain': 'GB', england: 'GB', turkiye: 'TR', 'türkiye': 'TR', korea: 'KR', 'south korea': 'KR', 'republic of korea': 'KR', 'hong kong sar': 'HK' };
  const norm = v => String(v || '').toLowerCase().replace(/^made in\s+/, '').replace(/[.]/g, '').replace(/\s+/g, ' ').trim();
  // "Made in Vietnam", "vietnam", "VN" → "VN"; '' when it is not a country we can name.
  function countryCode(text) {
    const t = norm(text); if (!t) return '';
    if (/^[a-z]{2}$/.test(t)) return COUNTRIES[t.toUpperCase()] ? t.toUpperCase() : '';
    if (ALIASES[t]) return ALIASES[t];
    for (const [code, name] of Object.entries(COUNTRIES)) if (norm(name) === t) return code;
    return '';
  }
  const slug = (v, n) => String(v || '').normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '').toUpperCase().slice(0, n);
  const num = (v, { max = 1e9, dp = 2 } = {}) => { if (v == null || v === '') return ''; const t = String(v).replace(/[^0-9.\-]/g, ''); if (!/\d/.test(t)) return ''; const n = Number(t); return Number.isFinite(n) && n >= 0 && n <= max ? String(Math.round(n * 10 ** dp) / 10 ** dp) : ''; };
  const digits = (v, min, max) => { const d = String(v || '').replace(/[^0-9]/g, ''); return d.length >= min && d.length <= max ? d : ''; };
  // a GTIN is 8, 12, 13 or 14 digits and its last digit checks the others
  function gtinOk(v) {
    const d = String(v || '').replace(/\D/g, ''); if (![8, 12, 13, 14].includes(d.length)) return false;
    let sum = 0; for (let i = 0; i < d.length - 1; i++) sum += Number(d[d.length - 2 - i]) * (i % 2 === 0 ? 3 : 1);
    return (10 - (sum % 10)) % 10 === Number(d[d.length - 1]);
  }
  // 6 to 10 digits, dots allowed: 6104.43 or 6104.43.2000
  const hsCode = v => { const d = String(v || '').replace(/[^0-9]/g, ''); return d.length >= 6 && d.length <= 10 ? d.replace(/^(\d{4})(\d{2})(\d{0,4})$/, (m, a, b, c) => (c ? `${a}.${b}.${c}` : `${a}.${b}`)) : ''; };

  // What it costs to make one unit, in the pack's currency. Unit costs on the materials live on the bill of materials (bom[].cost); these are the rest.
  // Not a quote: the client's own arithmetic, replaced by a factory quote when there is one. It never goes to a factory.
  const emptyCost = () => ({ labour: '', decoration: '', packaging: '', freight: '', dutyPct: '', wastePct: '', breaks: [] });
  function normalizeCost(c) {
    const x = c && typeof c === 'object' ? c : {};
    return { labour: num(x.labour, { max: 1e6 }), decoration: num(x.decoration, { max: 1e6 }), packaging: num(x.packaging, { max: 1e6 }), freight: num(x.freight, { max: 1e6 }), dutyPct: num(x.dutyPct, { max: 100, dp: 1 }), wastePct: num(x.wastePct, { max: 100, dp: 1 }),
      breaks: (Array.isArray(x.breaks) ? x.breaks : []).slice(0, 6).map(b => ({ qty: digits(b && b.qty, 1, 7), pctOff: num(b && b.pctOff, { max: 90, dp: 1 }) })).filter(b => b.qty && Number(b.qty) > 0).sort((a, b) => Number(a.qty) - Number(b.qty)) };
  }
  const empty = () => ({ currency: 'USD', retailPrice: '', compareAtPrice: '', skuPrefix: '', weightGrams: '', lengthCm: '', widthCm: '', heightCm: '', hsCode: '', cost: emptyCost(), variants: [] });

  // a pack's commercial block, cleaned. Prices and measurements are numbers kept as text (as the rest of the pack does); a bad barcode is dropped, not guessed.
  function normalize(input, limit = 200) {
    const c = input && typeof input === 'object' ? input : {}, base = empty();
    const cur = String(c.currency || 'USD').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
    const seen = new Set();
    const variants = (Array.isArray(c.variants) ? c.variants : []).slice(0, limit).map(v => ({
      size: String(v && v.size || '').slice(0, 12), colour: String(v && v.colour || '').slice(0, 80), sku: String(v && v.sku || '').toUpperCase().replace(/[^A-Z0-9\-_.]/g, '').slice(0, 40),
      barcode: gtinOk(v && v.barcode) ? String(v.barcode).replace(/\D/g, '') : '', price: num(v && v.price)
    })).filter(v => v.size || v.colour || v.sku).filter(v => { const k = `${v.size}|${v.colour}`.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    return { ...base, currency: cur.length === 3 ? cur : 'USD', retailPrice: num(c.retailPrice), compareAtPrice: num(c.compareAtPrice), skuPrefix: slug(c.skuPrefix, 12), weightGrams: num(c.weightGrams, { max: 1e6, dp: 1 }),
      lengthCm: num(c.lengthCm, { max: 1000, dp: 1 }), widthCm: num(c.widthCm, { max: 1000, dp: 1 }), heightCm: num(c.heightCm, { max: 1000, dp: 1 }), hsCode: hsCode(c.hsCode), cost: normalizeCost(c.cost), variants };
  }

  // One row for every size and colour in the pack. A row the team has already filled in keeps its SKU, barcode and price; a size or colour that has gone loses its row.
  // sizes: ['S','M'], colours: ['Grey','Volt'] (empty means one colour), styleNumber/name give the SKU prefix when none is set.
  function syncVariants(pack) {
    const p = pack || {}, c = normalize(p.commercial), sizes = (p.sizes || []).filter(Boolean), colours = (p.colorways || []).map(x => x.name).filter(Boolean);
    const prefix = c.skuPrefix || slug(p.style && p.style.styleNumber, 12) || slug(p.style && p.style.styleName, 8) || 'SKU';
    const have = new Map(c.variants.map(v => [`${v.size}|${v.colour}`.toLowerCase(), v])), used = new Set(c.variants.map(v => v.sku).filter(Boolean)), out = [];
    const codes = new Map(); for (const name of colours) { let code = slug(name, 3) || 'CLR', i = 2; while ([...codes.values()].includes(code)) code = slug(name, 2) + i++; codes.set(name, code); }
    for (const colour of (colours.length ? colours : [''])) for (const size of (sizes.length ? sizes : [''])) {
      const key = `${size}|${colour}`.toLowerCase(), old = have.get(key);
      if (old && old.sku) { out.push(old); continue; }
      if (old) { let sku = [prefix, codes.get(colour), slug(size, 6)].filter(Boolean).join('-'), n = 2; const base = sku; while (used.has(sku)) sku = `${base}-${n++}`; used.add(sku); out.push({ ...old, sku }); continue; } // a row with its SKU blanked gets one back
      let sku = [prefix, codes.get(colour), slug(size, 6)].filter(Boolean).join('-'), n = 2; const base = sku; while (used.has(sku)) sku = `${base}-${n++}`; used.add(sku);
      out.push({ size, colour, sku, barcode: '', price: '' });
    }
    return out;
  }

  // What is not there yet for a sale, in the words a person would use. Not required to publish: each gap is a field Shopify and the carton label will want.
  function missing(pack) {
    const p = pack || {}, c = normalize(p.commercial), out = [];
    if (!c.retailPrice) out.push('Retail price');
    if (!c.weightGrams) out.push('Weight of one unit');
    if (!c.hsCode) out.push('HS code (for customs)');
    if (!countryCode(p.care && p.care.countryOfOrigin)) out.push('Country of origin as a country (Style → Care)');
    const vs = c.variants;
    if (!vs.length) out.push('A SKU for every size and colour'); else if (vs.some(v => !v.sku)) out.push('A SKU on every size and colour');
    return out;
  }

  // The view a factory gets: everything but what the client charges and what it costs them.
  function forFactory(c) { const x = normalize(c); return { ...x, retailPrice: '', compareAtPrice: '', cost: emptyCost(), variants: x.variants.map(v => ({ ...v, price: '' })) }; }

  // One unit, added up. Materials are quantity x unit cost on each bill-of-materials line (a line with a cost and no quantity counts once); waste is a percentage on the
  // materials; duty is a percentage of what the goods cost before freight; freight is per unit. A quantity break takes a percentage off the goods at that order size.
  // Lines with no cost are counted, never guessed. Money is rounded to cents at the end.
  const f = v => { const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : null; };
  const r2 = n => Math.round(n * 100) / 100;
  function costSummary(pack) {
    const p = pack || {}, c = normalize(p.commercial), k = c.cost, bom = Array.isArray(p.bom) ? p.bom : [];
    let materials = 0, priced = 0, unpriced = 0;
    const lines = bom.map(r => {
      const u = f(r && r.cost), q = f(r && r.qty);
      if (u == null) { if (r && (r.component || r.material)) unpriced++; return null; }
      priced++; const line = (q == null ? 1 : q) * u; materials += line; return r2(line);
    });
    const waste = materials * (f(k.wastePct) || 0) / 100, labour = f(k.labour) || 0, decoration = f(k.decoration) || 0, packaging = f(k.packaging) || 0, freight = f(k.freight) || 0, dutyPct = f(k.dutyPct) || 0;
    const goods = materials + waste + labour + decoration + packaging, duty = goods * dutyPct / 100, landed = goods + duty + freight, retail = f(c.retailPrice);
    const marginOf = l => (retail && retail > 0 ? Math.round(((retail - l) / retail) * 1000) / 10 : null);
    const hasAny = priced > 0 || labour > 0 || decoration > 0 || packaging > 0 || freight > 0;
    const breaks = k.breaks.map(b => { const g = goods * (1 - (f(b.pctOff) || 0) / 100), l = g + g * dutyPct / 100 + freight; return { qty: b.qty, pctOff: b.pctOff || '0', landed: r2(l), marginPct: marginOf(l) }; });
    return { currency: c.currency, hasAny, lines, pricedLines: priced, unpricedLines: unpriced, materials: r2(materials), waste: r2(waste), labour: r2(labour), decoration: r2(decoration), packaging: r2(packaging),
      fob: r2(goods), dutyPct: String(dutyPct), duty: r2(duty), freight: r2(freight), landed: r2(landed), retail: retail == null ? null : r2(retail), marginPct: marginOf(landed), breaks };
  }

  const api = { COUNTRIES, countryCode, gtinOk, hsCode, empty, emptyCost, normalize, syncVariants, missing, forFactory, costSummary };
  root.FBCommercial = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
