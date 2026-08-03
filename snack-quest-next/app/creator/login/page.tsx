import { Suspense } from 'react';
import type { Metadata } from 'next';
import { CreatorLoginForm, CreatorLoginFormFallback } from '@/components/creator/CreatorLoginForm';
import { LoginGreetingSubtitle, LoginGreetingTitle } from '@/components/creator/LoginGreeting';
import { AuthShell } from '@/components/creator/design/AuthShell';

export const metadata: Metadata = {
  title: 'Sign in — Snack Quest Creators',
};

// Never statically prerendered — see app/admin/login/page.tsx for why
// (client-side Firebase SDK init needs real runtime env vars, and this
// is inherently per-session content).
export const dynamic = 'force-dynamic';

export default function CreatorLoginPage() {
  return (
    <AuthShell title={<LoginGreetingTitle />} description={<LoginGreetingSubtitle />}>
      <Suspense fallback={<CreatorLoginFormFallback />}>
        <CreatorLoginForm />
      </Suspense>
    </AuthShell>
  );
}
