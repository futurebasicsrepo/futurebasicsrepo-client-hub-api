// The Make page's walkthrough (thefuturebasics.com/pages/make): the Design Lab used for real, one click at a time. A browser drives the Lab in
// a client's room with the Lab open: a hoodie from the recipe menu, its flats, its pattern; then two screens of a tech pack already made
// (src/help-assets/make-pack-*.webp). Each step is a screen, the spot the next click lands on (in % of the screen, from the element's own box,
// so it is never off) and two lines of words. The Make page plays them in order and a visitor can click the spot to go on.
//
//   node scripts/make-walkthrough.mjs --base http://127.0.0.1:3300 --token <a client token whose room has the Design Lab> [--out src/help-assets]
//
// Writes make-walk-1.webp … and make-walk.json (served at hub.thefuturebasics.com/help/assets/). Take it in a demo room with made-up pieces
// (the piece it makes is named "Everyday hoodie"), never a client's. Run it again when the Lab's screens change.
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import sharp from 'sharp';

const arg = (k, d = '') => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const W = 1440, H = 900;
// the screens already made: the tech pack's callouts with the factory's acknowledgements, and the spec sheet
export const STILLS = [
  { img: 'make-pack-callouts.webp', title: 'A tech pack the factory signs off', text: 'Every detail is a callout pinned on the flat, with a note to the factory, and the factory acknowledges each one.', hot: { x: 58.5, y: 17, w: 40.5, h: 16.5 } },
  { img: 'make-pack-spec.webp', title: 'Measured, graded, placed', text: 'The spec sheet: every placement measured from the shoulder and the centre front, and every point of measure graded XS to XXL.', hot: { x: 68.5, y: 64.5, w: 31, h: 33 } }
];

export async function captureWalkthrough({ base, token, out = 'src/help-assets', playwright = null, log = console.log } = {}) {
  playwright ||= createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');
  mkdirSync(out, { recursive: true });
  const b = await playwright.chromium.launch(), steps = [];
  try {
    const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1.5 });
    await ctx.addInitScript(t => { try { localStorage.setItem('fb.client.token', t); localStorage.setItem('fb.helper.on', '0'); } catch { /* fine */ } }, token);
    const p = await ctx.newPage(), errors = []; p.on('pageerror', e => errors.push(e.message));
    // the Studio shows the flats and the pattern in a frame of their own: what to point at is found in whichever frame shows it
    const find = async (sel, wait = 20000) => { const t0 = Date.now(); for (;;) { for (const f of p.frames()) { const l = f.locator(sel).first(); if (await l.count().catch(() => 0) && await l.isVisible().catch(() => false)) return l; }
      if (Date.now() - t0 > wait) throw new Error(`nothing shows ${sel}`); await p.waitForTimeout(300); } };
    // one step: the screen as it is, the box of what is clicked next, then the click
    const shot = async (title, text, target, after = null) => {
      const el = typeof target === 'string' ? p.locator(target).first() : target;
      await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(400);
      const r = await el.boundingBox(); if (!r) throw new Error(`${title}: nothing to point at`);
      const n = steps.length + 1, file = `make-walk-${n}.webp`;
      await sharp(await p.screenshot()).resize({ width: 1800 }).webp({ quality: 78 }).toFile(`${out}/${file}`);
      const pc = (v, of) => Math.round(v / of * 1000) / 10;
      steps.push({ img: file, title, text, hot: { x: pc(r.x - 6, W), y: pc(r.y - 6, H), w: pc(r.width + 12, W), h: pc(r.height + 12, H) } });
      log(`${n}. ${title}`);
      if (after) await after(el);
    };
    await p.goto(`${base}/lab/recipe`, { waitUntil: 'networkidle' });
    await shot('Pick a base', '26 staples at their usual fit, each drawn on a real flat sketch.', '[data-base="hoodie"]', el => el.click());
    await p.waitForTimeout(800);
    await shot('Add what it needs', 'Pockets, closures and washes: only what suits this base is offered, and each one lands where it usually goes.', '[data-addon="chest-pocket"]',
      async el => { await el.click(); await p.click('[data-addon="wash-vintage"]'); });
    await p.waitForTimeout(800);
    await shot('Pick the colours', 'A colour system: the first colour is the garment, and every colour in it becomes a colourway.', '[data-main="1"]', el => el.click());
    await p.waitForTimeout(800); await p.fill('#name', 'Everyday hoodie');
    await shot('Open it in the Studio', 'The piece arrives measured, drawn and coloured, ready to finish.', '#open',
      el => Promise.all([p.waitForURL(/\/lab\/studio/, { timeout: 60000 }), el.click()]));
    await p.waitForLoadState('networkidle'); await p.waitForTimeout(3000);
    await shot('Real flats, checked as you go', 'The flats are measured in inches, and every pocket, placement and detail is checked against what a factory can make.', await find('text=Can be made as drawn'),
      () => p.click('[data-step="pattern"]'));
    await p.waitForLoadState('networkidle'); await p.waitForTimeout(4000);
    await shot('The pattern drafts itself', 'From the flats, graded XS to XXL. Every seam is walked against the one it is sewn to.', (await find('text=Sews together')).locator('xpath=..'),
      async () => (await find('button:has-text("Explode it")')).click());
    await p.waitForTimeout(3500);
    await shot('Every piece, ready to cut', 'The pattern pieces, apart, with seam allowances and notches, and laid out on the cloth with its yardage.', await find('button:has-text("Cutting layout")'));
    if (errors.length) throw new Error(`the Lab reported an error: ${errors[0]}`);
  } catch (e) { // what was on the screen when a step found nothing to point at
    try { const pg = b.contexts()[0]?.pages()[0]; if (pg) await pg.screenshot({ path: `${out}/make-walk-failed.png` }); } catch { /* fine */ }
    throw e;
  } finally { await b.close(); }
  const all = [...steps, ...STILLS];
  writeFileSync(`${out}/make-walk.json`, JSON.stringify({ made: new Date().toISOString().slice(0, 10), base: 'https://hub.thefuturebasics.com/help/assets/', steps: all }, null, 2) + '\n');
  return all;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const base = arg('base'), token = arg('token') || process.env.WALK_TOKEN;
  if (!base || !token) { console.error('usage: node scripts/make-walkthrough.mjs --base <server> --token <client token with the Design Lab> [--out dir]'); process.exit(2); }
  captureWalkthrough({ base, token, out: arg('out', 'src/help-assets') }).then(s => console.log(`${s.length} steps → make-walk.json`)).catch(e => { console.error(e.message); process.exit(1); });
}
