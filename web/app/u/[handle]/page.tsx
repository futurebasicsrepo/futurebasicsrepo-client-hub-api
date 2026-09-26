import { Suspense } from 'react';
import ProfileView from '@/components/ProfileView';

export default async function ProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  return <Suspense><ProfileView handle={decodeURIComponent(handle)} /></Suspense>;
}
