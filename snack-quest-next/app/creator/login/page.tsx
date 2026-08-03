import { Suspense } from 'react';
import type { Metadata } from 'next';
import Image from 'next/image';
import { CreatorLoginForm, CreatorLoginFormFallback } from '@/components/creator/CreatorLoginForm';

export const metadata: Metadata = {
  title: 'Sign in — Snack Quest Creators',
};

// Never statically prerendered — see app/admin/login/page.tsx for why
// (client-side Firebase SDK init needs real runtime env vars, and this
// is inherently per-session content).
export const dynamic = 'force-dynamic';

export default function CreatorLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <Image src="/logo.png" alt="Snack Quest" width={48} height={48} className="size-12 rounded-xl object-cover" />
          <h1 className="text-page-title font-bold tracking-tight text-foreground">Creators</h1>
          <p className="text-sm text-muted-foreground">Sign in to your creator account to continue.</p>
        </div>

        <div className="rounded-lg border border-border bg-surface p-6 shadow-md">
          <Suspense fallback={<CreatorLoginFormFallback />}>
            <CreatorLoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
