import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireCreatorSession } from '@/lib/auth/creatorSession';
import { CreatorUserMenu } from '@/components/creator/CreatorUserMenu';
import {
  PortalSideRail,
  PortalTabBar,
} from '@/components/creator/design/PortalNav';

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
 *
 * Shell rebuilt mobile-first (§ Creator Portal premium rebuild). The
 * previous version was an admin frame: `h-screen overflow-hidden` with
 * an internally scrolling `<main>`, which on a phone fights the
 * browser's own chrome-collapsing behaviour and breaks scroll
 * restoration between screens. The document scrolls normally now, and
 * the bottom tab bar is `fixed` over it.
 */
export default async function CreatorProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireCreatorSession();
  if (!session.onboardingCompleted) {
    redirect('/creator/onboarding');
  }

  return (
    <div className="bg-background min-h-dvh md:flex">
      <PortalSideRail />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-border bg-surface/95 sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-4 border-b px-4 backdrop-blur md:h-16 md:px-8">
          <Link
            href="/creator"
            className="focus-visible:ring-primary focus-visible:ring-offset-background flex items-center gap-2.5 rounded-md focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <span
              aria-hidden="true"
              className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg text-sm font-bold"
            >
              SQ
            </span>
            <span className="text-foreground font-semibold">Creators</span>
          </Link>
          <CreatorUserMenu
            displayName={session.displayName}
            email={session.email}
          />
        </header>

        {/*
          Bottom padding clears the fixed tab bar on mobile: its own
          height plus the iOS home-indicator inset, so the last element
          on a page is never trapped underneath it.
        */}
        <main className="flex-1 px-4 pt-6 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:px-8 md:pt-8 md:pb-12">
          {children}
        </main>
      </div>

      <PortalTabBar />
    </div>
  );
}
