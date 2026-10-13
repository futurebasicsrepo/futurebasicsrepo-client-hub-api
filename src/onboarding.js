// New-client onboarding: the details we want once, collected the first time someone signs in to their hub, and the short link staff text to new customers.
//   * A room made by the join link, or by Start project on a won deal, is marked "pending". The hub shows the form on that first visit and keeps a card in
//     Waiting on you until it is done. Rooms that existed before this feature are untouched; staff can ask any room to do it (POST /v1/admin/clients/:id/onboarding).
//   * What is saved: the room's own contact fields (name, phone, website), the answers as a record on the room, and the linked CRM contact (only blanks are filled).
//   * The link: /j/<handle> is the join page with the sender's name on it. The handle is the part before the @ of a staff email.
//   * No payment details here. Contracts take them on Stripe's page.
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const long = (v, n) => String(v ?? '').replace(/\r/g, '').trim().slice(0, n);

export const STORE_PLATFORMS = { shopify: 'Shopify', woocommerce: 'WooCommerce', squarespace: 'Squarespace', wix: 'Wix', bigcommerce: 'BigCommerce', custom: 'A custom-built site', none: 'No store yet', other: 'Something else' };
export const CONTACT_PREFS = { email: 'Email', text: 'Text message', call: 'Phone call' };

// "kyle@thefuturebasics.com" → "kyle". Anything that is not a plain handle gives ''.
export const staffHandle = email => { const h = String(email || '').split('@')[0].toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 30); return /^[a-z0-9][a-z0-9-]*$/.test(h) ? h : ''; };
export const cleanHandle = v => { const h = String(v || '').toLowerCase().trim(); return /^[a-z0-9][a-z0-9-]{0,29}$/.test(h) ? h : ''; };

// The link a person is sent. With details, the join page opens already filled in.
export function joinLink(hubUrl, { handle = '', name = '', email = '', company = '' } = {}) {
  const q = new URLSearchParams(); const set = (k, v) => { const t = String(v || '').trim(); if (t && !/^\s*$/.test(t)) q.set(k, t.slice(0, 140)); };
  set('name', name); set('email', email); set('company', company);
  const base = `${String(hubUrl).replace(/\/$/, '')}/j${cleanHandle(handle) ? '/' + cleanHandle(handle) : ''}`, s = q.toString();
  return s ? `${base}?${s}` : base;
}
// The text a staff member sends with the link: short enough for one message, no jargon.
export const textFor = ({ link, from = '', to = '' }) => `${to ? `Hi ${to}, ` : 'Hi, '}${from ? `it's ${from} at Future Basics. ` : ''}Here is your private link to open your Future Basics hub. It takes about two minutes and there is no password: ${link}`;

const urlOf = v => { const t = clip(v, 300); if (!t) return ''; const u = /^https?:\/\//i.test(t) ? t : `https://${t}`; try { const x = new URL(u); return /\./.test(x.hostname) ? x.toString().replace(/\/$/, '') : null; } catch { return null; } };
const emailOf = v => { const t = clip(v, 254).toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t) ? t : null; };

// → { value } or { error, field }
export function cleanOnboarding(b = {}) {
  const bad = (field, error) => ({ error, field });
  const name = clip(b.name, 140), company = clip(b.company, 140), phone = clip(b.phone, 40), goal = long(b.goal, 2000);
  if (name.length < 2) return bad('name', 'Enter your name');
  if (company.length < 2) return bad('company', 'Enter your company or brand name');
  if (phone.replace(/\D/g, '').length < 7) return bad('phone', 'Enter a mobile number we can text, with the area code');
  if (goal.length < 5) return bad('goal', 'Tell us in a sentence or two what you want to get done with us');
  const website = urlOf(b.website); if (website === null) return bad('website', 'That website does not look right');
  const storeUrl = urlOf(b.storeUrl); if (storeUrl === null) return bad('storeUrl', 'That store address does not look right');
  const billingEmail = clip(b.billingEmail, 254) ? emailOf(b.billingEmail) : ''; if (billingEmail === null) return bad('billingEmail', 'That billing email does not look right');
  const storePlatform = STORE_PLATFORMS[b.storePlatform] ? String(b.storePlatform) : '';
  const contactPref = CONTACT_PREFS[b.contactPref] ? String(b.contactPref) : 'email';
  const a = b.address && typeof b.address === 'object' ? b.address : {};
  const address = { line1: clip(a.line1, 160), line2: clip(a.line2, 160), city: clip(a.city, 100), region: clip(a.region, 60), postal: clip(a.postal, 20), country: clip(a.country, 80) };
  if (Object.values(address).some(Boolean) && !(address.line1 && address.city)) return bad('address', 'Add the street and the city, or leave the address empty');
  return { value: { name, company, phone, goal, role: clip(b.role, 100), legalName: clip(b.legalName, 160), website: website || '', storePlatform, storeUrl: storeUrl || '', address, billingEmail: billingEmail || '', contactPref, bestTime: clip(b.bestTime, 80), timezone: clip(b.timezone, 60), heardFrom: clip(b.heardFrom, 160) } };
}

const addressLine = a => [a?.line1, a?.line2, [a?.city, a?.region, a?.postal].filter(Boolean).join(' '), a?.country].filter(Boolean).join(', ');
export const summaryRows = v => [['Name', v.name + (v.role ? ` (${v.role})` : '')], ['Company', v.company + (v.legalName && v.legalName !== v.company ? ` · legal name ${v.legalName}` : '')], ['Phone', v.phone], ['Prefers', CONTACT_PREFS[v.contactPref] + (v.bestTime ? `, ${v.bestTime}` : '') + (v.timezone ? ` (${v.timezone})` : '')],
  ['Website', v.website], ['Store', v.storePlatform ? STORE_PLATFORMS[v.storePlatform] + (v.storeUrl ? ` · ${v.storeUrl}` : '') : ''], ['Address', addressLine(v.address)], ['Billing email', v.billingEmail], ['Heard about us', v.heardFrom], ['Wants to get done', v.goal]].filter(r => r[1]);

export function registerOnboardingRoutes(app, d) {
  const { pool, authenticate, adminOnly, notifyStaff, emailEscape, hubButton, workUrl, log = console } = d;
  const clientOnly = async (req, reply) => { if (req.auth?.role === 'admin') return reply.code(403).send({ error: req.auth.preview ? 'This is a read-only preview' : 'Onboarding is for client accounts' }); };

  async function current(req) {
    const c = (await pool.query(`select id,name,contact_name,contact_phone,website_url,onboarding_status status,onboarding,onboarding_done_at,acquisition from clients where id=$1`, [req.auth.clientId])).rows[0];
    const u = (await pool.query('select name from users where id=$1', [req.auth.sub])).rows[0];
    return { c, u };
  }
  app.get('/v1/onboarding', { preHandler: authenticate }, async (req, reply) => {
    const { c, u } = await current(req); if (!c) return reply.code(404).send({ error: 'Not found' });
    const saved = c.onboarding || {};
    const values = { name: saved.name || u?.name || c.contact_name || '', company: saved.company || c.name || '', phone: saved.phone || c.contact_phone || '', website: saved.website || c.website_url || '', role: '', legalName: '', storePlatform: '', storeUrl: '', address: {}, billingEmail: '', contactPref: 'email', bestTime: '', timezone: '', heardFrom: '', goal: '', ...saved };
    return { status: c.status || null, values, email: req.auth.email, completedAt: c.onboarding_done_at, sharedBy: c.acquisition?.staff || '', stores: STORE_PLATFORMS, prefs: CONTACT_PREFS };
  });

  app.post('/v1/onboarding', { preHandler: [authenticate, clientOnly] }, async (req, reply) => {
    const r = cleanOnboarding(req.body); if (r.error) return reply.code(422).send({ error: r.error, field: r.field });
    const v = r.value, db = await pool.connect();
    let first = false, client;
    try {
      await db.query('begin');
      const before = (await db.query('select onboarding_status from clients where id=$1 for update', [req.auth.clientId])).rows[0]; if (!before) { await db.query('rollback'); return reply.code(404).send({ error: 'Not found' }); }
      first = before.onboarding_status !== 'done';
      client = (await db.query(`update clients set name=$2, contact_name=$3, contact_phone=$4, website_url=coalesce(nullif($5,''),website_url), onboarding=$6::jsonb, onboarding_status='done', onboarding_done_at=now() where id=$1 returning id,name,slug`,
        [req.auth.clientId, v.company, v.name, v.phone, v.website, JSON.stringify({ ...v, version: 1 })])).rows[0];
      await db.query('update users set name=$2 where id=$1', [req.auth.sub, v.name]);
      // the CRM contact for this person: fill in what it lacks, never overwrite what staff typed
      const contacts = (await db.query(`select id from sales_contacts where client_id=$1 or lower(email)=$2`, [req.auth.clientId, String(req.auth.email || '').toLowerCase()]).catch(() => ({ rows: [] }))).rows;
      for (const ct of contacts) {
        await db.query(`update sales_contacts set name=case when name='' then $2 else name end, phone=case when phone='' then $3 else phone end, title=case when title='' then $4 else title end, updated_at=now() where id=$1`, [ct.id, v.name, v.phone, v.role]);
        if (first) await db.query(`insert into sales_activities(contact_id,kind,text) values($1,'system',$2)`, [ct.id, 'Finished the hub onboarding form']).catch(() => {});
      }
      await db.query('commit');
    } catch (e) { await db.query('rollback').catch(() => {}); throw e; } finally { db.release(); }
    if (first) {
      const rows = summaryRows(v);
      notifyStaff?.(`${client.name} finished onboarding`, `<p><strong>${emailEscape(client.name)}</strong> filled in their details in the hub.</p>${rows.map(([l, x]) => `<p style="margin:4px 0"><strong>${emailEscape(l)}:</strong> ${emailEscape(x)}</p>`).join('')}${hubButton ? hubButton(`${workUrl}/clients/${client.id}`, 'Open the room') : ''}`).catch(e => log.warn?.({ err: e.message }, 'onboarding notice failed'));
    }
    return { ok: true, status: 'done', first };
  });

  // staff: ask a room to do it (or mark it done by hand)
  app.post('/v1/admin/clients/:id/onboarding', { preHandler: [authenticate, adminOnly] }, async (req, reply) => {
    const status = req.body?.status; if (!['pending', 'done'].includes(status)) return reply.code(422).send({ error: 'status is pending or done' });
    const r = await pool.query(`update clients set onboarding_status=$2, onboarding_done_at=case when $2='done' then coalesce(onboarding_done_at,now()) else null end where id=$1 and slug<>'future-basics' returning id`, [req.params.id, status]);
    return r.rowCount ? { ok: true, status } : reply.code(404).send({ error: 'Client not found' });
  });
}
