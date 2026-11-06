// Does the fabric suit the style? A pure check (no imports, so the pages can run it too) of each chosen cloth against what the garment needs:
//   knit or woven  a tee, hoodie or polo is cut from a knit; a shirt, coat or tote from a woven. The other works only with changes, and we say which.
//   weight         each style has a usual range in gsm; far outside it the piece looks thin and see-through, or stiff and boxy.
//   stretch        leggings, swim and bras need real stretch (elastane or a four-way knit); a slim woven trouser wants 2–3% elastane.
//   parts          a rib needs to be a stretch knit, and a lining should be lighter than the shell.
// fabricFit({ style, fit, materials }) → { findings: [{ level: 'fail'|'warn', part, msg, fix }], asks, checked, verdict: 'good'|'check'|'wrong'|'unknown', summary }
//   asks: what the check could not see because the fabric does not say it, to be filled in on the piece (src/lab-materials-routes.js):
//         [{ part, id (the material), name, fields: ['construction'|'weightGsm'|'stretch'|'composition'|…], msg }]. They never make a verdict worse.
// A shoe or a plush is checked on its parts instead (materialFit, below): the upper's leather, the sole's hardness, a plush's pile and eyes.
//   style      a flat style key (src/lab-flats.js STYLES: tee, hoodie, pants, leggings …)
//   materials  the concept's picks (spec.materials: { role, part?, name, kind, spec: { weightGsm, construction, stretch, composition } })

// what each style is usually made from: base cloth, usual weight (gsm), and how much stretch it needs (0 none, 1 a knit's own give, 2 some elastane, 3 four-way)
export const STYLE_CLOTH = {
  tee: { base: 'knit', gsm: [120, 300] }, longsleeve: { base: 'knit', gsm: [120, 300] }, tank: { base: 'knit', gsm: [110, 260] }, polo: { base: 'knit', gsm: [160, 280] },
  crewneck: { base: 'knit', gsm: [240, 520] }, hoodie: { base: 'knit', gsm: [260, 560] }, ziphoodie: { base: 'knit', gsm: [260, 560] },
  beanie: { base: 'knit', gsm: [200, 650] }, bodysuit: { base: 'knit', gsm: [150, 300], stretch: 2 }, leggings: { base: 'knit', gsm: [180, 320], stretch: 3 },
  swimsuit: { base: 'knit', gsm: [150, 280], stretch: 3 }, bikini: { base: 'knit', gsm: [150, 280], stretch: 3 }, bra: { base: 'knit', gsm: [180, 340], stretch: 3 },
  shirt: { base: 'woven', gsm: [80, 240] }, shirtss: { base: 'woven', gsm: [80, 220] }, coat: { base: 'woven', gsm: [250, 900] }, tote: { base: 'woven', gsm: [200, 750] },
  bucket: { base: 'woven', gsm: [180, 450] }, cap: { base: 'woven', gsm: [180, 500] },
  jacket: { base: 'either', gsm: [120, 650] }, vest: { base: 'either', gsm: [120, 650] }, pants: { base: 'either', gsm: [170, 520] }, shorts: { base: 'either', gsm: [140, 460] },
  skirt: { base: 'either', gsm: [90, 460] }, dress: { base: 'either', gsm: [70, 320] }, cami: { base: 'either', gsm: [60, 220] },
};
const LABEL = { tee: 'a tee', longsleeve: 'a long-sleeve tee', tank: 'a tank', polo: 'a polo', crewneck: 'a sweatshirt', hoodie: 'a hoodie', ziphoodie: 'a zip hoodie', beanie: 'a beanie',
  bodysuit: 'a bodysuit', leggings: 'leggings', swimsuit: 'a swimsuit', bikini: 'a bikini', bra: 'a sports bra', shirt: 'a shirt', shirtss: 'a short-sleeve shirt', coat: 'a coat', tote: 'a tote',
  bucket: 'a bucket hat', cap: 'a cap', jacket: 'a jacket', vest: 'a vest', pants: 'trousers', shorts: 'shorts', skirt: 'a skirt', dress: 'a dress', cami: 'a cami' };
const PLURAL = new Set(['leggings', 'pants', 'shorts']);
const STRETCH_WORDS = ['no stretch', 'a knit\'s own give', 'some stretch', 'four-way stretch'];

const KNIT = /jersey|interlock|fleece|sherpa|terry|\brib\b|rib\s*\d|waffle|piqu|tricot|knit|mesh|ponte|scuba|pointelle|velour|jacquard knit/i;
const WOVEN = /broadcloth|lawn|gauze|dobby|end-on-end|moleskin|needlecord|cavalry|shirting|twill|canvas|duck|denim|chambray|corduroy|poplin|oxford|flannel|ripstop|taslan|taffeta|cordura|shell|softshell|woven|melton|satin|linen|seersucker|gabardine|voile|crepe|sateen|herringbone|tweed|nylon|drill/i;
// knit, woven, leather (a hide, or a PU or plant-based sheet), or '' when the words do not say
export function clothOf(m = {}) {
  const s = m.spec || {}, words = [s.construction, m.name].filter(Boolean).join(' ');
  if (/leather|suede|nubuck|shearling|^cork/i.test(String(s.construction || ''))) return 'leather'; // a hide or a coated sheet: cut like a woven, no give
  if (/stretch woven/i.test(words)) return 'woven';
  if (KNIT.test(String(s.construction || ''))) return 'knit'; if (WOVEN.test(String(s.construction || ''))) return 'woven';
  return KNIT.test(words) ? 'knit' : WOVEN.test(words) ? 'woven' : '';
}
// 0–3, from the stretch words, the elastane in it, and a knit's own give
export function stretchOf(m = {}) {
  const s = m.spec || {}, t = String(s.stretch || '').toLowerCase(), comp = String(s.composition || '').toLowerCase();
  let n = /high|4.?way|four.?way/.test(t) ? 3 : /medium|mid|2.?way|two.?way|moderate/.test(t) ? 2 : /low|slight|mechanical|comfort/.test(t) ? 1 : 0;
  const el = /(\d+(?:\.\d+)?)\s*%\s*(elastane|spandex|lycra|elasterell)/.exec(comp);
  if (el) n = Math.max(n, Number(el[1]) >= 10 ? 3 : Number(el[1]) >= 3 ? 2 : 1);
  else if (/elastane|spandex|lycra/.test(comp)) n = Math.max(n, 2);
  if (clothOf(m) === 'knit') n = Math.max(n, 1);
  return n;
}
const gsmOf = m => { const g = Number(m?.spec?.weightGsm); return g > 0 ? g : null; };
const isCloth = m => m && (m.kind === 'fabric' || ['main', 'contrast', 'lining', 'rib'].includes(m.role) || ['self', 'contrast', 'rib', 'lining'].includes(m.part));
const partOf = m => (m.part === 'rib' || m.role === 'rib' ? 'rib' : m.part === 'lining' || m.role === 'lining' ? 'lining' : m.part === 'contrast' || m.role === 'contrast' ? 'contrast' : 'main');

export function fabricFit({ style = '', fit = '', materials = [] } = {}) {
  const need = STYLE_CLOTH[style], picks = (Array.isArray(materials) ? materials : []).filter(isCloth), findings = [], asks = [], a = LABEL[style] || 'this style';
  const say = (level, part, msg, fix) => findings.push({ level, part, msg, fix });
  const ask = (m, part, fields, msg) => { if (fields.length) asks.push({ part, id: m.id || null, name: m.name || '', fields, msg }); };
  if (!need) return { findings, asks, checked: 0, verdict: 'unknown', summary: style ? 'This style has no fabric rules yet.' : 'The style is not known yet: save the flats first.' };
  const main = picks.find(m => partOf(m) === 'main') || null;
  if (!main) return { findings, asks, checked: 0, verdict: 'unknown', summary: 'Choose the main fabric to check it suits the style.' };
  let checked = 0;
  for (const m of picks) {
    const part = partOf(m), cloth = clothOf(m), gsm = gsmOf(m), st = stretchOf(m), name = m.name || 'This fabric'; checked++;
    if (part === 'main' || part === 'contrast') {
      if (need.base === 'knit' && cloth === 'leather') say('warn', part, `${name} is a leather; ${a} is usually cut from a knit.`, 'Leather has no give: cut it with more ease and an opening, or use it on panels and trims instead.');
      if (need.base === 'knit' && cloth === 'woven' && !need.stretch) say('warn', part, `${name} is a woven; ${a} is usually cut from a knit.`, `A woven ${a.replace(/^an? /, '')} needs more ease and an opening (placket or zip) to go on. Choose a knit, or loosen the fit.`);
      if (need.base === 'woven' && cloth === 'knit') say('warn', part, `${name} is a knit; ${a} is usually cut from a woven.`, 'It will drape and stretch out of shape: interface the front, collar and buttonholes, or choose a woven.');
      const stretchKnown = Boolean(String(m.spec?.stretch || '').trim() || String(m.spec?.composition || '').trim()); // a knit's own give is known, its elastane is not
      if (need.stretch && st < need.stretch && !stretchKnown) ask(m, part, ['stretch', 'composition'], `${a[0].toUpperCase() + a.slice(1)} ${PLURAL.has(style) ? 'need' : 'needs'} ${STRETCH_WORDS[need.stretch]}: say how much ${name} stretches, or what it is made of.`);
      else if (need.stretch && st < need.stretch) say(st + 1 < need.stretch || cloth === 'woven' ? 'fail' : 'warn', part, `${a[0].toUpperCase() + a.slice(1)} ${PLURAL.has(style) ? 'need' : 'needs'} ${STRETCH_WORDS[need.stretch]}; ${name} has ${STRETCH_WORDS[st]}.`, need.stretch >= 3 ? 'Choose a four-way stretch knit with 10–20% elastane.' : 'Choose a knit with elastane in it.');
      if (gsm && part === 'main') {
        const [lo, hi] = need.gsm;
        if (gsm < lo * .85) say('warn', part, `${name} is ${gsm} gsm, light for ${a} (usually ${lo}–${hi} gsm).`, 'It may look thin or see-through: go heavier, or line it.');
        if (gsm > hi * 1.15) say('warn', part, `${name} is ${gsm} gsm, heavy for ${a} (usually ${lo}–${hi} gsm).`, 'It will be stiff and bulky at the seams: go lighter.');
      }
      if (part === 'main' && fit === 'slim' && cloth === 'woven' && st < 2 && ['pants', 'shorts', 'skirt', 'shirt', 'shirtss', 'dress'].includes(style)) say('warn', part, `A slim ${a.replace(/^an? /, '')} in a woven with no stretch is tight to move in.`, 'Add 2–3% elastane, or move to a regular fit.');
    }
    if (part === 'rib' && (cloth === 'woven' || st < 2)) say('warn', 'rib', `${name} is on the rib, and a rib needs to be a stretch knit to grip and recover.`, 'Use a 1×1 or 2×2 rib with elastane.');
    if (part === 'lining' && gsm && gsmOf(main) && gsm > gsmOf(main)) say('warn', 'lining', `The lining (${gsm} gsm) is heavier than the shell (${gsmOf(main)} gsm).`, 'Choose a lighter lining so it sits inside without pulling.');
    if (cloth === 'leather' && !gsm) { if ((part === 'main' || part === 'contrast') && !(Number(m.spec?.thicknessMm) > 0)) ask(m, part, ['thicknessMm'], `How thick is ${name} (mm)? It decides what it suits.`); }
    else if ((part === 'main' || part === 'contrast') && !cloth && !gsm) { say('warn', part, `${name} has no construction or weight on it, so it cannot be checked.`, 'Fill them in here (what it is and its gsm), or in the materials library.'); ask(m, part, ['construction', 'weightGsm'], `What is ${name}, and how heavy?`); }
    else if ((part === 'main' || part === 'contrast') && !cloth) ask(m, part, ['construction'], `What is ${name} (jersey, fleece, twill…)? Knit or woven decides what it suits.`);
    else if (part === 'main' && !gsm) ask(m, part, ['weightGsm'], `How heavy is ${name}? Its weight decides whether it reads thin or stiff on ${a}.`);
  }
  const fails = findings.filter(f => f.level === 'fail').length, warns = findings.length - fails;
  return verdictOf(findings, asks, checked, `The fabric suits ${a}`, 'fabric');
}
// the result from the findings: what is wrong first, then what is worth a look, then good (saying what could not be seen)
function verdictOf(findings, asks, checked, goodWords, what = 'material') {
  const fails = findings.filter(f => f.level === 'fail').length, warns = findings.length - fails;
  return { findings, asks, checked, verdict: fails ? 'wrong' : warns ? 'check' : 'good',
    summary: fails ? `${fails} ${what} problem${fails > 1 ? 's' : ''}: ${findings.find(f => f.level === 'fail').msg}` : warns ? `${warns} thing${warns > 1 ? 's' : ''} to check: ${findings[0].msg}`
      : asks.length ? `Nothing wrong so far, but ${asks.length} detail${asks.length > 1 ? 's are' : ' is'} missing to check it fully.` : `${goodWords}.` };
}

// ---- a shoe and a plush: checked on their parts (src/lab-materials-goods.js PARTS) ----
const LEATHER = /upper leather|suede|nubuck|patent|synthetic leather/;
const shore = m => { const h = parseFloat(String(m?.spec?.hardness || '')); return h > 0 ? h : null; };
const mm = m => { const t = Number(m?.spec?.thicknessMm); return t > 0 ? t : null; };
export function footwearFit({ materials = [] } = {}) {
  const on = (Array.isArray(materials) ? materials : []).filter(m => m?.part), findings = [], asks = [], say = (level, part, msg, fix) => findings.push({ level, part, msg, fix });
  const ask = (m, part, fields, msg) => { if (fields.length) asks.push({ part, id: m.id || null, name: m.name || '', fields, msg }); };
  const upper = on.find(m => m.part === 'upper'); if (!upper) return { findings, asks, checked: 0, verdict: 'unknown', summary: 'Choose the upper to check the materials suit a shoe.' };
  const cat = m => String(m?.spec?.category || ''), n = m => m.name || 'This material';
  for (const m of on) {
    const t = mm(m), h = shore(m);
    if (m.part === 'upper' || m.part === 'overlay') {
      if (m.kind === 'fabric') { const g = gsmOf(m); if (!g) ask(m, m.part, ['weightGsm'], `How heavy is ${n(m)}? A cloth upper needs body to hold the last's shape.`); else if (g < 250) say('warn', m.part, `${n(m)} is ${g} gsm, light for a shoe upper.`, 'Laminate it to a backer (foam or a woven) so it holds its shape on the last and does not tear at the eyelets.'); }
      else if (LEATHER.test(cat(m))) {
        if (!t) ask(m, m.part, ['thicknessMm'], `How thick is ${n(m)}? The upper's thickness decides whether it lasts cleanly.`);
        else if (m.part === 'upper' && t < .9) say('warn', 'upper', `${n(m)} is ${t} mm, thin for an upper.`, 'It can tear at the toe when lasted and creases early: go 1.0–2.0 mm, or back it.');
        else if (t > 2.2) say('warn', m.part, `${n(m)} is ${t} mm, thick for ${m.part === 'upper' ? 'an upper' : 'an overlay'}.`, 'It is hard to last and stiff where the foot bends: go under 2.0 mm, or skive the edges.');
        if (m.part === 'upper' && /patent/.test(cat(m))) say('warn', 'upper', `${n(m)} is patent: across the vamp it cracks where the foot bends.`, 'Use patent on overlays and dress shoes, or choose a softer leather for the vamp.');
      }
    }
    if (m.part === 'lining' && t && mm(upper) && t > mm(upper)) say('warn', 'lining', `The lining (${t} mm) is thicker than the upper (${mm(upper)} mm).`, 'Choose a thinner lining so the shoe does not fit small and stiff.');
    if (m.part === 'outsole') {
      if (!h && !/leather/i.test(String(m.spec?.composition || ''))) ask(m, 'outsole', ['hardness'], `How hard is ${n(m)} (Shore A)? It decides grip and wear.`);
      else if (h && h < 55) say('warn', 'outsole', `${n(m)} is ${h} Shore A, soft for an outsole: it wears through fast.`, 'Go 60–75 Shore A, or add a harder rubber at the heel and toe.');
      else if (h && h > 80) say('warn', 'outsole', `${n(m)} is ${h} Shore A, hard for an outsole: it slips on wet floors.`, 'Go 60–75 Shore A for grip.');
      if (t && t < 3) say('warn', 'outsole', `${n(m)} is ${t} mm, thin for an outsole.`, 'Go 3.5 mm or more, more under the heel.');
    }
    if (m.part === 'midsole') {
      if (!h) ask(m, 'midsole', ['hardness'], `How hard is ${n(m)} (Shore A or C)? It decides how the shoe feels underfoot.`);
      else if (h > 70) say('warn', 'midsole', `${n(m)} is ${h}, firm for a midsole: a harsh ride.`, 'Most midsoles sit at 40–60.');
      else if (h < 30) say('warn', 'midsole', `${n(m)} is ${h}, very soft for a midsole: it packs down and feels unstable.`, 'Go 40–60, or add a firmer frame at the heel.');
    }
  }
  if (!on.some(m => m.part === 'outsole') && !on.some(m => m.part === 'midsole')) asks.push({ part: 'outsole', id: null, name: '', fields: [], msg: 'Choose the sole too, to check its hardness and thickness.' });
  return verdictOf(findings, asks, on.length, 'The materials suit a shoe');
}
export function plushFit({ materials = [] } = {}) {
  const on = (Array.isArray(materials) ? materials : []).filter(m => m?.part), findings = [], asks = [], say = (level, part, msg, fix) => findings.push({ level, part, msg, fix });
  const ask = (m, part, fields, msg) => { if (fields.length) asks.push({ part, id: m.id || null, name: m.name || '', fields, msg }); };
  const body = on.find(m => m.part === 'body'); if (!body) return { findings, asks, checked: 0, verdict: 'unknown', summary: 'Choose the body fabric to check the materials suit a plush.' };
  const cat = m => String(m?.spec?.category || ''), n = m => m.name || 'This material';
  for (const m of on) {
    if (m.part === 'body' || m.part === 'contrast') {
      const cloth = m.kind === 'fabric' ? clothOf(m) : '', pile = Number(m.spec?.pileMm) || 0, g = gsmOf(m);
      if (m.kind === 'fabric' && cloth === 'woven') say('warn', m.part, `${n(m)} is a woven: it has no give, so the stuffed shape comes out lumpy.`, 'Use a knit pile (minky, velboa) or a fleece for the body.');
      if (/felt/.test(cat(m)) && m.part === 'body') say('warn', 'body', `${n(m)} is felt: stiff, not cuddly, and it pills.`, 'Keep felt for small details (pads, a nose) and use a pile fabric for the body.');
      if (pile > 20) say('warn', m.part, `${n(m)} has a ${pile} mm pile: it hides the face and the seams.`, 'Shave the pile on the muzzle and around the eyes, or use a shorter pile there.');
      if (m.part === 'body') { if (!g) ask(m, 'body', ['weightGsm'], `How heavy is ${n(m)}? A light pile lets the fill show through.`); else if (g < 180) say('warn', 'body', `${n(m)} is ${g} gsm, light for a plush body: the fill shows through and the seams pull.`, 'Go 250–400 gsm, or back it with a light knit.'); }
    }
    if ((m.part === 'eyes' || m.part === 'nose') && /safety/.test(cat(m))) {
      const sf = String(m.spec?.safety || '');
      if (!sf) ask(m, m.part, ['safety'], `Which safety standard does ${n(m)} meet (EN71, ASTM F963)? A hard eye or nose has to be pull-tested.`);
      if (!/3\s*\+|3 years|36 ?m|over 3/i.test(sf)) say('warn', m.part, `${n(m)} is a hard ${m.part === 'eyes' ? 'eye' : 'nose'}: a small part, not allowed on a toy for under-3s.`, 'Embroider it for a baby toy; otherwise mark the toy 3+ and pull-test the eyes (90 N, EN71-1).');
    }
    if (m.part === 'fill' && /pellet/.test(cat(m))) say('warn', 'fill', `${n(m)} are pellets: they must sit in a sewn inner bag, and are not for under-3s.`, 'Sew an inner pouch for the pellets and mark the toy 3+, or use fibre fill only.');
  }
  if (!on.some(m => m.part === 'fill')) asks.push({ part: 'fill', id: null, name: '', fields: [], msg: 'Choose the fill too.' });
  return verdictOf(findings, asks, on.length, 'The materials suit a plush');
}
// one call for any piece: a shoe and a plush on their parts, clothing on its fabric against the style
export function materialFit({ category = '', style = '', fit = '', materials = [] } = {}) {
  if (category === 'footwear') return footwearFit({ materials });
  if (category === 'plush') return plushFit({ materials });
  return style ? fabricFit({ style, fit, materials }) : null;
}

// A fabric the check calls wrong can be kept on purpose (a woven legging, a deliberately light hoodie), with the reason written down:
// spec.fabricAccept = { reason, by, at, main } holds while the main fabric is still the one it was given for. → the result, marked accepted.
export const mainOf = materials => { const l = Array.isArray(materials) ? materials : []; return l.find(m => isCloth(m) && partOf(m) === 'main') || l.find(m => m?.part === 'upper' || m?.part === 'body') || null; };
export function withAccept(fit, accept, materials) {
  const main = mainOf(materials), ok = fit && fit.verdict !== 'good' && fit.verdict !== 'unknown' && accept && accept.reason && main && accept.main === main.id;
  return ok ? { ...fit, accepted: { reason: accept.reason, by: accept.by || '', at: accept.at || null }, summary: `Kept on purpose: ${accept.reason}${accept.by ? ` (${accept.by})` : ''}. The check said: ${fit.findings[0]?.msg || fit.summary}` } : fit;
}
