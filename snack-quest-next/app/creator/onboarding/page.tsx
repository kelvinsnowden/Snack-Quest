import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireCreatorSession } from '@/lib/auth/creatorSession';
import { OnboardingForm } from '@/components/creator/OnboardingForm';

export const metadata: Metadata = {
  title: 'Complete your profile — Snack Quest Creators',
};

export const dynamic = 'force-dynamic';

/**
 * Sits outside the `(protected)` route group deliberately (§ Creator
 * Portal auth) — it needs a signed-in session but must never itself
 * redirect *into* onboarding the way `(protected)/layout.tsx` does for
 * every other creator page, or a not-yet-onboarded creator could never
 * reach this page at all.
 */
export default async function CreatorOnboardingPage() {
  const session = await requireCreatorSession();
  if (session.onboardingCompleted) {
    redirect('/creator');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">
            SQ
          </div>
          <h1 className="text-page-title font-bold tracking-tight text-foreground">Welcome, {session.displayName.split(' ')[0]}</h1>
          <p className="text-sm text-muted-foreground">A few details before you get your referral link.</p>
        </div>

        <div className="rounded-lg border border-border bg-surface p-6 shadow-md">
          <OnboardingForm />
        </div>
      </div>
    </main>
  );
}
