// The production package: one zip a factory downloads from its pack link with everything it needs to start work, so nothing waits on an email.
//   buildFactoryPackage({ data, title, version, publishedAt, pdf, sheets, lab }) → { name, zip, files: [{ name, bytes }], readme }
// What goes in:
//   tech-pack.pdf, tech-pack.xlsx               the pack as published, as the factory sees it (no costs, no margins)
//   artwork/, sketches/                         every artwork picture and technical sketch on the pack, as files
//   decorations/NN-name/                        per placement, at the size it is placed: separations and films (print) or .dst/.exp stitch files,
//                                               the thread list and sew-out (embroidery), the job sheet, and the artwork traced to vector
//   decorations/decoration-sheet.pdf, flats/    the decoration sheet and the spec sheet as a vector
//   pattern/, last/                             the pattern (every size as AAMA DXF, the base size as DXF and SVG) and, for a shoe, the last
//   engineering/                                hard goods and electronics: the assembly in 3D (STEP for CAD, STL), each made part for its toolmaker, the
//                                               exploded drawing, the parts list, the cables and the block diagram, all without our costs
//   README.txt                                  what each file is, and what could not be made
// The Lab files come from the design as it stands; when it changed after this version was published, the README says so and the PDF governs.
import { zip } from './zip.js';

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' };
export const slug = v => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
const fromDataUrl = v => { const m = /^data:([a-z/+.-]+);base64,(.+)$/i.exec(typeof v === 'string' ? v : ''); return m && EXT[m[1].toLowerCase()] ? { ext: EXT[m[1].toLowerCase()], data: Buffer.from(m[2], 'base64') } : null; };

// the pictures on the pack itself, each once, named for what it is
export function packPictures(data = {}) {
  const out = [], seen = new Set(), add = (dir, name, img) => { const f = fromDataUrl(img); if (!f) return; let base = `${dir}/${slug(name) || dir}`, n = base, i = 2; while (seen.has(n)) n = `${base}-${i++}`; seen.add(n); out.push({ name: `${n}.${f.ext}`, data: f.data }); };
  const sketches = Array.isArray(data.sketches) ? data.sketches : [], onSketches = new Set(sketches.map(x => x.image));
  // a technical flat or spec sheet the Lab put among the artwork is a drawing, not art to print: it goes with the sketches, once
  for (const a of Array.isArray(data.artwork) ? data.artwork : []) { if (onSketches.has(a.image)) continue; add(/^(spec sheet|technical flat)/i.test(a.name || '') ? 'sketches' : 'artwork', a.name || 'artwork', a.image); if (a.clear && a.clear !== a.image) add('artwork', `${a.name || 'artwork'} transparent`, a.clear); }
  for (const s of sketches) add('sketches', s.label || s.view || 'sketch', s.image);
  return out;
}

const DESCRIBE = [
  [/^tech-pack\.pdf$/, 'The tech pack as published: specification, measurements, materials, construction, labels, samples and sign-off.'],
  [/^tech-pack\.xlsx$/, 'The same pack as a workbook: materials, measurements by size, colourways, construction, labels, samples and SKUs.'],
  [/^artwork\//, 'Artwork pictures on the pack.'],
  [/^sketches\//, 'Technical sketches, flats and reference pictures on the pack.'],
  [/^decorations\/decoration-sheet\.pdf$/, 'Decoration sheet: every placement with its technique, size, position, colours and checks.'],
  [/\.dst$/, 'Embroidery stitch file, Tajima DST (most commercial machines).'],
  [/\.exp$/, 'Embroidery stitch file, Melco EXP.'],
  [/artwork-vector\.svg$/, 'The artwork traced to vector paths, at its placed size.'],
  [/job-sheet\.pdf$/, 'The job sheet for this placement: technique, size, colours (Pantone C), and the settings to make it.'],
  [/job\.json$/, 'Everything on the job sheet, as data.'],
  [/stitch-preview\.png$/, 'The stitch file drawn as it sews out: check it against the sample.'],
  [/^decorations\/[^/]+\/README\.txt$/, 'Notes for this placement: what each of its files is.'],
  [/artwork-300dpi\.png$/, 'The artwork at its placed size, 300 dpi.'],
  [/^decorations\/[^/]+\/(film|ink|plate|underbase)/i, 'A separation for this placement: one plate or film per ink.'],
  [/^decorations\//, 'Production file for this placement.'],
  [/^engineering\/assembly\.stl$/, 'The product assembled, every part at its real shape, in millimetres (STL).'],
  [/^engineering\/assembly\.step$/, 'The assembly for CAD (STEP AP214, mm): every part an exact solid, flat faces as planes and round faces as cylinders, named and coloured.'],
  [/^engineering\/parts\/.+\.step$/, 'One part the factory makes, as an exact solid for the toolmaker\'s CAD (STEP AP214, mm). The number is its item on the parts list.'],
  [/^engineering\/parts\//, 'One part the factory makes (moulded, machined, stamped or cut), on its own as a mesh (STL, mm), for a 3D-printed sample. The number is its item on the parts list.'],
  [/^engineering\/exploded-drawing\.svg$/, 'The exploded drawing: every part ballooned with its item number, and the parts list.'],
  [/^engineering\/parts-list\.csv$/, 'The parts list: item, part, quantity, material, process, finish, colour and mass.'],
  [/^engineering\/cables\.csv$/, 'The cables: each one\'s reference (W1…), what it joins, its wires and connectors, and its length.'],
  [/^engineering\/block-diagram\.svg$/, 'The electronics block diagram: power, the main chip, and what it drives, each line named by its bus.'],
  [/^flats\/spec-sheet\.svg$/, 'Spec sheet as a vector: the flats with placements and measurements.'],
  [/^flats\/tech-flats\.svg$/, 'Technical flats drawn from the pattern, every view.'],
  [/aama\.dxf$/, 'The pattern, every size of the run, AAMA/ASTM DXF in inches (opens in Gerber, Lectra, Optitex and most CAD).'],
  [/^pattern\/.*\.dxf$/, 'The pattern for the base size, plain DXF.'],
  [/^pattern\/.*\.svg$/, 'The pattern pieces drawn to scale, for a look or a print.'],
  [/^last\/.*\.stl$/, 'The last in 3D (mm, Z up), for the last maker or CAD.'],
  [/^last\/.*\.svg$/, 'The last drawn for the last maker: side and bottom with its length, girths and spring.'],
];
const describe = name => (DESCRIBE.find(([re]) => re.test(name)) || [null, ''])[1];

export function readme({ title, version, publishedAt, files, notes = [], stale = false }) {
  const when = d => (d ? new Date(d).toISOString().slice(0, 10) : '');
  const lines = [`${title} · tech pack v${version || '?'} · production package`, `Published ${when(publishedAt) || 'not yet'} · made ${when(new Date())} by Future Basics`, ''];
  if (stale) lines.push('NOTE: the design was changed after this version was published. The decoration, pattern and last files are made from the design as it stands now; where they differ from tech-pack.pdf, the PDF governs. Ask Future Basics for the next version.', '');
  lines.push('Files', '-----');
  for (const f of files) lines.push(`${f.name}${describe(f.name) ? `\n    ${describe(f.name)}` : ''}`);
  if (notes.length) lines.push('', 'Notes', '-----', ...notes.map(n => `- ${n}`));
  lines.push('', 'Colours are Pantone C, matched from the artwork: confirm each against a swatch book. Stitch files are a production-grade start: a digitiser should look them over before a large run (lettering under 5 mm, dense overlaps).', 'Questions go on the pack link (Messages), so the answer stays with the pack.');
  return lines.join('\n') + '\n';
}

export function buildFactoryPackage({ data = {}, title = 'Tech pack', version = null, publishedAt = null, pdf = null, sheets = null, lab = null }) {
  const files = [];
  if (pdf) files.push({ name: 'tech-pack.pdf', data: pdf });
  if (sheets) files.push({ name: 'tech-pack.xlsx', data: sheets });
  files.push(...packPictures(data));
  const notes = [...(lab?.notes || [])];
  for (const f of lab?.files || []) if (!files.some(x => x.name === f.name)) files.push(f);
  if (!lab) notes.push('Decoration, pattern and last files: this pack was not designed in the Future Basics Design Lab, so there are none to make. The artwork files above are the source.');
  const text = readme({ title, version, publishedAt, files, notes, stale: Boolean(lab?.stale) });
  const name = `${slug(title) || 'tech-pack'}-v${version || 0}-production`;
  const entries = [{ name: `${name}/README.txt`, data: Buffer.from(text) }, ...files.map(f => ({ name: `${name}/${f.name}`, data: Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data) }))];
  return { name: `${name}.zip`, zip: zip(entries), files: files.map(f => ({ name: f.name, bytes: (Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data)).length })), readme: text };
}
