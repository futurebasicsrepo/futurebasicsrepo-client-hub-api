// Card data exposure: the confirm screenshot the requester sees has card
// fields painted over. Runs in Chromium; skipped where it isn't installed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { CARD_FIELDS } from '../src/fulfill/agent.js';

let chromium = null;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath()) && !existsSync('/opt/pw-browsers/chromium')) chromium = null;
} catch {
  chromium = null;
}

test('the confirm screenshot masks card fields and payment iframes', { skip: !chromium && 'no Chromium' }, async (t) => {
  const browser = await chromium.launch(existsSync(chromium.executablePath()) ? {} : { executablePath: '/opt/pw-browsers/chromium' });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 520, height: 400 } });
  await page.setContent(`<body style="background:#fff;margin:0;padding:20px;font:20px sans-serif"><p>Total $120.00</p>
    <input id="n" autocomplete="cc-number" value="4000 0012 3456 7899" style="width:300px;font-size:24px"><br>
    <input id="c" name="cvc" value="123"><br>
    <iframe id="f" title="Secure card payment input" srcdoc="<input value=4242424242424242>" style="width:300px;height:40px"></iframe></body>`);
  const shot = await page.screenshot({ mask: [page.locator(CARD_FIELDS)], maskColor: '#1b1712' });
  const at = async (sel, dx) => {
    const b = await page.locator(sel).boundingBox();
    return [b.x + dx, b.y + b.height / 2];
  };
  const pts = [await at('#n', 20), await at('#n', 200), await at('#c', 10), await at('#f', 30), [5, 5]];
  const reader = await browser.newPage();
  const px = await reader.evaluate(async ({ data, pts }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    return pts.map(([a, b]) => Array.from(x.getImageData(a, b, 1, 1).data.slice(0, 3)).join(','));
  }, { data: shot.toString('base64'), pts });
  assert.deepEqual(px.slice(0, 4), ['27,23,18', '27,23,18', '27,23,18', '27,23,18'], 'card number, CVC and the card iframe are covered');
  assert.equal(px[4], '255,255,255', 'the rest of the page is untouched');
});
