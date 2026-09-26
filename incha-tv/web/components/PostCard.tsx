import Link from 'next/link';
import type { Post } from '@/lib/api';
import { compact, filterCss, runtime, timeAgo } from '@/lib/format';

export function Thumb({ post }: { post: Post }) {
  const style = { filter: filterCss(post.filter) };
  if (post.coverUrl || post.kind === 'image') {
    return <img src={post.coverUrl || post.mediaUrl} alt="" loading="lazy" style={style} />;
  }
  // No cover yet: let the browser render the first trimmed frame.
  const start = post.trimStart ?? 0.1;
  return <video src={`${post.mediaUrl}#t=${start}`} preload="metadata" muted playsInline style={style} />;
}

export default function PostCard({ post, href }: { post: Post; href?: string }) {
  const length = post.kind === 'video' ? runtime(post) : null;
  return (
    <article className="card">
      <Link href={href ?? `/p/${post.id}`} className="thumb">
        <Thumb post={post} />
        <span className="overlay">
          {length && <span className="badge">{length}</span>}
          {post.kind === 'image' && <span className="badge">Photo</span>}
        </span>
      </Link>
      <Link href={`/p/${post.id}`}><h3>{post.title}</h3></Link>
      <div className="meta">
        <Link href={`/u/${post.creator.handle}`}>@{post.creator.handle}</Link>
        {post.fandom && <>· <Link href={`/f/${post.fandom.slug}`}>{post.fandom.name}</Link></>}
      </div>
      <div className="meta">
        <span>▲ {compact(post.score)}</span>·<span>{compact(post.viewCount)} {post.viewCount === 1 ? 'view' : 'views'}</span>·<span>{compact(post.commentCount)} comments</span>·<span>{timeAgo(post.publishedAt)}</span>
      </div>
    </article>
  );
}
