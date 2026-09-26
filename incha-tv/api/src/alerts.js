// Follows and push alerts: fans follow teams or matches and get a phone notification for
// kick-off, goals, red cards, half/full time and when someone goes live.
import webpush from 'web-push';
import { slugify, POST_ID_RE } from './lib.js';

const ALERT_TTL = 30 * 60; // seconds a push service keeps an undelivered alert
const MAX_SUBSCRIPTIONS_PER_USER = 10;

const minute = event => (event.minute == null ? '' : event.stoppage ? ` · ${event.minute}+${event.stoppage}'` : ` · ${event.minute}'`);

/** The notification for a match event, or null for events that don't alert (yellows, notes, second half). */
export function alertFor(match, event) {
  const score = `${match.home_name} ${match.home_score}–${match.away_score} ${match.away_name}`;
  const team = event.side === 'home' ? match.home_name : event.side === 'away' ? match.away_name : '';
  const base = { url: `/m/${match.id}`, tag: `match-${match.id}` };
  switch (event.type) {
    case 'kickoff': return { ...base, title: `Kick-off: ${match.home_name} vs ${match.away_name}`, body: 'Follow it live on incha.tv' };
    case 'goal': return { ...base, title: `⚽ GOAL · ${score}`, body: `${event.player ? `${event.player} for ${team}` : team}${minute(event)}` };
    case 'red': return { ...base, title: `🟥 Red card · ${team}`, body: `${event.player ? `${event.player} · ` : ''}${score}${minute(event)}` };
    case 'halftime': return { ...base, title: `Half time · ${score}`, body: 'Tap for the match story so far' };
    case 'fulltime': return { ...base, title: `Full time · ${score}`, body: 'See the goals and the clips from the stands' };
    default: return null;
  }
}

export function createNotifier({ pool, log, send } = {}) {
  const publicKey = process.env.VAPID_PUBLIC_KEY || '';
  const privateKey = process.env.VAPID_PRIVATE_KEY || '';
  const enabled = Boolean(send || (publicKey && privateKey));
  if (!send && enabled) webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'https://incha.tv', publicKey, privateKey);
  const deliver = send ?? ((subscription, payload, options) => webpush.sendNotification(subscription, payload, options));

  // Followers of the match, plus followers of either team when the match is public (never for youth or
  // unlisted matches: following a team must not reveal those).
  async function recipients(match, actorId) {
    const openToTeamFollowers = match.visibility === 'public' && !match.youth;
    const { rows } = await pool.query(`
      select ps.id, ps.endpoint, ps.p256dh, ps.auth from push_subscriptions ps
      where ps.user_id is distinct from $2::bigint and ps.user_id in (
        select user_id from match_follows where match_id = $1
        union select user_id from team_follows where $3 and team_id in ($4, $5))`,
    [match.id, actorId ?? null, openToTeamFollowers, match.home_team_id, match.away_team_id]);
    return rows;
  }

  async function push(match, alert, actorId) {
    if (!enabled || !alert) return 0;
    const subs = await recipients(match, actorId);
    const payload = JSON.stringify(alert);
    // One alert per match collapses older undelivered ones on the push service.
    const options = { TTL: ALERT_TTL, urgency: 'high', topic: `m${match.id}` };
    let sent = 0;
    for (let i = 0; i < subs.length; i += 20) {
      await Promise.all(subs.slice(i, i + 20).map(async sub => {
        try {
          await deliver({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, options);
          sent++;
        } catch (error) {
          // Expired or revoked subscriptions are removed; anything else is logged and skipped.
          if (error.statusCode === 404 || error.statusCode === 410) await pool.query(`delete from push_subscriptions where id = $1`, [sub.id]);
          else log?.warn?.({ err: error, endpoint: sub.endpoint.slice(0, 60) }, 'push failed');
        }
      }));
    }
    return sent;
  }

  return {
    enabled,
    publicKey,
    matchEvent: (match, event, actorId) => push(match, alertFor(match, event), actorId),
    streamStarted: (match, handle, actorId) => push(match, {
      url: `/m/${match.id}`, tag: `live-${match.id}`,
      title: `📹 @${handle} is live`, body: `${match.home_name} vs ${match.away_name} · watch from the sideline`
    }, actorId)
  };
}

export function registerAlerts(app, { pool, fail, requireUser, notifier, loadMatch }) {
  app.get('/v1/push/key', async () => ({ publicKey: notifier.publicKey || null }));

  app.post('/v1/push/subscriptions', { preHandler: requireUser }, async (req, reply) => {
    const endpoint = String(req.body?.endpoint || '');
    const p256dh = String(req.body?.keys?.p256dh || '');
    const auth = String(req.body?.keys?.auth || '');
    if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || !auth || p256dh.length > 200 || auth.length > 100) {
      return fail(reply, 400, 'That push subscription is not valid.');
    }
    // An endpoint belongs to one browser; if someone else signs in there, it moves to them.
    await pool.query(`
      insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, $3, $4)
      on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    [req.user.id, endpoint, p256dh, auth]);
    await pool.query(`
      delete from push_subscriptions where user_id = $1 and id not in (
        select id from push_subscriptions where user_id = $1 order by created_at desc limit $2)`, [req.user.id, MAX_SUBSCRIPTIONS_PER_USER]);
    return reply.code(201).send({ ok: true });
  });

  app.delete('/v1/push/subscriptions', { preHandler: requireUser }, async (req, reply) => {
    await pool.query(`delete from push_subscriptions where user_id = $1 and endpoint = $2`, [req.user.id, String(req.body?.endpoint || '')]);
    return reply.code(204).send();
  });

  // ---- follows ----
  const follow = (table, column) => async (req, reply, id) => {
    if (req.method === 'DELETE') await pool.query(`delete from ${table} where user_id = $1 and ${column} = $2`, [req.user.id, id]);
    else await pool.query(`insert into ${table} (user_id, ${column}) values ($1, $2) on conflict do nothing`, [req.user.id, id]);
    return { following: req.method !== 'DELETE' };
  };
  const followMatch = follow('match_follows', 'match_id');
  const followTeam = follow('team_follows', 'team_id');

  for (const method of ['POST', 'DELETE']) {
    app.route({ method, url: '/v1/matches/:id/follow', preHandler: requireUser, handler: async (req, reply) => {
      if (!POST_ID_RE.test(req.params.id) || !(await loadMatch(req.params.id))) return fail(reply, 404, 'Match not found.');
      return followMatch(req, reply, req.params.id);
    } });
    app.route({ method, url: '/v1/teams/:slug/follow', preHandler: requireUser, handler: async (req, reply) => {
      const { rows: [team] } = await pool.query(`select id from teams where slug = $1`, [slugify(req.params.slug)]);
      if (!team) return fail(reply, 404, 'Team not found.');
      return followTeam(req, reply, team.id);
    } });
  }

  app.get('/v1/me/follows', { preHandler: requireUser }, async req => {
    const [{ rows: teams }, { rows: matches }] = await Promise.all([
      pool.query(`select t.slug, t.name from team_follows f join teams t on t.id = f.team_id where f.user_id = $1 order by t.name`, [req.user.id]),
      pool.query(`select match_id from match_follows where user_id = $1 order by created_at desc limit 100`, [req.user.id])
    ]);
    return { teams, matchIds: matches.map(m => m.match_id) };
  });
}
