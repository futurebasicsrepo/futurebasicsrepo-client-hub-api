// The product's folder: everything the client is owed for one product, in one place, as a list and as one zip.
//   1 Tech pack      the PDF of every published version (made by the server, see refreshTechPackPdf)
//   2 Your uploads   what the client uploaded: artwork in the pack, reference photos they started from, files they sent
//   3 Design files   what Future Basics made or uploaded for them: the approved hero image, colourway pictures, design files
//   4 3D model       the STL and its preview
// Nothing is copied into a folder table. The list is read from where each file already lives, every time, so a new version, a new
// upload, a new picture or a new model is in the folder (and in the next zip) the moment it exists.
import { readFile, writeFile, unlink, access } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { zip } from './zip.js';
import { techPackPdf } from './tp-pdf.js';
import { normalizeTechPack, normalizeVerification } from './techpack.js';

export const GROUPS = [['techpack', '1 Tech pack', 'Tech pack'], ['uploads', '2 Your uploads', 'Your uploads'], ['design', '3 Design files', 'Design files'], ['model', '4 3D model', '3D model'], ['internal', '5 Internal (staff only)', 'Internal, staff only']];
export const PDF_ASSET = 'Tech pack (PDF)';
const MAX_ZIP_BYTES = 250 * 1024 * 1024;
const slug = s => String(s || 'file').normalize('NFKD').replace(/[^\w.\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 80) || 'file';
const MIME_EXT = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/svg+xml': 'svg' };
const parseData = uri => { const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(String(uri || '')); return m ? { mime: m[1].toLowerCase(), b64: m[2] } : null; };
const dataBytes = uri => { const d = parseData(uri); return d ? Math.floor(d.b64.length * 3 / 4) : 0; };
const inPackImage = (id, label, uri, group, at) => { const d = parseData(uri); if (!d) return null; const ext = MIME_EXT[d.mime] || 'img'; return { id, group, name: `${label}.${ext}`, label, mime: d.mime, bytes: dataBytes(uri), at, latest: true, source: 'pack' }; };

// product: { id, client_id, title }. admin: staff also see what is marked internal.
export async function listFiles({ pool, uploadDir, meshDir, product, admin = false }) {
  const items = [];
  // files uploaded and filed as assets (client uploads, staff uploads, the generated PDFs), every version
  const av = (await pool.query(`select av.id,av.version,av.original_name,av.mime_type,av.size_bytes,av.created_at,av.notes,a.id asset_id,a.name asset_name,a.kind,a.visibility,a.current_version,u.role uploader_role
    from asset_versions av join assets a on a.id=av.asset_id left join users u on u.id=av.uploader_id where a.product_id=$1 order by a.name,av.version desc`, [product.id])).rows;
  for (const r of av) {
    if (r.visibility !== 'client' && !admin) continue;
    const isPdf = r.kind === 'tech-pack', group = r.visibility !== 'client' ? 'internal' : isPdf ? 'techpack' : r.uploader_role === 'client' ? 'uploads' : 'design';
    const ext = extname(r.original_name || '').toLowerCase();
    const label = isPdf ? `Tech pack ${String(r.notes || '').replace(/^pack /, '') || 'v' + r.version}` : `${r.asset_name}${r.current_version > 1 ? ' v' + r.version : ''}`;
    items.push({ id: `av:${r.id}`, group, name: isPdf ? r.original_name : `${slug(r.asset_name)}${r.current_version > 1 || r.version > 1 ? `-v${r.version}` : ''}${ext}`, label, mime: r.mime_type || 'application/octet-stream', bytes: Number(r.size_bytes), at: r.created_at, version: r.version, latest: r.version === r.current_version, source: 'asset', note: isPdf ? null : r.notes || null });
  }
  // what is in the pack: the client's artwork and photos, the approved hero, the colourway pictures
  const tp = (await pool.query(`select data,published_data,published_at,initiated_by,updated_at from tech_packs where product_id=$1`, [product.id])).rows[0];
  if (tp) {
    const pack = normalizeTechPack(tp.published_data || tp.data), at = tp.published_at || tp.updated_at, mine = tp.initiated_by === 'client';
    pack.artwork.forEach(a => { const it = a.image && inPackImage(`art:${a.id}`, `Artwork — ${a.name || 'artwork'}`, a.image, 'uploads', at); if (it) { it.name = `${slug('artwork-' + (a.name || a.id))}.${it.name.split('.').pop()}`; items.push(it); } });
    pack.sketches.forEach((s, i) => {
      if (/^cutout-/.test(String(s.id || ''))) return;
      if (s.image) { const it = inPackImage(`sk:${s.id}`, `Reference — ${s.view}${s.label ? ' ' + s.label : ''}`, s.image, mine && i === 0 ? 'uploads' : 'design', at); if (it) { it.name = `${slug('reference-' + s.view + (s.label ? '-' + s.label : '') + (pack.sketches.filter(x => x.view === s.view).length > 1 ? '-' + (i + 1) : ''))}.${it.name.split('.').pop()}`; items.push(it); } }
      if (s.hero && s.hero.image) { const it = inPackImage(`hero:${s.id}`, `Hero image — ${s.view}`, s.hero.image, 'design', at); if (it) { it.name = `${slug('hero-image-' + s.view)}.${it.name.split('.').pop()}`; items.push(it); } }
    });
    pack.renderings.filter(r => r.image && !/^cutout-/.test(String(r.id || ''))).forEach((r, i) => { const it = inPackImage(`rend:${r.id}`, `Colourway — ${r.name || i + 1}`, r.image, 'design', at); if (it) { it.name = `${slug('colourway-' + (r.name || i + 1))}.${it.name.split('.').pop()}`; items.push(it); } });
  }
  // the 3D shape
  const m = (await pool.query(`select id,stl_file,thumb_file,stl_bytes,completed_at,created_at,pack_version from tech_pack_models where product_id=$1 and status='done' and stl_file is not null order by created_at desc limit 1`, [product.id])).rows[0];
  if (m) {
    const have = async f => f && await access(join(meshDir, f)).then(() => true, () => false);
    if (await have(m.stl_file)) items.push({ id: `stl:${m.id}`, group: 'model', name: `${slug(product.title)}-3d-shape.stl`, label: '3D shape (STL)', mime: 'model/stl', bytes: Number(m.stl_bytes) || 0, at: m.completed_at || m.created_at, latest: true, source: 'model', note: 'Made from one picture to show the form; the tech pack\'s measurements decide the size.' });
    if (await have(m.thumb_file)) items.push({ id: `stlthumb:${m.id}`, group: 'model', name: `${slug(product.title)}-3d-shape-preview.jpg`, label: '3D shape preview', mime: 'image/jpeg', bytes: 0, at: m.completed_at || m.created_at, latest: true, source: 'model' });
  }
  items.sort((a, b) => new Date(b.at) - new Date(a.at));
  const groups = GROUPS.map(([key, folder, title]) => ({ key, folder, title, items: items.filter(i => i.group === key) })).filter(g => g.items.length);
  return { groups, count: items.length, bytes: items.reduce((s, i) => s + (i.bytes || 0), 0) };
}

// The bytes of one item, or null when it is not there any more.
export async function readItem({ pool, uploadDir, meshDir, product, id, admin = false }) {
  const [kind, key] = String(id).split(/:(.+)/);
  if (kind === 'av') {
    const r = (await pool.query(`select av.*,a.visibility,a.product_id,a.kind from asset_versions av join assets a on a.id=av.asset_id where av.id=$1 and a.product_id=$2`, [key, product.id])).rows[0];
    if (!r || (r.visibility !== 'client' && !admin)) return null;
    try { return { buf: await readFile(join(uploadDir, r.storage_name)), name: r.original_name, mime: r.mime_type || 'application/octet-stream' }; } catch { return null; }
  }
  if (kind === 'stl' || kind === 'stlthumb') {
    const m = (await pool.query(`select * from tech_pack_models where id=$1 and product_id=$2 and status='done'`, [key, product.id])).rows[0]; if (!m) return null;
    try { return kind === 'stl' ? { buf: await readFile(join(meshDir, m.stl_file)), name: `${slug(product.title)}-3d-shape.stl`, mime: 'model/stl' } : { buf: await readFile(join(meshDir, m.thumb_file)), name: `${slug(product.title)}-3d-shape-preview.jpg`, mime: 'image/jpeg' }; } catch { return null; }
  }
  // from the pack: found by listing, so the name and the rules are the same as in the folder
  const list = await listFiles({ pool, uploadDir, meshDir, product, admin }), it = list.groups.flatMap(g => g.items).find(i => i.id === id); if (!it) return null;
  const tp = (await pool.query(`select data,published_data from tech_packs where product_id=$1`, [product.id])).rows[0]; if (!tp) return null;
  const pack = normalizeTechPack(tp.published_data || tp.data); let uri = null;
  if (kind === 'art') uri = pack.artwork.find(a => a.id === key)?.image; else if (kind === 'sk') uri = pack.sketches.find(s => s.id === key)?.image; else if (kind === 'hero') uri = pack.sketches.find(s => s.id === key)?.hero?.image; else if (kind === 'rend') uri = pack.renderings.find(r => r.id === key)?.image;
  const d = parseData(uri); return d ? { buf: Buffer.from(d.b64, 'base64'), name: it.name, mime: d.mime } : null;
}

// Everything in the folder, as one zip, laid out by folder, with a note of what is inside.
export async function buildZip({ pool, uploadDir, meshDir, product, admin = false }) {
  const list = await listFiles({ pool, uploadDir, meshDir, product, admin });
  if (list.bytes > MAX_ZIP_BYTES) { const e = new Error('This folder is too large to download as one zip. Download the files one at a time.'); e.statusCode = 413; throw e; }
  const root = `${slug(product.title)}-files`, used = new Set(), entries = [], readme = [`${product.title}`, `Files from Future Basics, ${new Date().toISOString().slice(0, 10)}`, ''];
  for (const g of list.groups) {
    readme.push(`${g.folder}`);
    for (const it of g.items) {
      const f = await readItem({ pool, uploadDir, meshDir, product, id: it.id, admin }); if (!f) continue;
      let name = it.name, n = 1; while (used.has(`${g.folder}/${name}`)) { const e = extname(it.name); name = `${it.name.slice(0, it.name.length - e.length)}-${++n}${e}`; }
      used.add(`${g.folder}/${name}`); entries.push({ name: `${root}/${g.folder}/${name}`, data: f.buf, date: new Date(it.at) });
      readme.push(`  ${name}${it.latest ? '' : '   (an earlier version)'}`);
    }
    readme.push('');
  }
  readme.push('Anything added later, such as a new tech pack version, a new upload or a new picture, appears in your folder in the hub and in the next zip you download.');
  entries.unshift({ name: `${root}/README.txt`, data: Buffer.from(readme.join('\n'), 'utf8'), date: new Date() });
  return { buf: zip(entries), name: `${root}.zip`, count: entries.length - 1 };
}

// ---- the tech pack PDFs: one per published version, made by the server and filed as a versioned asset ----
// A version's PDF is made once when it is published and made again (in place, not as a new version) when its signatures or pictures change.
export async function refreshTechPackPdf({ pool, uploadDir, productId, version = null, actorId = null }) {
  const tp = (await pool.query(`select tp.*,p.title,p.client_id c_id,c.name client_name,pr.name project_name from tech_packs tp join products p on p.id=tp.product_id join clients c on c.id=tp.client_id left join projects pr on pr.id=p.project_id where tp.product_id=$1`, [productId])).rows[0];
  if (!tp || !tp.published_at || !tp.published_data) return null;
  const v = version ?? tp.version;
  let snap = { data: tp.published_data, verification: tp.verification, lockedAt: tp.locked_at, publishedAt: tp.published_at };
  if (v !== tp.version) {
    const old = (await pool.query(`select * from tech_pack_versions where tech_pack_id=$1 and version=$2`, [tp.id, v])).rows[0]; if (!old) return null;
    snap = { data: old.data, verification: old.verification, lockedAt: old.locked_at, publishedAt: old.published_at };
  }
  const buf = await techPackPdf({ pack: snap.data, product: { title: tp.title }, version: v, publishedAt: snap.publishedAt, verification: normalizeVerification(snap.verification, v), revisions: (Array.isArray(tp.revisions) ? tp.revisions : []).filter(r => r.version <= v), lockedAt: snap.lockedAt, client: tp.client_name, project: tp.project_name || '' });
  const asset = (await pool.query(`insert into assets(product_id,name,kind,visibility) values($1,$2,'tech-pack','client') on conflict(product_id,name) do update set kind='tech-pack',visibility='client' returning *`, [productId, PDF_ASSET])).rows[0];
  const original = `${slug(tp.title)}-tech-pack-v${v}.pdf`, storage = `${randomBytes(18).toString('hex')}-${original}`, note = `pack v${v}`;
  await writeFile(join(uploadDir, storage), buf);
  const same = (await pool.query(`select * from asset_versions where asset_id=$1 and notes=$2 order by version desc limit 1`, [asset.id, note])).rows[0];
  if (same) {
    await pool.query(`update asset_versions set storage_name=$2,size_bytes=$3,original_name=$4,created_at=now() where id=$1`, [same.id, storage, buf.length, original]);
    await unlink(join(uploadDir, same.storage_name)).catch(() => {});
    return { versionId: same.id, replaced: true, version: v };
  }
  const n = (await pool.query(`update assets set current_version=current_version+1,updated_at=now() where id=$1 returning current_version`, [asset.id])).rows[0].current_version;
  const row = (await pool.query(`insert into asset_versions(asset_id,uploader_id,version,original_name,storage_name,mime_type,size_bytes,notes) values($1,$2,$3,$4,$5,'application/pdf',$6,$7) returning id`, [asset.id, actorId, n, original, storage, buf.length, note])).rows[0];
  return { versionId: row.id, replaced: false, version: v, isNew: true, clientId: tp.c_id, title: tp.title };
}
// Every published version has its PDF: earlier versions are made the first time anyone asks, so a product published before the folder existed gets its history.
export async function ensureAllPdfs({ pool, uploadDir, productId }) {
  const tp = (await pool.query(`select id,version,published_at from tech_packs where product_id=$1`, [productId])).rows[0]; if (!tp || !tp.published_at) return [];
  const have = new Set((await pool.query(`select av.notes from asset_versions av join assets a on a.id=av.asset_id where a.product_id=$1 and a.kind='tech-pack'`, [productId])).rows.map(r => r.notes));
  const versions = (await pool.query(`select version from tech_pack_versions where tech_pack_id=$1 order by version`, [tp.id])).rows.map(r => r.version);
  if (!versions.includes(tp.version)) versions.push(tp.version);
  const made = [];
  for (const v of versions) if (!have.has(`pack v${v}`)) { const r = await refreshTechPackPdf({ pool, uploadDir, productId, version: v }); if (r) made.push(r); }
  return made;
}
