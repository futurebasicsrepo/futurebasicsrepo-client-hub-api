import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanBuild, cleanUrl, slugify, canSee, visibleBuilds, hasAnyAccess, highlightsFromText, highlightsToText, linksFromText, linksToText, SEED_BUILDS, HOSTED_SERVICES, MOVED_BUILD_REPOS, STATUSES } from '../src/builds.js';

const NOW = Date.parse('2026-10-11T12:00:00Z'), future = '2026-11-11T00:00:00Z', past = '2026-09-01T00:00:00Z';
const B = (over = {}) => ({ id: 'b1', slug: 's', name: 'N', visibility: 'listed', status: 'live', sort_order: 100, ...over });
const inv = (over = {}) => ({ build_id: null, expires_at: future, revoked_at: null, ...over });

test('web addresses are http(s) only, with no credentials; a bare domain gets https', () => {
  assert.equal(cleanUrl('example.com/path'), 'https://example.com/path');
  assert.equal(cleanUrl('https://spotmeplease.com'), 'https://spotmeplease.com');
  assert.equal(cleanUrl(''), '');
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'ftp://x.com', 'https://user:pw@x.com', 'file:///etc/passwd', 'https://']) assert.equal(cleanUrl(bad), null, bad);
});

test('a build is cleaned, bounded and given an address; what is not allowed is refused in plain words', () => {
  const ok = cleanBuild({ name: "  Benny's   Beans ", tagline: 'x'.repeat(300), status: 'nope', visibility: 'nope', hosting: 'moon', liveUrl: 'bennys-beans.up.railway.app', stack: ' Node, Postgres ,,Railway', highlights: [{ title: 'A', text: 'b' }, {}, { title: '', text: '' }], sortOrder: '12' }).value;
  assert.equal(ok.name, "Benny's Beans"); assert.equal(ok.slug, 'benny-s-beans'); assert.equal(ok.tagline.length, 140);
  assert.equal(ok.status, 'concept', 'an unknown status falls back'); assert.equal(ok.visibility, 'hidden', 'and an unknown visibility falls back to the safe one'); assert.equal(ok.hosting, 'other');
  assert.equal(ok.live_url, 'https://bennys-beans.up.railway.app'); assert.deepEqual(ok.stack, ['Node', 'Postgres', 'Railway']); assert.deepEqual(ok.highlights, [{ title: 'A', text: 'b' }]); assert.equal(ok.sort_order, 12);
  assert.match(cleanBuild({ name: '' }).error, /needs a name/); assert.match(cleanBuild({ name: 'X', liveUrl: 'javascript:1' }).error, /web address/);
  assert.match(cleanBuild({ name: 'Me' }).error, /used by the showcase/, 'a name that would take a path the showcase uses is refused'); assert.match(cleanBuild({ name: 'X', slug: 'auth' }).error, /used by the showcase/);
  assert.deepEqual(cleanBuild({ tagline: 'only this' }, { partial: true }).value, { tagline: 'only this' }, 'a partial update touches only what it names');
});

test('hidden builds are staff only; listed ones need an invite for all, or a client; invite-only ones need that build by name', () => {
  const staff = { staff: true, invites: [] }, client = { client: true, invites: [] }, all = { invites: [inv()] }, one = { invites: [inv({ build_id: 'b2' })] }, nobody = { invites: [] };
  const hidden = B({ visibility: 'hidden' }), listed = B(), only = B({ id: 'b2', visibility: 'invite' });
  assert.deepEqual([hidden, listed, only].map(b => canSee(b, staff, NOW)), [true, true, true], 'staff see everything');
  assert.deepEqual([hidden, listed, only].map(b => canSee(b, client, NOW)), [false, true, false], 'a client sees what is listed');
  assert.deepEqual([hidden, listed, only].map(b => canSee(b, all, NOW)), [false, true, false], 'an invite to all listed builds does not open an invite-only one');
  assert.deepEqual([hidden, listed, only].map(b => canSee(b, one, NOW)), [false, false, true], 'an invite to one build opens that one, and not the rest');
  assert.deepEqual([hidden, listed, only].map(b => canSee(b, nobody, NOW)), [false, false, false]);
  assert.equal(canSee(listed, { invites: [inv({ build_id: 'b1' })] }, NOW), true, 'a named invite opens a listed build too');
  assert.equal(canSee(hidden, { invites: [inv({ build_id: 'b1' })] }, NOW), false, 'but never a hidden one, even by name');
  assert.equal(canSee(B({ status: 'archived' }), all, NOW), false, 'archived builds are withdrawn from everyone but staff');
});

test('an expired or revoked invite opens nothing', () => {
  const b = B();
  assert.equal(canSee(b, { invites: [inv({ expires_at: past })] }, NOW), false); assert.equal(canSee(b, { invites: [inv({ revoked_at: '2026-10-01T00:00:00Z' })] }, NOW), false);
  assert.equal(canSee(b, { invites: [inv({ expires_at: past }), inv()] }, NOW), true, 'one good invite is enough');
  assert.equal(canSee(null, { staff: true }), false);
});

test('who may ask for a sign-in code at all, and the order builds are shown in', () => {
  assert.equal(hasAnyAccess({ invites: [] }), false); assert.equal(hasAnyAccess({ invites: [inv({ expires_at: past })] }), false, 'a lapsed invite is no access at all'); assert.equal(hasAnyAccess({ invites: [inv({ revoked_at: new Date().toISOString() })] }), false, 'neither is a revoked one'); assert.equal(hasAnyAccess({ invites: [inv({})] }), true);
  assert.equal(hasAnyAccess({ staff: true, invites: [] }), true); assert.equal(hasAnyAccess({ client: true, invites: [] }), true); assert.equal(hasAnyAccess(null), false);
  const list = visibleBuilds([B({ id: 'z', name: 'Zed', sort_order: 5 }), B({ id: 'a', name: 'Alpha', sort_order: 50 }), B({ id: 'b', name: 'Bravo', sort_order: 50 })], { staff: true }, NOW);
  assert.deepEqual(list.map(b => b.name), ['Zed', 'Alpha', 'Bravo']);
});

test('highlights are edited as lines and survive the round trip', () => {
  const list = [{ title: 'Live roast clock', text: 'next roast day' }, { title: 'Just a title', text: '' }];
  assert.deepEqual(highlightsFromText(highlightsToText(list)), list); assert.deepEqual(highlightsFromText('A - b\n\nC – d'), [{ title: 'A', text: 'b' }, { title: 'C', text: 'd' }]);
});

test('extra links: cleaned, bounded, edited as lines and survive the round trip', () => {
  const ok = cleanBuild({ name: 'X', links: [{ label: 'Make an Offer, walked through', url: 'https://claude.ai/artifact/abc' }, { label: '', url: 'www.example.com/demo' }] });
  assert.deepEqual(ok.value.links, [{ label: 'Make an Offer, walked through', url: 'https://claude.ai/artifact/abc' }, { label: 'example.com', url: 'https://www.example.com/demo' }], 'a missing label falls back to the host');
  assert.match(cleanBuild({ name: 'X', links: [{ label: 'Bad', url: 'javascript:alert(1)' }] }).error, /web address/);
  assert.match(cleanBuild({ name: 'X', links: [{ label: 'No address', url: '' }] }).error, /web address/);
  assert.deepEqual(cleanBuild({ name: 'X', links: [{ label: '', url: '' }] }).value.links, [], 'an empty row is dropped, not an error');
  assert.equal(cleanBuild({ name: 'X', links: Array.from({ length: 12 }, (_, n) => ({ label: 'L' + n, url: 'https://e.com/' + n })) }).value.links.length, 8, 'at most eight');
  assert.deepEqual(cleanBuild({ name: 'X' }).value.links, [], 'a new build starts with none'); assert.equal(cleanBuild({ tagline: 'y' }, { partial: true }).value.links, undefined, 'an update that does not send links leaves them alone'); assert.equal(cleanBuild({ links: [] }, { partial: true }).value.links.length, 0);
  const list = [{ label: 'Hardware drawings', url: 'https://claude.ai/artifact/GVQF9iEcNxv5BXQPK9S46Z' }, { label: 'A walkthrough - with a dash', url: 'https://e.com/a-b' }];
  assert.deepEqual(linksFromText(linksToText(list)), list); assert.deepEqual(linksFromText('Demo | https://e.com/x\n\nhttps://e.com/y'), [{ label: 'Demo', url: 'https://e.com/x' }, { label: '', url: 'https://e.com/y' }]);
});

test('the seed list is complete and valid: every build clean, addresses unique, none exposed by default', () => {
  const slugs = new Set();
  for (const b of SEED_BUILDS) { const r = cleanBuild(b); assert.ok(!r.error, b.name + ': ' + r.error); assert.ok(STATUSES.includes(r.value.status)); assert.ok(!slugs.has(r.value.slug), 'duplicate ' + r.value.slug); slugs.add(r.value.slug); assert.ok(!b.visibility || b.visibility === 'hidden', b.name + ' must not seed as visible'); }
  for (const want of ['spot', 'bennys-beans', 'modish-nail-spa', 'nursepartners', 'common-ground', 'cuesea']) assert.ok(slugs.has(want), want);
});

test('a build whose code moved follows it to the address its seed now gives', () => {
  for (const m of MOVED_BUILD_REPOS) {
    const seed = SEED_BUILDS.find(b => b.slug === m.slug);
    assert.ok(seed, m.slug + ' is a seeded build');
    assert.equal(m.to.repoUrl, seed.repoUrl); assert.equal(m.to.repoPath, seed.repoPath || '');
    assert.notDeepEqual(m.from, m.to);
  }
});

test('a build tied to a client\'s own project is theirs to see, even hidden, but never when archived', async () => {
  const { canSee } = await import('../src/builds.js');
  const b = { id: 'b1', visibility: 'hidden', status: 'in-progress' }, mine = { client: true, invites: [], projectBuildIds: ['b1'] }, other = { client: true, invites: [], projectBuildIds: ['b2'] };
  assert.equal(canSee(b, mine), true); assert.equal(canSee(b, other), false); assert.equal(canSee({ ...b, status: 'archived' }, mine), false);
  assert.equal(canSee({ ...b, visibility: 'invite' }, mine), true); assert.equal(canSee(b, { client: true, invites: [] }), false);
});

test('hosted services are valid builds, hidden-able, live and watched at a health address', () => {
  assert.ok(HOSTED_SERVICES.length >= 1);
  for (const h of HOSTED_SERVICES) { const r = cleanBuild(h); assert.ok(!r.error, `${h.name}: ${r.error}`); assert.equal(r.value.status, 'live'); assert.match(r.value.live_url, /^https:\/\/.+\/health$/); assert.ok(!SEED_BUILDS.some(b => b.slug === h.slug), 'a hosted service is not also a seed'); }
});
