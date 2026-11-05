import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createLive, LIVE_CHANNEL } from '../src/live.js';

const quiet = { warn() {} };
// a request and reply as far as live.stream touches them
function fakeStream() {
  const req = { raw: new EventEmitter() }, res = new EventEmitter();
  res.out = ''; res.head = null; res.write = s => { res.out += s; return true; }; res.writeHead = (code, h) => { res.head = { code, h }; }; res.end = () => res.emit('close');
  const reply = { raw: res, hijacked: false, hijack() { this.hijacked = true; }, code(c) { this.status = c; return this; }, send(b) { this.body = b; return this; } };
  return { req, res, reply };
}

test('with no database to listen on, a nudge reaches this server\'s listeners', async () => {
  const live = createLive({ log: quiet }); await live.start();
  assert.equal(live.listening, false);
  const got = []; const off = live.subscribe(ev => got.push(ev));
  await live.publish({ t: 'chat', room: 'r1', channel: 'c1' }); off(); await live.publish({ t: 'chat', room: 'r1', channel: 'c2' });
  assert.deepEqual(got, [{ t: 'chat', room: 'r1', channel: 'c1' }]);
  await live.close();
});

test('a stream writes only what it is allowed to hear, shaped, and lets go when the page leaves', async () => {
  const live = createLive({ log: quiet }); const { req, res, reply } = fakeStream();
  live.stream(req, reply, ev => ev.room === 'mine', ev => ({ channel: ev.channel }));
  assert.ok(reply.hijacked && res.head.code === 200 && /text\/event-stream/.test(res.head.h['Content-Type']));
  assert.match(res.out, /event: ready/);
  await live.publish({ t: 'chat', room: 'mine', channel: 'a', secret: 'x' }); await live.publish({ t: 'chat', room: 'theirs', channel: 'b' });
  assert.match(res.out, /data: \{"channel":"a"\}/); assert.doesNotMatch(res.out, /"b"|secret/);
  assert.equal(live.streams, 1); req.raw.emit('close'); assert.equal(live.streams, 0);
  await live.publish({ t: 'chat', room: 'mine', channel: 'c' }); assert.doesNotMatch(res.out, /"c"/, 'nothing is written after the page left');
  await live.close();
});

test('across servers a nudge goes through Postgres NOTIFY, and arrives through LISTEN', async () => {
  const sent = [], conn = new EventEmitter();
  conn.connect = async () => {}; conn.query = async q => { assert.equal(q, `listen ${LIVE_CHANNEL}`); }; conn.end = async () => {};
  const pool = { query: async (q, v) => { sent.push(v); conn.emit('notification', { channel: LIVE_CHANNEL, payload: v[1] }); } };
  const live = createLive({ pool, log: quiet, connect: () => conn }); await live.start();
  assert.equal(live.listening, true);
  const got = []; live.subscribe(ev => got.push(ev));
  await live.publish({ t: 'chat', room: 'r', channel: 'c' });
  assert.equal(sent.length, 1); assert.equal(sent[0][0], LIVE_CHANNEL); assert.deepEqual(got, [{ t: 'chat', room: 'r', channel: 'c' }], 'delivered once, by the notification');
  conn.emit('notification', { channel: 'other', payload: '{"t":"x"}' }); conn.emit('notification', { channel: LIVE_CHANNEL, payload: 'not json' });
  assert.equal(got.length, 1, 'other channels and bad payloads are ignored');
  await live.close();
});

test('a lost listener falls back to this server and closing ends every stream', async () => {
  const conn = new EventEmitter(); conn.connect = async () => {}; conn.query = async () => {}; conn.end = async () => {};
  const pool = { query: async () => { throw new Error('should not notify while down'); } };
  const live = createLive({ pool, log: quiet, connect: () => conn }); await live.start();
  conn.emit('error', new Error('gone')); assert.equal(live.listening, false);
  const got = []; live.subscribe(ev => got.push(ev)); await live.publish({ t: 'chat', room: 'r' }); assert.equal(got.length, 1);
  const { req, res, reply } = fakeStream(); let ended = false; res.end = () => { ended = true; };
  live.stream(req, reply, () => true); await live.close(); assert.ok(ended); assert.equal(live.streams, 0);
});
