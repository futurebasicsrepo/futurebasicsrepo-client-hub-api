import type { Post } from '@/lib/api';

export default function VisibilityBadge({ post }: { post: Pick<Post, 'status' | 'visibility'> }) {
  if (post.status === 'draft') return <span className="badge">Draft</span>;
  if (post.visibility === 'public') return <span className="badge flare">Public</span>;
  if (post.visibility === 'unlisted') return <span className="badge sky">Unlisted</span>;
  return <span className="badge">Private</span>;
}
