'use client';

import { useEffect, useState } from 'react';
import { SITE_URL } from '@/lib/api';

export default function ShareBar({ postId, title }: { postId: string; title: string }) {
  const url = `${SITE_URL}/p/${postId}`;
  const text = `${title} — on incha.tv`;
  const [toast, setToast] = useState('');
  const [canNativeShare, setCanNativeShare] = useState(false);

  useEffect(() => { setCanNativeShare(typeof navigator !== 'undefined' && 'share' in navigator); }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 1800);
    return () => clearTimeout(timer);
  }, [toast]);

  const e = encodeURIComponent;
  const targets = [
    { label: 'WhatsApp', href: `https://wa.me/?text=${e(`${text} ${url}`)}` },
    { label: 'X', href: `https://twitter.com/intent/tweet?text=${e(text)}&url=${e(url)}` },
    { label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${e(url)}` },
    { label: 'Reddit', href: `https://www.reddit.com/submit?url=${e(url)}&title=${e(title)}` },
    { label: 'Email', href: `mailto:?subject=${e(text)}&body=${e(url)}` }
  ];

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setToast('Link copied');
    } catch {
      window.prompt('Copy this link', url);
    }
  }

  return (
    <div className="stack">
      <div className="row">
        <span className="mono muted">Share</span>
        <div className="spacer" />
        {canNativeShare && (
          <button className="btn btn-primary btn-sm" onClick={() => navigator.share({ title, text, url }).catch(() => {})}>Share…</button>
        )}
      </div>
      <div className="share-grid">
        <button className="btn" onClick={copy}>Copy link</button>
        {targets.map(target => (
          <a key={target.label} className="btn" href={target.href} target="_blank" rel="noopener noreferrer">{target.label}</a>
        ))}
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
