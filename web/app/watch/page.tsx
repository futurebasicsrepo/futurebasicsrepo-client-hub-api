import { Suspense } from 'react';
import WatchFeed from '@/components/WatchFeed';

export const metadata = { title: 'Watch' };

export default function WatchPage() {
  return <Suspense><WatchFeed /></Suspense>;
}
