// A shoe's pattern is put together from its pieces: every seam walked, every piece cut whole measured against a tape over the last, the
// leg as high as it is drawn (src/lab-footwear.js footwearAssembly). Every style and way of making it, across the sizes and across the
// choices a person can make; and patterns broken on purpose, each caught by the check that is about it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { footwearPattern, footwearAssembly, fwDefaults, FW_STYLES, VARIANTS } from '../src/lab-footwear.js';
import { shellOf, flattenPoint } from '../src/lab-last-shell.js';

const KINDS = Object.keys(FW_STYLES).flatMap(style => Object.keys(VARIANTS[style] || { _: 1 }).map(v => [style, v === '_' ? null : v]));
const fails = A => [...A.seams, ...A.meas].filter(x => x.ok === false).map(x => `${x.name}: ${x.a ?? x.got} against ${x.b ?? x.want}`).concat(A.missing.map(m => 'Missing ' + m.need));
const made = (style, v, o = {}) => footwearPattern({ ...fwDefaults(style, v), size: 9.5, ...o });

test('every shoe goes together: each style and variant at a small, a middle and a large size', () => {
  for (const [style, v] of KINDS) for (const size of [5.5, 9.5, 13]) { const A = made(style, v, { size }).assembly;
    assert.ok(A.ok, `${style}${v ? '/' + v : ''} US ${size}: ${fails(A).join('; ')}`);
    assert.ok([...A.seams, ...A.meas].every(x => x.ok !== null) || FW_STYLES[style].backless, `${style}${v ? '/' + v : ''} US ${size}: every seam and measurement could be made`); }
});

test('the lines a person sets are made to agree before the shoe is drafted', () => {
  // each of these left a shoe that could not be made: lacing behind the ankle bone (the collar jumped 2½ in), lacing ⅝ in long with four
  // eyelets in it, a leg in front of its own vamp line, a gore longer than a low collar, a square toe 1/16 in narrow at the toe box
  for (const [style, o, v] of [['sneaker', { throat: .15 }], ['sneaker', { throat: .55 }], ['sneaker', { vamp: .45 }], ['runner', { throat: .15 }], ['runner', { vamp: .45 }], ['derby', { eyelets: 9 }], ['hightop', { throat: .55 }], ['boot', { throat: .55 }], ['hiker', { throat: .55 }],
    ['loafer', { collar: 8 }], ['mule', { collar: 8 }, 'loafer'], ['chelsea', { collar: 4 }], ['chelsea', { sole: 'midsole' }], ['loafer', { heel: 0 }], ['runner', { toe: 'square' }], ['loafer', { toe: 'square' }], ['chelsea', { toe: 'square' }], ['footbed-clog', { spring: 1.25 }, 'wood']]) {
    const A = made(style, v || null, o).assembly; assert.ok(A.ok, `${style} ${JSON.stringify(o)}: ${fails(A).join('; ')}`); }
  const far = made('sneaker', null, { throat: .15 }), near = made('sneaker', null, { throat: .55 }), F = far.last.F;
  assert.ok(far.marks.throat >= F * .28 + .49, 'the lacing starts in front of the ankle bone'); assert.ok(far.notes.some(n => /in front of the ankle bone/.test(n)), 'and the pattern says the line was moved');
  assert.ok(near.marks.vamp - near.marks.throat >= 1.12, 'a lace edge keeps 1⅛ in behind the vamp line');
  const es = near.pieces.find(q => q.id === 'eyestay'); assert.ok(/^3 eyelets a side/.test(es.notes[0]), `a short lace edge takes the eyelets it has room for (${es.notes[0]})`);
  const many = made('derby', null, { eyelets: 9 }); assert.ok(many.notes.some(n => /9 pairs of eyelets were asked for/.test(n)), 'more eyelets than the edge takes at ⅜ in apart: fewer are punched, and it is said');
  const tall = made('hightop', null, { throat: .55 }); assert.ok(tall.marks.leg <= tall.marks.vamp - F * .2 + .001, 'the front of the leg stays a fifth of the foot behind the vamp line');
  const low = made('chelsea', null, { collar: 4 }), g = low.pieces.find(q => q.id === 'gore'), gy = g.shown.map(p => p[1]); assert.ok(Math.max(...gy) - Math.min(...gy) < 2.4, 'a 4 in collar has a gore of its own length, not a 6 in collar\'s');
});

test('a leg is cut as high as it is drawn: the curl over the top of the last is not counted as leg', () => {
  for (const style of ['boot', 'hightop', 'hiker', 'chelsea']) { const pat = made(style), h = shellOf(pat.last, { leg: pat.leg }).lateral, bot = pat.last.lastBottom;
    // a height above the last, at the back seam and at the middle of the leg: the same on the piece, to 1/8 in (it was 6⅛ in and 6½ in for 6 in)
    const cut = x => Math.hypot(...flattenPoint(h, [x, bot(x) - 6]).map((v, i) => v - flattenPoint(h, [x, bot(x)])[i])), back = cut(.3), mid = cut(pat.marks.leg * .6);
    assert.ok(Math.abs(back - 6) < .125 && Math.abs(mid - 6) < .125 && Math.abs(mid - back) < .09, `${style}: 6 in drawn is ${back.toFixed(2)} in cut at the back seam and ${mid.toFixed(2)} in at the middle of the leg`);
    assert.ok(pat.assembly.meas.filter(x => /the leg's height/.test(x.name)).length === 2, `${style}: both quarters' legs are measured`); }
});

test('shoes broken on purpose are caught, each by the check that is about it', () => {
  const pc = (p, id) => p.pieces.find(q => q.id === id);
  // toward a piece's fold line by a distance: a piece cut whole made narrower
  const narrow = (q, d) => { const [a, b] = q.fold, ux = b[0] - a[0], uy = b[1] - a[1], l = Math.hypot(ux, uy) || 1, n = [-uy / l, ux / l]; q.sew = q.sew.map(p => { const s = (p[0] - a[0]) * n[0] + (p[1] - a[1]) * n[1]; return Math.abs(s) < d ? p : [p[0] - Math.sign(s) * d * n[0], p[1] - Math.sign(s) * d * n[1]]; }); };
  const scaleY = (q, k) => { const y0 = Math.max(...q.sew.map(p => p[1])); q.sew = q.sew.map(p => [p[0], y0 + (p[1] - y0) * k]); if (q.at) for (const key of Object.keys(q.at)) q.at[key] = [q.at[key][0], y0 + (q.at[key][1] - y0) * k]; };
  const broken = [
    ['a vamp ¼ in narrow each side', 'sneaker', null, p => narrow(pc(p, 'vamp'), .25), /Vamp: lasting allowance left/],
    ['a toe puff bigger than its vamp', 'derby', null, p => { const q = pc(p, 'toe-puff'), c = q.fold[0]; q.sew = q.sew.map(pt => [c[0] + (pt[0] - c[0]) * 1.25, c[1] + (pt[1] - c[1]) * 1.25]); }, /Toe puff inside the vamp|Toe puff: allowance/],
    ['no heel counter', 'sneaker', null, p => { p.pieces = p.pieces.filter(q => q.id !== 'counter'); }, /Missing Heel counter/],
    ['no gore', 'chelsea', null, p => { p.pieces = p.pieces.filter(q => q.id !== 'gore'); }, /Missing Elastic gores/],
    ['an eyestay cut once a shoe', 'boot', null, p => { pc(p, 'eyestay').cut = 2; }, /Eyestay: how many are cut for a pair/],
    ['a tongue 1 in short', 'hightop', null, p => { const t = pc(p, 'tongue'), y0 = Math.max(...t.sew.map(q => q[1])), h = y0 - Math.min(...t.sew.map(q => q[1])); t.sew = t.sew.map(q => [q[0], y0 + (q[1] - y0) * (h - 1) / h]); }, /Tongue: how far it stands/],
    ['a tongue lining that is not the tongue', 'sneaker', null, p => { const t = pc(p, 'tongue-lining'); t.sew = t.sew.map(q => [q[0] * 1.2, q[1]]); }, /Tongue lining to the tongue/],
    ['an inside quarter shorter at the back seam', 'derby', null, p => scaleY(pc(p, 'quarter-med'), .9), /Back seam/],
    ['a leg cut ⅜ in too high', 'boot', null, p => scaleY(pc(p, 'quarter-lat'), 1.06), /the leg's height/],
    ['a strobel sock ⅜ in short', 'runner', null, p => { const q = pc(p, 'strobel'), x1 = Math.max(...q.sew.map(pt => pt[0])); q.sew = q.sew.map(pt => [pt[0] * (x1 - .375) / x1, pt[1]]); for (const k of Object.keys(q.at)) q.at[k] = [q.at[k][0] * (x1 - .375) / x1, q.at[k][1]]; }, /Strobel sock: its length/],
    ['a sockliner too narrow', 'loafer', null, p => { const q = pc(p, 'sockliner'); q.sew = q.sew.map(pt => [pt[0], pt[1] * .9]); }, /Sockliner: its width/],
    ['a gore longer than the edge it is sewn under', 'chelsea', null, p => { const g = pc(p, 'gore'); g.lines.back = g.lines.back.map((q, i, all) => [q[0], all[0][1] + (q[1] - all[0][1]) * 1.2]); }, /Gore into the back quarter/]];
  for (const [what, style, v, hurt, re] of broken) { const p = made(style, v); assert.ok(p.assembly.ok, `${style} goes together before it is broken`); hurt(p); const A = footwearAssembly(p), f = fails(A);
    assert.ok(!A.ok && f.some(x => re.test(x)), `${what} is caught (${f.join('; ') || 'nothing failed'})`); }
});
