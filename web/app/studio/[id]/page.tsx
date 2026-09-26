import { Suspense } from 'react';
import Editor from '@/components/Editor';

export const metadata = { title: 'Edit' };

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Suspense><Editor id={id} /></Suspense>;
}
