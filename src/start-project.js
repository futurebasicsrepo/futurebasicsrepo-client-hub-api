// A won deal becomes work: the client's room (found or made), a project in it, and for software a build record, with the deal's owner as the account owner.
import { cleanProject, newBuildFor } from './software.js';

const slugOf = name => String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'client';

// Returns { ok: true, client, project } or { error, status, existing? }. Safe to ask twice: a deal that already started a project says so unless asked for another.
export async function startProject(pool, { dealId, actor = null, kind = 'software', name = '', newBuild = true, again = false }) {
  const db = await pool.connect();
  try {
    await db.query('begin');
    const deal = (await db.query(`select d.id, d.title, d.stage, d.owner_id, d.project_id, d.contact_id, ct.name contact_name, lower(ct.email) contact_email, ct.client_id contact_client_id,
        coalesce(co.name, co2.name, '') company
      from sales_deals d left join sales_contacts ct on ct.id=d.contact_id left join sales_companies co on co.id=d.company_id left join sales_companies co2 on co2.id=ct.company_id where d.id=$1 for update of d`, [dealId])).rows[0];
    if (!deal) { await db.query('rollback'); return { error: 'Not found', status: 404 }; }
    if (deal.stage !== 'won') { await db.query('rollback'); return { error: 'Move the deal to Won first: a project starts from a deal you have won', status: 409 }; }
    if (deal.project_id && !again) {
      const ex = (await db.query('select p.id, p.name, p.client_id from projects p where p.id=$1', [deal.project_id])).rows[0];
      if (ex) { await db.query('rollback'); return { error: `This deal already started “${ex.name}”`, status: 409, existing: { projectId: ex.id, clientId: ex.client_id } }; }
    }
    const pv = cleanProject({ name: name || deal.title, kind }); if (pv.error) { await db.query('rollback'); return { error: pv.error, status: 422 }; }
    const v = pv.value;

    // the client's room: the contact's own, else one with the company's name, else a new one
    let client = null;
    if (deal.contact_client_id) client = (await db.query(`select id, name, owner_id from clients where id=$1 and archived_at is null`, [deal.contact_client_id])).rows[0] || null;
    const wanted = (deal.company || deal.contact_name || deal.title).trim();
    if (!client) client = (await db.query(`select id, name, owner_id from clients where lower(name)=lower($1) and archived_at is null and slug<>'future-basics' limit 1`, [wanted])).rows[0] || null;
    let created = false;
    if (!client) {
      const base = slugOf(wanted); let slug = base;
      for (let n = 2; (await db.query('select 1 from clients where slug=$1', [slug])).rowCount; n++) slug = `${base}-${n}`;
      client = (await db.query(`insert into clients(name, slug, status, contact_name, contact_email, allowed_emails, notes, activated_at) values($1,$2,'active',$3,$4,$5,$6,now()) returning id, name, owner_id`,
        [wanted.slice(0, 160), slug, deal.contact_name || null, deal.contact_email || null, deal.contact_email ? [deal.contact_email] : [], `Started from the won deal “${deal.title}”`])).rows[0];
      await db.query(`insert into projects(client_id,name,status,milestone) values($1,'General development','active','In progress') on conflict (client_id,name) do nothing`, [client.id]);
      created = true;
    }
    if (v.kind === 'software' && newBuild !== false) v.build_id = await newBuildFor(db, v.name);
    const dup = (await db.query('select id from projects where client_id=$1 and name=$2', [client.id, v.name])).rows[0];
    if (dup) { await db.query('rollback'); return { error: `${client.name} already has a project called “${v.name}”. Give this one another name`, status: 409, existing: { projectId: dup.id, clientId: client.id } }; }
    const project = (await db.query(`insert into projects(client_id,name,status,milestone,kind,build_id,stage) values($1,$2,'active','Kickoff',$3,$4,$5) returning id, name, kind`, [client.id, v.name, v.kind, v.build_id, v.stage])).rows[0];

    const owner = deal.owner_id || client.owner_id || actor;
    await db.query('update sales_deals set project_id=$2, owner_id=coalesce(owner_id,$3), updated_at=now() where id=$1', [deal.id, project.id, actor]);
    await db.query('update clients set owner_id=coalesce(owner_id,$2) where id=$1', [client.id, owner]);
    if (deal.contact_id && !deal.contact_client_id) await db.query('update sales_contacts set client_id=$2 where id=$1 and client_id is null', [deal.contact_id, client.id]);
    if (deal.contact_id) await db.query(`insert into sales_activities(contact_id, deal_id, kind, text, actor_id) values($1,$2,'system',$3,$4)`,
      [deal.contact_id, deal.id, `Project started: ${project.name} (${v.kind === 'software' ? 'software' : 'product'} development) in ${created ? 'a new' : 'the'} room for ${client.name}`, actor]);
    await db.query('commit');
    return { ok: true, client: { id: client.id, name: client.name, created }, project, ownerId: owner || null };
  } catch (e) { await db.query('rollback').catch(() => {}); throw e; } finally { db.release(); }
}
