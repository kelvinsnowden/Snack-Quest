import { Suspense } from 'react';
import type { Metadata } from 'next';
import { CreatorRegisterForm, CreatorRegisterFormFallback } from '@/components/creator/CreatorRegisterForm';

export const metadata: Metadata = {
  title: 'Create your account — Snack Quest Creators',
};

// Never statically prerendered — same reasoning as app/creator/login/page.tsx.
export const dynamic = 'force-dynamic';

export default function CreatorRegisterPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">
            SQ
          </div>
          <h1 className="text-page-title font-bold tracking-tight text-foreground">Join the creator program</h1>
          <p className="text-sm text-muted-foreground">Earn commission promoting Snack Quest boxes.</p>
        </div>

        <div className="rounded-lg border border-border bg-surface p-6 shadow-md">
          <Suspense fallback={<CreatorRegisterFormFallback />}>
            <CreatorRegisterForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
