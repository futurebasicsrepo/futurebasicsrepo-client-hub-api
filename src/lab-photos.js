// Photographs of real cloth and trims for the materials library: close-ups cut from free photo scans, kept in grey and recoloured to each
// material's colour when shown (GET /lab/material-photos/:id.jpg?c=hex), so one photo serves every colourway. A fabric picks its photo from its
// construction, finish and weight (photoFor); its own swatch photo, when someone adds one, still comes first.
// Shared by the server and the page (/lab/lab-photos.js), so it has no imports. scripts/build-material-photos.mjs makes the files from `src`.
//
// Every photo is free to use commercially. Poly Haven and ambientCG are CC0 (no conditions); the Wikimedia Commons ones are CC BY-SA and carry
// their credit wherever the photo is shown (creditOf).

const PH = (id, label, asset, mm, o = {}) => ({ id, label, kind: 'fabric', tint: true, src: { site: 'polyhaven', asset, mm }, credit: { title: o.title || label, by: o.by || 'Poly Haven', site: 'Poly Haven', url: `https://polyhaven.com/a/${asset}`, licence: 'CC0' }, ...o });
const ACG = (id, label, asset, mm, o = {}) => ({ id, label, kind: 'fabric', tint: true, src: { site: 'ambientcg', asset, mm }, credit: { title: asset.replace(/(\d+)$/, ' $1'), by: 'ambientCG', site: 'ambientCG', url: `https://ambientcg.com/view?id=${asset}`, licence: 'CC0' }, ...o });
const WC = (id, label, kind, file, crop, credit, o = {}) => ({ id, label, kind, tint: kind === 'fabric', src: { site: 'commons', file, crop }, credit: { title: file.replace(/\.\w+$/, ''), site: 'Wikimedia Commons', url: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, '_'))}`, ...credit }, ...o });

// `mm` is how much cloth the close-up shows across; `crop` (Commons) is the part of the photo kept, as fractions [x, y, w, h]
export const MATERIAL_PHOTOS = [
  PH('jersey', 'Cotton jersey', 'cotton_jersey', 16),
  PH('melange', 'Melange jersey', 'jersey_melange', 28),
  PH('sweat', 'Sweatshirt fleece', 'jogging_melange', 30),
  PH('terry', 'Terry loops', 'terry_cloth', 45),
  PH('polar', 'Polar fleece', 'polar_fleece', 55),
  PH('sherpa', 'Sherpa pile', 'curly_teddy_natural', 70),
  PH('knit', 'Knitted jumper', 'knitted_fleece', 60),
  PH('waffle', 'Waffle knit', 'waffle_pique_cotton', 45),
  PH('poplin', 'Poplin', 'stretch_poplin', 18),
  PH('stretch-woven', 'Polyester stretch woven', 'bi_stretch', 22),
  PH('poly-woven', 'Polyester woven', 'terlenka', 22),
  PH('denim', 'Denim', 'denim_fabric_03', 30),
  PH('denim-raw', 'Raw denim', 'denim_fabric_06', 30),
  PH('denim-washed', 'Washed denim', 'denim_fabric_04', 34),
  PH('corduroy', 'Corduroy', 'ribbed_corduroy', 45),
  PH('satin', 'Satin', 'crepe_satin', 45),
  PH('herringbone', 'Herringbone', 'poly_wool_herringbone', 40),
  PH('melton', 'Wool melton', 'caban', 40),
  PH('linen', 'Linen', 'rough_linen', 30),
  PH('velour', 'Velour', 'velour_velvet', 40),
  PH('neoprene', 'Scuba knit', 'scuba_suede', 40),
  ACG('canvas', 'Canvas', 'Fabric030', 70),
  ACG('canvas-light', 'Light canvas', 'Fabric066', 55),
  ACG('duck', 'Heavy duck canvas', 'Fabric063', 70),
  ACG('twill', 'Cotton twill', 'Fabric077', 55),
  ACG('nylon', 'Nylon shell', 'Fabric059', 90),
  WC('ripstop', 'Ripstop', 'fabric', 'RipStop.jpg', [.2, .2, .6, .6], { by: 'Flyout', licence: 'CC BY-SA 3.0' }),
  WC('zip-metal', 'Metal zip', 'trim', 'Coil plastic and metal zippers.jpg', [.0, .06, .62, .36], { by: 'Woodbine9', licence: 'CC BY-SA 4.0' }),
  WC('aglet', 'Aglets', 'trim', 'Three Different Aglets.jpg', [.0, .05, 1, .9], { by: 'Ian W. Fieggen', licence: 'CC BY-SA 3.0' })
];
const BY_ID = new Map(MATERIAL_PHOTOS.map(p => [p.id, p]));
export const photoById = id => BY_ID.get(String(id || '')) || null;
export const creditOf = p => (p ? `Photo: “${p.credit.title}”, ${p.credit.by === p.credit.site ? p.credit.site : `${p.credit.by}, ${p.credit.site}`}, ${p.credit.licence}${p.tint ? ', recoloured' : ''}` : '');

// the photo a material shows: the one chosen on it, else one picked from what it is; '' when no photo fits (the drawing stays)
export function photoFor(m = {}) {
  const s = m.spec || {};
  if (s.photo === 'none') return '';
  if (photoById(s.photo)) return s.photo;
  if (m.kind === 'trim') {
    const w = `${s.category || ''} ${s.material || ''} ${s.finish || ''} ${m.name || ''}`.toLowerCase();
    if (s.category === 'zip' && /brass|metal/.test(w) && !/nickel|silver|black|gunmetal/.test(w)) return 'zip-metal';
    if (s.category === 'aglet' && /brass|metal/.test(w) && !/nickel|silver|black/.test(w)) return 'aglet';
    return '';
  }
  if (m.kind !== 'fabric') return '';
  const c = String(s.construction || '').toLowerCase(), f = String(s.finish || '').toLowerCase(), gsm = Number(s.weightGsm) || 0;
  const heather = (m.colours || []).some(x => /heather|melange|marl/i.test(x?.name || '')) || /melange|heather|marl/i.test(m.name || '');
  if (/denim/.test(c)) return /raw|rigid|rinse/.test(f) ? 'denim-raw' : /wash|fade|bleach|vintage/.test(f) ? 'denim-washed' : 'denim';
  if (/chambray/.test(c)) return 'poplin';
  if (/ripstop/.test(c)) return 'ripstop';
  if (/polar/.test(c)) return 'polar';
  if (/sherpa|teddy|pile/.test(c)) return 'sherpa';
  if (/terry|loopback/.test(c)) return 'terry';
  if (/fleece/.test(c)) return 'sweat';
  if (/waffle|piqu/.test(c)) return 'waffle';
  if (/rib/.test(c)) return '';
  if (/knit \(jumper\)|sweater|gauge|merino/.test(c)) return 'knit';
  if (/jersey|interlock|tricot|performance/.test(c)) return heather ? 'melange' : 'jersey';
  if (/cord(uroy)?$|corduroy/.test(c)) return 'corduroy';
  if (/satin|sateen/.test(c)) return 'satin';
  if (/herringbone/.test(c)) return 'herringbone';
  if (/melton|flannel|boiled wool/.test(c)) return 'melton';
  if (/linen/.test(c)) return 'linen';
  if (/velour|velvet/.test(c)) return 'velour';
  if (/scuba|neoprene/.test(c)) return 'neoprene';
  if (/cordura|ballistic|oxford/.test(c) && /nylon|poly/.test(`${c} ${s.composition || ''}`.toLowerCase())) return 'duck';
  if (/taslan|taffeta|nylon|shell|softshell|pongee|2-layer|3-layer/.test(c)) return 'nylon';
  if (/stretch woven|4-way|bi-stretch/.test(c)) return 'stretch-woven';
  if (/duck|canvas/.test(c)) return gsm >= 440 ? 'duck' : gsm && gsm < 280 ? 'canvas-light' : 'canvas';
  if (/twill|gabardine|drill|chino/.test(c)) return 'twill';
  if (/poplin|oxford|broadcloth/.test(c)) return /oxford/.test(c) ? 'canvas-light' : 'poplin';
  if (/polyester/.test(c)) return 'poly-woven';
  return '';
}
