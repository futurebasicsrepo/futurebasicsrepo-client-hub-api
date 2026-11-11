// The supplier catalogue in the Design Lab (the Sketch library's Catalogue, src/lab-sketches.html): every product as something to start a
// design from. Behind the Lab's own gate, so a client's room with the Lab uses it and a room without cannot.
//   GET  /v1/lab/catalog?q=&group=&limit=&offset=      browse: the products, each with the base it opens on, and the groups with their counts
//   POST /v1/lab/concepts/from-catalog {item, colour?: {name, hex}}   a concept named after the product, on its base → { concept, studio, base }
// NO PRICE LEAVES HERE: the items come from src/lab-catalog.js, which keeps id, name, brand and base only (test/lab-catalog.test.js).
// A product on a library sketch, bag or shoe is started by the route that already does that (from-sketch, from-library-bag,
// from-library-footwear), called inside the service as the same person, so there is one way each kind of concept is made; a product on a style
// with no sketch (a beanie, a tote) or on a product type (src/lab-goods.js) starts on that style's flat, drawn from its measurements.
import { labCatalogItem, browseLabCatalog } from './lab-catalog.js';
import { STYLES } from './lab-flats.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clip = (v, n) => String(v ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
const colourOf = c => { const hex = /^#[0-9a-f]{6}$/i.test(String(c?.hex || '')) ? String(c.hex).toLowerCase() : ''; return hex ? { hex, name: clip(c?.name, 40) } : null; };

// how a catalogue product is started: { via: the route that makes it, body } or { via: 'style', style } or { error }
export function catalogStart(item, colour = null) {
  const b = item?.base; if (!b) return { error: 'Choose a product from the catalogue' };
  const body = { template: b.template, name: clip(item.name, 120), ...(colourOf(colour) ? { colour: colourOf(colour) } : {}) };
  if (b.kind === 'bag') return { via: '/v1/lab/concepts/from-library-bag', body };
  if (b.kind === 'shoe') return { via: '/v1/lab/concepts/from-library-footwear', body };
  if (b.kind === 'style' && b.template) return { via: '/v1/lab/concepts/from-sketch', body };
  const style = b.kind === 'new' ? b.type : b.style;
  if (!STYLES[style]) return { error: `${b.label} cannot be opened in the Studio yet` };
  return { via: 'style', style, name: body.name, colour: body.colour || null };
}
// what a concept remembers of the catalogue product it started from (never its cost)
export const catalogMemo = item => ({ id: item.id, name: clip(item.name, 200), brand: clip(item.brand, 80) });

export function registerLabCatalogRoutes(app, d) {
  const { pool, authenticate, adminOnly, lab = null, flatThumb = null } = d;
  const pre = [authenticate, adminOnly], bad = (reply, error, code = 422) => reply.code(code).send({ error });
  const own = req => lab?.scope?.(req) || null, actorOf = req => (UUID.test(String(req.auth?.sub || '')) ? req.auth.sub : null);

  app.get('/v1/lab/catalog', { preHandler: pre }, async req => browseLabCatalog({ q: clip(req.query?.q, 80), group: clip(req.query?.group, 60), limit: req.query?.limit, offset: req.query?.offset }));

  app.post('/v1/lab/concepts/from-catalog', { preHandler: pre }, async (req, reply) => {
    const item = labCatalogItem(req.body?.item); if (!item) return bad(reply, 'Choose a product from the catalogue', 422);
    const s = catalogStart(item, req.body?.colour); if (s.error) return bad(reply, s.error);
    const memo = catalogMemo(item);
    if (s.via !== 'style') {
      // the route that already starts a concept from this kind of drawing, as the same person (their room, their access)
      const r = await app.inject({ method: 'POST', url: s.via, headers: { 'content-type': 'application/json', ...(req.headers?.authorization ? { authorization: req.headers.authorization } : {}), ...(req.headers?.cookie ? { cookie: req.headers.cookie } : {}) }, payload: s.body });
      let out = null; try { out = r.json(); } catch { out = null; }
      if (r.statusCode !== 201 || !UUID.test(String(out?.concept?.id || ''))) return bad(reply, out?.error || 'The product could not be opened in the Studio', r.statusCode >= 400 ? r.statusCode : 502);
      await pool.query(`update lab_concepts set spec = coalesce(spec,'{}'::jsonb) || $2::jsonb, updated_at=now() where id=$1`, [out.concept.id, JSON.stringify({ catalog: memo })]);
      return reply.code(201).send({ concept: { id: out.concept.id, name: out.concept.name, category: out.concept.category }, studio: out.studio, base: item.base });
    }
    // a style drawn from its measurements: the concept names the style, and its flats start as that style's flat (src/lab-flats-routes.js)
    const S = STYLES[s.style], spec = { description: `Started from the catalogue: ${memo.name}.`, silhouette: S.label, fabric: '', fit: '', details: [], trims: '', colors: s.colour ? [s.colour.name || s.colour.hex] : [], style: s.style, template: 'none', ...(s.colour ? { color: s.colour.hex } : {}), catalog: memo,
      ...(S.kind === 'goods' ? { branding: { logo: { mark: 'none' } } } : {}) }; // a product type starts bare: no logo is put on a mug for its maker (a garment starts as it does from a sketch)
    const id = (await pool.query(`insert into lab_concepts(name, category, role, spec, twist, created_by, client_id) values($1,$2,'core',$3,'',$4,$5) returning id`, [s.name, S.category || 'other', spec, actorOf(req), own(req)])).rows[0].id;
    flatThumb?.(id);
    return reply.code(201).send({ concept: { id, name: s.name, category: S.category || 'other' }, studio: `/lab/studio?concept=${id}&view=front`, base: item.base });
  });
}
