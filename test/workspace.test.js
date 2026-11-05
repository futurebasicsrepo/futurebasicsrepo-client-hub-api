import test from 'node:test';
import assert from 'node:assert/strict';
import { mentionsIn, channelName, FB_HANDLE } from '../src/team-chat-routes.js';
import { dueState, initials } from '../src/workspace-routes.js';
await import('../src/presence.js');

const people = [{ id: 'm', name: 'Maya Reyes', email: 'maya@brand.com' }, { id: 'd', name: 'Dan Conway', email: 'dconway@brand.com' }, { id: 'x', name: '', email: 'jo@brand.com' }];

test('a mention reaches a teammate by first name, full name or address, and nothing else', () => {
  assert.deepEqual(mentionsIn('@Maya can you check the crest?', people), ['m']);
  assert.deepEqual(mentionsIn('thanks @mayareyes and @dconway', people).sort(), ['d', 'm']);
  assert.deepEqual(mentionsIn('cc @jo', people), ['x']);
  assert.deepEqual(mentionsIn('email maya@brand.com about it', people), [], 'an address in a sentence is not a mention');
  assert.deepEqual(mentionsIn('@Mayan rib', people), [], 'a longer word is someone else');
  assert.deepEqual(mentionsIn('', people), []);
});

test('@futurebasics brings Future Basics in', () => {
  for (const t of ['@futurebasics help', 'hey @FutureBasics', 'ask @future basics', '@fb thoughts?']) assert.ok(FB_HANDLE.test(t), t);
  for (const t of ['futurebasics', 'me@fb.com', '@fbx']) assert.ok(!FB_HANDLE.test(t), t);
});

test('channel names are short, lower case and safe', () => {
  assert.equal(channelName('#Tour Drop 2027!'), 'tour-drop-2027');
  assert.equal(channelName('  Demo lane six hoodie  '), 'demo-lane-six-hoodie');
  assert.equal(channelName('!!!'), '');
});

test('a task is late, due soon, later, undated or done', () => {
  const today = '2026-11-05';
  assert.equal(dueState({ status: 'todo', due: '2026-11-04' }, today), 'late');
  assert.equal(dueState({ status: 'doing', due: '2026-11-08' }, today), 'soon');
  assert.equal(dueState({ status: 'review', due: '2026-11-20' }, today), 'later');
  assert.equal(dueState({ status: 'todo', due: '' }, today), 'undated');
  assert.equal(dueState({ status: 'done', due: '2026-10-01' }, today), 'done', 'done is never late');
});

test('initials for the round faces', () => {
  assert.equal(initials('Maya Reyes'), 'MR'); assert.equal(initials('Kyle (Future Basics)'), 'K'); assert.equal(initials('jo@brand.com'), 'JB'); assert.equal(initials(''), '?');
});

test('who is here, in words', () => {
  const { sentence } = globalThis.FBPresence;
  assert.equal(sentence([]), '');
  assert.equal(sentence([{ name: 'Maya', mode: 'viewing' }]), 'Maya is here too');
  assert.equal(sentence([{ name: 'Maya', mode: 'editing' }, { name: 'Dan', mode: 'viewing' }]), 'Maya is changing this right now');
  assert.equal(sentence([{ name: 'Maya', mode: 'viewing' }, { name: 'Dan', mode: 'viewing' }, { name: 'Alyssa', mode: 'viewing' }]), 'Maya, Dan and Alyssa are here too');
});
