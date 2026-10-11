import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRepo, cleanRepoPath, touchesPath, cleanChangeTitle, lookAtBuild } from '../src/builds-sync.js';

test('a repository is recognised from the ways people write it, and nothing else', () => {
  for (const v of ['futurebasicsrepo/pig-food', 'https://github.com/futurebasicsrepo/pig-food', 'https://github.com/futurebasicsrepo/pig-food.git', 'https://www.github.com/futurebasicsrepo/pig-food/tree/main/src', 'https://github.com/futurebasicsrepo/pig-food/pull/3'])
    assert.equal(parseRepo(v), 'futurebasicsrepo/pig-food', v);
  for (const v of ['', 'https://example.com/a/b', 'https://gitlab.com/a/b', 'justone', 'https://github.com/onlyowner', null]) assert.equal(parseRepo(v), '', String(v));
});

test('a folder in the repository: tidy, never escaping it', () => {
  assert.equal(cleanRepoPath('/sites/bennysbeans/'), 'sites/bennysbeans'); assert.equal(cleanRepoPath('spot'), 'spot'); assert.equal(cleanRepoPath('  '), '');
  for (const bad of ['../etc', 'a/../b', 'a//b', './x']) assert.equal(cleanRepoPath(bad), '', bad);
  assert.equal(touchesPath(['spot/src/a.js', 'README.md'], 'spot'), true); assert.equal(touchesPath(['spotless/a.js'], 'spot'), false, 'a folder that merely starts with the same letters is not it');
  assert.equal(touchesPath(['anything'], ''), true, 'no folder means the whole repository'); assert.equal(touchesPath([], 'spot'), false);
});

test('a pull request title becomes a line a visitor can read', () => {
  assert.equal(cleanChangeTitle('feat(spot): friendly order reasons (#227)'), 'Friendly order reasons');
  assert.equal(cleanChangeTitle('[WIP] fix: orders ship text.  '), 'Orders ship text');
  assert.equal(cleanChangeTitle('  Builds   showcase: extra links on a build #228'), 'Builds showcase: extra links on a build');
  assert.equal(cleanChangeTitle(''), ''); assert.equal(cleanChangeTitle('x'.repeat(400)).length, 160);
});

// a stand-in GitHub
function fakeGithub({ pulls = [], files = {}, commits = [{ commit: { committer: { date: '2026-10-09T10:00:00Z' } } }], fail = 0, seen = [] } = {}) {
  return async (url, init) => {
    seen.push({ url, auth: init?.headers?.Authorization });
    const u = new URL(url), p = u.pathname;
    const ok = body => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
    if (fail) return { ok: false, status: fail, json: async () => ({}), text: async () => 'nope' };
    if (/^\/repos\/[^/]+\/[^/]+$/.test(p)) return ok({ default_branch: 'main' });
    if (p.endsWith('/commits')) return ok(commits);
    if (p.endsWith('/pulls')) return ok(pulls);
    const m = /\/pulls\/(\d+)\/files$/.exec(p); if (m) return ok((files[m[1]] || []).map(filename => ({ filename })));
    return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
  };
}
const NOW = new Date('2026-10-10T12:00:00Z');

test('the first look records the time and the last change, and queues nothing from the past', async () => {
  const seen = [], r = await lookAtBuild({ repoUrl: 'https://github.com/o/r', repoPath: 'spot', syncCursor: null }, { fetchImpl: fakeGithub({ pulls: [{ number: 1, title: 'old', merged_at: '2026-09-01T00:00:00Z' }], seen }), token: 'tok', now: NOW });
  assert.deepEqual(r.changes, []); assert.equal(r.lastChangeAt, '2026-10-09T10:00:00Z'); assert.equal(r.cursor, NOW.toISOString());
  assert.ok(seen.every(s => s.auth === 'Bearer tok'), 'the token goes with every request'); assert.ok(seen.some(s => /commits\?.*path=spot/.test(s.url)), 'the last change is the last one that touched the folder');
});

test('later looks queue merged changes that touched the folder, oldest first, and ignore the rest', async () => {
  const pulls = [
    { number: 9, title: 'feat: new thing (#9)', merged_at: '2026-10-10T09:00:00Z', html_url: 'https://github.com/o/r/pull/9' },
    { number: 8, title: 'docs only', merged_at: '2026-10-10T08:00:00Z' },
    { number: 7, title: 'closed, never merged', merged_at: null },
    { number: 6, title: 'before the last look', merged_at: '2026-10-09T00:00:00Z' },
    { number: 5, title: 'earlier in the day', merged_at: '2026-10-10T07:00:00Z' }];
  const files = { 9: ['spot/src/server.js'], 8: ['README.md'], 5: ['spot/a.js', 'x'] };
  const r = await lookAtBuild({ repoUrl: 'o/r', repoPath: 'spot', syncCursor: '2026-10-09T12:00:00Z' }, { fetchImpl: fakeGithub({ pulls, files }), now: NOW });
  assert.deepEqual(r.changes.map(c => [c.ref, c.rawTitle]), [['o/r#5', 'earlier in the day'], ['o/r#9', 'feat: new thing (#9)']]);
  assert.equal(r.changes[1].url, 'https://github.com/o/r/pull/9');
  const whole = await lookAtBuild({ repoUrl: 'o/r', repoPath: '', syncCursor: '2026-10-09T12:00:00Z' }, { fetchImpl: fakeGithub({ pulls, files }), now: NOW });
  assert.deepEqual(whole.changes.map(c => c.ref), ['o/r#5', 'o/r#8', 'o/r#9'], 'a build that owns the whole repository gets every merged change');
});

test('a repository that cannot be read says why, in words staff can act on', async () => {
  await assert.rejects(lookAtBuild({ repoUrl: 'o/r', syncCursor: null }, { fetchImpl: fakeGithub({ fail: 404 }) }), /cannot see this repository/);
  await assert.rejects(lookAtBuild({ repoUrl: 'o/r', syncCursor: null }, { fetchImpl: fakeGithub({ fail: 401 }) }), /token was refused/);
  assert.equal((await lookAtBuild({ repoUrl: 'https://example.com/x/y', syncCursor: null }, { fetchImpl: fakeGithub() })).skipped, true, 'a build without a GitHub address is simply skipped');
});
