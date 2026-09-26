import type { Metadata } from 'next';
import Image from 'next/image';
import { requirePartnerSession } from '@/lib/auth/partnerSession';
import { PartnerTabBar, PartnerSideNav } from '@/components/partner/PartnerTabBar';
import { PartnerSignOutButton } from '@/components/partner/PartnerSignOutButton';

export const metadata: Metadata = {
  title: {
    default: 'Snack Quest Owners',
    template: '%s — Snack Quest Owners',
  },
};

/**
 * The Secure tier of the Owner Portal (§ PART 2 — OWNER PORTAL,
 * § partner authentication) — every `/partner/*` page other than
 * `/partner/login` lives inside this group and is unreachable
 * without a valid partner session. Mobile-first per the brief's own
 * instruction: the document scrolls normally, and the tab bar is
 * `fixed` over it rather than the page living inside an
 * internally-scrolling shell (see `PartnerTabBar`'s own doc comment
 * for why that matters on a phone).
 */
export default async function PartnerProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePartnerSession();

  return (
    <div className="min-h-dvh bg-background md:flex">
      <PartnerSideNav />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-surface/95 px-4 backdrop-blur">
          <div className="flex items-center gap-2">
            <Image src="/logo.png" alt="" aria-hidden="true" width={28} height={28} className="rounded-lg" />
            <span className="text-sm font-semibold text-foreground">{session.name}</span>
          </div>
          <PartnerSignOutButton />
        </header>
        <main className="flex-1 px-4 pb-24 pt-4 md:px-8 md:pb-8">{children}</main>
      </div>
      <PartnerTabBar />
    </div>
  );
}
