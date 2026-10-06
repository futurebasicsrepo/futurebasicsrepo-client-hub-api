import { test } from 'node:test';
import assert from 'node:assert/strict';
globalThis.window = globalThis;
await import('../src/tp-i18n.js');
const I = globalThis.FBTP_I18N, LANGS = ['zh', 'zh-hant', 'es', 'pt', 'it'];

// every sentence the page builds around a pack's own text, one per pattern
const SAMPLES = ['Spec (in)', 'Spec 10', 'Version 3', 'v2 published 5 Oct 2026', 'Published v2', 'printed 5 Oct 2026', '✓ Acknowledged by Mill A', 'Countersign as Mill A', 'Approve tech pack v2', 'Sign as Mill A',
  'All 4 callouts acknowledged by factory', 'All 1 callout acknowledged by factory', 'All 6 POMs have spec + tolerance', 'All 1 POM have spec + tolerance', '2 pending: Heel wrap, Outsole length',
  'Sample size 9 specified with tolerances', '3 artwork files with Pantone references', '1 artwork file with Pantone references', '2 placements with width in inches', '1 placement with width in inches',
  'No artwork uploaded — required for production', 'No placements yet — required for production', 'front view missing', 'front and back view missing', 'Approved 5 Oct by Maya', 'Sample size 9',
  '3 of 5 acknowledged by factory', '✓ Locked for production — v2 signed by every party', 'Acknowledge all callouts first — 3 still pending in the Calls tab.',
  'By approving, Maya confirms this tech pack describes the product they want made. It goes to Future Basics, then the factory.', '1.5 from left', '2 from top', 'Width 3.5', '4 in', 'garment width 12 (true scale)', 'Heel wrap on front'];

test('every language covers the same phrases as Simplified Chinese, and every phrase is filled in', () => {
  const keys = Object.keys(I.langs.zh.dict).sort();
  assert.ok(keys.length > 150);
  for (const l of LANGS) {
    assert.deepEqual(Object.keys(I.langs[l].dict).sort(), keys, `${l} has the same phrase list`);
    for (const [k, v] of Object.entries(I.langs[l].dict)) assert.ok(typeof v === 'string' && v.trim(), `${l}: "${k}" has a translation`);
  }
});

test('Spanish, Portuguese and Italian really are translated, not copied', () => {
  for (const l of ['es', 'pt', 'it']) {
    const d = I.langs[l].dict, same = Object.keys(d).filter(k => d[k] === k);
    assert.ok(same.length <= 14, `${l}: only names and loan words stay as written (${same.join(', ')})`);
    assert.ok(!/[一-鿿]/.test(JSON.stringify(d)), `${l} has no Chinese in it`);
  }
  assert.equal(I.lookup('es', 'Tech pack'), 'Ficha técnica');
  assert.equal(I.lookup('pt', 'Tech pack'), 'Ficha técnica');
  assert.equal(I.lookup('it', 'Tech pack'), 'Scheda tecnica');
  assert.equal(I.lookup('pt', 'outsole'), 'sola');
  assert.equal(I.lookup('it', 'outsole'), 'suola');
  assert.equal(I.lookup('es', 'heel'), 'talón');
});

test('every sentence pattern produces text in every language, with nothing left unfilled', () => {
  for (const l of LANGS) for (const s of SAMPLES) {
    const t = I.lookup(l, s, {});
    assert.ok(t && t !== s, `${l}: "${s}" is translated`);
    assert.ok(!/\$\d/.test(t) && !/undefined/.test(t), `${l}: "${s}" → "${t}" has no placeholders left`);
  }
});

test('Traditional Chinese is written in Traditional characters, with Hong Kong and Taiwan terms', () => {
  const d = I.langs['zh-hant'];
  assert.equal(d.html, 'zh-Hant');
  assert.equal(I.langs.zh.label, 'Chinese (Simplified)');
  assert.equal(d.label, 'Chinese (Traditional)');
  const all = JSON.stringify(d.dict) + d.note('Mill A', 2, '5 Oct 2026') + SAMPLES.map(s => I.lookup('zh-hant', s, {})).join('');
  const simplified = [...'艺单图发签确认无码说书检质设计划样数据过这为对应时们'].filter(c => all.includes(c));
  assert.deepEqual(simplified, [], 'no Simplified-only characters');
  assert.equal(I.lookup('zh-hant', 'Tech pack'), '工藝單');
  assert.equal(I.lookup('zh-hant', 'Sign'), '簽核');
  assert.ok(!all.includes('籤'), 'sign is 簽, not the lottery-slip 籤');
});

test('names and numbers inside a sentence are carried through', () => {
  for (const l of LANGS) {
    assert.ok(I.lookup(l, 'Sign as Mill A').includes('Mill A'));
    assert.ok(I.lookup(l, '✓ Acknowledged by Mill A').includes('Mill A'));
    assert.ok(I.lookup(l, '3 of 5 acknowledged by factory').includes('3') && I.lookup(l, '3 of 5 acknowledged by factory').includes('5'));
    assert.ok(I.lookup(l, 'v2 published 5 Oct 2026').includes('5 Oct 2026'));
  }
});

test('the pack\'s own text comes from the server map, ahead of the patterns and after the fixed words', () => {
  assert.equal(I.lookup('es', 'Heel wrap', { 'Heel wrap': 'Envoltura del talón' }), 'Envoltura del talón');
  assert.equal(I.lookup('es', 'Heel wrap', {}), null, 'unknown text stays English');
  assert.equal(I.lookup('es', 'Tech pack', { 'Tech pack': 'ignored' }), 'Ficha técnica', 'the page\'s own words are not overridden by the map');
  assert.equal(I.lookup('it', '2 pending: Heel wrap, Outsole length', { 'Heel wrap': 'Avvolgimento tallone' }), '2 in sospeso: Avvolgimento tallone, Outsole length');
  assert.equal(I.lookup('pt', 'Callout on front'), 'Indicação · frente', 'pieces joined with a dot are translated one by one');
  assert.equal(I.lookup('xx', 'Tech pack'), null, 'an unknown language gives nothing');
});

test('plurals read correctly', () => {
  assert.equal(I.lookup('es', '1 placement with width in inches'), '1 ubicación con ancho en pulgadas');
  assert.equal(I.lookup('es', '2 placements with width in inches'), '2 ubicaciones con ancho en pulgadas');
  assert.equal(I.lookup('pt', 'front and back view missing'), 'Faltam as vistas frente e trás');
  assert.equal(I.lookup('pt', 'front view missing'), 'Falta a vista frente');
  assert.equal(I.lookup('it', 'front and back view missing'), 'Mancano le viste fronte e retro');
  assert.equal(I.lookup('it', 'All 1 callout acknowledged by factory'), "L'indicazione è confermata dalla fabbrica");
});

test('each language names itself and writes the factory note and page title', () => {
  for (const l of LANGS) {
    const c = I.langs[l];
    assert.ok(c.native && c.label && c.html);
    assert.ok(c.title('Layer runner').includes('Layer runner'));
    const note = c.note('Mill A', 2, '5 Oct 2026');
    assert.ok(note.includes('Mill A') && note.includes('5 Oct 2026') && note.includes('2') && note.startsWith('<p class="note noprint">'));
    assert.ok(c.note('', 2, '5 Oct 2026').includes('<strong>'), 'a missing factory name falls back to a generic one');
  }
  assert.deepEqual(I.order, LANGS);
});
