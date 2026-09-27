'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useRequireUser } from '@/lib/useRequireUser';

/** Studio now lives on your profile; keep old links working. */
export default function StudioRedirect() {
  const user = useRequireUser();
  const router = useRouter();
  useEffect(() => { if (user) router.replace(`/u/${user.handle}?tab=studio`); }, [user, router]);
  return <div className="wrap"><div className="skeleton" style={{ height: 140, marginTop: 40 }} /></div>;
}
