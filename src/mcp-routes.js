// The Design Lab connector: a room's own AI tool (Claude Code, Claude Desktop, Cursor, VS Code: anything that speaks the Model Context Protocol
// and takes a key) designs with the
// Lab. (Tools that connect only by signing in, such as ChatGPT and claude.ai on the web, need OAuth: the next version.) It starts a piece from the recipe menu, sets its measurements, places the brand's marks, runs the flats check and its one-tap fixes,
// reads the pattern's proof, makes the tech pack and asks Future Basics to make it.
//
//   POST /mcp                 the connector (MCP over Streamable HTTP, answered as plain JSON: no stream, no session to keep)
//   GET  /v1/ai-keys          the room's AI access keys (never the keys themselves)
//   POST /v1/ai-keys          {name} a new key, shown once, with how to connect it
//   DELETE /v1/ai-keys/:id    turn a key off
//
// Who it acts as: a key belongs to the person on the room's team who made it. Each call is made as that person, through the same routes the
// Lab's pages call, with a session minted for the call (five minutes). The Lab gate, the room's scoping, the team checks (taken off the team,
// moved room, signed out everywhere) and every check the pages run apply unchanged: the connector adds a way in, not a way round. No tool
// spends an AI generation, sends anything to a factory, or takes a payment. "Ask Future Basics to make it" puts a request in front of our
// team, as the button in the hub does. Only a hash of each key is kept.
import { createHash, randomBytes } from 'node:crypto';
import { SignJWT } from 'jose';
import { placementChecks, overlapChecks, fixPlacement, fixLabel, defaultPlacement, pomTable, describe, STYLES, madeOn } from './lab-flats.js';
import { logoSvg } from './brand-kit.js';

export const MCP_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
export const KEY_PREFIX = 'fbk_';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_KEYS = 10, PER_MINUTE = 120;
export const hashKey = k => createHash('sha256').update(String(k)).digest('hex');
const clip = (s, n) => String(s ?? '').trim().slice(0, n);

const INSTRUCTIONS = `Future Basics Design Lab: design apparel and accessories that a factory can make, in the user's own room.
How to work: list_recipe → start_piece (a base, add-ons, a colour system) → get_piece → set_measurements / place_logo → check_piece (apply_fixes to clear problems) → get_pattern → make_tech_pack → ask_us_to_make_it.
Measurements are in inches, at the sample size (M). The checks are the factory's rules: never tell the user a piece can be made unless check_piece and get_pattern say so. Every answer has a studio link the user can open to see and edit the piece.`;

// ---- the tools ----
const piece = { piece_id: { type: 'string', description: 'The piece (concept) id, from start_piece or list_pieces' } };
export const TOOLS = [
  { name: 'list_recipe', title: 'Recipe menu', description: 'What a piece can start from: the bases (tee, hoodie, joggers, cap, tote…), the add-ons each base takes, and the colour systems. Pass base to see that base\'s add-ons.',
    inputSchema: { type: 'object', properties: { base: { type: 'string', description: 'A base id, to list its add-ons' } } }, annotations: { readOnlyHint: true } },
  { name: 'start_piece', title: 'Start a piece', description: 'Start a new piece from the recipe menu: its flats come out measured, drawn and coloured. Costs no AI generation.',
    inputSchema: { type: 'object', required: ['base'], properties: { base: { type: 'string', description: 'A base id from list_recipe' }, addons: { type: 'array', items: { type: 'string' }, description: 'Add-on ids from list_recipe for this base' }, colour_system: { type: 'string', description: 'A colour system id from list_recipe' }, colour: { type: 'string', description: 'The colour within the system to make it in (its name); the first if left out' }, name: { type: 'string', description: 'What to call the piece' } } },
    annotations: { readOnlyHint: false, destructiveHint: false } },
  { name: 'list_pieces', title: 'Your pieces', description: 'The pieces in the room\'s Design Lab, newest first, with their status (draft, approved, tech_pack).',
    inputSchema: { type: 'object', properties: { status: { type: 'string', enum: ['draft', 'approved', 'rejected', 'tech_pack'] } } }, annotations: { readOnlyHint: true } },
  { name: 'get_piece', title: 'Read a piece', description: 'A piece\'s flats: what it is, its fit, every measurement (inches, sample size), every logo and graphic and where it sits, and what the flats check found.',
    inputSchema: { type: 'object', required: ['piece_id'], properties: piece }, annotations: { readOnlyHint: true } },
  { name: 'set_measurements', title: 'Set measurements', description: 'Change a piece\'s measurements (inches, at the sample size) or its fit. Keys come from get_piece. The size run grades from these.',
    inputSchema: { type: 'object', required: ['piece_id'], properties: { ...piece, measurements: { type: 'object', additionalProperties: { type: 'number' }, description: 'Measurement key → inches, e.g. {"length": 28.5, "chest": 23}' }, fit: { type: 'string', description: 'slim, regular, relaxed, boxy, oversized or wide' } } },
    annotations: { readOnlyHint: false, destructiveHint: false } },
  { name: 'place_logo', title: 'Place a logo', description: 'Put one of the brand\'s marks on the piece where it usually goes for that spot. It is checked at once; get the findings with check_piece.',
    inputSchema: { type: 'object', required: ['piece_id', 'mark'], properties: { ...piece, mark: { type: 'string', enum: ['mark', 'word', 'lockup'], description: 'mark: the cue mark; word: the wordmark; lockup: both' }, where: { type: 'string', description: 'left chest, centre chest, full front, back, back neck, sleeve, hem', default: 'left chest' }, width_in: { type: 'number', description: 'Its width in inches; the usual size for the spot if left out' } } },
    annotations: { readOnlyHint: false, destructiveHint: false } },
  { name: 'check_piece', title: 'Check it can be made', description: 'Run the flats check: every logo and graphic against seams, pockets, zips, edges and what its technique can make. Each problem says what fixes it. apply_fixes: true makes every fix (moved or sized the least it takes) and saves.',
    inputSchema: { type: 'object', required: ['piece_id'], properties: { ...piece, apply_fixes: { type: 'boolean', default: false } } }, annotations: { readOnlyHint: false, destructiveHint: false } },
  { name: 'get_pattern', title: 'Pattern proof', description: 'The sewn pattern\'s proof: whether every seam walks, the made piece measures to its spec at every size, and how much fabric it takes. Also what the room\'s samples taught the pattern.',
    inputSchema: { type: 'object', required: ['piece_id'], properties: piece }, annotations: { readOnlyHint: true } },
  { name: 'make_tech_pack', title: 'Make the tech pack', description: 'Approve the piece and make its tech pack in the room (measurements graded, BOM, construction, the flats). Needs the twist: the specific thing on this piece that is the brand\'s own, in the user\'s words. Refused while the flats check finds a problem: fix it first.',
    inputSchema: { type: 'object', required: ['piece_id', 'twist'], properties: { ...piece, twist: { type: 'string', description: 'What on this piece is the brand\'s own (15 characters or more), as the user said it' } } },
    annotations: { readOnlyHint: false, destructiveHint: false } },
  { name: 'ask_us_to_make_it', title: 'Ask Future Basics to make it', description: 'Ask Future Basics to make a piece that has a tech pack. Our team comes back with a quote; nothing is ordered or paid. Only call this when the user has said, in this conversation, that they want it made.',
    inputSchema: { type: 'object', required: ['piece_id', 'confirm'], properties: { ...piece, quantity: { type: 'integer', minimum: 1 }, note: { type: 'string' }, confirm: { type: 'boolean', description: 'true only when the user asked for it to be made' } } },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true } }
];

// ---- a tool, as the person who owns the key ----
class ToolError extends Error {}
const fail = m => { throw new ToolError(m); };
const markAspect = k => { const v = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(logoSvg(k)); return v ? Number(v[1]) / Number(v[2]) : 1; };

export function createTools({ call, hub = () => '' }) {
  const studio = (id, view = 'front') => `${hub()}/lab/studio?concept=${id}&view=${view}`;
  const ok = (r, what) => { if (r.status >= 400) fail(r.json?.error || `${what} failed (${r.status})`); return r.json; };
  const needPiece = a => { if (!UUID.test(String(a.piece_id || ''))) fail('piece_id is not a piece id: use list_pieces or start_piece'); return a.piece_id; };
  const flatOf = async id => { const f = ok(await call('GET', `/v1/lab/concepts/${id}/flats`), 'Reading the piece'); if (!f.flat) fail(f.unsupported || 'This piece has no flats the Lab can draw'); return f; };
  const save = async (id, flat) => { const { check, saved, updatedAt, ...body } = flat; return ok(await call('PUT', `/v1/lab/concepts/${id}/flats`, body), 'Saving the piece'); };
  const rulesOf = (f, q) => { const t = f.techniques.find(x => x.id === (q.techniqueId || f.madeAs?.[q.id])); return t ? { ...t.rules, techniqueName: t.name, madeOn: madeOn(t) } : {}; };
  const findingsOf = (f, P) => { const over = overlapChecks(P.placements); return P.placements.map(q => ({ q, list: [...placementChecks(q, P, rulesOf(f, q)), ...(over[q.id] || []), ...((P.check?.findings?.[q.id]) || []).filter(x => ['FINE_DETAIL', 'INKS', 'GRADIENT', 'STITCHES', 'TINY'].includes(x.code))] })); };
  const sizeM = P => { try { return Object.fromEntries(pomTable(P).map(r => [r.key, { name: r.name, inches: (r.values.find(v => v.size === (P.size || 'M')) || r.values[0])?.value }])); } catch { return P.m; } };

  return {
    async list_recipe(a) {
      const r = ok(await call('GET', '/v1/lab/recipe'), 'Reading the recipe menu');
      if (a.base) { const b = r.bases.find(x => x.id === a.base); if (!b) fail(`No base "${a.base}": list_recipe without base lists them`);
        return { base: { id: b.id, label: b.label, what: b.styleLabel, note: b.note }, addons: r.addons.filter(x => b.addons.includes(x.id)).map(x => ({ id: x.id, label: x.label, group: x.group })) }; }
      return { bases: r.bases.map(b => ({ id: b.id, label: b.label, what: b.styleLabel, category: b.category, addons: b.addons.length })), colour_systems: r.systems.map(s => ({ id: s.id, name: s.name, mood: s.mood, colours: s.colours.map(c => c.name) })) };
    },
    async start_piece(a) {
      let colour = 0;
      if (a.colour && a.colour_system) { const sys = ok(await call('GET', '/v1/lab/recipe'), 'Reading the recipe menu').systems.find(s => s.id === a.colour_system);
        const i = sys ? sys.colours.findIndex(c => c.name.toLowerCase() === String(a.colour).toLowerCase()) : -1; if (sys && i < 0) fail(`${sys.name} has no colour "${a.colour}": it has ${sys.colours.map(c => c.name).join(', ')}`); colour = Math.max(0, i); }
      const r = await call('POST', '/v1/lab/concepts/from-recipe', { base: a.base, addons: Array.isArray(a.addons) ? a.addons : [], system: a.colour_system || null, colour, name: clip(a.name, 120) });
      const out = ok(r, 'Starting the piece'), c = out.concept;
      return { piece_id: c.id, name: c.name, category: c.category, status: c.status, studio: `${hub()}${out.studio}`, next: 'get_piece to read it; place_logo to brand it; check_piece before make_tech_pack' };
    },
    async list_pieces(a) {
      const r = ok(await call('GET', `/v1/lab/concepts?limit=60${a.status ? `&status=${encodeURIComponent(a.status)}` : ''}`), 'Listing the pieces');
      return { pieces: (r.concepts || []).map(c => ({ piece_id: c.id, name: c.name, category: c.category, status: c.status, updated: c.updatedAt || c.updated_at, studio: studio(c.id) })) };
    },
    async get_piece(a) {
      const id = needPiece(a), f = await flatOf(id), P = f.flat, F = findingsOf(f, P);
      return { piece_id: id, name: f.concept.name, status: f.concept.status, what: STYLES[P.style]?.label || P.style, fit: P.fit, sample_size: P.size || 'M', saved: P.saved, measurements: sizeM(P),
        logos_and_graphics: F.map(({ q, list }) => ({ id: q.id, name: q.name, side: q.view, width_in: q.w, height_in: q.h, where: describe(q, P), problems: list.filter(x => x.level !== 'info').map(x => x.text) })),
        can_be_made: F.every(x => !x.list.some(y => y.level === 'fail')), studio: studio(id) };
    },
    async set_measurements(a) {
      const id = needPiece(a), f = await flatOf(id), P = { ...f.flat, m: { ...f.flat.m } }, changed = [];
      for (const [k, v] of Object.entries(a.measurements || {})) {
        if (!(k in P.m)) fail(`"${k}" is not a measurement of this piece: it has ${Object.keys(P.m).join(', ')}`);
        const n = Number(v), was = Number(P.m[k]); if (!Number.isFinite(n) || n < 0) fail(`${k} must be inches`);
        if (was > 0 && (n > was * 1.6 || n < was * .4)) fail(`${k} from ${was} to ${n} in is more than the Lab moves a measurement at once: change it in steps, or start from another base`);
        P.m[k] = n; changed.push(`${k} ${was} → ${n} in`);
      }
      if (a.fit) P.fit = a.fit;
      if (!changed.length && !a.fit) fail('Nothing to change: give measurements or a fit');
      const r = await save(id, P);
      return { piece_id: id, changed: [...changed, ...(a.fit ? [`fit ${f.flat.fit} → ${a.fit}`] : [])], check: r.check?.summary || null, studio: studio(id) };
    },
    async place_logo(a) {
      const id = needPiece(a), f = await flatOf(id), P = f.flat, k = ['mark', 'word', 'lockup'].includes(a.mark) ? a.mark : fail('mark is mark, word or lockup');
      if ((P.placements || []).length >= 12) fail('A piece takes 12 logos and graphics at most');
      const where = clip(a.where || 'left chest', 60).toLowerCase(), aspect = markAspect(k);
      let q = { id: 'p' + randomBytes(3).toString('hex'), name: { mark: 'Cue mark', word: 'Wordmark', lockup: 'Wordmark and cue mark' }[k], mark: k, source: 'logo', added: true, ...defaultPlacement('logo', P, { aspect, label: where }) };
      const w = Number(a.width_in); if (Number.isFinite(w) && w > 0) { const top = q.y - q.h / 2; q = { ...q, w: Math.round(w * 8) / 8, h: Math.round(w / aspect * 8) / 8 }; q.y = Math.round((top + q.h / 2) * 8) / 8; }
      const t = f.techniques.find(x => x.id === f.firstTechnique?.logo) || f.techniques.find(x => x.id === f.firstTechnique?.mark) || null; if (t) { q.techniqueId = t.id; q.technique = t.base; }
      const next = { ...P, placements: [...(P.placements || []), q] }, r = await save(id, next), problems = (r.check?.findings?.[q.id] || []).filter(x => x.level !== 'info');
      return { piece_id: id, placed: { id: q.id, name: q.name, where: r.where?.[q.id] || describe(q, P), width_in: q.w, height_in: q.h }, problems: problems.map(x => ({ level: x.level, text: x.text, fix: fixLabel(x) })), next: problems.length ? 'check_piece with apply_fixes: true clears these' : 'check_piece before make_tech_pack', studio: studio(id) };
    },
    async check_piece(a) {
      const id = needPiece(a), f = await flatOf(id); let P = f.flat; const applied = [], left = [];
      const techs = f.techniques.map(t => ({ id: t.id, name: t.name, base: t.base, madeOn: madeOn(t) }));
      if (a.apply_fixes) {
        // one finding at a time, nearest first: each fix is checked against the piece as the last one left it
        for (let round = 0; round < 24; round++) {
          const F = findingsOf(f, P), hit = F.flatMap(({ q, list }) => list.filter(x => x.level !== 'info' && fixLabel(x)).map(x => ({ q, x }))).find(({ q, x }) => !left.some(l => l.id === q.id && l.code === x.code));
          if (!hit) break;
          const r = fixPlacement(hit.q, P, hit.x, { rules: rulesOf(f, hit.q), others: P.placements, techniques: techs });
          if (!r) { left.push({ id: hit.q.id, code: hit.x.code, text: hit.x.text }); continue; }
          P = { ...P, placements: P.placements.map(q => (q.id === hit.q.id ? { ...q, ...r.set } : q)) }; applied.push(r.words);
        }
        if (applied.length) { const s = await save(id, P); P = { ...P, check: s.check }; }
      }
      const F = findingsOf(f, P), problems = F.flatMap(({ q, list }) => list.filter(x => x.level !== 'info').map(x => ({ on: q.name, level: x.level, text: x.text, fix: fixLabel(x) || 'change the artwork' })));
      return { piece_id: id, can_be_made: !problems.some(x => x.level === 'fail'), fixed: applied, could_not_fix: left.map(l => `${l.text} Nothing close by clears it: make it smaller or move it in the studio.`), problems,
        next: problems.length ? (a.apply_fixes ? 'What is left needs a person: open the studio' : 'check_piece with apply_fixes: true') : 'get_pattern, then make_tech_pack', studio: studio(id) };
    },
    async get_pattern(a) {
      const id = needPiece(a), r = ok(await call('GET', `/v1/lab/concepts/${id}/pattern`), 'Reading the pattern'), k = r.check;
      return { piece_id: id, sews_together: k ? k.ok : null, checks: k ? `${k.passed} of ${k.made} pass at ${k.size}` : 'This kind of piece is checked its own way: open the pattern in the studio',
        sizes: k?.sizes?.map(z => ({ size: z.size, ok: z.ok, ...(z.why ? { why: z.why } : {}) })) || [], problems: k?.problems || [],
        fabric: r.yardage ? r.yardage : null, learned_from_samples: r.learned ? { on: r.learned.on, samples: r.learned.n, fabric: r.learned.fabric, cut_longer_pct: +(r.learned.length * 100).toFixed(1), cut_wider_pct: +(r.learned.width * 100).toFixed(1) } : null,
        studio: studio(id, 'pattern') };
    },
    async make_tech_pack(a) {
      const id = needPiece(a), twist = clip(a.twist, 400); if (twist.length < 15) fail('The twist is the specific thing on this piece that is the brand\'s own, in a sentence (15 characters or more). Ask the user.');
      const c = ok(await call('GET', `/v1/lab/concepts/${id}`), 'Reading the piece').concept || {};
      if (c.productId || c.product_id) return { piece_id: id, already: true, tech_pack: `${hub()}/tech-packs/${c.productId || c.product_id}` };
      ok(await call('PUT', `/v1/lab/concepts/${id}`, { twist }), 'Saving the twist');
      const ap = await call('POST', `/v1/lab/concepts/${id}/approve`, {});
      // what only a person may decide (too close to what inspired it, or approving what the flats say cannot be made) stays with a person
      if (ap.status >= 400) fail(`${ap.json?.error || 'It could not be approved'}${ap.json?.code === 'CANNOT_MAKE' ? ' Run check_piece with apply_fixes: true, then try again.' : ap.json?.code === 'TOO_CLOSE' ? ' That is the user\'s call: they can approve it with a reason in the studio.' : ''}`);
      const t = ok(await call('POST', `/v1/lab/concepts/${id}/tech-pack`, {}), 'Making the tech pack');
      return { piece_id: id, product_id: t.productId, tech_pack: t.url && /^https?:/.test(t.url) ? t.url : `${hub()}${t.url || ''}`, next: 'The user finishes and publishes it in the hub; ask_us_to_make_it when they want it made' };
    },
    async ask_us_to_make_it(a) {
      if (a.confirm !== true) fail('Only when the user has asked for it to be made: call again with confirm: true');
      const id = needPiece(a), c = ok(await call('GET', `/v1/lab/concepts/${id}`), 'Reading the piece').concept || {}, pid = c.productId || c.product_id;
      if (!pid) fail('It has no tech pack yet: make_tech_pack first');
      const q = Number.isInteger(a.quantity) && a.quantity > 0 ? a.quantity : null;
      const r = ok(await call('POST', `/v1/products/${pid}/make-request`, { qty: q, note: clip(`${clip(a.note, 1400)}\n(Sent from the room's AI tool)`, 1500) }), 'Asking Future Basics');
      return { piece_id: id, requested: true, quantity: q, status: r.request?.status || 'requested', what_happens: 'Future Basics comes back with a quote in the hub. Nothing is ordered or paid until the user accepts it there.' };
    }
  };
}

// ---- the routes ----
export function registerMcpRoutes(app, { pool, secret, authenticate, hubUrl = () => '', log = console }) {
  const hits = new Map(); // key id → { at, n }: calls this minute
  const limited = id => { const now = Date.now(), h = hits.get(id); if (!h || now - h.at > 60000) { hits.set(id, { at: now, n: 1 }); return false; } h.n++; return h.n > PER_MINUTE; };
  const bad = (reply, error, code = 422) => reply.code(code).send({ error });
  const view = r => ({ id: r.id, name: r.name, prefix: r.prefix, createdAt: r.created_at, lastUsedAt: r.last_used_at, calls: r.calls, by: r.by_name || null, revokedAt: r.revoked_at });
  const room = req => (req.auth?.role === 'client' && UUID.test(String(req.auth.clientId || '')) && UUID.test(String(req.auth.sub || '')) ? req.auth.clientId : null);
  const endpoint = () => `${String(hubUrl() || '').replace(/\/$/, '')}/mcp`;

  // the room's keys: anyone on the team sees them and can turn one off; a key is made by, and acts as, the person who made it
  app.get('/v1/ai-keys', { preHandler: authenticate }, async (req, reply) => {
    const cid = room(req); if (!cid) return bad(reply, 'AI access keys belong to a room\'s team', 403);
    const rows = (await pool.query(`select k.*, u.name by_name from ai_keys k left join users u on u.id=k.user_id where k.client_id=$1 and k.revoked_at is null order by k.created_at desc`, [cid])).rows;
    return { keys: rows.map(view), endpoint: endpoint() };
  });
  app.post('/v1/ai-keys', { preHandler: authenticate }, async (req, reply) => {
    const cid = room(req); if (!cid) return bad(reply, 'AI access keys belong to a room\'s team', 403);
    if (req.auth.preview) return bad(reply, 'Client preview is read-only', 403);
    const n = Number((await pool.query('select count(*)::int n from ai_keys where client_id=$1 and revoked_at is null', [cid])).rows[0].n);
    if (n >= MAX_KEYS) return bad(reply, `The room has ${MAX_KEYS} keys turned on. Turn one off first.`, 409);
    const key = KEY_PREFIX + randomBytes(24).toString('base64url'), name = clip(req.body?.name, 60) || 'My AI tool';
    const r = (await pool.query(`insert into ai_keys(client_id, user_id, name, prefix, hash) values($1,$2,$3,$4,$5) returning *`, [cid, req.auth.sub, name, key.slice(0, KEY_PREFIX.length + 6), hashKey(key)])).rows[0];
    await pool.query(`insert into activities(client_id, actor_id, type, summary, metadata) values($1,$2,'ai-connector',$3,$4)`, [cid, req.auth.sub, `An AI access key was made: ${name}`, { keyId: r.id }]).catch(() => {});
    const url = endpoint();
    return reply.code(201).send({ key, keyInfo: view(r), endpoint: url,
      connect: { claudeCode: `claude mcp add --transport http future-basics ${url} --header "Authorization: Bearer ${key}"`,
        json: { mcpServers: { 'future-basics': { type: 'http', url, headers: { Authorization: `Bearer ${key}` } } } },
        // Claude Desktop starts local servers from its config: mcp-remote bridges it to this one (the key in an env var, as mcp-remote documents)
        claudeDesktop: { mcpServers: { 'future-basics': { command: 'npx', args: ['-y', 'mcp-remote', url, '--header', 'Authorization:${AUTH}'], env: { AUTH: `Bearer ${key}` } } } } } });
  });
  app.delete('/v1/ai-keys/:id', { preHandler: authenticate }, async (req, reply) => {
    const cid = room(req); if (!cid) return bad(reply, 'AI access keys belong to a room\'s team', 403);
    if (req.auth.preview) return bad(reply, 'Client preview is read-only', 403);
    if (!UUID.test(String(req.params.id))) return bad(reply, 'Not found', 404);
    const r = await pool.query('update ai_keys set revoked_at=now() where id=$1 and client_id=$2 and revoked_at is null returning id, name', [req.params.id, cid]);
    if (!r.rowCount) return bad(reply, 'Not found', 404);
    await pool.query(`insert into activities(client_id, actor_id, type, summary, metadata) values($1,$2,'ai-connector',$3,$4)`, [cid, req.auth.sub, `An AI access key was turned off: ${r.rows[0].name}`, { keyId: r.rows[0].id }]).catch(() => {});
    return { ok: true };
  });

  // ---- the connector ----
  const rpc = (id, result) => ({ jsonrpc: '2.0', id, result });
  const rpcErr = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
  const unauthorised = (reply, why) => reply.code(401).header('www-authenticate', 'Bearer realm="future-basics", error="invalid_token"').send({ error: why });
  async function who(req) {
    const k = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim(); if (!k.startsWith(KEY_PREFIX)) return null;
    const r = (await pool.query(`select k.id, k.client_id, k.user_id, u.role, u.email, c.slug from ai_keys k join users u on u.id=k.user_id join clients c on c.id=k.client_id where k.hash=$1 and k.revoked_at is null and c.archived_at is null`, [hashKey(k)])).rows[0];
    return r && r.role === 'client' ? r : null;
  }
  const routes = TOOLS.map(t => t.name);
  // GET opens a server-to-client stream in MCP; this connector has nothing to push, so there is none
  app.get('/mcp', { logLevel: 'warn' }, async (_req, reply) => reply.code(405).header('allow', 'POST').send({ error: 'The Future Basics connector takes POST (MCP over HTTP). Add it to your AI tool with your AI access key.' }));
  app.delete('/mcp', { logLevel: 'warn' }, async (_req, reply) => reply.code(405).header('allow', 'POST').send({ error: 'No session to end' }));
  app.post('/mcp', { logLevel: 'warn', bodyLimit: 200_000 }, async (req, reply) => {
    const k = await who(req); if (!k) return unauthorised(reply, 'Add your Future Basics AI access key as a bearer token (Authorization: Bearer fbk_…). Make one in the hub, under the Design Lab.');
    if (limited(k.id)) return reply.code(429).header('retry-after', '60').send(rpcErr(req.body?.id, -32000, `More than ${PER_MINUTE} calls a minute on this key: wait a minute`));
    const m = req.body;
    if (Array.isArray(m)) return reply.send(rpcErr(null, -32600, 'Batches are not taken: send one message at a time'));
    if (!m || m.jsonrpc !== '2.0' || typeof m.method !== 'string') return reply.code(400).send(rpcErr(m?.id, -32600, 'Not a JSON-RPC 2.0 message'));
    if (m.id === undefined) return reply.code(202).send(); // a notification (initialized, cancelled): nothing to answer
    pool.query('update ai_keys set last_used_at=now(), calls=calls+1 where id=$1', [k.id]).catch(() => {});
    if (m.method === 'initialize') {
      const asked = String(m.params?.protocolVersion || ''), v = MCP_PROTOCOLS.includes(asked) ? asked : MCP_PROTOCOLS[0];
      return rpc(m.id, { protocolVersion: v, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'future-basics-design-lab', title: 'Future Basics Design Lab', version: '1.0.0' }, instructions: INSTRUCTIONS });
    }
    if (m.method === 'ping') return rpc(m.id, {});
    if (m.method === 'tools/list') return rpc(m.id, { tools: TOOLS });
    if (m.method !== 'tools/call') return rpcErr(m.id, -32601, `No method ${m.method}`);
    const name = String(m.params?.name || ''), args = m.params?.arguments && typeof m.params.arguments === 'object' ? m.params.arguments : {};
    if (!routes.includes(name)) return rpcErr(m.id, -32602, `No tool ${name}`);
    // the session this call runs on: the key's person, in the key's room, for five minutes, through the routes the pages call
    const token = await new SignJWT({ sub: k.user_id, clientId: k.client_id, client: k.slug, role: 'client', email: k.email, via: 'ai-key', keyId: k.id }).setProtectedHeader({ alg: 'HS256' }).setIssuer('future-basics-client-hub').setIssuedAt().setExpirationTime('5m').sign(secret);
    const call = async (method, url, payload) => { const r = await app.inject({ method, url, headers: { authorization: `Bearer ${token}`, ...(payload ? { 'content-type': 'application/json' } : {}) }, ...(payload ? { payload } : {}) }); let json = null; try { json = r.json(); } catch { json = null; } return { status: r.statusCode, json }; };
    try {
      const out = await createTools({ call, hub: () => String(hubUrl() || '').replace(/\/$/, '') })[name](args);
      if (['start_piece', 'make_tech_pack', 'ask_us_to_make_it'].includes(name)) pool.query(`insert into activities(client_id, actor_id, type, summary, metadata) values($1,$2,'ai-connector',$3,$4)`, [k.client_id, k.user_id, `From the room's AI tool: ${name.replace(/_/g, ' ')}`, { keyId: k.id, tool: name, pieceId: out.piece_id || null, productId: out.product_id || null }]).catch(() => {});
      return rpc(m.id, { content: [{ type: 'text', text: JSON.stringify(out, null, 1) }], isError: false });
    } catch (e) {
      if (!(e instanceof ToolError)) log.warn?.({ err: e.message, tool: name }, 'connector tool failed');
      return rpc(m.id, { content: [{ type: 'text', text: e instanceof ToolError ? e.message : 'The Lab could not do that just now. Try again, or open the studio.' }], isError: true });
    }
  });
}
