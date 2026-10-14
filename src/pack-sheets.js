// A tech pack as a spreadsheet: factories and buyers live in Excel, so every pack can be taken out as one workbook (a sheet each for the materials, the
// measurements, colourways, construction, labels, samples, SKUs and, for the client and staff, the cost) or as one CSV per sheet.
//   * Built from the published pack, for the same audience that is looking at it. A factory never gets the cost sheet, a unit cost, or what the client charges.
//   * The workbook is written by hand (OOXML in a zip, stored not compressed), so there is nothing to install. Text is written as text, never as a formula,
//     and the CSV puts a ' in front of a cell that starts with = + - or @ so a spreadsheet does not run what a person typed into a pack.
import './commercial.js';
import { zip } from './zip.js';

const cc = () => globalThis.FBCommercial;
const text = v => String(v ?? '');
const numeric = v => { const t = text(v).trim(); return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null; };

// → [{ name, note?, header: [...], rows: [[...]], widths?: [...], sum?: {...} }]
export function packSheets(pack, { audience = 'client', title = '' } = {}) {
  const p = pack || {}, fac = audience === 'factory', s = p.style || {}, sizes = Array.isArray(p.sizes) ? p.sizes : [], out = [];
  const com = cc().normalize(p.commercial), cost = cc().costSummary(p), cur = com.currency;

  out.push({ name: 'Overview', header: ['Field', 'Value'], widths: [26, 70], rows: [
    ['Product', title || s.styleName], ['Style name', s.styleName], ['Style number', s.styleNumber], ['Season', s.season], ['Category', s.category], ['Description', s.description],
    ['Sizes', sizes.join(', ')], ['Country of origin', p.care?.countryOfOrigin], ['HS code', com.hsCode], ['Weight of one unit (g)', numeric(com.weightGrams) ?? ''],
    ...(fac ? [] : [['Retail price', numeric(com.retailPrice) ?? ''], ['Currency', cur]])
  ].filter(r => r[1] !== undefined && r[1] !== null && r[1] !== '' || r[0] === 'Product') });

  const bomHead = ['Component', 'Material', 'Spec', 'Supplier', 'Ref', 'Colour', 'Placement', 'Qty', 'Unit', ...(fac ? [] : [`Unit cost (${cur})`, `Line cost (${cur})`]), 'Notes'];
  out.push({ name: 'Materials', header: bomHead, widths: [24, 24, 30, 18, 12, 16, 22, 8, 8, ...(fac ? [] : [14, 14]), 30], rows: (p.bom || []).map((r, i) => {
    const q = numeric(r.qty), u = numeric(r.cost);
    return [r.component, r.material, r.spec, r.supplier, r.ref, r.color, r.placement, q ?? r.qty, r.unit, ...(fac ? [] : [u ?? '', u == null ? '' : { f: `IF(H${i + 2}="",1,H${i + 2})*J${i + 2}`, v: Math.round((q ?? 1) * u * 100) / 100 }]), r.notes];
  }) });

  out.push({ name: 'Measurements', header: ['Code', 'Point of measure', 'How to measure', 'Tolerance', ...sizes], widths: [8, 30, 40, 12, ...sizes.map(() => 9)], rows: (p.pom || []).map(r => [r.code, r.name, r.how, r.tolerance, ...sizes.map(z => numeric(r.values?.[z]) ?? text(r.values?.[z]))]) });
  out.push({ name: 'Colourways', header: ['Name', 'Pantone / code', 'Swatch', 'Notes'], widths: [24, 16, 12, 40], rows: (p.colorways || []).map(r => [r.name, r.code, r.swatch, r.notes]) });
  out.push({ name: 'Construction', header: ['Area', 'Detail'], widths: [26, 90], rows: (p.construction || []).map(r => [r.area, r.detail]) });
  out.push({ name: 'Labels', header: ['Item', 'Spec', 'Placement'], widths: [24, 60, 30], rows: (p.labels || []).map(r => [r.item, r.spec, r.placement]) });
  out.push({ name: 'Samples', header: ['Stage', 'Qty', 'Due', 'Status', 'Notes'], widths: [24, 8, 12, 14, 40], rows: (p.sampling || []).map(r => [r.stage, numeric(r.qty) ?? r.qty, r.due, r.status, r.notes]) });
  out.push({ name: 'SKUs', header: ['Size', 'Colour', 'SKU', 'Barcode (GTIN)', ...(fac ? [] : [`Price (${cur})`])], widths: [8, 20, 24, 18, 12], rows: com.variants.map(v => [v.size, v.colour, v.sku, v.barcode, ...(fac ? [] : [numeric(v.price) ?? numeric(com.retailPrice) ?? ''])]) });

  if (!fac && cost.hasAny) {
    const rows = [['Materials', cost.materials], ['Waste allowance', cost.waste], ['Labour', cost.labour], ['Decoration', cost.decoration], ['Packaging', cost.packaging], ['Cost before freight and duty', cost.fob],
      [`Duty (${cost.dutyPct}%)`, cost.duty], ['Freight', cost.freight], ['Landed cost of one unit', cost.landed], ['Retail price', cost.retail ?? ''], ['Gross margin on retail', cost.marginPct == null ? '' : `${cost.marginPct}%`]];
    for (const b of cost.breaks) rows.push([`At ${b.qty} units (${b.pctOff}% off)`, b.landed]);
    out.push({ name: 'Cost', note: 'An estimate from the unit costs in Materials. A factory quote replaces it.', header: [`Per unit (${cur})`, 'Amount'], widths: [38, 16], rows, money: [1] });
  }
  return out.filter(sh => sh.rows.length || sh.name === 'Overview');
}

// ---- CSV ----
const guard = v => { const t = typeof v === 'object' && v ? text(v.v) : text(v); return /^[=+\-@\t\r]/.test(t) && numeric(t) === null ? `'${t}` : t; };
const csvCell = v => { const t = guard(v); return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
export const toCsv = sheet => '﻿' + [sheet.header, ...sheet.rows].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

// ---- XLSX ----
const esc = v => text(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const col = i => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const sheetName = (n, used) => { let b = text(n).replace(/[\[\]:*?\/\\]/g, ' ').trim().slice(0, 31) || 'Sheet', x = b, i = 2; while (used.has(x.toLowerCase())) x = b.slice(0, 28) + ' ' + i++; used.add(x.toLowerCase()); return x; };
function sheetXml(sh) {
  const cells = (r, ri, head, moneyCols = []) => `<row r="${ri}">${r.map((v, ci) => {
    const ref = col(ci) + ri;
    if (v && typeof v === 'object' && v.f) return `<c r="${ref}" s="3"><f>${esc(v.f)}</f><v>${Number(v.v) || 0}</v></c>`;
    const n = typeof v === 'number' ? v : null;
    if (n !== null && Number.isFinite(n)) return `<c r="${ref}" s="${head ? 1 : moneyCols.includes(ci) ? 3 : 0}"><v>${n}</v></c>`;
    const t = text(v); if (t === '') return '';
    return `<c r="${ref}" s="${head ? 1 : 0}" t="inlineStr"><is><t xml:space="preserve">${esc(t)}</t></is></c>`;
  }).join('')}</row>`;
  const rows = [cells(sh.header, 1, true), ...sh.rows.map((r, i) => cells(r, i + 2, false, sh.money || []))].join('');
  const widths = (sh.widths || []).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${widths ? `<cols>${widths}</cols>` : ''}<sheetData>${rows}</sheetData></worksheet>`;
}
export function toXlsx(sheets) {
  const used = new Set(), named = sheets.map(sh => ({ ...sh, tab: sheetName(sh.name, used) }));
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const entries = [
    ['[Content_Types].xml', `${head}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${named.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `${head}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${named.map((sh, i) => `<sheet name="${esc(sh.tab)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${named.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${named.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    // 0 plain, 1 bold on grey (header), 2 wrapped text, 3 money (two decimals)
    ['xl/styles.xml', `${head}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE9EAE5"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
    ...named.map((sh, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(sh)])
  ].map(([name, data]) => ({ name, data: Buffer.from(data, 'utf8') }));
  return zip(entries);
}

// the file name a download gets
export const exportName = (title, version, ext) => `${text(title).normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'tech-pack'}-${typeof version === 'number' ? 'v' + version : text(version).replace(/[^a-z0-9]+/gi, '') || 'v1'}${ext}`;
export const SHEET_KEYS = { overview: 'Overview', materials: 'Materials', measurements: 'Measurements', colourways: 'Colourways', construction: 'Construction', labels: 'Labels', samples: 'Samples', skus: 'SKUs', cost: 'Cost' };
