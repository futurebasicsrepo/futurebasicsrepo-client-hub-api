import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../src/ball.js';
const { ballFor, ballHtml } = globalThis.FBBall;
const pack = o => ({ tech_pack: { initiated_by: 'client', status: 'draft', version: 1, ...o } });

test('the client has the ball while they draft their own tech pack, Future Basics once they submit it', () => {
  assert.equal(ballFor(pack({})).who, 'client');
  assert.equal(ballFor(pack({ status: 'submitted' })).who, 'future-basics');
  assert.match(ballFor(pack({ status: 'submitted' })).why, /publishes v1/);
  assert.equal(ballFor(pack({ ai_status: 'pending' })).who, 'future-basics', 'while the assistant reads the photo it is on our side');
});

test('a staff-written pack is ours until it is published', () => {
  assert.equal(ballFor({ tech_pack: { initiated_by: 'brand', status: 'draft' } }).who, 'future-basics');
});

test('a published pack is passed along the chain: client, then Future Basics, then the factory', () => {
  const pub = o => ({ tech_pack: { initiated_by: 'client', published_at: '2026-10-01', version: 2, ...o } });
  assert.equal(ballFor(pub({})).who, 'client');
  assert.equal(ballFor(pub({ client_signed: true })).who, 'future-basics');
  assert.equal(ballFor(pub({ client_signed: true, brand_signed: true })).who, 'factory');
  assert.match(ballFor(pub({ client_signed: true })).why, /v2/);
});

test('with the pack done, the current step of the flow says who has the ball', () => {
  const done = { client_signed: true, brand_signed: true, factory_signed: true, published_at: 'x', version: 1 };
  assert.equal(ballFor({ tech_pack: done, milestones: [{ status: 'done', responsible_party: 'client' }, { name: 'Sample', status: 'current', responsible_party: 'factory' }] }).who, 'factory');
  assert.equal(ballFor({ milestones: [{ name: 'Approval', status: 'current', responsible_party: 'client' }] }).who, 'client');
  assert.equal(ballFor({ waiting_on: 'future-basics' }).who, 'future-basics');
  assert.equal(ballFor({ milestones: [] }).who, null, 'nobody when nothing says');
  assert.equal(ballFor({ waiting_on: 'store' }).who, null, 'an unknown party is not guessed');
});

test('the marker names the party, or says "Your move" to the party it belongs to, and escapes what it prints', () => {
  const p = pack({});
  assert.match(ballHtml(p), /ball-client[^>]*>.*<b>Client<\/b>/);
  assert.match(ballHtml(p, { mine: 'client' }), /<b>Your move<\/b>/);
  assert.match(ballHtml(pack({ status: 'submitted' }), { mine: 'client' }), /<b>Future Basics<\/b>/);
  assert.equal(ballHtml({}), '');
  assert.ok(!/<script/.test(ballHtml({ milestones: [{ name: '<script>', status: 'current', responsible_party: 'client' }] })));
});
