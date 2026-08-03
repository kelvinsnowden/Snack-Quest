import { Suspense } from 'react';
import type { Metadata } from 'next';
import { CreatorRegisterForm, CreatorRegisterFormFallback } from '@/components/creator/CreatorRegisterForm';
import { AuthShell } from '@/components/creator/design/AuthShell';

export const metadata: Metadata = {
  title: 'Create your account — Snack Quest Creators',
};

// Never statically prerendered — same reasoning as app/creator/login/page.tsx.
export const dynamic = 'force-dynamic';

export default function CreatorRegisterPage() {
  return (
    <AuthShell
      title="Join the creator program"
      description="Earn commission promoting Snack Quest boxes."
    >
      <Suspense fallback={<CreatorRegisterFormFallback />}>
        <CreatorRegisterForm />
      </Suspense>
    </AuthShell>
  );
}
