'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, getToken, type Profile, type User } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { compact } from '@/lib/format';
import Avatar from './Avatar';
import Feed from './Feed';

export default function ProfileView({ handle }: { handle: string }) {
  const { user, signIn, signOut } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [missing, setMissing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ displayName: '', bio: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ user: Profile }>(`/v1/users/${encodeURIComponent(handle)}`).then(d => setProfile(d.user)).catch(() => setMissing(true));
  }, [handle]);

  const isMe = user?.handle === handle.toLowerCase().replace(/^@/, '');

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
  if (!profile) return <div className="wrap"><div className="skeleton" style={{ height: 140, marginTop: 40 }} /></div>;

  return (
    <div className="wrap">
      <section className="profile-head">
        <Avatar name={profile.displayName} size="lg" />
        <div className="stack" style={{ gap: 4, flex: 1, minWidth: 240 }}>
          <h1 className="display">{profile.displayName}</h1>
          <span className="muted">@{profile.handle}</span>
          {profile.bio && <p style={{ margin: '8px 0 0', maxWidth: 560 }}>{profile.bio}</p>}
        </div>
        <div className="stats">
          <div><strong>{compact(profile.postCount)}</strong><span className="mono muted">Posts</span></div>
          <div><strong>{compact(profile.totalScore)}</strong><span className="mono muted">Upvotes</span></div>
        </div>
        {isMe && !editing && (
          <div className="row">
            <Link href="/studio" className="btn btn-sm btn-primary">Studio</Link>
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
      <Feed creator={profile.handle} emptyTitle="No public posts yet" emptyBody={isMe ? 'Your published public posts show up here.' : 'Check back after the next match.'} />
    </div>
  );
}
