// Live updates: when something changes (a team chat message, a channel), the pages that show it hear at once instead of on their next poll.
//
//   const live = createLive({ pool, log });
//   live.publish({ t: 'chat', room, channel, staffIn });     // after the change is saved
//   live.stream(req, reply, ev => ev.room === room)            // inside a signed-in GET route: hold it open and pass on what it may hear
//
// What goes out is only a nudge (which room, which channel): the page then asks the usual routes for the thread, so who may read what stays
// decided in one place. Across servers the nudge travels by Postgres LISTEN/NOTIFY on one connection of its own; with no database to listen
// on (tests, or while that connection is down) it is delivered inside this process, so one server always works.
//
// A stream is plain server-sent events over a fetch (the page sends its token as a header, never in the address): a comment every 25 seconds
// keeps proxies from closing it, and the page reconnects when it drops.
import pg from 'pg';

export const LIVE_CHANNEL = 'fb_live';
const PING_MS = 25000;
const MAX_STREAMS = 4000;

export function createLive({ pool, log = console, connect } = {}) {
  const subs = new Set(), open = new Set();
  let client = null, listening = false, closed = false, wait = 1000, timer = null;
  const deliver = ev => { for (const fn of subs) { try { fn(ev); } catch (err) { log.warn?.({ err: err.message }, 'live: a listener failed'); } } };
  const makeClient = connect || (() => (pool?.options ? new pg.Client(pool.options) : null));

  async function listen() {
    if (closed) return;
    let c = null;
    try {
      c = makeClient(); if (!c) return;
      c.on('error', err => { log.warn?.({ err: err.message }, 'live: listener connection lost'); drop(c); });
      c.on('end', () => drop(c));
      c.on('notification', n => { if (n.channel !== LIVE_CHANNEL) return; try { deliver(JSON.parse(n.payload)); } catch {} });
      await c.connect(); await c.query(`listen ${LIVE_CHANNEL}`);
      if (closed) { c.end().catch(() => {}); return; }
      client = c; listening = true; wait = 1000;
    } catch (err) { log.warn?.({ err: err.message }, 'live: cannot listen yet; delivering on this server only'); drop(c); }
  }
  function drop(c) {
    if (c && client && c !== client) return;
    listening = false; client = null;
    try { c?.removeAllListeners('notification'); c?.end().catch(() => {}); } catch {}
    if (!closed && !timer) { timer = setTimeout(() => { timer = null; listen(); }, wait); wait = Math.min(wait * 2, 30000); timer.unref?.(); }
  }

  return {
    start() { return listen(); },
    get listening() { return listening; },
    get streams() { return open.size; },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    // never throws: a nudge that cannot go out leaves the pages on their safety-net poll
    async publish(ev) {
      if (!ev || typeof ev !== 'object') return;
      if (listening && pool) {
        try { await pool.query('select pg_notify($1, $2)', [LIVE_CHANNEL, JSON.stringify(ev)]); return; }
        catch (err) { log.warn?.({ err: err.message }, 'live: notify failed; delivering on this server only'); }
      }
      deliver(ev);
    },
    // hold the request open and write each event that passes `allow` (and maps through `shape`, if given)
    stream(req, reply, allow, shape = ev => ev) {
      if (open.size >= MAX_STREAMS) return reply.code(503).send({ error: 'Too many live connections right now; the page will keep checking on its own' });
      reply.hijack();
      const res = reply.raw;
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write(`retry: 3000\nevent: ready\ndata: {}\n\n`);
      const off = this.subscribe(ev => { if (!allow(ev)) return; const out = shape(ev); if (out) res.write(`data: ${JSON.stringify(out)}\n\n`); });
      const ping = setInterval(() => res.write(': ping\n\n'), PING_MS); ping.unref?.();
      const end = () => { off(); clearInterval(ping); open.delete(entry); };
      const entry = { res, end };
      open.add(entry);
      req.raw.on('close', end); res.on('close', end); res.on('error', end);
    },
    async close() {
      closed = true; clearTimeout(timer);
      for (const s of [...open]) { s.end(); try { s.res.end(); } catch {} }
      const c = client; client = null; listening = false;
      if (c) await c.end().catch(() => {});
    }
  };
}
