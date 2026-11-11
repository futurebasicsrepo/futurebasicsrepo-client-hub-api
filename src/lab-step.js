// STEP (ISO 10303-21, AP214) of an assembly, for a toolmaker's CAD: every part as an exact solid at its real size and place, named and
// coloured, in millimetres. The engineering's own solids are profiles swept along an axis, so they are written as true geometry, not a mesh:
// flat faces as planes, the rounded corners of a box and the walls of a round part as cylinders with their radius, the floor, ceiling and
// rim of a housing as planes with the opening cut through. Elliptical sections are written as many flat facets, a ball as a faceted
// ellipsoid; both are still closed solids. (The detailed parts the 3D view draws, src/lab-parts3d.js, are pictures; these are the bodies.)
//   stepOf(spec, { t, only, title }) → text: one solid per part (qty drawn once), pulled apart by t (0 = assembled), or one part only
import { cleanAssembly, explodeOffsets, featuresOf } from './lab-assembly.js';

const fmt = v => { const r = Math.round(v * 1e6) / 1e6; return Number.isInteger(r) ? `${r}.` : String(r); }; // STEP reals carry a point
const esc = s => String(s ?? '').replace(/[\\']/g, c => (c === "'" ? "''" : '\\\\')).replace(/[^\x20-\x7e]/g, '?').slice(0, 120);

// ---- the profile across a part (its local x, y), as segments going round anticlockwise: lines and arcs ----
const ARC_EPS = .01, ELL_SEG = 40;
function roundedRect(w, d, r) {
  r = Math.max(0, Math.min(r, w / 2 - .01, d / 2 - .01));
  if (r <= ARC_EPS) return [[w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2], [-w / 2, -d / 2]].map((a, i, P) => ({ line: true, a, b: P[(i + 1) % 4] }));
  const segs = [], cs = [[w / 2 - r, d / 2 - r], [-w / 2 + r, d / 2 - r], [-w / 2 + r, -d / 2 + r], [w / 2 - r, -d / 2 + r]];
  const at = (c, k) => [c[0] + r * Math.cos(k * Math.PI / 2), c[1] + r * Math.sin(k * Math.PI / 2)];
  for (let q = 0; q < 4; q++) { const c = cs[q], next = cs[(q + 1) % 4]; segs.push({ arc: true, c, r, a: at(c, q), b: at(c, q + 1) }); const e = at(c, q + 1), s = at(next, q + 1); if (Math.hypot(e[0] - s[0], e[1] - s[1]) > ARC_EPS) segs.push({ line: true, a: e, b: s }); }
  return segs;
}
function round(w, d) {
  if (Math.abs(w - d) < 1e-6) { const r = w / 2; return [{ arc: true, c: [0, 0], r, a: [r, 0], b: [-r, 0] }, { arc: true, c: [0, 0], r, a: [-r, 0], b: [r, 0] }]; }
  const P = Array.from({ length: ELL_SEG }, (_, i) => { const a = i / ELL_SEG * Math.PI * 2; return [w / 2 * Math.cos(a), d / 2 * Math.sin(a)]; });
  return P.map((a, i) => ({ line: true, a, b: P[(i + 1) % P.length] }));
}
const ROUND = new Set(['cyl', 'cup', 'ring']), shellLike = p => p.shape === 'shell' || p.shape === 'cup' || p.shape === 'ring';
const localDims = p => { const [x, y, z] = p.size; return p.axis === 'y' ? [x, z, y] : p.axis === 'x' ? [z, y, x] : [x, y, z]; };
// local → world turns, as the engine's meshes (src/lab-assembly.js): z as is, y-axis Rx(−90°), x-axis Ry(+90°)
const turn = (p, [x, y, z]) => (p.axis === 'y' ? [x, z, -y] : p.axis === 'x' ? [z, y, -x] : [x, y, z]);

export function stepOf(s0, { t = 0, only = null, title = '' } = {}) {
  const s = cleanAssembly(s0), off = explodeOffsets(s, t), lines = [];
  let n = 0; const put = text => { lines.push(`#${++n}=${text};`); return `#${n}`; };
  const pt = q => put(`CARTESIAN_POINT('',(${q.map(fmt).join(',')}))`), dir = v => { const l = Math.hypot(...v) || 1; return put(`DIRECTION('',(${v.map(x => fmt(x / l)).join(',')}))`); };
  const place = (o, z, x) => put(`AXIS2_PLACEMENT_3D('',${pt(o)},${dir(z)},${dir(x)})`);

  // units, tolerance and the context every representation shares
  const mm = put('( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) )'), rad = put('( NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.) )'), sr = put('( NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT() )');
  const unc = put(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-04),${mm},'distance_accuracy_value','confusion accuracy')`);
  const ctx = put(`( GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((${unc})) GLOBAL_UNIT_ASSIGNED_CONTEXT((${mm},${rad},${sr})) REPRESENTATION_CONTEXT('Context3D','3D Context with UNIT and UNCERTAINTY') )`);

  // one part as a closed solid: its profile(s) at the heights the shape needs, the walls between them, the caps, floor and rim
  function solidOf(p) {
    const at = p.at.map((v, k) => v + (off[p.id]?.[k] || 0)), W = q => { const w = turn(p, q); return [w[0] + at[0], w[1] + at[1], w[2] + at[2]]; }, R = v => turn(p, v);
    const faces = [];
    if (p.shape === 'ball') return polyhedron(p, W, R);
    const [w, d, L] = localDims(p), z0 = -L / 2, z1 = L / 2, tk = shellLike(p) ? Math.min(p.wall, Math.min(w, d) / 2 - .2) : 0;
    // the windows in a housing's side walls (featuresOf): the outline is split where a window's sides are, outer and inner at the same places,
    // so each stretch of wall inside a window (`col`) is one segment of each
    const F = featuresOf(p), sides = F.sides, TAU = Math.PI * 2, inWin = (m, sg) => (m.phi ? [0, TAU, -TAU].some(k => sg.mid + k > m.a && sg.mid + k < m.b) : sg.wall === m.wall && sg.side === m.side && sg.mid > m.a && sg.mid < m.b);
    const tag = sg => { sg.wins = sides.filter(m => sg.mid != null && inWin(m, sg)); if (sg.wins.length) sg.col = sg.wall != null ? `${sg.wall}:${sg.side}:${sg.mid.toFixed(4)}` : `a:${(((sg.mid % TAU) + TAU) % TAU).toFixed(5)}`; return sg; };
    const cutRect = (P, Wd, Dd) => P.flatMap(sg => { if (!sg.line) return [sg];
      const ki = Math.abs(sg.a[1] - sg.b[1]) < 1e-9 && Math.abs(Math.abs(sg.a[1]) - Dd / 2) < 1e-7 ? 1 : Math.abs(sg.a[0] - sg.b[0]) < 1e-9 && Math.abs(Math.abs(sg.a[0]) - Wd / 2) < 1e-7 ? 0 : -1; if (ki < 0) return [sg];
      const ti = 1 - ki, side = Math.sign(sg.a[ki]), lo = Math.min(sg.a[ti], sg.b[ti]), hi = Math.max(sg.a[ti], sg.b[ti]), dn = Math.sign(sg.b[ti] - sg.a[ti]);
      const marks = [...new Set(sides.filter(m => !m.phi && m.wall === ki && m.side === side).flatMap(m => [m.a, m.b]))].filter(v => v > lo + 1e-6 && v < hi - 1e-6).sort((x, y) => dn * (x - y)), out = [];
      let a = sg.a; for (const v of [...marks, null]) { const b = v == null ? sg.b : ti === 0 ? [v, sg.a[1]] : [sg.a[0], v]; out.push(tag({ line: true, a, b, wall: ki, side, mid: (a[ti] + b[ti]) / 2 })); a = b; } return out; });
    const cutRound = (Wd, Dd) => { const circle = Math.abs(Wd - Dd) < 1e-6, base = circle ? [0, Math.PI] : Array.from({ length: ELL_SEG }, (_, i) => i / ELL_SEG * TAU), norm = a => ((a % TAU) + TAU) % TAU;
      const A = [...base, ...sides.filter(m => m.phi).flatMap(m => [norm(m.a), norm(m.b)])].sort((x, y) => x - y).filter((a, i, l) => i === 0 || a - l[i - 1] > 1e-7), at = a => [Wd / 2 * Math.cos(a), Dd / 2 * Math.sin(a)];
      return A.map((a, i) => { const b = i + 1 < A.length ? A[i + 1] : A[0] + TAU; return tag(circle ? { arc: true, c: [0, 0], r: Wd / 2, a: at(a), b: at(b), mid: (a + b) / 2 } : { line: true, a: at(a), b: at(b), mid: (a + b) / 2 }); }); };
    const prof = (Wd, Dd, r) => (!sides.length ? (ROUND.has(p.shape) ? round(Wd, Dd) : roundedRect(Wd, Dd, r)) : ROUND.has(p.shape) ? cutRound(Wd, Dd) : cutRect(roundedRect(Wd, Dd, r), Wd, Dd));
    const outP = prof(w, d, p.r ?? 0), innP = tk ? prof(w - 2 * tk, d - 2 * tk, Math.max((p.r ?? 0) - tk, 0)) : null;
    const levels = new Map(); let keys = 0;
    const level = (P, z) => { const k = `${P.key ??= ++keys}:${z}`; if (levels.has(k)) return levels.get(k); const V = P.map(sg => put(`VERTEX_POINT('',${pt(W([sg.a[0], sg.a[1], z]))})`));
      const E = P.map((sg, i) => { const curve = sg.line ? put(`LINE('',${pt(W([sg.a[0], sg.a[1], z]))},${put(`VECTOR('',${dir(R([sg.b[0] - sg.a[0], sg.b[1] - sg.a[1], 0]))},${fmt(Math.hypot(sg.b[0] - sg.a[0], sg.b[1] - sg.a[1]))})`)})`) : put(`CIRCLE('',${place(W([sg.c[0], sg.c[1], z]), R([0, 0, 1]), R([1, 0, 0]))},${fmt(sg.r)})`); return put(`EDGE_CURVE('',${V[i]},${V[(i + 1) % P.length]},${curve},.T.)`); });
      const L2 = { V, E, P, z }; levels.set(k, L2); return L2; };
    const oe = (e, sense) => put(`ORIENTED_EDGE('',*,*,${e},${sense ? '.T.' : '.F.'})`);
    const loopOf = (L2, forward) => put(`EDGE_LOOP('',(${(forward ? L2.E.map(e => oe(e, true)) : [...L2.E].reverse().map(e => oe(e, false))).join(',')}))`);
    // a wall between two heights: a plane for each straight segment, a cylinder for each arc; inward (a hole's wall) faces the other way
    const ups = new Map(), upOf = (P, i, za, zb) => { const k = `${P.key ??= ++keys}:${i}:${za}:${zb}`; if (!ups.has(k)) ups.set(k, put(`EDGE_CURVE('',${level(P, za).V[i]},${level(P, zb).V[i]},${put(`LINE('',${pt(W([P[i].a[0], P[i].a[1], za]))},${put(`VECTOR('',${dir(R([0, 0, 1]))},${fmt(zb - za)})`)})`)},.T.)`)); return ups.get(k); };
    const wall = (P, za, zb, inward, skip = null) => { const A = level(P, za), B = level(P, zb), up = P.map((_, i) => ({ toString: () => upOf(P, i, za, zb) }));
      P.forEach((sg, i) => { if (skip && skip(sg)) return; const j = (i + 1) % P.length, loop = inward ? [oe(A.E[i], false), oe(up[i], true), oe(B.E[i], true), oe(up[j], false)] : [oe(A.E[i], true), oe(up[j], true), oe(B.E[i], false), oe(up[i], false)];
        const surf = sg.line ? put(`PLANE('',${place(W([sg.a[0], sg.a[1], za]), R(inward ? [-(sg.b[1] - sg.a[1]), sg.b[0] - sg.a[0], 0] : [sg.b[1] - sg.a[1], -(sg.b[0] - sg.a[0]), 0]), R([sg.b[0] - sg.a[0], sg.b[1] - sg.a[1], 0]))})`) : put(`CYLINDRICAL_SURFACE('',${place(W([sg.c[0], sg.c[1], za]), R([0, 0, 1]), R([1, 0, 0]))},${fmt(sg.r)})`);
        faces.push(put(`ADVANCED_FACE('',(${put(`FACE_OUTER_BOUND('',${put(`EDGE_LOOP('',(${loop.join(',')}))`)},.T.)`)}),${surf},${sg.line ? '.T.' : inward ? '.F.' : '.T.'})`)); }); };
    // a flat face at z, looking up or down, bounded by a profile, with a hole through it when there is an inner profile
    const cap = (P, z, upward, hole = null) => { const A = level(P, z), bounds = [put(`FACE_OUTER_BOUND('',${loopOf(A, upward)},.T.)`)]; for (const h of !hole || !hole.length ? [] : Array.isArray(hole[0]) ? hole : [hole]) bounds.push(put(`FACE_BOUND('',${loopOf(level(h, z), !upward)},.T.)`));
      faces.push(put(`ADVANCED_FACE('',(${bounds.join(',')}),${put(`PLANE('',${place(W([0, 0, z]), R([0, 0, upward ? 1 : -1]), R([1, 0, 0]))})`)},.T.)`)); };
    // the openings through the part along its axis and the screw bosses on a housing's floor (featuresOf, src/lab-assembly.js): a round one is
    // a true circle, a square one four lines; a boss is a cylinder with its pilot bore, which runs out through the floor when a screw
    // comes up through it. A window in a side wall leaves its stretch of wall out between its sill and its head (a notch when it reaches the rim),
    // with flat faces round it: the two sides, the sill, the head.
    const circ = (cx, cy, r) => [{ arc: true, c: [cx, cy], r, a: [cx + r, cy], b: [cx - r, cy] }, { arc: true, c: [cx, cy], r, a: [cx - r, cy], b: [cx + r, cy] }];
    const holeP = h => { if (h.round && Math.abs(h.hw - h.hd) < 1e-6) return circ(h.cx, h.cy, h.hw); const P = h.round ? Array.from({ length: ELL_SEG }, (_, i) => { const a = i / ELL_SEG * Math.PI * 2; return [h.cx + h.hw * Math.cos(a), h.cy + h.hd * Math.sin(a)]; }) : [[h.cx + h.hw, h.cy - h.hd], [h.cx + h.hw, h.cy + h.hd], [h.cx - h.hw, h.cy + h.hd], [h.cx - h.hw, h.cy - h.hd]]; return P.map((a, i) => ({ line: true, a, b: P[(i + 1) % P.length] })); };
    const bossP = F.bosses.map(b => ({ b, ring: circ(b.cx, b.cy, b.R), bore: circ(b.cx, b.cy, b.rp) })), own = F.holes.filter(h => !h.boss).map(holeP), through = [...own, ...bossP.filter(q => q.b.bore).map(q => q.bore)];
    const wins = sides.map(m => ({ m, za: Math.min(F.sgn * m.ua, F.sgn * m.ub), zb: Math.max(F.sgn * m.ua, F.sgn * m.ub) })), near = (a, b) => Math.abs(a - b) < 1e-9;
    const steps = (lo, hi) => { const z = [...new Set([lo, hi, ...wins.flatMap(x => [x.za, x.zb])])].filter(v => v > lo - 1e-9 && v < hi + 1e-9).sort((a, b) => a - b).filter((v, i, l) => i === 0 || v - l[i - 1] > 1e-9); return z.slice(0, -1).map((v, i) => [v, z[i + 1]]); };
    const lost = (sg, za, zb) => Boolean(sg.wins) && wins.some(x => sg.wins.includes(x.m) && x.za < za + 1e-9 && x.zb > zb - 1e-9), layered = (P, lo, hi, inward) => { for (const [a, b] of steps(lo, hi)) wall(P, a, b, inward, sg => lost(sg, a, b)); };
    if (!innP && F.flange) { const { k, za, zb } = F.flange, bodP = round(w * k, d * k), low = za <= z0 + 1e-9; // a flanged round part: flange, step, body
      wall(outP, za, zb, false); wall(bodP, low ? zb : z0, low ? z1 : za, false); cap(outP, low ? z0 : z1, !low); cap(outP, low ? zb : za, low, bodP); cap(bodP, low ? z1 : z0, low); }
    else if (!innP) { wall(outP, z0, z1, false); cap(outP, z0, false, own); cap(outP, z1, true, own); for (const h of own) wall(h, z0, z1, true); }
    else { const o = p.shape === 'ring' ? 'both' : p.open === '-' ? '-' : '+', up = o === '+', zo = up ? z0 : z1, zi = o === 'both' ? null : up ? z0 + tk : z1 - tk, ilo = o === '+' ? zi : z0, ihi = o === '-' ? zi : z1, lo = (a, b) => Math.min(a, b), hi = (a, b) => Math.max(a, b);
      layered(outP, z0, z1, false); layered(innP, ilo, ihi, true);
      // a line across the wall's thickness at an outline point, at a height: shared by a window's side and its sill or head, or the rim
      const n = outP.length, ni = innP.length, cols = new Map(); outP.forEach((sg, i) => { if (sg.col) cols.set(sg.col, { io: i }); }); innP.forEach((sg, i) => { if (sg.col && cols.has(sg.col)) cols.get(sg.col).ii = i; });
      const across = new Map(), spoke = (vo, vi, z) => { const k = `${vo}:${z}`; if (!across.has(k)) { const a = outP[vo].a, b = innP[vi].a; across.set(k, put(`EDGE_CURVE('',${level(outP, z).V[vo]},${level(innP, z).V[vi]},${put(`LINE('',${pt(W([a[0], a[1], z]))},${put(`VECTOR('',${dir(R([b[0] - a[0], b[1] - a[1], 0]))},${fmt(Math.hypot(b[0] - a[0], b[1] - a[1]))})`)})`)},.T.)`)); } return across.get(k); };
      const flatFace = (loop, origin, normal, ref) => faces.push(put(`ADVANCED_FACE('',(${put(`FACE_OUTER_BOUND('',${put(`EDGE_LOOP('',(${loop.join(',')}))`)},.T.)`)}),${put(`PLANE('',${place(W(origin), R(normal), R(ref))})`)},.T.)`));
      // a flat piece of the wall's thickness at height z, from outline point vo0 round to vo1 (inner vi0 to vi1), looking up or down
      const ledge = (z, vo0, vo1, vi0, vi1, upward) => { const A = level(outP, z), B = level(innP, z), eo = [], ei = []; for (let i = vo0; i !== vo1; i = (i + 1) % n) eo.push(A.E[i]); for (let i = vi0; i !== vi1; i = (i + 1) % ni) ei.push(B.E[i]);
        const fwd = [...eo.map(e => oe(e, true)), oe(spoke(vo1, vi1, z), true), ...ei.reverse().map(e => oe(e, false)), oe(spoke(vo0, vi0, z), false)], back = [oe(spoke(vo0, vi0, z), true), ...ei.reverse().map(e => oe(e, true)), oe(spoke(vo1, vi1, z), false), ...eo.reverse().map(e => oe(e, false))];
        flatFace(upward ? fwd : back, [0, 0, z], [0, 0, upward ? 1 : -1], [1, 0, 0]); };
      for (const { io, ii } of cols.values()) { if (ii == null) continue; const so = outP[io], vo1 = (io + 1) % n, vi1 = (ii + 1) % ni, prev = outP[(io + n - 1) % n], next = outP[vo1], layers = steps(ilo, ihi);
        layers.forEach(([a, b], k) => { if (!lost(so, a, b)) return;
          // its two sides, where the wall next to it is still there
          for (const [vo, vi, nb, sgn] of [[io, ii, prev, 1], [vo1, vi1, next, -1]]) { if (lost(nb, a, b)) continue; const q = outP[vo].a, r = innP[vi].a, nrm = [sgn * (r[1] - q[1]), -sgn * (r[0] - q[0]), 0];
            const lp = sgn > 0 ? [oe(spoke(vo, vi, a), true), oe(upOf(innP, vi, a, b), true), oe(spoke(vo, vi, b), false), oe(upOf(outP, vo, a, b), false)] : [oe(upOf(outP, vo, a, b), true), oe(spoke(vo, vi, b), true), oe(upOf(innP, vi, a, b), false), oe(spoke(vo, vi, a), false)];
            flatFace(lp, [q[0], q[1], a], nrm, [0, 0, 1]); }
          // its sill and its head, where there is wall (or the floor) below or above it
          const below = k > 0 ? !lost(so, ...layers[k - 1]) : o === '+', above = k < layers.length - 1 ? !lost(so, ...layers[k + 1]) : o === '-';
          if (below) ledge(a, io, vo1, ii, vi1, true); if (above) ledge(b, io, vo1, ii, vi1, false); }); }
      // the rim: whole, or in pieces between the notches that reach it
      const rim = (z, upward) => { const [a, b] = steps(ilo, ihi)[near(z, ilo) ? 0 : steps(ilo, ihi).length - 1], gone = outP.map(sg => lost(sg, a, b)); if (!gone.some(Boolean)) return cap(outP, z, upward, innP);
        for (let i = 0; i < n; i++) { if (!gone[i] || gone[(i + 1) % n]) continue; let j = (i + 1) % n; while (!gone[j]) j = (j + 1) % n; ledge(z, (i + 1) % n, j, (cols.get(outP[i].col).ii + 1) % ni, cols.get(outP[j].col).ii, upward); } };
      if (o === 'both') { rim(z0, false); rim(z1, true); }
      else { rim(up ? z1 : z0, up);
        cap(outP, zo, !up, through); cap(innP, zi, up, [...own, ...bossP.map(q => q.ring)]); for (const h of own) wall(h, lo(zo, zi), hi(zo, zi), true);
        for (const { b, ring, bore } of bossP) { const ze = F.sgn * b.ue, zb = b.bore ? zo : zi; wall(ring, lo(zi, ze), hi(zi, ze), false); cap(ring, ze, up, [bore]); wall(bore, lo(zb, ze), hi(zb, ze), true); if (!b.bore) cap(bore, zi, up); } } }
    return put(`MANIFOLD_SOLID_BREP('${esc(p.name)}',${put(`CLOSED_SHELL('',(${faces.join(',')}))`)})`);
  }
  // a ball: an ellipsoid of flat facets (latitude bands, triangles at the poles), every edge shared by two faces
  function polyhedron(p, W) {
    const [a, b, c] = p.size.map(v => v / 2), m = 24, k = 36, P = (i, j) => { const th = i / m * Math.PI, ph = j / k * 2 * Math.PI; return [a * Math.sin(th) * Math.cos(ph), b * Math.sin(th) * Math.sin(ph), c * Math.cos(th)]; };
    const vid = new Map(), V = (i, j) => { const key = i === 0 ? 'N' : i === m ? 'S' : `${i},${j % k}`; if (!vid.has(key)) vid.set(key, { at: P(i, j), ref: put(`VERTEX_POINT('',${pt(W(P(i, j)))})`) }); return vid.get(key); };
    const edges = new Map(), edge = (A, B) => { const key = [A.ref, B.ref].sort().join('-'); if (!edges.has(key)) { const wa = W(A.at), wb = W(B.at); edges.set(key, { from: A.ref, ref: put(`EDGE_CURVE('',${A.ref},${B.ref},${put(`LINE('',${pt(wa)},${put(`VECTOR('',${dir(wb.map((v, q) => v - wa[q]))},${fmt(Math.hypot(...wb.map((v, q) => v - wa[q])))})`)})`)},.T.)`) }); } const e = edges.get(key); return put(`ORIENTED_EDGE('',*,*,${e.ref},${e.from === A.ref ? '.T.' : '.F.'})`); };
    const faces = [], face = vs => { const ws = vs.map(v => W(v.at)), u = ws[1].map((x, q) => x - ws[0][q]), v2 = ws[2].map((x, q) => x - ws[0][q]), nn = [u[1] * v2[2] - u[2] * v2[1], u[2] * v2[0] - u[0] * v2[2], u[0] * v2[1] - u[1] * v2[0]];
      faces.push(put(`ADVANCED_FACE('',(${put(`FACE_OUTER_BOUND('',${put(`EDGE_LOOP('',(${vs.map((v, q) => edge(v, vs[(q + 1) % vs.length])).join(',')}))`)},.T.)`)}),${put(`PLANE('',${place(ws[0], nn, u)})`)},.T.)`)); };
    for (let i = 0; i < m; i++) for (let j = 0; j < k; j++) { const A = V(i, j), B = V(i + 1, j), C = V(i + 1, j + 1), D = V(i, j + 1); if (i === 0) face([A, B, C]); else if (i === m - 1) face([A, B, D]); else face([A, B, C, D]); }
    return put(`MANIFOLD_SOLID_BREP('${esc(p.name)}',${put(`CLOSED_SHELL('',(${faces.join(',')}))`)})`);
  }

  const parts = s.parts.filter(p => !only || p.id === only), solids = parts.map(solidOf), name = esc(title || s.name || 'Assembly');
  const origin = place([0, 0, 0], [0, 0, 1], [1, 0, 0]);
  const rep = put(`ADVANCED_BREP_SHAPE_REPRESENTATION('${name}',(${[origin, ...solids].join(',')}),${ctx})`);
  // the product the shape belongs to
  const app = put("APPLICATION_CONTEXT('core data for automotive mechanical design processes')");
  put(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,${app})`);
  const prod = put(`PRODUCT('${name}','${name}','Future Basics Design Lab',(${put(`PRODUCT_CONTEXT('',${app},'mechanical')`)}))`);
  put(`PRODUCT_RELATED_PRODUCT_CATEGORY('part',$,(${prod}))`);
  const pdef = put(`PRODUCT_DEFINITION('design','',${put(`PRODUCT_DEFINITION_FORMATION('','',${prod})`)},${put(`PRODUCT_DEFINITION_CONTEXT('part definition',${app},'design')`)})`);
  put(`SHAPE_DEFINITION_REPRESENTATION(${put(`PRODUCT_DEFINITION_SHAPE('','',${pdef})`)},${rep})`);
  // each solid in its part's colour
  const styled = parts.map((p, i) => { const h = /^#[0-9a-f]{6}$/i.test(p.colour || '') ? p.colour : '#9a9da1', [r, g, b] = [1, 3, 5].map(q => parseInt(h.slice(q, q + 2), 16) / 255);
    const col = put(`COLOUR_RGB('',${fmt(r)},${fmt(g)},${fmt(b)})`), fill = put(`SURFACE_STYLE_FILL_AREA(${put(`FILL_AREA_STYLE('',(${put(`FILL_AREA_STYLE_COLOUR('',${col})`)}))`)})`);
    return put(`STYLED_ITEM('color',(${put(`PRESENTATION_STYLE_ASSIGNMENT((${put(`SURFACE_STYLE_USAGE(.BOTH.,${put(`SURFACE_SIDE_STYLE('',(${fill}))`)})`)}))`)}),${solids[i]})`); });
  put(`MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION('',(${styled.join(',')}),${ctx})`);
  const file = `${name.replace(/[^A-Za-z0-9]+/g, '-')}.step`;
  return ['ISO-10303-21;', 'HEADER;', `FILE_DESCRIPTION(('Future Basics Design Lab assembly: ${name}, mm'),'2;1');`, `FILE_NAME('${file}','${new Date().toISOString().slice(0, 19)}',('Future Basics'),('Future Basics'),'Future Basics Design Lab','Future Basics Design Lab','');`,
    "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));", 'ENDSEC;', 'DATA;', ...lines, 'ENDSEC;', 'END-ISO-10303-21;', ''].join('\n');
}
