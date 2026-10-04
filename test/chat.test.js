import { test } from 'node:test';
import assert from 'node:assert/strict';
await import('../src/chat.js');
const { layout, clean, bytes } = globalThis.FBChat;

const T = (min, base = Date.UTC(2026, 9, 4, 12, 0, 0)) => new Date(base + min * 60000).toISOString();
const msg = (id, role, min, extra = {}) => ({ id, author_role: role, author_name: role === 'admin' ? 'Future Basics' : 'Maya', body: id, created_at: T(min), reply_to_id: null, files: [], ...extra });

test('consecutive messages from one side join into a group; a change of speaker or a long pause starts a new one', () => {
  const rows = layout([msg('a', 'client', 0), msg('b', 'client', 1), msg('c', 'admin', 2), msg('d', 'admin', 3), msg('e', 'admin', 40)], []);
  const by = Object.fromEntries(rows.map(r => [r.m.id, r]));
  assert.equal(by.a.joinsPrev, false); assert.equal(by.a.joinsNext, true);
  assert.equal(by.b.joinsPrev, true); assert.equal(by.b.joinsNext, false);
  assert.equal(by.c.joinsPrev, false); assert.equal(by.c.joinsNext, true);
  assert.equal(by.d.joinsPrev, true); assert.equal(by.d.joinsNext, false);   // e comes 37 minutes later: a new group
  assert.equal(by.e.joinsPrev, false);
});

test('a time stamp opens the thread, after a pause of twenty minutes, and on a new day', () => {
  const rows = layout([msg('a', 'client', 0), msg('b', 'client', 5), msg('c', 'client', 30), msg('d', 'client', 60 * 24 + 40)], []);
  assert.deepEqual(rows.map(r => r.stamp), [true, false, true, true]);
});

test('updates sit among the messages in time order and break a group', () => {
  const rows = layout([msg('a', 'client', 0), msg('b', 'client', 4)], [{ id: 'e1', title: 'Tech pack submitted', createdAt: T(2), unread: true }]);
  assert.deepEqual(rows.map(r => r.k === 'e' ? 'event' : r.m.id), ['a', 'event', 'b']);
  assert.equal(rows[0].joinsNext, false); assert.equal(rows[2].joinsPrev, false);
});

test('a reply knows the message it quotes, and a missing one is just no quote', () => {
  const rows = layout([msg('a', 'client', 0), msg('b', 'admin', 1, { reply_to_id: 'a' }), msg('c', 'admin', 2, { reply_to_id: 'gone' })], []);
  assert.equal(rows[1].parent.id, 'a'); assert.equal(rows[2].parent, null);
});

test('nothing in, nothing out', () => { assert.deepEqual(layout([], []), []); assert.deepEqual(layout(undefined, undefined), []); });

test('an old failure signal shows its sentence, not the API reply', () => {
  assert.equal(clean('Assistant failed (attempt 1): 400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low."}} Re-run it.'), 'Assistant failed (attempt 1): Your credit balance is too low. Re-run it.');
  assert.equal(clean('Tech pack submitted'), 'Tech pack submitted');
});
test('file sizes read as people say them', () => { assert.equal(bytes(512), '512 B'); assert.equal(bytes(2048), '2.0 KB'); assert.equal(bytes(5 * 1048576), '5.0 MB'); });
