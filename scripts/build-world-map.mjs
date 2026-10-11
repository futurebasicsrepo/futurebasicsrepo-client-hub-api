// Turns Natural Earth's 110m countries (TopoJSON, public domain) into one SVG path in a 1000 x 500 equirectangular box, so the Factories
// map needs no outside scripts or tiles. Run: node scripts/build-world-map.mjs countries-110m.json > src/assets/world-map.json
import { readFileSync } from 'node:fs';
const topo = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { scale, translate } = topo.transform;
const arcs = topo.arcs.map(a => { let x = 0, y = 0; return a.map(([dx, dy]) => { x += dx; y += dy; return [x * scale[0] + translate[0], y * scale[1] + translate[1]]; }); });
const W = 1000, H = 500, px = ([lng, lat]) => [((lng + 180) / 360) * W, ((90 - lat) / 180) * H];
const ring = idx => { const pts = []; for (const i of idx) { const a = i >= 0 ? arcs[i] : [...arcs[~i]].reverse(); pts.push(...(pts.length ? a.slice(1) : a)); } return pts; };
const r1 = n => Math.round(n * 10) / 10;
let d = '';
for (const g of topo.objects.countries.geometries) {
  const polys = g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : [];
  for (const poly of polys) for (const idx of poly) {
    const pts = ring(idx); if (pts.every(p => p[1] < -60)) continue; // no Antarctica
    let last = null, out = '';
    for (const p of pts) { const [x, y] = px(p).map(r1); if (last && last[0] === x && last[1] === y) continue; out += (out ? 'L' : 'M') + x + ' ' + y; last = [x, y]; }
    d += out + 'Z';
  }
}
process.stdout.write(JSON.stringify({ width: W, height: H, viewBox: '0 18 1000 395', d }) + '\n');
