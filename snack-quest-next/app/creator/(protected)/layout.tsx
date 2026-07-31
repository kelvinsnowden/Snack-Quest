import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireCreatorSession } from '@/lib/auth/creatorSession';
import { CreatorUserMenu } from '@/components/creator/CreatorUserMenu';

export const metadata: Metadata = {
  title: {
    default: 'Snack Quest Creators',
    template: '%s — Snack Quest Creators',
  },
};

/**
 * The Secure tier of the creator auth check (§ Creator Portal auth) —
 * the one place every `/creator/*` page (other than login/register/
 * onboarding, which live outside this route group) actually gets
 * protected. A creator who hasn't finished onboarding is sent there
 * first — every other page in this group assumes a complete profile.
 */
export default async function CreatorProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await requireCreatorSession();
  if (!session.onboardingCompleted) {
    redirect('/creator/onboarding');
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface px-4 md:px-6">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            SQ
          </div>
          <span className="font-semibold text-foreground">Snack Quest Creators</span>
        </div>
        <CreatorUserMenu displayName={session.displayName} email={session.email} />
      </header>
      <main className="flex-1 overflow-y-auto p-4 md:p-8">{children}</main>
    </div>
  );
}
