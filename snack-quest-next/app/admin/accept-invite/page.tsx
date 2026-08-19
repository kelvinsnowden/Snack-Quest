import { Suspense } from 'react';
import type { Metadata } from 'next';
import Image from 'next/image';
import { AcceptInviteForm, AcceptInviteFormFallback } from '@/components/admin/AcceptInviteForm';

export const metadata: Metadata = {
  title: 'Set your password — Snack Quest Admin',
};

// Same reasoning as /admin/login: the client-side Firebase SDK needs
// real runtime env vars, and this is inherently a one-time,
// never-cached page (a stale prerender would bake in the build's
// `NEXT_PUBLIC_FIREBASE_*` values instead of the request's).
export const dynamic = 'force-dynamic';

export default function AcceptInvitePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <Image src="/logo.png" alt="Snack Quest" width={48} height={48} className="size-12 rounded-xl object-cover" />
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Welcome to the team</h1>
          <p className="text-sm text-muted-foreground">Set a password to activate your staff account.</p>
        </div>

        <div className="rounded-lg border border-border bg-surface p-6 shadow-md">
          <Suspense fallback={<AcceptInviteFormFallback />}>
            <AcceptInviteForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
