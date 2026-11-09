// The silhouette yardstick (scripts/pattern-score.mjs): drafted patterns for the styles we trust stay close to their sketches. A floor here
// catches a drafting change that quietly pulls a block away from the drawings (the binding strip once took the tank from 88 to 11).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('pattern score: tanks and shorts stay close to their sketches', () => {
  const out = mkdtempSync(join(tmpdir(), 'pscore-'));
  try {
    execFileSync(process.execPath, ['scripts/pattern-score.mjs', '--style', 'tank,shorts', '--out', out], { stdio: 'pipe' });
    const { summary } = JSON.parse(readFileSync(join(out, 'score.json'), 'utf8'));
    assert.equal(summary.errors, 0);
    for (const s of ['tank', 'shorts']) {
      const r = summary.byStyle[s];
      assert.ok(r && r.n > 0, `${s} scored`);
      assert.ok(r.shape >= 80, `${s} shape ${r.shape}`);
      assert.ok(r.proportions >= 82, `${s} proportions ${r.proportions}`);
      assert.ok(r.features == null || r.features >= 95, `${s} features ${r.features}`);
    }
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test('a top takes the shoulder and sleeve traced off its sketch, set again (never added twice) when a sketch is picked', async () => {
  const { TEMPLATE_PROPORTIONS: TP } = await import('../src/lab-template-proportions.js');
  const { fitToTemplate, defaultParams } = await import('../src/lab-flats.js');
  const [id, tp] = Object.entries(TP).find(([, v]) => Number.isFinite(v.sleeveAngle) && v.shoulder) || [];
  assert.ok(id, 'some top has a traced shoulder and sleeve');
  const { FLAT_TEMPLATES } = await import('../src/lab-flat-templates.js'), style = FLAT_TEMPLATES.find(t => t.id === id).style, base = defaultParams(style).m;
  const p = fitToTemplate({ ...defaultParams(style), template: id });
  assert.equal(p.m.shoulder, Math.round((base.shoulder + tp.shoulder) * 8) / 8);
  assert.equal(p.options.sleeveAngle, tp.sleeveAngle);
  const again = fitToTemplate(p); assert.equal(again.m.shoulder, p.m.shoulder, 'picked again: the same, not twice the change');
  const other = FLAT_TEMPLATES.find(t => t.style === style && !TP[t.id]);
  if (other) { const q = fitToTemplate({ ...p, template: other.id }); assert.equal(q.m.shoulder, base.shoulder); assert.equal(q.options.sleeveAngle, undefined); }
});
