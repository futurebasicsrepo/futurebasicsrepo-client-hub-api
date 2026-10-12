import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

// Reads the guides out of src/helper.js without drawing anything, then checks them against the pages they belong to.
const src = f => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
let TOURS = null;
const ctx = { location: { pathname: '/' }, document: {} }; ctx.window = ctx; ctx.top = ctx; ctx.__fbHelperTours = t => { TOURS = t; };
vm.runInNewContext(src('helper.js'), ctx);

const FILES = {
  'hub-': ['client.html', 'chat.js'], 'tp-': ['techpack.html'], 'staff-pack': ['techpack.html'], 'staff-home': ['work-home.html', 'console-nav.js'], 'staff-sales': ['sales.html'],
  'staff-prototype': ['prototypes.html'], 'staff-leads': ['prototypes.html'], 'staff-money': ['money.html'], 'staff-intel': ['intel.html'], 'staff-factories': ['factories.html'],
  'staff-builds': ['builds-admin.html'], 'staff-console': ['admin.html'], 'staff-health': ['admin.html']
};
const filesFor = id => Object.entries(FILES).find(([k]) => id.startsWith(k))?.[1];
const text = v => typeof v === 'function' ? 'x' : v;

test('there are guides for the hub and for the work console, and their ids are unique and point at each other correctly', () => {
  assert.ok(TOURS && TOURS.length >= 15);
  const ids = TOURS.map(t => t.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.some(i => i.startsWith('hub-')) && ids.some(i => i.startsWith('staff-')));
  for (const t of TOURS) { assert.ok(t.title && typeof t.match === 'function', t.id); if (t.next) assert.ok(ids.includes(t.next.tour), `${t.id} → ${t.next.tour}`); }
});

test('every step says what to do and why, and a step that waits on the person can be finished', () => {
  for (const t of TOURS) {
    assert.ok(t.steps.length >= 2, t.id);
    for (const s of t.steps) {
      const where = `${t.id} · ${text(s.title)}`;
      assert.ok(text(s.title) && text(s.do) && text(s.why) && s.target, where);
      assert.ok(!s.done || ['click', 'input'].includes(s.done) || typeof s.done === 'function', where);
      if (s.done) assert.ok(text(s.after), `${where} needs an "after" line`);
      assert.ok(String(text(s.do)).length < 260 && String(text(s.why)).length < 300, `${where} is too long for a bubble`);
    }
  }
});

test('every selector in a guide can be found in the page it belongs to', () => {
  for (const t of TOURS) {
    const files = filesFor(t.id); assert.ok(files, `no page listed for ${t.id}`);
    const code = files.map(src).join('\n');
    for (const s of t.steps) for (const sel of [].concat(s.target)) {
      if (typeof sel !== 'string') continue;
      const where = `${t.id} · ${text(s.title)} · ${sel}`;
      for (const m of sel.matchAll(/\[([\w-]+)(?:[*^$]?=)"([^"]*)"\]/g)) { const [, a, v] = m; assert.ok(code.includes(`${a}="${v}"`) || (code.includes(a) && code.includes(v)), `${where}: ${a}="${v}"`); }
      const bare = sel.replace(/\[[^\]]*\]/g, ' ');
      for (const m of bare.matchAll(/#([A-Za-z][\w-]*)/g)) assert.ok(new RegExp(`id=\\\\?["']${m[1]}["']|id:\\s*["']${m[1]}["']|getElementById\\(["']${m[1]}["']\\)`).test(code), `${where}: no #${m[1]}`);
      for (const m of bare.matchAll(/\.([A-Za-z][\w-]*)/g)) assert.ok(code.includes(m[1]), `${where}: no .${m[1]}`);
    }
  }
});
