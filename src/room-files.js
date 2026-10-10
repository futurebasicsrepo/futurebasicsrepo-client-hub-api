// "All files": everything sent in a room that is not tied to a product, in one list, the way a chat keeps attachments.
//   room files     sent from the hub's Files panel, or added by staff (room_files)
//   chat files     attached to a message in a project thread (project_files); they were already shared with the thread
// Who sees what:
//   a client      what they sent themselves, what staff marked client-visible, and the attachments in their own project threads
//   staff         everything, with the two switches (client-visible, factory-visible) and the project/product a file belongs to
//   a factory     only files staff marked factory-visible, only in a project where that factory holds an assigned pack
// Product folders (tech pack PDFs, artwork, design files, the 3D shape) stay in src/files.js; this list links to them, it does not copy them.

const ARCHIVED = `(ap.archived_at is not null or ap.status in ('archive','archived'))`;

const shape = r => ({
  id: `${r.source}:${r.id}`, source: r.source === 'rf' ? 'room' : 'chat', name: r.original_name, mime: r.mime_type || 'application/octet-stream',
  bytes: Number(r.size_bytes) || 0, at: r.created_at, by: r.uploader_role, byName: r.uploader_name || (r.uploader_role === 'admin' ? 'Future Basics' : 'Client'),
  note: r.note || '', clientVisible: r.source === 'pf' ? true : Boolean(r.client_visible), factoryVisible: Boolean(r.factory_visible),
  purpose: r.purpose || '', projectId: r.project_id || null, projectName: r.project_name || '', productId: r.product_id || null, productTitle: r.product_title || ''
});

// One client's files, newest first. admin: staff see all of it; otherwise only what the client is entitled to.
export async function listRoomFiles(pool, clientId, { admin = false } = {}) {
  const room = (await pool.query(`select 'rf' source,rf.id,rf.original_name,rf.mime_type,rf.size_bytes,rf.created_at,rf.uploader_role,rf.note,rf.client_visible,rf.factory_visible,
      rf.project_id,pr.name project_name,rf.product_id,p.title product_title,rf.purpose,coalesce(u.name,u.email) uploader_name
    from room_files rf left join projects pr on pr.id=rf.project_id left join products p on p.id=rf.product_id left join users u on u.id=rf.uploader_id
    where rf.client_id=$1 ${admin ? '' : `and (rf.uploader_role='client' or rf.client_visible)`}`, [clientId])).rows;
  const chat = (await pool.query(`select 'pf' source,pf.id,pf.original_name,pf.mime_type,pf.size_bytes,pf.created_at,pf.uploader_role,null note,true client_visible,pf.factory_visible,
      pf.project_id,pr.name project_name,null product_id,null product_title,null purpose,coalesce(u.name,u.email) uploader_name
    from project_files pf join projects pr on pr.id=pf.project_id left join users u on u.id=pf.uploader_id where pf.client_id=$1`, [clientId])).rows;
  return [...room, ...chat].map(shape).sort((a, b) => new Date(b.at) - new Date(a.at));
}

// The projects in which this factory holds a pack assigned to it, with the titles of those packs.
export async function factoryProjects(pool, supplierId) {
  const rows = (await pool.query(`select p.project_id,p.title from tech_pack_shares s join tech_packs tp on tp.id=s.tech_pack_id join products p on p.id=tp.product_id
      join projects ap on ap.id=p.project_id
    where s.supplier_id=$1 and s.assigned and s.revoked_at is null and (s.expires_at is null or s.expires_at>now()) and tp.published_at is not null and not ${ARCHIVED}
    order by s.created_at desc`, [supplierId])).rows;
  const map = new Map();
  for (const r of rows) { if (!map.has(r.project_id)) map.set(r.project_id, []); if (!map.get(r.project_id).includes(r.title)) map.get(r.project_id).push(r.title); }
  return map;
}

// What a factory may see: factory-visible files of its projects. No client or project name goes out: the packs the factory holds name the project.
export async function listFactoryFiles(pool, supplierId) {
  const projects = await factoryProjects(pool, supplierId); if (!projects.size) return [];
  const ids = [...projects.keys()];
  const rows = (await pool.query(`select 'rf' source,id,original_name,mime_type,size_bytes,created_at,project_id from room_files where project_id=any($1::uuid[]) and factory_visible
    union all select 'pf',id,original_name,mime_type,size_bytes,created_at,project_id from project_files where project_id=any($1::uuid[]) and factory_visible`, [ids])).rows;
  return rows.map(r => ({ id: `${r.source}:${r.id}`, name: r.original_name, mime: r.mime_type || 'application/octet-stream', bytes: Number(r.size_bytes) || 0, at: r.created_at, packs: projects.get(r.project_id) || [] }))
    .sort((a, b) => new Date(b.at) - new Date(a.at));
}

export const parseFileId = id => { const m = /^(rf|pf):([0-9a-f-]{36})$/i.exec(String(id || '')); return m ? { source: m[1].toLowerCase(), id: m[2] } : null; };

// The stored row behind an id, with the rule that decides who may take it. null when it does not exist or may not be seen.
//   who: { admin:true } | { clientId } | { supplierId }
export async function fileFor(pool, fid, who) {
  const k = parseFileId(fid); if (!k) return null;
  const table = k.source === 'rf' ? 'room_files' : 'project_files';
  const row = (await pool.query(`select * from ${table} where id=$1`, [k.id])).rows[0]; if (!row) return null;
  if (who.admin) return { ...k, row };
  if (who.clientId) {
    if (row.client_id !== who.clientId) return null;
    return k.source === 'pf' || row.uploader_role === 'client' || row.client_visible ? { ...k, row } : null;
  }
  if (who.supplierId) {
    if (!row.factory_visible || !row.project_id) return null;
    return (await factoryProjects(pool, who.supplierId)).has(row.project_id) ? { ...k, row } : null;
  }
  return null;
}
