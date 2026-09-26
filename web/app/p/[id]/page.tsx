import type { Metadata } from 'next';
import { fetchPublicPost, SITE_URL } from '@/lib/api';
import PostView from '@/components/PostView';

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const post = await fetchPublicPost(id);
  if (!post) return { title: 'Post', robots: { index: false } };
  const description = post.description || `${post.fandom ? `${post.fandom.name} · ` : ''}by @${post.creator.handle} on incha.tv`;
  const image = post.coverUrl || (post.kind === 'image' ? post.mediaUrl : undefined);
  const url = `${SITE_URL}/p/${post.id}`;
  return {
    title: post.title,
    description,
    alternates: { canonical: url },
    robots: post.visibility === 'public' ? undefined : { index: false },
    openGraph: {
      title: post.title,
      description,
      url,
      type: post.kind === 'video' ? 'video.other' : 'article',
      images: image ? [image] : undefined,
      videos: post.kind === 'video' && post.visibility === 'public' ? [{ url: post.mediaUrl, type: post.mediaMime }] : undefined
    },
    twitter: { card: 'summary_large_image', title: post.title, description, images: image ? [image] : undefined }
  };
}

export default async function PostPage({ params }: Params) {
  const { id } = await params;
  return <PostView id={id} />;
}
