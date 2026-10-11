// Factories: what each one makes, the skills it has, where it is, and where its assigned work stands. The rules are plain functions
// (test/factories.test.js); the staff API is src/factories-routes.js and the page is src/factories.html.

// Product types are the families the tech packs already know (src/categories.js), grouped the way people talk about them.
export const PRODUCT_TYPES = [
  { group: 'Garments', types: [['top', 'Tops and tees'], ['bottom', 'Bottoms'], ['outerwear', 'Outerwear'], ['dress', 'Dresses and one-pieces'], ['hosiery', 'Socks and gloves']] },
  { group: 'Footwear and headwear', types: [['footwear', 'Footwear'], ['headwear', 'Hats and caps']] },
  { group: 'Bags and soft goods', types: [['bag', 'Bags and cases'], ['flat', 'Blankets, scarves, flat textiles'], ['belt', 'Belts and pet gear'], ['plush', 'Plush']] },
  { group: 'Hard goods', types: [['drink', 'Drinkware'], ['jewelry', 'Jewelry and watches'], ['eyewear', 'Eyewear'], ['small', 'Pins, patches, keychains'], ['box', 'Boxes and packaging']] },
  { group: 'Electronics', types: [['tech', 'Accessories and chargers'], ['electronics', 'Electronics and devices']] }
];
export const TYPE_KEYS = PRODUCT_TYPES.flatMap(g => g.types.map(t => t[0]));
export const typeLabel = k => PRODUCT_TYPES.flatMap(g => g.types).find(t => t[0] === k)?.[1] || k;

// Skills are what the factory can do to a product, beyond making it.
export const SKILLS = [
  ['cut-sew', 'Cut and sew'], ['knit', 'Knitting'], ['woven', 'Woven fabric'], ['embroidery', 'Embroidery'], ['screen-print', 'Screen printing'],
  ['dtf-dtg', 'DTF and DTG printing'], ['sublimation', 'Sublimation'], ['heat-transfer', 'Heat transfer and labels'], ['dye-wash', 'Dyeing and washing'],
  ['leather', 'Leather work'], ['injection', 'Injection moulding'], ['die-cast', 'Die casting and metal'], ['enamel', 'Enamel and pin making'],
  ['silicone', 'Silicone and rubber'], ['pcb', 'PCB assembly'], ['firmware', 'Firmware and testing'], ['laser', 'Laser cutting and engraving'],
  ['3d-print', '3D printing and prototyping'], ['sampling', 'Fast sampling'], ['private-label', 'Private label and packing'], ['low-moq', 'Low minimums'], ['qc', 'In-house QC']
];
export const SKILL_KEYS = SKILLS.map(s => s[0]);
export const skillLabel = k => SKILLS.find(s => s[0] === k)?.[1] || k;

const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001F]/g, ' ').trim().slice(0, n);
const list = (v, allowed, extraMax = 0) => {
  const out = []; const src = Array.isArray(v) ? v : String(v || '').split(',');
  for (let x of src) { x = String(x || '').trim().toLowerCase(); if (!x) continue; if (!allowed.includes(x) && !extraMax) continue; if (!allowed.includes(x)) x = x.replace(/[^a-z0-9 -]/g, '').slice(0, 30); if (x && !out.includes(x)) out.push(x); }
  return out.slice(0, 40);
};

// What a staff member may set on a factory. Anything not sent keeps its value; a bad value is an error naming the field.
export function cleanProfile(input = {}, cur = {}) {
  const has = k => Object.prototype.hasOwnProperty.call(input, k);
  const out = {};
  if (has('productTypes')) out.productTypes = list(input.productTypes, TYPE_KEYS);
  if (has('skills')) out.skills = list(input.skills, SKILL_KEYS, 1);
  if (has('city')) out.city = clean(input.city, 80);
  if (has('country')) out.country = clean(input.country, 80);
  if (has('website')) { const w = clean(input.website, 200); if (w && !/^https?:\/\//i.test(w)) out.website = 'https://' + w; else out.website = w; if (out.website && !/^https?:\/\/[^\s.]+\.[^\s]{2,}$/i.test(out.website)) return { error: 'That website address does not look right' }; }
  if (has('leadTimeDays')) { const n = input.leadTimeDays === '' || input.leadTimeDays == null ? null : Math.round(Number(input.leadTimeDays)); if (n != null && !(n >= 0 && n <= 730)) return { error: 'Lead time is a number of days, 0 to 730' }; out.leadTimeDays = n; }
  if (has('notes')) out.notes = clean(input.notes, 2000);
  // a pin set by hand beats the one worked out from the place; clearing both numbers goes back to the place
  const place = () => geocode(out.city ?? cur.city, out.country ?? cur.country);
  const blank = v => v === '' || v == null;
  if (has('lat') || has('lng')) {
    if (blank(input.lat) && blank(input.lng)) { const g = place(); out.lat = g ? g.lat : null; out.lng = g ? g.lng : null; out.geoManual = false; }
    else {
      const lat = Number(input.lat), lng = Number(input.lng);
      if (blank(input.lat) || blank(input.lng) || !(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)) return { error: 'The pin needs a latitude (-90 to 90) and a longitude (-180 to 180)' };
      out.lat = Math.round(lat * 1e4) / 1e4; out.lng = Math.round(lng * 1e4) / 1e4; out.geoManual = true;
    }
  } else if (('city' in out || 'country' in out) && !cur.geoManual) {
    const g = place(); out.lat = g ? g.lat : null; out.lng = g ? g.lng : null; out.geoManual = false;
  }
  return { p: out };
}

// ---- a pin from the place name: the cities factories are usually in, then the country ----
const CITIES = {
  shenzhen: [22.54, 114.06], guangzhou: [23.13, 113.26], dongguan: [23.02, 113.75], foshan: [23.02, 113.12], zhongshan: [22.52, 113.39], shantou: [23.35, 116.68], huizhou: [23.11, 114.42],
  shanghai: [31.23, 121.47], hangzhou: [30.27, 120.15], ningbo: [29.87, 121.55], suzhou: [31.3, 120.59], wuxi: [31.49, 120.31], nanjing: [32.06, 118.8], yiwu: [29.31, 120.07], wenzhou: [28.0, 120.67], shaoxing: [30.0, 120.58],
  xiamen: [24.48, 118.09], fuzhou: [26.07, 119.3], quanzhou: [24.87, 118.68], jinjiang: [24.78, 118.57], putian: [25.43, 119.0], qingdao: [36.07, 120.38], tianjin: [39.34, 117.36], beijing: [39.9, 116.4], wuhan: [30.59, 114.3], chengdu: [30.57, 104.07], chongqing: [29.56, 106.55],
  'hong kong': [22.32, 114.17], macau: [22.2, 113.54], taipei: [25.03, 121.57], taichung: [24.15, 120.67], seoul: [37.57, 126.98], busan: [35.18, 129.08], tokyo: [35.68, 139.69], osaka: [34.69, 135.5],
  'ho chi minh city': [10.82, 106.63], 'ho chi minh': [10.82, 106.63], saigon: [10.82, 106.63], hanoi: [21.03, 105.85], 'hai phong': [20.86, 106.68], bangkok: [13.76, 100.5], jakarta: [-6.2, 106.85], bandung: [-6.91, 107.61], manila: [14.6, 120.98], cebu: [10.32, 123.89],
  'kuala lumpur': [3.14, 101.69], penang: [5.41, 100.34], singapore: [1.35, 103.82], dhaka: [23.81, 90.41], chittagong: [22.36, 91.78], karachi: [24.86, 67.0], lahore: [31.55, 74.34], sialkot: [32.49, 74.53], delhi: [28.61, 77.21], 'new delhi': [28.61, 77.21], mumbai: [19.08, 72.88],
  chennai: [13.08, 80.27], tirupur: [11.11, 77.34], bangalore: [12.97, 77.59], bengaluru: [12.97, 77.59], kolkata: [22.57, 88.36], colombo: [6.93, 79.86], kathmandu: [27.72, 85.32],
  istanbul: [41.01, 28.98], izmir: [38.42, 27.14], bursa: [40.19, 29.06], lisbon: [38.72, -9.14], porto: [41.15, -8.61], guimaraes: [41.44, -8.3], barcelona: [41.39, 2.17], madrid: [40.42, -3.7], valencia: [39.47, -0.38],
  milan: [45.46, 9.19], florence: [43.77, 11.26], prato: [43.88, 11.1], como: [45.81, 9.09], paris: [48.86, 2.35], london: [51.51, -0.13], manchester: [53.48, -2.24], leicester: [52.64, -1.13], berlin: [52.52, 13.4], munich: [48.14, 11.58], amsterdam: [52.37, 4.9],
  warsaw: [52.23, 21.01], lodz: [51.76, 19.46], bucharest: [44.43, 26.1], sofia: [42.7, 23.32], budapest: [47.5, 19.04], prague: [50.08, 14.44],
  'los angeles': [34.05, -118.24], 'new york': [40.71, -74.0], chicago: [41.88, -87.63], dallas: [32.78, -96.8], miami: [25.76, -80.19], seattle: [47.61, -122.33], portland: [45.52, -122.68], 'san francisco': [37.77, -122.42], vancouver: [49.28, -123.12], toronto: [43.65, -79.38],
  'mexico city': [19.43, -99.13], guadalajara: [20.67, -103.35], leon: [21.12, -101.68], monterrey: [25.69, -100.32], tijuana: [32.51, -117.04], lima: [-12.05, -77.04], bogota: [4.71, -74.07], medellin: [6.24, -75.58], 'sao paulo': [-23.55, -46.63], 'buenos aires': [-34.6, -58.38], santiago: [-33.45, -70.67],
  cairo: [30.04, 31.24], casablanca: [33.57, -7.59], tunis: [36.81, 10.18], nairobi: [-1.29, 36.82], 'addis ababa': [9.03, 38.74], johannesburg: [-26.2, 28.05], 'cape town': [-33.92, 18.42], dubai: [25.2, 55.27], 'tel aviv': [32.09, 34.78], sydney: [-33.87, 151.21], melbourne: [-37.81, 144.96]
};
const COUNTRIES = {
  china: [35.0, 103.0], 'hong kong': [22.32, 114.17], taiwan: [23.7, 121.0], 'south korea': [36.5, 127.8], korea: [36.5, 127.8], japan: [36.2, 138.3], vietnam: [14.1, 108.3], thailand: [15.9, 100.99], indonesia: [-2.5, 118.0], philippines: [12.9, 121.8], malaysia: [4.2, 102.0], singapore: [1.35, 103.82],
  cambodia: [12.6, 104.99], myanmar: [21.9, 95.96], bangladesh: [23.7, 90.4], pakistan: [30.4, 69.3], india: [21.0, 78.0], 'sri lanka': [7.9, 80.8], nepal: [28.4, 84.1], turkey: [39.0, 35.2], turkiye: [39.0, 35.2], portugal: [39.4, -8.2], spain: [40.2, -3.7], italy: [42.8, 12.6], france: [46.6, 2.2],
  'united kingdom': [54.0, -2.5], uk: [54.0, -2.5], england: [52.5, -1.5], germany: [51.2, 10.4], netherlands: [52.2, 5.3], poland: [52.0, 19.1], romania: [45.9, 24.97], bulgaria: [42.7, 25.5], hungary: [47.2, 19.5], 'czech republic': [49.8, 15.5], czechia: [49.8, 15.5],
  'united states': [39.8, -98.6], usa: [39.8, -98.6], us: [39.8, -98.6], canada: [56.1, -106.3], mexico: [23.6, -102.5], guatemala: [15.8, -90.2], honduras: [15.2, -86.2], 'el salvador': [13.8, -88.9], nicaragua: [12.9, -85.2], colombia: [4.6, -74.3], peru: [-9.2, -75.0], brazil: [-14.2, -51.9], argentina: [-38.4, -63.6], chile: [-35.7, -71.5],
  egypt: [26.8, 30.8], morocco: [31.8, -7.1], tunisia: [33.9, 9.5], kenya: [-0.02, 37.9], ethiopia: [9.1, 40.5], 'south africa': [-30.6, 22.9], madagascar: [-18.8, 46.9], 'united arab emirates': [23.4, 53.8], uae: [23.4, 53.8], israel: [31.0, 34.9], australia: [-25.3, 133.8], 'new zealand': [-40.9, 174.9]
};
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
// "Shenzhen, Guangdong" and "Shenzhen" both find Shenzhen; with no city match the country is used. null when neither is known.
export function geocode(city, country) {
  const c = norm(city);
  if (c) { if (CITIES[c]) return { lat: CITIES[c][0], lng: CITIES[c][1], from: 'city' }; for (const part of String(city).split(/[,/;|]/)) { const k = norm(part); if (CITIES[k]) return { lat: CITIES[k][0], lng: CITIES[k][1], from: 'city' }; } for (const k of Object.keys(CITIES)) if (c.includes(k) && k.length > 4) return { lat: CITIES[k][0], lng: CITIES[k][1], from: 'city' }; }
  const k = norm(country); if (k && COUNTRIES[k]) return { lat: COUNTRIES[k][0], lng: COUNTRIES[k][1], from: 'country' };
  for (const part of String(city || '').split(/[,/;|]/)) { const q = norm(part); if (COUNTRIES[q]) return { lat: COUNTRIES[q][0], lng: COUNTRIES[q][1], from: 'country' }; }
  return null;
}

// ---- where one assigned pack stands, and whether a person needs to act ----
// pack: { kind: 'quote'|'review', quotedAt, waivedAt, lockedAt, factorySigned, unread }
export function packState(p) {
  if (p.kind === 'quote') return p.quotedAt ? 'quoted' : p.waivedAt ? 'closed' : 'needs-quote';
  return p.lockedAt || p.factorySigned ? 'signed' : 'to-review';
}
export const PACK_STATE = {
  'needs-quote': ['Waiting for their quote', 'warn'], quoted: ['Quoted', 'ok'], closed: ['Closed without a quote', 'dim'], 'to-review': ['Waiting for them to read and sign', 'warn'], signed: ['Signed', 'ok']
};
// project status indicator: the project's own status, and whether its date has slipped
export function projectIndicator(pr, now = new Date()) {
  if (!pr) return null;
  const target = pr.target_date ? new Date(pr.target_date) : null;
  const late = Boolean(target && target < new Date(now.toISOString().slice(0, 10)) && !['complete', 'completed', 'delivered', 'done', 'archived'].includes(String(pr.status).toLowerCase()));
  const days = target ? Math.round((target - new Date(now.toISOString().slice(0, 10))) / 86400000) : null;
  return { status: pr.status || '', milestone: pr.milestone || '', targetDate: pr.target_date ? String(pr.target_date).slice(0, 10) : null, late, daysLeft: days };
}
// a production run: late when its ETA has passed and it has not arrived
export function runIndicator(r, now = new Date()) {
  const done = ['delivered', 'complete', 'completed', 'received', 'cancelled'].includes(String(r.status).toLowerCase());
  const eta = r.eta_date ? new Date(r.eta_date) : null, today = new Date(now.toISOString().slice(0, 10));
  return { late: Boolean(eta && !done && eta < today), done };
}

// One light for a factory on the list: red when something it holds is late or waiting on a person, amber while it is waiting on the factory, green when it has work and nothing is stuck, grey when idle.
export function factoryLight({ needsAction = 0, waiting = 0, lateProjects = 0, lateRuns = 0, packs = 0, runs = 0 }) {
  if (lateProjects || lateRuns) return 'late';
  if (needsAction || waiting) return 'waiting';
  return packs || runs ? 'active' : 'idle';
}
export const LIGHT = { late: 'Something is late', waiting: 'Waiting on them', active: 'Work in hand, nothing stuck', idle: 'No work assigned' };

// Group points that share a place so the map can show one pin with a count.
export function pinsFor(factories) {
  const by = new Map();
  for (const f of factories) {
    if (f.lat == null || f.lng == null) continue;
    const key = `${Math.round(f.lat * 20) / 20}|${Math.round(f.lng * 20) / 20}`;
    if (!by.has(key)) by.set(key, { lat: f.lat, lng: f.lng, ids: [], names: [], light: 'idle', work: 0 });
    const p = by.get(key); p.ids.push(f.key); p.names.push(f.name); p.work += f.counts?.packs || 0;
    const rank = { late: 3, waiting: 2, active: 1, idle: 0 }; if (rank[f.light] > rank[p.light]) p.light = f.light;
  }
  return [...by.values()];
}
