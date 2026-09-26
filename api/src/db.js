import pg from 'pg';

const url = process.env.DATABASE_URL || '';
const local = /localhost|127\.0\.0\.1|\.railway\.internal/.test(url) || process.env.DATABASE_SSL === 'false';

export const pool = new pg.Pool({
  connectionString: url,
  ssl: local ? false : { rejectUnauthorized: false }
});

// Starter fandoms so the feed has somewhere to point on day one.
const SEED_FANDOMS = [
  ['philadelphia-union', 'Philadelphia Union'],
  ['argentina', 'Argentina'],
  ['usmnt', 'USMNT'],
  ['mexico', 'México'],
  ['world-cup-2026', 'World Cup 2026'],
  ['premier-league', 'Premier League'],
  ['la-liga', 'La Liga'],
  ['liga-mx', 'Liga MX'],
  ['street-football', 'Street Football'],
  ['philly-sports', 'Philly Sports']
];

export async function migrate() {
  await pool.query(`
    create table if not exists users (
      id bigserial primary key,
      email text unique not null,
      handle text unique not null,
      display_name text not null,
      bio text not null default '',
      password_hash text not null,
      created_at timestamptz not null default now()
    );
    create table if not exists fandoms (
      id bigserial primary key,
      slug text unique not null,
      name text not null,
      created_at timestamptz not null default now()
    );
    create table if not exists posts (
      id text primary key,
      user_id bigint not null references users(id) on delete cascade,
      fandom_id bigint references fandoms(id) on delete set null,
      title text not null default '',
      description text not null default '',
      media_kind text not null check (media_kind in ('video','image')),
      media_key text unique not null,
      media_mime text not null,
      media_bytes bigint not null,
      cover_key text unique,
      cover_mime text,
      duration real,
      trim_start real,
      trim_end real,
      filter text not null default 'none',
      status text not null default 'draft' check (status in ('draft','published')),
      visibility text not null default 'private' check (visibility in ('public','unlisted','private')),
      score integer not null default 0,
      comment_count integer not null default 0,
      view_count bigint not null default 0,
      published_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index if not exists posts_public_feed on posts (published_at desc) where status='published' and visibility='public';
    create index if not exists posts_user on posts (user_id, created_at desc);
    create index if not exists posts_fandom on posts (fandom_id, published_at desc);
    create table if not exists votes (
      post_id text not null references posts(id) on delete cascade,
      user_id bigint not null references users(id) on delete cascade,
      created_at timestamptz not null default now(),
      primary key (post_id, user_id)
    );
    create table if not exists comments (
      id bigserial primary key,
      post_id text not null references posts(id) on delete cascade,
      user_id bigint not null references users(id) on delete cascade,
      parent_id bigint references comments(id) on delete cascade,
      body text,
      created_at timestamptz not null default now(),
      deleted_at timestamptz
    );
    create index if not exists comments_post on comments (post_id, created_at);

    create table if not exists teams (
      id bigserial primary key,
      slug text unique not null,
      name text not null,
      created_by bigint references users(id) on delete set null,
      created_at timestamptz not null default now()
    );
    create table if not exists matches (
      id text primary key,
      home_team_id bigint not null references teams(id),
      away_team_id bigint not null references teams(id),
      home_score integer not null default 0,
      away_score integer not null default 0,
      period text not null default 'pre' check (period in ('pre','1h','ht','2h','ft')),
      period_started_at timestamptz,
      half_length integer not null default 45 check (half_length between 5 and 60),
      kickoff_at timestamptz not null default now(),
      venue text not null default '',
      competition text not null default '',
      youth boolean not null default false,
      visibility text not null default 'public' check (visibility in ('public','unlisted')),
      created_by bigint not null references users(id) on delete cascade,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index if not exists matches_kickoff on matches (kickoff_at desc);
    create index if not exists matches_teams on matches (home_team_id, away_team_id);
    create table if not exists match_events (
      id bigserial primary key,
      match_id text not null references matches(id) on delete cascade,
      type text not null check (type in ('goal','yellow','red','note','kickoff','halftime','second_half','fulltime')),
      side text check (side in ('home','away')),
      minute integer,
      stoppage integer not null default 0,
      player text not null default '',
      created_by bigint references users(id) on delete set null,
      created_at timestamptz not null default now()
    );
    create index if not exists match_events_match on match_events (match_id, created_at);
    alter table posts add column if not exists match_id text references matches(id) on delete set null;
    alter table posts add column if not exists match_minute integer;
    create index if not exists posts_match on posts (match_id);

    -- Uploaded videos are converted to H.264/AAC MP4 in the background; existing rows are already playable.
    alter table posts add column if not exists media_status text not null default 'ready' check (media_status in ('processing','ready','failed'));
    alter table posts add column if not exists media_error text;
    alter table posts add column if not exists width integer;
    alter table posts add column if not exists height integer;
    create index if not exists posts_processing on posts (created_at) where media_status = 'processing';

    create table if not exists streams (
      id text primary key,
      match_id text not null references matches(id) on delete cascade,
      user_id bigint not null references users(id) on delete cascade,
      status text not null default 'live' check (status in ('live','ended')),
      match_minute integer,
      started_at timestamptz not null default now(),
      ended_at timestamptz,
      post_id text references posts(id) on delete set null
    );
    create index if not exists streams_live on streams (match_id) where status = 'live';
    create index if not exists streams_user on streams (user_id, started_at desc);
  `);
  const values = SEED_FANDOMS.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(',');
  await pool.query(`insert into fandoms (slug, name) values ${values} on conflict (slug) do nothing`, SEED_FANDOMS.flat());
}
