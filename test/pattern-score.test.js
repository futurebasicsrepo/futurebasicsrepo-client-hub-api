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
