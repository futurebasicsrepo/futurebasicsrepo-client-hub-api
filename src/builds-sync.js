// Keeping the showcase current. A build's code lives on GitHub (often a folder inside one repo); when a change to it is merged, the showcase notices:
//   - the build shows "Updated <date>" (the newest commit that touched it), and
//   - each merged pull request that touched it is queued as a "what's new" line, which staff publish (edited if they like) or let publish by themselves.
// Only the cleaned line and its date ever reach a viewer; the pull request's own title, number and address stay with staff.
//
// This file is pure apart from the fetch it is handed, so it is tested against a stand-in GitHub.

// "owner/name" from "owner/name" or any github.com address of a repository (or a page inside it); '' when it is not one
export function parseRepo(v) {
  const s = String(v || '').trim().replace(/\.git$/i, '');
  const m = /^(?:https?:\/\/(?:www\.)?github\.com\/)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:[/?#].*)?$/.exec(s);
  if (!m || /^(?:https?:)$/i.test(m[1])) return '';
  return `${m[1]}/${m[2]}`;
}
// a folder inside the repository, without slashes at the ends; '' for the whole repository
export function cleanRepoPath(v) {
  const s = String(v || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  return !s || s.split('/').some(p => p === '..' || p === '.' || !p) || s.length > 120 ? '' : s;
}
export const touchesPath = (files, path) => { const p = cleanRepoPath(path); return !p || files.some(f => f === p || f.startsWith(p + '/')); };

// a pull request title as a line a visitor can read: no "feat:" prefix, no "(#123)", no trailing full stop
export function cleanChangeTitle(t) {
  let s = String(t || '').replace(/\s+/g, ' ').trim();
  s = s.replace(/^(?:\[[^\]]{1,20}\]\s*)+/, '').replace(/^(?:feat|fix|chore|docs|refactor|perf|test|style|build|ci)(?:\([^)]*\))?!?:\s*/i, '');
  s = s.replace(/\s*\(#\d+\)\s*$/, '').replace(/\s*#\d+\s*$/, '').replace(/[.\s]+$/, '').trim();
  if (s) s = s[0].toUpperCase() + s.slice(1);
  return s.slice(0, 160);
}

const API = () => String(process.env.GITHUB_API_ORIGIN || 'https://api.github.com').replace(/\/$/, '');
const headers = token => ({ Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'future-basics-builds', ...(token ? { Authorization: `Bearer ${token}` } : {}) });

class GithubError extends Error { constructor(status, path, body) { super(status === 404 ? 'GitHub cannot see this repository: check the address, and that the token can read it' : status === 401 ? 'The GitHub token was refused' : status === 403 ? 'GitHub refused the request (rate limit, or the token cannot read this repository)' : `GitHub answered ${status}`); this.status = status; this.path = path; this.detail = String(body || '').slice(0, 200); } }

// What changed in one build since the last look.
//   build: { repoUrl, repoPath, syncCursor (ISO or null) }
//   → { lastChangeAt, changes: [{ ref, rawTitle, url, at }], cursor }
// The first look (no cursor) only records "now": a build's whole history is not dumped into the queue.
export async function lookAtBuild(build, { fetchImpl = fetch, token = '', now = new Date(), maxPrs = 30 } = {}) {
  const repo = parseRepo(build.repoUrl), path = cleanRepoPath(build.repoPath);
  if (!repo) return { skipped: true, changes: [], lastChangeAt: null, cursor: build.syncCursor || null };
  const get = async p => { const r = await fetchImpl(API() + p, { headers: headers(token) }); if (!r.ok) throw new GithubError(r.status, p, await r.text().catch(() => '')); return r.json(); };
  const meta = await get(`/repos/${repo}`);
  const commits = await get(`/repos/${repo}/commits?per_page=1${path ? `&path=${encodeURIComponent(path)}` : ''}&sha=${encodeURIComponent(meta.default_branch || 'main')}`);
  const lastChangeAt = commits?.[0]?.commit?.committer?.date || commits?.[0]?.commit?.author?.date || null;
  const cursor = build.syncCursor ? new Date(build.syncCursor) : null, changes = [];
  if (cursor) {
    const prs = await get(`/repos/${repo}/pulls?state=closed&base=${encodeURIComponent(meta.default_branch || 'main')}&sort=updated&direction=desc&per_page=${maxPrs}`);
    for (const pr of (prs || [])) {
      if (!pr.merged_at || new Date(pr.merged_at) <= cursor) continue;
      if (path) { const files = await get(`/repos/${repo}/pulls/${pr.number}/files?per_page=100`); if (!touchesPath((files || []).map(f => f.filename), path)) continue; }
      changes.push({ ref: `${repo}#${pr.number}`, rawTitle: String(pr.title || ''), url: pr.html_url || '', at: pr.merged_at });
    }
    changes.sort((a, b) => new Date(a.at) - new Date(b.at));
  }
  return { changes, lastChangeAt, cursor: now.toISOString() };
}

// Every build with a repository, one after another so one bad repository does not stop the rest. Writes through `pool`.
export async function syncBuilds(pool, { fetchImpl = fetch, token = process.env.BUILDS_GITHUB_TOKEN || process.env.GITHUB_TOKEN || '', only = null, log = console, now = new Date() } = {}) {
  const rows = (await pool.query(`select id,name,repo_url,repo_path,sync_cursor,auto_publish from builds where repo_url <> '' ${only ? 'and id = $1' : ''} order by name`, only ? [only] : [])).rows;
  const out = { checked: 0, queued: 0, published: 0, failed: 0, errors: [] };
  for (const b of rows) {
    if (!parseRepo(b.repo_url)) continue;
    out.checked++;
    try {
      const r = await lookAtBuild({ repoUrl: b.repo_url, repoPath: b.repo_path, syncCursor: b.sync_cursor }, { fetchImpl, token, now });
      for (const c of r.changes) {
        const text = cleanChangeTitle(c.rawTitle); if (!text) continue;
        const status = b.auto_publish ? 'published' : 'new';
        const ins = await pool.query(`insert into build_updates(build_id,ref,source,raw_title,text,url,status,happened_at,published_at) values($1,$2,'github',$3,$4,$5,$6,$7,${b.auto_publish ? 'now()' : 'null'}) on conflict (build_id, ref) do nothing returning id`, [b.id, c.ref, c.rawTitle.slice(0, 300), text, c.url, status, c.at]);
        if (ins.rowCount) { if (b.auto_publish) out.published++; else out.queued++; }
      }
      await pool.query(`update builds set sync_cursor=$2, synced_at=$3, sync_error='', last_change_at=coalesce($4::timestamptz, last_change_at) where id=$1`, [b.id, r.cursor, now.toISOString(), r.lastChangeAt]);
    } catch (e) {
      out.failed++; out.errors.push(`${b.name}: ${e.message}`);
      log.warn?.({ err: e.message, build: b.name }, 'showcase sync failed for one build');
      await pool.query(`update builds set sync_error=$2, synced_at=$3 where id=$1`, [b.id, String(e.message).slice(0, 300), now.toISOString()]).catch(() => {});
    }
  }
  return out;
}
