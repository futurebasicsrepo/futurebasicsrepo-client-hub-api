// What a concept still needs before it becomes a tech pack, read from everything the Design workspace touches: the picture, the graphics placed
// on the garment, the flats and their check, the materials, the twist, the "too close" check and the approval. Pure (the route reads the rows);
// the Design workspace shows it as a checklist, each item with where to fix it.
//   state: 'done' | 'todo' (holds the tech pack up) | 'warn' (worth a look, does not hold it up)
//   go:    { view: 'picture'|'front' } inside the workspace, or { href } elsewhere in the Lab
// A shoe or a plush is made from its pattern, not from flats: `pattern` is { saved, checks: [{level, msg}], main: the part its main material
// goes on, picked: whether a material is on it }, and its items say so.
export function readiness({ concept, studioDoc = null, flat = null, pattern = null }) {
  const c = concept || {}, spec = c.spec || {}, card = { href: `/lab?concept=${c.id}#board` }, items = [];
  const add = (id, label, state, note, go) => items.push({ id, label, state, note, go });
  const isPack = c.status === 'tech_pack';
  add('picture', 'The concept picture', c.has_image ? 'done' : 'todo', c.has_image ? 'The concept has its picture.' : 'Finish the picture, then press Use as the concept picture.', { view: 'picture' });
  const layers = Array.isArray(studioDoc?.layers) ? studioDoc.layers.filter(l => l && l.kind !== 'base' && l.visible !== false) : [], loose = layers.filter(l => !l.placement);
  add('placed', pattern ? 'Graphics placed on the product' : 'Graphics placed on the garment', loose.length ? 'warn' : 'done',
    loose.length ? `${loose.length} layer${loose.length > 1 ? 's' : ''} on the picture ${loose.length > 1 ? 'have' : 'has'} no place on the garment (${loose.slice(0, 3).map(l => l.name || 'a layer').join(', ')}). Choose Goes on, or leave ${loose.length > 1 ? 'them' : 'it'} on the picture only.` : layers.length ? 'Every graphic on the picture has its place and size on the garment.' : 'Nothing extra on the picture to place.', { view: 'picture' });
  const picks = Array.isArray(spec.materials) ? spec.materials : [];
  if (pattern) {
    const go = { view: 'pattern' }, ch = Array.isArray(pattern.checks) ? pattern.checks : [], fails = ch.filter(x => x.level === 'fail'), warns = ch.filter(x => x.level === 'warn');
    add('pattern', 'The pattern saved', pattern.saved ? 'done' : 'todo', pattern.saved ? 'The pattern is saved, and its tech flats are drawn from it.' : 'Open Pattern, set it up (or read it from the picture) and save it.', go);
    add('made', 'It can be made as patterned', !pattern.saved ? 'todo' : fails.length ? 'todo' : warns.length ? 'warn' : 'done',
      !pattern.saved ? 'The pattern\'s checks run once it is saved.' : fails.length ? `${fails.length} problem${fails.length > 1 ? 's' : ''} to fix first: ${fails[0].msg}` : warns.length ? `Can be made: ${warns.length} thing${warns.length > 1 ? 's' : ''} to check (${warns[0].msg})` : 'The pattern\'s checks pass.', go);
    const on = picks.filter(m => m?.part), main = on.some(m => m.part === pattern.main);
    add('materials', `The ${pattern.mainLabel || 'main material'} chosen`, main ? 'done' : on.length ? 'warn' : 'todo', main ? `${on.length} part${on.length > 1 ? 's have' : ' has'} a material.` : on.length ? `Materials are on ${on.length} part${on.length > 1 ? 's' : ''}, but not yet on the ${String(pattern.mainLabel || 'main part').toLowerCase()}.` : 'Choose a material for each part on Pattern (Materials).', go);
  } else {
    add('flats', 'The flats saved', flat ? 'done' : 'todo', flat ? 'The measured flats are saved.' : 'Open the flats, check the measurements and save them.', { view: 'front' });
    const fails = Number(flat?.check?.summary?.fail || 0), warns = Number(flat?.check?.summary?.warn || 0);
    add('made', 'It can be made as drawn', !flat ? 'todo' : fails ? 'todo' : warns ? 'warn' : 'done',
      !flat ? 'The flats check runs when they are saved.' : fails ? `${fails} problem${fails > 1 ? 's' : ''} on the flats to fix before it can be made.` : warns ? `Can be made: ${warns} thing${warns > 1 ? 's' : ''} to check on the flats.` : 'The flats check passes.', { view: 'front' });
    const fabric = picks.some(m => m && (m.kind === 'fabric' || /fabric|main|shell|body/i.test(String(m.role || ''))));
    add('materials', 'The main fabric chosen', fabric ? 'done' : picks.length ? 'warn' : 'todo', fabric ? `${picks.length} material${picks.length > 1 ? 's' : ''} chosen.` : picks.length ? 'Materials are chosen but none is marked as the fabric.' : 'Choose the main fabric and trims on the concept (What it is made of).', card);
  }
  const twist = String(c.twist || '').trim().length >= 15;
  add('twist', 'Our twist written down', twist ? 'done' : 'todo', twist ? 'The twist says what is ours.' : 'Write what our twist is on the concept: approval needs it.', card);
  const close = c.closeness?.verdict === 'too_close';
  if (close) add('close', 'Not too close to what inspired it', 'warn', 'The check says it sits close to a reference: change it, or give a reason when approving.', card);
  const approved = c.status === 'approved' || isPack;
  add('approved', 'Approved', approved ? 'done' : 'todo', approved ? (isPack ? 'Approved, and a tech pack.' : 'Approved.') : c.client_verdict === 'changes' ? 'The client asked for changes: see the concept.' : 'Approve it on the concept when it is right.', card);
  const blocking = items.filter(i => i.state === 'todo'), ready = !blocking.length;
  return { items, ready, isPack, done: items.filter(i => i.state === 'done').length, total: items.length, next: isPack ? { label: 'Open the tech pack', href: c.product_id ? `/tech-packs/${c.product_id}` : card.href } : ready ? { label: 'Send to the tech pack', href: card.href } : null };
}
