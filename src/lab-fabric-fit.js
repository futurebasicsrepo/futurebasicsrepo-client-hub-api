// Does the fabric suit the style? A pure check (no imports, so the pages can run it too) of each chosen cloth against what the garment needs:
//   knit or woven  a tee, hoodie or polo is cut from a knit; a shirt, coat or tote from a woven. The other works only with changes, and we say which.
//   weight         each style has a usual range in gsm; far outside it the piece looks thin and see-through, or stiff and boxy.
//   stretch        leggings, swim and bras need real stretch (elastane or a four-way knit); a slim woven trouser wants 2–3% elastane.
//   parts          a rib needs to be a stretch knit, and a lining should be lighter than the shell.
// fabricFit({ style, fit, materials }) → { findings: [{ level: 'fail'|'warn', part, msg, fix }], checked, verdict: 'good'|'check'|'wrong'|'unknown', summary }
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
const WOVEN = /twill|canvas|duck|denim|chambray|corduroy|poplin|oxford|flannel|ripstop|taslan|taffeta|cordura|shell|softshell|woven|melton|satin|linen|seersucker|gabardine|voile|crepe|sateen|herringbone|tweed|nylon|drill/i;
// knit, woven, or '' when the words do not say
export function clothOf(m = {}) {
  const s = m.spec || {}, words = [s.construction, m.name].filter(Boolean).join(' ');
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
  const need = STYLE_CLOTH[style], picks = (Array.isArray(materials) ? materials : []).filter(isCloth), findings = [], a = LABEL[style] || 'this style';
  const say = (level, part, msg, fix) => findings.push({ level, part, msg, fix });
  if (!need) return { findings, checked: 0, verdict: 'unknown', summary: style ? 'This style has no fabric rules yet.' : 'The style is not known yet: save the flats first.' };
  const main = picks.find(m => partOf(m) === 'main') || null;
  if (!main) return { findings, checked: 0, verdict: 'unknown', summary: 'Choose the main fabric to check it suits the style.' };
  let checked = 0;
  for (const m of picks) {
    const part = partOf(m), cloth = clothOf(m), gsm = gsmOf(m), st = stretchOf(m), name = m.name || 'This fabric'; checked++;
    if (part === 'main' || part === 'contrast') {
      if (need.base === 'knit' && cloth === 'woven' && !need.stretch) say('warn', part, `${name} is a woven; ${a} is usually cut from a knit.`, `A woven ${a.replace(/^an? /, '')} needs more ease and an opening (placket or zip) to go on. Choose a knit, or loosen the fit.`);
      if (need.base === 'woven' && cloth === 'knit') say('warn', part, `${name} is a knit; ${a} is usually cut from a woven.`, 'It will drape and stretch out of shape: interface the front, collar and buttonholes, or choose a woven.');
      if (need.stretch && st < need.stretch) say(st + 1 < need.stretch || cloth === 'woven' ? 'fail' : 'warn', part, `${a[0].toUpperCase() + a.slice(1)} ${PLURAL.has(style) ? 'need' : 'needs'} ${STRETCH_WORDS[need.stretch]}; ${name} has ${STRETCH_WORDS[st]}.`, need.stretch >= 3 ? 'Choose a four-way stretch knit with 10–20% elastane.' : 'Choose a knit with elastane in it.');
      if (gsm && part === 'main') {
        const [lo, hi] = need.gsm;
        if (gsm < lo * .85) say('warn', part, `${name} is ${gsm} gsm, light for ${a} (usually ${lo}–${hi} gsm).`, 'It may look thin or see-through: go heavier, or line it.');
        if (gsm > hi * 1.15) say('warn', part, `${name} is ${gsm} gsm, heavy for ${a} (usually ${lo}–${hi} gsm).`, 'It will be stiff and bulky at the seams: go lighter.');
      }
      if (part === 'main' && fit === 'slim' && cloth === 'woven' && st < 2 && ['pants', 'shorts', 'skirt', 'shirt', 'shirtss', 'dress'].includes(style)) say('warn', part, `A slim ${a.replace(/^an? /, '')} in a woven with no stretch is tight to move in.`, 'Add 2–3% elastane, or move to a regular fit.');
    }
    if (part === 'rib' && (cloth === 'woven' || st < 2)) say('warn', 'rib', `${name} is on the rib, and a rib needs to be a stretch knit to grip and recover.`, 'Use a 1×1 or 2×2 rib with elastane.');
    if (part === 'lining' && gsm && gsmOf(main) && gsm > gsmOf(main)) say('warn', 'lining', `The lining (${gsm} gsm) is heavier than the shell (${gsmOf(main)} gsm).`, 'Choose a lighter lining so it sits inside without pulling.');
    if ((part === 'main' || part === 'contrast') && !cloth && !gsm) say('warn', part, `${name} has no construction or weight on it, so it cannot be checked.`, 'Add its construction and gsm in the materials library.');
  }
  const fails = findings.filter(f => f.level === 'fail').length, warns = findings.length - fails;
  return { findings, checked, verdict: fails ? 'wrong' : warns ? 'check' : 'good',
    summary: fails ? `${fails} fabric problem${fails > 1 ? 's' : ''}: ${findings.find(f => f.level === 'fail').msg}` : warns ? `${warns} thing${warns > 1 ? 's' : ''} to check: ${findings[0].msg}` : `The fabric suits ${a}.` };
}
