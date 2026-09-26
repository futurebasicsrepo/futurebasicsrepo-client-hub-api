import { Suspense } from 'react';
import AuthForm from '@/components/AuthForm';

export const metadata = { title: 'Join' };
export default function SignupPage() {
  return <Suspense><AuthForm mode="signup" /></Suspense>;
}
