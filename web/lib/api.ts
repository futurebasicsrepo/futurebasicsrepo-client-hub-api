export const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');
// Vercel exposes the project's production host to Next.js builds, so share links work before a custom domain is set.
const vercelHost = process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL;
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || (vercelHost ? `https://${vercelHost}` : 'http://localhost:3000')).replace(/\/$/, '');

export type Visibility = 'public' | 'unlisted' | 'private';
export type FilterName = 'none' | 'terrace' | 'matchday' | 'floodlight' | 'vintage' | 'mono';
export type Sort = 'hot' | 'new' | 'top';

export interface User { id: number; handle: string; displayName: string; bio: string; createdAt: string; role?: 'user' | 'moderator' | 'admin' }
export interface Profile extends Omit<User, 'id'> { postCount: number; totalScore: number; matchCount?: number }
export interface Fandom { slug: string; name: string; postCount?: number; latestAt?: string | null; coverUrl?: string | null }

// ---- fandom communities ----
export interface Channel { slug: string; name: string; kind: 'threads' | 'chat'; description: string; threadCount: number; lastActivityAt: string | null; online?: number }
export interface FandomHub { fandom: { slug: string; name: string; memberCount: number; postCount: number; joined: boolean }; channels: Channel[] }
export interface Author { handle: string; displayName: string }
export interface Thread {
  id: string; channel: string; title: string; body: string; score: number; replyCount: number;
  createdAt: string; lastActivityAt: string; deleted: boolean; author: Author | null;
  fandom?: { slug: string; name: string }; viewerHasVoted: boolean; canDelete?: boolean;
}
export interface Reply {
  id: number; parentId: number | null; depth: number; body: string | null; score: number; createdAt: string;
  deleted: boolean; author: Author | null; viewerHasVoted: boolean; canDelete: boolean;
}
// ---- moderation ----
export type ReportType = 'post' | 'comment' | 'thread' | 'reply' | 'chat' | 'match' | 'user';
export interface ModItem {
  type: ReportType; id: string; reports: number; reporters: number; reasons: Record<string, number>;
  firstAt: string; lastAt: string; autoHidden: boolean; link: string | null; notes: string[];
  snapshot: { title?: string; body?: string | null; image?: string | null } | null;
  status: 'open' | 'actioned' | 'dismissed'; resolution: string | null; author: string | null; authorBanned: boolean;
}
export interface ChatMessage { id: number; body: string; createdAt: string; author: Author }

export interface Post {
  id: string;
  title: string;
  description: string;
  kind: 'video' | 'image';
  mediaUrl: string;
  mediaMime: string;
  coverUrl: string | null;
  duration: number | null;
  width: number | null;
  height: number | null;
  /** Videos are converted to web-safe MP4 after upload. */
  mediaStatus: 'processing' | 'ready' | 'failed';
  mediaError: string | null;
  trimStart: number | null;
  trimEnd: number | null;
  filter: FilterName;
  status: 'draft' | 'published' | 'removed';
  visibility: Visibility;
  score: number;
  commentCount: number;
  viewCount: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  fandom: Fandom | null;
  creator: { handle: string; displayName: string };
  viewerHasVoted: boolean;
  match: MatchSummary | null;
  matchMinute: number | null;
  /** Set when the clip was cut from someone else's live stream. */
  clippedFrom?: { handle: string } | null;
  isOwner: boolean;
}

export interface MatchSummary { id: string; home: string; away: string; homeScore: number; awayScore: number; period: Period; youth: boolean }
export type Period = 'pre' | '1h' | 'ht' | '2h' | 'ft';
export interface Team { name: string; slug: string }
export interface Match {
  id: string;
  home: Team;
  away: Team;
  homeScore: number;
  awayScore: number;
  period: Period;
  status: 'upcoming' | 'live' | 'finished';
  periodStartedAt: string | null;
  halfLength: number;
  kickoffAt: string;
  venue: string;
  competition: string;
  youth: boolean;
  visibility: 'public' | 'unlisted';
  scorekeeper: { handle: string; displayName: string };
  liveStreams?: number;
  /** Highlight reel made at full time. */
  reelStatus?: 'building' | 'ready' | 'none' | 'failed' | null;
  reelPostId?: string | null;
  /** The server called full time because the scoreboard went quiet. */
  autoEnded?: boolean;
  canScore?: boolean;
  /** Viewer-specific (missing on the anonymous live stream). */
  isOwner?: boolean;
  following?: boolean;
  keepers?: { handle: string; displayName: string }[];
  /** Set when the match is a tie in a tournament bracket. */
  tournament?: { id: string; name: string; round: string } | null;
  /** Your part in the match, on your own match list. */
  role?: 'scorekeeper' | 'co-keeper';
}
export interface LiveStream {
  id: string;
  matchId: string;
  status: 'live' | 'ended';
  startedAt: string;
  endedAt: string | null;
  streamer: { handle: string; displayName: string };
  hlsUrl: string;
  replayPostId: string | null;
  isOwner: boolean;
}
export interface MatchEvent {
  id: number;
  type: 'goal' | 'yellow' | 'red' | 'note' | 'kickoff' | 'halftime' | 'second_half' | 'fulltime';
  side: 'home' | 'away' | null;
  minute: number | null;
  stoppage: number;
  player: string;
  /** Set when the scorer was picked from the squad. */
  playerId?: number | null;
  createdAt: string;
}
export interface MatchSnapshot {
  match: Match; events: MatchEvent[]; clips: Post[]; streams: LiveStream[]; serverTime: string;
  /** Both squads, for scorekeepers only. */
  rosters?: { home: Player[]; away: Player[] };
}

// Squads (see api/src/teams.js).
export type Position = '' | 'GK' | 'DF' | 'MF' | 'FW';
export interface Player { id: number; name: string; number: number | null; position: Position; goals?: number }
export interface TeamRecord { played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number }
export interface TeamPage {
  team: { name: string; slug: string; youth: boolean };
  following: boolean;
  record: TeamRecord;
  matches: Match[];
  canManage: boolean;
  isOwner: boolean;
  managers: { handle: string; displayName: string; owner: boolean }[];
  roster: Player[];
  rosterCount: number;
  /** A youth squad: names are only shown to its managers. */
  rosterHidden: boolean;
}

// Tournaments (see api/src/tournaments.js).
export type TournamentStatus = 'registration' | 'running' | 'finished';
export interface TournamentCard {
  id: string; name: string; status: TournamentStatus; capacity: number; approved: number; venue: string; startsAt: string; youth: boolean;
  organizer: { handle: string; displayName: string }; champion: Team | null;
}
export interface Tournament {
  id: string; name: string; description: string; status: TournamentStatus; capacity: number; approval: 'manual' | 'auto';
  halfLength: number; venue: string; startsAt: string; youth: boolean; visibility: 'public' | 'unlisted';
  organizer: { handle: string; displayName: string } | null;
  champion: Team | null;
  isOrganizer: boolean;
  counts: { approved: number; pending: number };
  createdAt: string;
}
export interface TournamentEntry { slug: string; name: string; status: 'pending' | 'approved' | 'rejected'; seed: number | null; players: number; mine: boolean; note?: string }
export interface BracketSlot {
  id: number; slot: number; home: Team | null; away: Team | null; winner: 'home' | 'away' | null; bye: boolean;
  decided: 'score' | 'penalties' | 'walkover' | 'bye' | null; note: string; match: Match | null; awaitingDecision: boolean;
}
export interface BracketRound { round: number; name: string; slots: BracketSlot[] }
export interface TournamentView { tournament: Tournament; teams: TournamentEntry[]; bracket: BracketRound[] | null; serverTime: string }

// Pro & international football (see api/src/worldscores.js).
export interface WorldSide { name: string; short: string; abbr: string; score: number | null; winner: boolean }
export interface WorldMatch {
  id: string;
  league: { slug: string; name: string };
  state: 'pre' | 'in' | 'post' | 'off';
  detail: string | null;
  kickoffAt: string;
  home: WorldSide;
  away: WorldSide;
  venue: string | null;
}
export interface WorldLeague { slug: string; name: string; live: number; matches: WorldMatch[] }
export interface WorldScores { updatedAt: string; live: number; total: number; leagues: WorldLeague[]; stale?: boolean }

export interface Comment {
  id: number;
  parentId: number | null;
  body: string | null;
  deleted: boolean;
  createdAt: string;
  author: { handle: string; displayName: string } | null;
  canDelete: boolean;
}

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

const TOKEN_KEY = 'incha.token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* storage unavailable (private mode) */ }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${API_URL}${path}`, {
    method: init.method || 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: init.signal,
    cache: 'no-store'
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status);
  return data as T;
}

// Raw binary POST (live video chunks). Returns the parsed JSON body along with the status so callers can resync.
export async function postBinary<T>(path: string, body: Blob, signal?: AbortSignal): Promise<{ status: number; data: T & { error?: string } }> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body,
    signal,
    cache: 'no-store'
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

// Multipart upload with progress, which fetch() can't report.
export function uploadFile<T>(path: string, file: Blob, filename: string, onProgress?: (fraction: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}${path}`);
    const token = getToken();
    if (token) xhr.setRequestHeader('authorization', `Bearer ${token}`);
    xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress?.(event.loaded / event.total); };
    xhr.onload = () => {
      let data: { error?: string } = {};
      try { data = JSON.parse(xhr.responseText || '{}'); } catch { /* non-JSON body */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as T);
      else reject(new ApiError(data.error || `Upload failed (${xhr.status})`, xhr.status));
    };
    xhr.onerror = () => reject(new ApiError('Network error during upload.', 0));
    const form = new FormData();
    form.append('file', file, filename);
    xhr.send(form);
  });
}

export async function fetchPublicMatch(id: string): Promise<MatchSnapshot | null> {
  try {
    const res = await fetch(`${API_URL}/v1/matches/${encodeURIComponent(id)}`, { next: { revalidate: 15 } });
    return res.ok ? ((await res.json()) as MatchSnapshot) : null;
  } catch {
    return null;
  }
}

// Server-side fetch for metadata; returns null on any failure.
export async function fetchPublicPost(id: string): Promise<Post | null> {
  try {
    const res = await fetch(`${API_URL}/v1/posts/${encodeURIComponent(id)}`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return (await res.json()).post as Post;
  } catch {
    return null;
  }
}

export async function fetchPublicTournament(id: string): Promise<TournamentView | null> {
  try {
    const res = await fetch(`${API_URL}/v1/tournaments/${encodeURIComponent(id)}`, { next: { revalidate: 30 } });
    return res.ok ? ((await res.json()) as TournamentView) : null;
  } catch {
    return null;
  }
}
