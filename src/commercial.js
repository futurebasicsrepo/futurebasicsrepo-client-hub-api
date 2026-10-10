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

  const empty = () => ({ currency: 'USD', retailPrice: '', compareAtPrice: '', skuPrefix: '', weightGrams: '', lengthCm: '', widthCm: '', heightCm: '', hsCode: '', variants: [] });

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
      lengthCm: num(c.lengthCm, { max: 1000, dp: 1 }), widthCm: num(c.widthCm, { max: 1000, dp: 1 }), heightCm: num(c.heightCm, { max: 1000, dp: 1 }), hsCode: hsCode(c.hsCode), variants };
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
      if (old) { out.push(old); continue; }
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

  // The view a factory gets: everything but what the client charges.
  function forFactory(c) { const x = normalize(c); return { ...x, retailPrice: '', compareAtPrice: '', variants: x.variants.map(v => ({ ...v, price: '' })) }; }

  const api = { COUNTRIES, countryCode, gtinOk, hsCode, empty, normalize, syncVariants, missing, forFactory };
  root.FBCommercial = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
