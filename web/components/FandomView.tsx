'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, type FandomHub } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { compact } from '@/lib/format';
import Feed from './Feed';
import ThreadList from './community/ThreadList';
import ChatRoom from './community/ChatRoom';

/**
 * A fandom is a community: part Discord server (# channels, a live matchday chat),
 * part subreddit (threads with upvotes and nested replies), plus the fandom's clips.
 */
export default function FandomView({ slug, channel: requested }: { slug: string; channel?: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const [hub, setHub] = useState<FandomHub | null>(null);
  const [missing, setMissing] = useState(false);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    api<FandomHub>(`/v1/fandoms/${encodeURIComponent(slug)}/hub`).then(setHub).catch(() => setMissing(true));
  }, [slug, user]);

  if (missing) {
    return <div className="wrap"><div className="empty" style={{ marginTop: 48 }}><div className="display">No such fandom</div><Link href="/fandoms" className="btn">Browse fandoms</Link></div></div>;
  }

  const current = requested === 'clips' ? 'clips' : hub?.channels.find(c => c.slug === requested)?.slug ?? 'general';
  const channel = hub?.channels.find(c => c.slug === current);

  async function toggleJoin() {
    if (!user) { router.push(`/login?next=/f/${slug}`); return; }
    if (!hub) return;
    setJoining(true);
    try {
      const result = await api<{ joined: boolean; memberCount: number }>(`/v1/fandoms/${encodeURIComponent(slug)}/join`, { method: hub.fandom.joined ? 'DELETE' : 'POST' });
      setHub({ ...hub, fandom: { ...hub.fandom, joined: result.joined, memberCount: result.memberCount } });
    } finally {
      setJoining(false);
    }
  }

  const href = (c: string) => `/f/${slug}${c === 'general' ? '' : `?c=${c}`}`;

  return (
    <div className="wrap fandom-hub">
      <header className="fandom-head">
        <div>
          <span className="mono muted">Fandom</span>
          <h1 className="display">{hub?.fandom.name ?? '…'}</h1>
          <p className="muted">{hub ? `${compact(hub.fandom.memberCount)} ${hub.fandom.memberCount === 1 ? 'member' : 'members'} · ${compact(hub.fandom.postCount)} clips` : ' '}</p>
        </div>
        {hub && (
          <button className={`btn ${hub.fandom.joined ? '' : 'btn-primary'}`} onClick={toggleJoin} disabled={joining} aria-pressed={hub.fandom.joined}>
            {hub.fandom.joined ? '✓ Joined' : 'Join'}
          </button>
        )}
      </header>

      <div className="fandom-body">
        <nav className="channel-rail" aria-label="Channels">
          {(hub?.channels ?? []).map(c => (
            <Link key={c.slug} href={href(c.slug)} replace scroll={false} className="channel-link" aria-current={current === c.slug ? 'page' : undefined}>
              <span className="channel-hash" aria-hidden="true">{c.kind === 'chat' ? '●' : '#'}</span>
              <span className="channel-name">{c.name}</span>
              {c.kind === 'chat' && !!c.online && current !== c.slug && <span className="channel-badge live">{c.online}</span>}
              {c.kind === 'threads' && c.threadCount > 0 && <span className="channel-badge">{compact(c.threadCount)}</span>}
            </Link>
          ))}
          {hub && (
            <Link href={href('clips')} replace scroll={false} className="channel-link" aria-current={current === 'clips' ? 'page' : undefined}>
              <span className="channel-hash" aria-hidden="true">▶</span><span className="channel-name">clips</span>
            </Link>
          )}
        </nav>

        <div className="channel-main">
          {!hub && <div className="skeleton" style={{ height: 240 }} />}
          {hub && current === 'clips' && <Feed fandom={slug} emptyTitle="Quiet in the stands" emptyBody="No clips in this fandom yet. Start the chant." />}
          {hub && channel?.kind === 'threads' && <ThreadList key={channel.slug} slug={slug} channel={channel} />}
          {hub && channel?.kind === 'chat' && <ChatRoom key={channel.slug} slug={slug} channel={channel} />}
        </div>
      </div>
    </div>
  );
}
