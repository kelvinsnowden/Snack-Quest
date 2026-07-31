import { Suspense } from 'react';
import type { Metadata } from 'next';
import { LoginForm, LoginFormFallback } from '@/components/admin/LoginForm';

export const metadata: Metadata = {
  title: 'Sign in — Snack Quest Admin',
};

// Never statically prerendered: this page's client-side Firebase SDK
// initialization needs real NEXT_PUBLIC_FIREBASE_* config present at
// render time, which a build-time static-export pass can't guarantee
// (build environments legitimately don't always carry runtime env
// vars). It's also inherently per-request/session-cookie-gated
// content anyway, never something that should be statically cached.
export const dynamic = 'force-dynamic';

export default function AdminLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">
            SQ
          </div>
          <h1 className="text-page-title font-bold tracking-tight text-foreground">Admin</h1>
          <p className="text-sm text-muted-foreground">Sign in with your staff account to continue.</p>
        </div>

        <div className="rounded-lg border border-border bg-surface p-6 shadow-md">
          <Suspense fallback={<LoginFormFallback />}>
            <LoginForm />
          </Suspense>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Staff accounts are provisioned by a super admin — there is no self-registration here.
        </p>
      </div>
    </main>
  );
}
