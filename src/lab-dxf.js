// A complete DXF R12 (AC1009) file, the way AutoCAD writes one, so that strict readers open it (Aspose/GroupDocs, Gerber, Lectra, Optitex,
// Illustrator), not only forgiving ones: the header with the version and the drawing's extents, every table (viewport, line types, layers,
// text style, views, UCS, application ids, dimension style), the model and paper space blocks, then the blocks and entities, each with a
// handle. A bare HEADER + ENTITIES file opens in some programs and fails in others ("Object reference not set to an instance of an object").
// No DOM, no Node.
//   const d = dxfR12(); d.layer('CUT', 7); d.poly(d.ents, pts, 'CUT'); d.text(d.ents, x, y, 'Front', .2); … d.toString({ units: 'in' })
//   Points are [x, y] in the drawing's own units, y up (a caller drawing y down negates y before it gets here).
const num = v => { const n = Math.round(Number(v) * 10000) / 10000; return Number.isFinite(n) ? String(n === 0 ? 0 : n) : '0'; };
// text that every reader takes: plain ASCII, no line breaks (a degree or fraction sign spelled out)
const ascii = s => String(s ?? '').replace(/[\r\n]+/g, ' ').replace(/[¼½¾⅛⅜⅝⅞]/g, c => ({ '¼': '1/4', '½': '1/2', '¾': '3/4', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8' }[c]))
  .replace(/[×]/g, 'x').replace(/[–—]/g, '-').replace(/[·•]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').normalize('NFKD').replace(/[^\x20-\x7e]/g, '').slice(0, 250);

export function dxfR12() {
  let handle = 0x20; const H = () => (handle++).toString(16).toUpperCase();
  const layers = new Map([['0', 7]]), blocks = [], ents = [], ext = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const see = (x, y) => { if (Number.isFinite(x) && Number.isFinite(y)) { ext.x0 = Math.min(ext.x0, x); ext.y0 = Math.min(ext.y0, y); ext.x1 = Math.max(ext.x1, x); ext.y1 = Math.max(ext.y1, y); } };
  const use = l => { l = String(l); if (!layers.has(l)) layers.set(l, 7); return l; };
  const d = {
    ents, blocks,
    layer: (name, colour = 7) => { layers.set(String(name), colour); },
    // a polyline (closed or open) on a layer, its vertices in turn, ended by its SEQEND
    poly(arr, pts, layer, closed = true) {
      const l = use(layer); arr.push('0', 'POLYLINE', '5', H(), '8', l, '66', '1', '10', '0', '20', '0', '30', '0', '70', closed ? '1' : '0');
      for (const [x, y] of pts) { if (arr === ents) see(x, y); arr.push('0', 'VERTEX', '5', H(), '8', l, '10', num(x), '20', num(y), '30', '0', '70', '0'); }
      arr.push('0', 'SEQEND', '5', H(), '8', l);
    },
    line(arr, a, b, layer) { const l = use(layer); if (arr === ents) { see(...a); see(...b); } arr.push('0', 'LINE', '5', H(), '8', l, '10', num(a[0]), '20', num(a[1]), '30', '0', '11', num(b[0]), '21', num(b[1]), '31', '0'); },
    point(arr, [x, y], layer) { const l = use(layer); if (arr === ents) see(x, y); arr.push('0', 'POINT', '5', H(), '8', l, '10', num(x), '20', num(y), '30', '0'); },
    text(arr, x, y, s, h, layer = '0') { const l = use(layer), t = ascii(s); if (!t) return; if (arr === ents) { see(x, y); see(x + t.length * h * .7, y + h); } arr.push('0', 'TEXT', '5', H(), '8', l, '10', num(x), '20', num(y), '30', '0', '40', num(h), '1', t, '7', 'STANDARD'); },
    // a block of entities drawn by the caller between begin and end, placed with insert (its extent counted where it lands)
    begin(name) { blocks.push('0', 'BLOCK', '5', H(), '8', '0', '2', name, '70', '0', '10', '0', '20', '0', '30', '0', '3', name, '1', ''); },
    end() { blocks.push('0', 'ENDBLK', '5', H(), '8', '0'); },
    insert(name, x, y, box = null, layer = '0') { const l = use(layer); if (box) { see(x + box.x0, y + box.y0); see(x + box.x1, y + box.y1); } else see(x, y); ents.push('0', 'INSERT', '5', H(), '8', l, '2', name, '10', num(x), '20', num(y), '30', '0'); },
    toString({ units = 'in' } = {}) {
      const mm = units === 'mm', e = Number.isFinite(ext.x0) ? ext : { x0: 0, y0: 0, x1: 10, y1: 10 };
      const v = (name, code, val) => ['9', name, String(code), String(val)], v2 = (name, x, y) => ['9', name, '10', num(x), '20', num(y)], v3 = (name, x, y, z = 0) => ['9', name, '10', num(x), '20', num(y), '30', num(z)];
      const blk = ['0', 'SECTION', '2', 'BLOCKS',
        '0', 'BLOCK', '5', H(), '8', '0', '2', '$MODEL_SPACE', '70', '0', '10', '0', '20', '0', '30', '0', '3', '$MODEL_SPACE', '1', '', '0', 'ENDBLK', '5', H(), '8', '0',
        '0', 'BLOCK', '5', H(), '67', '1', '8', '0', '2', '$PAPER_SPACE', '70', '0', '10', '0', '20', '0', '30', '0', '3', '$PAPER_SPACE', '1', '', '0', 'ENDBLK', '5', H(), '67', '1', '8', '0',
        ...blocks, '0', 'ENDSEC'];
      const header = ['0', 'SECTION', '2', 'HEADER', ...v('$ACADVER', 1, 'AC1009'), ...v3('$INSBASE', 0, 0), ...v3('$EXTMIN', e.x0, e.y0), ...v3('$EXTMAX', e.x1, e.y1),
        ...v2('$LIMMIN', e.x0, e.y0), ...v2('$LIMMAX', e.x1, e.y1), ...v('$LUNITS', 70, 2), ...v('$LUPREC', 70, 4), ...v('$MEASUREMENT', 70, mm ? 1 : 0), ...v('$TEXTSTYLE', 7, 'STANDARD'),
        ...v('$CLAYER', 8, '0'), ...v('$HANDLING', 70, 1), ...v('$HANDSEED', 5, (handle + 1).toString(16).toUpperCase()), '0', 'ENDSEC'];
      const w = Math.max(e.x1 - e.x0, 1), hgt = Math.max(e.y1 - e.y0, 1);
      const table = (name, rows) => ['0', 'TABLE', '2', name, '70', String(rows.length), ...rows.flat(), '0', 'ENDTAB'];
      const tables = ['0', 'SECTION', '2', 'TABLES',
        ...table('VPORT', [['0', 'VPORT', '2', '*ACTIVE', '70', '0', '10', '0', '20', '0', '11', '1', '21', '1', '12', num((e.x0 + e.x1) / 2), '22', num((e.y0 + e.y1) / 2), '13', '0', '23', '0', '14', '1', '24', '1', '15', '0', '25', '0', '16', '0', '26', '0', '36', '1', '17', '0', '27', '0', '37', '0', '40', num(hgt * 1.1), '41', num(w / hgt), '42', '50', '43', '0', '44', '0', '50', '0', '51', '0', '71', '0', '72', '100', '73', '1', '74', '3', '75', '0', '76', '0', '77', '0', '78', '0']]),
        ...table('LTYPE', [['0', 'LTYPE', '2', 'CONTINUOUS', '70', '0', '3', 'Solid line', '72', '65', '73', '0', '40', '0']]),
        ...table('LAYER', [...layers].map(([n, c]) => ['0', 'LAYER', '2', n, '70', '0', '62', String(c), '6', 'CONTINUOUS'])),
        ...table('STYLE', [['0', 'STYLE', '2', 'STANDARD', '70', '0', '40', '0', '41', '1', '50', '0', '71', '0', '42', '0.2', '3', 'txt', '4', '']]),
        ...table('VIEW', []), ...table('UCS', []),
        ...table('APPID', [['0', 'APPID', '2', 'ACAD', '70', '0']]),
        ...table('DIMSTYLE', [['0', 'DIMSTYLE', '2', 'STANDARD', '70', '0']]),
        '0', 'ENDSEC'];
      return [...header, ...tables, ...blk, '0', 'SECTION', '2', 'ENTITIES', ...ents, '0', 'ENDSEC', '0', 'EOF'].join('\n') + '\n';
    }
  };
  return d;
}
