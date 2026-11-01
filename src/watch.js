// Watching for copying, and making every file that leaves traceable.
//
// 1. Read limits on the libraries. Each account's pulls of library material are counted per hour, by kind: full-size sketches (and their
//    masks and parts), sketch thumbnails, swatches and material photos, graphic files (vector and stitch), technique photos and samples,
//    and exported files. Ordinary work stays far below the notice level. Past it, an "unusual pull" is recorded once that hour, and it
//    shows on Platform health. Past the stop level (five times the notice), a client account is paused on that kind for the rest of the
//    hour (429). Staff are never paused, only recorded.
// 2. Fingerprints on exports. Every file the app sends for download gets a reference, logged with who took it, from which room, and what.
//    For the design work (Lab exports and the factory package), where the format allows, the reference is written into the file itself: a comment in SVG, DXF, STEP and HTML, the header of an STL, the
//    metadata of a PDF (an incremental update, so the document is untouched), and a manifest inside a zip. A file found elsewhere can be
//    traced back on Platform health (or GET /v1/admin/exports/:ref).
import { randomBytes } from 'node:crypto';
import { crc32 } from './zip.js';

export const LIMITS = {
  sketch: { notice: 300, label: 'full-size sketches' },
  thumb: { notice: 3000, label: 'sketch thumbnails' },
  swatch: { notice: 600, label: 'swatches and material photos' },
  graphic: { notice: 150, label: 'graphic files' },
  technique: { notice: 300, label: 'technique photos' },
  export: { notice: 60, label: 'exported files' }
};
export const STOP_FACTOR = 5;
// The design work whose files carry the reference: everything the Lab exports, and the factory package of a tech pack. Other downloads
// (invoices, contracts, a client's own uploads, a Shopify theme that must go into a store exactly as built) are recorded, not changed.
export const MARKED = /^\/v1\/(lab\/|tp\/[^/]+\/package\.zip$|(admin\/)?products\/[^/]+\/tech-pack\/package\.zip$)/;
const HOUR = 3600_000;

// which kind of library material a request is, or null
export function kindOf(path) {
  const p = String(path || '').split('?')[0];
  if (/^\/lab\/flat-templates\/thumbs\//.test(p)) return 'thumb';
  if (/^\/lab\/(flat-templates|flat-masks|flat-parts)\//.test(p)) return 'sketch';
  if (/^\/lab\/material-photos\//.test(p) || /^\/v1\/lab\/materials\/[^/]+\/swatch$/.test(p)) return 'swatch';
  if (/^\/v1\/lab\/library\/graphics\/[^/]+\/(vector\.svg|embroidery)$/.test(p)) return 'graphic';
  if (/^\/v1\/lab\/library\/(technique-photos\/[^/]+|techniques\/[^/]+\/sample)$/.test(p)) return 'technique';
  return null;
}
// a file sent for download: content-disposition with a filename
export const isFile = cd => /filename/i.test(String(cd || ''));
export const newRef = () => randomBytes(6).toString('hex').toUpperCase().replace(/(.{4})(.{4})(.{4})/, '$1-$2-$3');

// ---- writing the reference into the file ----
const esc = s => String(s).replace(/--/g, '—').replace(/[\r\n]+/g, ' ');
export function markSvg(text, note) {
  const c = `<!-- ${esc(note)} -->`, m = /^﻿?\s*<\?xml[^>]*\?>/.exec(text);
  return m ? text.slice(0, m[0].length) + '\n' + c + text.slice(m[0].length) : c + '\n' + text;
}
export function markHtml(text, note) { const m = /^\s*<!doctype[^>]*>/i.exec(text); const c = `<!-- ${esc(note)} -->`; return m ? text.slice(0, m[0].length) + '\n' + c + text.slice(m[0].length) : c + '\n' + text; }
export const markDxf = (text, note) => `999\n${String(note).replace(/[\r\n]+/g, ' ')}\n` + text;
export function markStep(text, note) { const i = text.indexOf('ISO-10303-21;'); const c = `/* ${String(note).replace(/\*\//g, '')} */`; return i < 0 ? text : text.slice(0, i + 13) + '\n' + c + text.slice(i + 13); }
export function markStl(buf, note) {
  const b = Buffer.from(buf);
  if (b.length >= 84 && b.length === 84 + 50 * b.readUInt32LE(80)) { const h = Buffer.alloc(80, 0x20); h.write(String(note).slice(0, 80), 0, 'ascii'); h.copy(b, 0); return b; } // binary: the 80-byte header is free text
  const t = b.toString('utf8'), nl = t.indexOf('\n'); if (!/^solid/.test(t) || nl < 0) return b;
  return Buffer.from(t.slice(0, nl).replace(/\s*$/, '') + ` (${String(note).replace(/[\r\n]+/g, ' ')})` + t.slice(nl), 'utf8');
}
// PDF: an incremental update that redefines the document's information dictionary with the reference in its keywords. The pages are
// not touched; a reader sees the same document. If the file cannot be read this way it is sent as it was.
export function markPdf(buf, note) {
  try {
    const b = Buffer.from(buf), tail = b.subarray(Math.max(0, b.length - 4096)).toString('latin1');
    const sx = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(tail); if (!sx) return b;
    const tr = tail.lastIndexOf('trailer'); if (tr < 0) return b; // a cross-reference stream: left as it is
    const dict = tail.slice(tr, tail.lastIndexOf('startxref'));
    const size = Number((/\/Size\s+(\d+)/.exec(dict) || [])[1]), root = (/\/Root\s+(\d+\s+\d+\s+R)/.exec(dict) || [])[1]; if (!size || !root) return b;
    const pdfStr = s => '(' + String(s).replace(/[\\()]/g, m => '\\' + m).replace(/·/g, '-').replace(/[^\x20-\x7e]/g, '') + ')';
    const infoRef = /\/Info\s+(\d+)\s+(\d+)\s+R/.exec(dict); let num = size, body = `/Producer ${pdfStr('Future Basics')}`;
    if (infoRef) {
      num = Number(infoRef[1]); const whole = b.toString('latin1'), at = whole.lastIndexOf(`\n${num} ${infoRef[2]} obj`);
      if (at >= 0) { const end = whole.indexOf('endobj', at), inner = whole.slice(at, end), o = inner.indexOf('<<'), c = inner.lastIndexOf('>>'); if (o >= 0 && c > o) body = inner.slice(o + 2, c).replace(/\/Keywords\s*\([^)]*\)/g, ''); }
    }
    const offset = b.length + 1, obj = `\n${num} 0 obj\n<<${body} /Keywords ${pdfStr(note)}>>\nendobj\n`, xrefAt = offset + obj.length - 1;
    const upd = `${obj}xref\n${num} 1\n${String(offset).padStart(10, '0')} 00000 n \ntrailer\n<< /Size ${Math.max(size, num + 1)} /Root ${root} /Info ${num} 0 R /Prev ${sx[1]} >>\nstartxref\n${xrefAt}\n%%EOF\n`;
    return Buffer.concat([b, Buffer.from(upd, 'latin1')]);
  } catch { return Buffer.from(buf); }
}
// zip: one more stored file, a manifest, added before the central directory
export function markZip(buf, name, content) {
  try {
    const b = Buffer.from(buf); let e = -1; for (let i = b.length - 22; i >= Math.max(0, b.length - 66000); i--) if (b.readUInt32LE(i) === 0x06054b50) { e = i; break; }
    if (e < 0) return b;
    const count = b.readUInt16LE(e + 10), cdSize = b.readUInt32LE(e + 12), cdOff = b.readUInt32LE(e + 16), comment = b.subarray(e + 22);
    const nm = Buffer.from(name, 'utf8'), data = Buffer.from(content, 'utf8'), crc = crc32(data), now = new Date();
    const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1), date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(time, 10); local.writeUInt16LE(date, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nm.length, 26);
    const cen = Buffer.alloc(46); cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(time, 12); cen.writeUInt16LE(date, 14); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(data.length, 20); cen.writeUInt32LE(data.length, 24); cen.writeUInt16LE(nm.length, 28); cen.writeUInt32LE(cdOff, 42);
    const added = local.length + nm.length + data.length, end = Buffer.alloc(22); b.copy(end, 0, e, e + 22);
    end.writeUInt16LE(count + 1, 8); end.writeUInt16LE(count + 1, 10); end.writeUInt32LE(cdSize + cen.length + nm.length, 12); end.writeUInt32LE(cdOff + added, 16);
    return Buffer.concat([b.subarray(0, cdOff), local, nm, data, b.subarray(cdOff, cdOff + cdSize), cen, nm, end, comment]);
  } catch { return Buffer.from(buf); }
}
export function markFile(payload, type, note, manifest) {
  const t = String(type || '').toLowerCase(), text = () => (Buffer.isBuffer(payload) ? payload.toString('utf8') : String(payload));
  if (/svg/.test(t)) return markSvg(text(), note);
  if (/text\/html/.test(t)) return markHtml(text(), note);
  if (/dxf/.test(t)) return markDxf(text(), note);
  if (/step/.test(t)) return markStep(text(), note);
  if (/stl/.test(t)) return markStl(Buffer.isBuffer(payload) ? payload : Buffer.from(payload), note);
  if (/pdf/.test(t)) return markPdf(Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'latin1'), note);
  if (/zip/.test(t)) return markZip(Buffer.isBuffer(payload) ? payload : Buffer.from(payload), 'FUTURE-BASICS-EXPORT.txt', manifest);
  return payload; // CSV, images, stitch files: recorded, not changed (a line inside would break them)
}

export function createWatch({ pool, log = console, now = () => Date.now() }) {
  const counts = new Map(); // `${who}|${kind}` -> { hour, n }
  const rooms = new Map();  // client id -> name, for the note in the file
  const hourOf = t => Math.floor(t / HOUR);
  async function ensure() {
    await pool.query(`create table if not exists export_log (ref text primary key, at timestamptz not null default now(), user_id uuid, client_id uuid, role text, ip text,
      method text, path text, filename text, content_type text, bytes int, marked boolean not null default false)`);
    await pool.query('create index if not exists export_log_at on export_log(at desc)');
    await pool.query(`create table if not exists security_events (id bigserial primary key, at timestamptz not null default now(), kind text not null, category text,
      user_id uuid, client_id uuid, role text, ip text, count int, detail text)`);
    await pool.query('create index if not exists security_events_at on security_events(at desc)');
  }
  async function roomName(id) {
    if (!id) return ''; if (rooms.has(id)) return rooms.get(id);
    const n = (await pool.query('select name from clients where id=$1', [id]).catch(() => ({ rows: [] }))).rows[0]?.name || ''; rooms.set(id, n); return n;
  }
  // who the request is: a signed-in account (the API's sign-in or the Lab's page session), else the address it came from
  const whoOf = req => { const a = req.auth || req.labPage || {}; return a.sub ? { key: `u:${a.sub}`, userId: a.sub, role: a.role || '', clientId: a.clientId || null } : { key: `ip:${req.ip}`, userId: null, role: 'anonymous', clientId: null }; };
  const uuid = v => (/^[0-9a-f-]{36}$/i.test(String(v || '')) ? v : null);
  // count one pull; returns 'ok', 'notice' (crossed the notice level just now) or 'stop' (over the stop level, and a client)
  function count(who, kind) {
    const k = `${who.key}|${kind}`, h = hourOf(now()), c = counts.get(k); const cur = c && c.hour === h ? c : { hour: h, n: 0 }; cur.n++; counts.set(k, cur);
    if (counts.size > 50_000) for (const [key, v] of counts) if (v.hour < h) counts.delete(key);
    const L = LIMITS[kind];
    if (who.role === 'client' && cur.n > L.notice * STOP_FACTOR) return { state: cur.n === L.notice * STOP_FACTOR + 1 ? 'stop-now' : 'stop', n: cur.n };
    if (cur.n === L.notice + 1) return { state: 'notice', n: cur.n };
    return { state: 'ok', n: cur.n };
  }
  const event = (kind, category, who, ip, n, detail) => pool.query('insert into security_events(kind,category,user_id,client_id,role,ip,count,detail) values($1,$2,$3,$4,$5,$6,$7,$8)',
    [kind, category, uuid(who.userId), uuid(who.clientId), who.role, ip, n, detail]).catch(e => log.warn?.({ err: e.message }, 'security event not recorded'));
  const refuse = (reply, kind) => { reply.code(429).header('content-type', 'application/json; charset=utf-8').header('cache-control', 'no-store'); reply.removeHeader('content-disposition'); reply.removeHeader('content-encoding');
    return JSON.stringify({ error: `That is a lot of ${LIMITS[kind].label} in one hour, so this account is paused on them for the rest of the hour. If you need more, ask Future Basics.`, code: 'PULL_LIMIT' }); };
  // the hook: after the route has answered, before it is sent
  async function onSend(req, reply, payload) {
    const status = reply.statusCode; if (status < 200 || status >= 300) return payload;
    const p = String(req.url || '').split('?')[0], cd = reply.getHeader('content-disposition'), file = isFile(cd) && (Buffer.isBuffer(payload) || typeof payload === 'string');
    const kind = kindOf(p) || (file ? 'export' : null); if (!kind) return payload;
    const who = whoOf(req), r = count(who, kind);
    if (r.state === 'notice') event('unusual-pull', kind, who, req.ip, r.n, `${r.n} ${LIMITS[kind].label} in an hour (notice at ${LIMITS[kind].notice})`);
    if (r.state === 'stop-now') event('paused', kind, who, req.ip, r.n, `paused on ${LIMITS[kind].label} for the rest of the hour after ${r.n - 1}`);
    if (r.state === 'stop' || r.state === 'stop-now') return refuse(reply, kind);
    if (!file) return payload;
    // the fingerprint
    const ref = newRef(), room = who.role === 'admin' ? 'Future Basics' : who.clientId ? (await roomName(who.clientId)) || 'a client room' : 'a shared link';
    const day = new Date(now()).toISOString().slice(0, 10), type = String(reply.getHeader('content-type') || ''), filename = (/filename\*?=(?:UTF-8'')?"?([^";]+)/i.exec(String(cd)) || [])[1] || '';
    const note = `Future Basics export ${ref} · ${day} · for ${room} · not for redistribution or AI training`;
    const manifest = `Future Basics export\nReference: ${ref}\nDate: ${day}\nFor: ${room}\nFile: ${decodeURIComponent(filename)}\n\nThis package was made for the room named above. It may not be shared outside it, resold, or used to train or prompt AI models.\nQuestions: hello@thefuturebasics.com\n`;
    let out = payload; if (MARKED.test(p)) try { out = markFile(payload, type, note, manifest); } catch {}
    const marked = out !== payload;
    await pool.query('insert into export_log(ref,user_id,client_id,role,ip,method,path,filename,content_type,bytes,marked) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
      [ref, uuid(who.userId), uuid(who.clientId), who.role, req.ip, req.method, p.slice(0, 300), decodeURIComponent(filename).slice(0, 200), type.slice(0, 120), Buffer.byteLength(out), marked]).catch(e => log.warn?.({ err: e.message }, 'export not logged'));
    reply.header('x-export-ref', ref); if (Buffer.isBuffer(out) || typeof out === 'string') reply.removeHeader('content-length');
    return out;
  }
  // Platform health: the copy watch as one check
  async function check() {
    const q = await pool.query(`select e.at,e.kind,e.category,e.count,e.role,coalesce(u.email,e.ip) who,c.name room from security_events e left join users u on u.id=e.user_id left join clients c on c.id=e.client_id
      where e.at>now()-interval '7 days' order by e.at desc limit 6`).catch(() => ({ rows: [] }));
    const x = (await pool.query(`select count(*)::int n, count(distinct coalesce(user_id::text,ip))::int people from export_log where at>now()-interval '24 hours'`).catch(() => ({ rows: [{ n: 0, people: 0 }] }))).rows[0];
    const recent = q.rows.filter(r => Date.now() - new Date(r.at).getTime() < 24 * HOUR), paused = recent.filter(r => r.kind === 'paused');
    return { id: 'copywatch', name: 'Copy watch (library pulls, exports)', group: 'security', status: paused.length ? 'down' : recent.length ? 'warn' : 'ok',
      summary: paused.length ? `${paused.length} account${paused.length === 1 ? ' was' : 's were'} paused for pulling too much in the last day` : recent.length ? `${recent.length} unusual pull${recent.length === 1 ? '' : 's'} in the last day` : 'No unusual pulls in the last day',
      facts: [['Files exported, last 24 hours', `${x.n} by ${x.people} ${x.people === 1 ? 'account' : 'accounts'}`], ...q.rows.map(r => [new Date(r.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }), `${r.kind === 'paused' ? 'Paused' : 'Unusual'}: ${r.who || 'someone'}${r.room ? ` (${r.room})` : ''}, ${r.count} ${LIMITS[r.category]?.label || r.category}`])] };
  }
  async function lookup(ref) {
    return (await pool.query(`select x.ref,x.at,x.role,x.ip,x.method,x.path,x.filename,x.content_type,x.bytes,x.marked,u.email,u.name user_name,c.name room from export_log x left join users u on u.id=x.user_id left join clients c on c.id=x.client_id where x.ref=$1`, [String(ref || '').toUpperCase().trim()])).rows[0] || null;
  }
  return { ensure, onSend, check, lookup, count, _counts: counts };
}
