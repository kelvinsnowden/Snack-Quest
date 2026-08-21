import type { Metadata } from 'next';
import Image from 'next/image';
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
    <div className="bg-background relative min-h-dvh md:flex">
      {/*
        The same atmosphere the storefront opens with — two soft brand
        washes behind the content (§ brand consistency pass). The portal
        was a flat grey field, which is why it read as a different
        product from the site that recruited the creator into it.
        Fixed rather than absolute so the colour stays put while a long
        earnings list scrolls over it, and pointer-events-none so it can
        never intercept a tap.
      */}
      {/*
        Desktop only. Two 500px circles at blur-3xl are a real
        compositing cost on a phone, and they were buying atmosphere
        behind content that already sits on its own cards — the ambient
        wash read as a slightly dirty background rather than as depth.
        The desktop layout has the empty margins that make it land.
      */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 hidden overflow-hidden md:block">
        <div className="bg-secondary/10 absolute -top-40 -left-32 size-[520px] rounded-full blur-3xl" />
        <div className="bg-primary/10 absolute -right-40 bottom-0 size-[460px] rounded-full blur-3xl" />
      </div>

      <PortalSideRail />

      <div className="relative flex min-w-0 flex-1 flex-col">
        <header className="border-border bg-surface/95 sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-4 border-b px-4 backdrop-blur md:h-16 md:px-8">
          <Link
            href="/creator"
            /* Was 108x32 on every page — the header's home link, under the touch minimum portal-wide. */
            className="focus-visible:ring-primary focus-visible:ring-offset-background -mx-2 flex min-h-11 items-center gap-2.5 rounded-md px-2 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <Image
              src="/logo.png"
              alt=""
              aria-hidden="true"
              width={32}
              height={32}
              className="size-8 rounded-lg object-cover"
            />
            <span className="text-foreground font-semibold">Creators</span>
          </Link>
          <CreatorUserMenu
            displayName={session.displayName}
            email={session.email}
            photoURL={session.photoURL}
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
