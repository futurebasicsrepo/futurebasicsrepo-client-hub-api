'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { api, getToken, type Profile, type User } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { compact } from '@/lib/format';
import Avatar from './Avatar';
import Feed from './Feed';
import StudioList from './StudioList';
import ProfileMatches from './ProfileMatches';

type Tab = 'posts' | 'studio' | 'matches';
const LABELS: Record<Tab, string> = { posts: 'Posts', studio: 'Studio', matches: 'Matches' };

/** A person's page. On your own it's your home base: public posts, every upload (Studio), your matches and settings. */
export default function ProfileView({ handle }: { handle: string }) {
  const { user, ready, signIn, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [missing, setMissing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ displayName: '', bio: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ user: Profile }>(`/v1/users/${encodeURIComponent(handle)}`).then(d => setProfile(d.user)).catch(() => setMissing(true));
  }, [handle]);

  const isMe = user?.handle === handle.toLowerCase().replace(/^@/, '');
  const tabs: Tab[] = isMe ? ['posts', 'studio', 'matches'] : ['posts', 'matches'];
  const requested = params.get('tab') as Tab | null;
  const tab: Tab = requested && tabs.includes(requested) ? requested : 'posts';
  const openTab = (next: Tab) => router.replace(next === 'posts' ? pathname : `${pathname}?tab=${next}`, { scroll: false });

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    try {
      const { user: updated } = await api<{ user: User }>('/v1/me', { method: 'PATCH', body: draft });
      setProfile(p => (p ? { ...p, displayName: updated.displayName, bio: updated.bio } : p));
      const token = getToken();
      if (token) signIn(token, updated);
      setEditing(false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (missing) return <div className="wrap"><div className="empty" style={{ marginTop: 48 }}><div className="display">Creator not found</div><Link href="/" className="btn">Back to the feed</Link></div></div>;
  // Wait for auth too, so your own Studio/Matches tabs don't flash in after the page renders.
  if (!profile || !ready) return <div className="wrap"><div className="skeleton" style={{ height: 140, marginTop: 40 }} /></div>;

  return (
    <div className="wrap profile">
      <section className="profile-head">
        <Avatar name={profile.displayName} size="lg" />
        <div className="stack" style={{ gap: 4, flex: 1, minWidth: 220 }}>
          <h1 className="display">{profile.displayName}</h1>
          <span className="muted">@{profile.handle}</span>
          {profile.bio && <p style={{ margin: '8px 0 0', maxWidth: 560 }}>{profile.bio}</p>}
        </div>
        <div className="stats">
          <div><strong>{compact(profile.postCount)}</strong><span className="mono muted">Posts</span></div>
          <div><strong>{compact(profile.matchCount ?? 0)}</strong><span className="mono muted">Matches</span></div>
          <div><strong>{compact(profile.totalScore)}</strong><span className="mono muted">Upvotes</span></div>
        </div>
        {isMe && !editing && (
          <div className="row">
            <button className="btn btn-sm" onClick={() => { setDraft({ displayName: profile.displayName, bio: profile.bio }); setEditing(true); }}>Edit profile</button>
            <button className="btn btn-sm btn-ghost" onClick={() => { signOut(); router.push('/'); }}>Sign out</button>
          </div>
        )}
      </section>

      {editing && (
        <form className="panel stack" onSubmit={save} style={{ maxWidth: 560, marginBottom: 24 }}>
          <div className="field"><label htmlFor="dn">Display name</label><input id="dn" className="input" value={draft.displayName} maxLength={60} onChange={e => setDraft({ ...draft, displayName: e.target.value })} /></div>
          <div className="field"><label htmlFor="bio">Bio</label><textarea id="bio" className="textarea" value={draft.bio} maxLength={280} onChange={e => setDraft({ ...draft, bio: e.target.value })} /></div>
          {error && <p className="error">{error}</p>}
          <div className="row"><button className="btn btn-primary btn-sm">Save</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button></div>
        </form>
      )}

      <nav className="profile-tabs" aria-label="Profile sections">
        {tabs.map(t => (
          <button key={t} aria-current={tab === t ? 'page' : undefined} onClick={() => openTab(t)}>{LABELS[t]}</button>
        ))}
      </nav>

      <div className="profile-panel">
        {tab === 'posts' && (
          <Feed creator={profile.handle} emptyTitle="No public posts yet" emptyBody={isMe ? 'Your published public posts show up here. Drafts live in Studio.' : 'Check back after the next match.'} />
        )}
        {tab === 'studio' && isMe && <StudioList />}
        {tab === 'matches' && <ProfileMatches handle={profile.handle} isMe={isMe} />}
      </div>
    </div>
  );
}
