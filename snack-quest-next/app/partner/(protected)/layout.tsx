import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { requirePartnerSession } from '@/lib/auth/partnerSession';
import { PartnerTabBar, PartnerSideNav } from '@/components/partner/PartnerTabBar';
import { PartnerAccountMenu } from '@/components/partner/PartnerAccountMenu';

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
 *
 * `theme-partner-dark` (§ Owner Portal dark redesign) is a scoped,
 * always-on dark theme for this one portal — see the class's own doc
 * comment in `globals.css` for why a class here rather than
 * `data-theme` on `<html>`. Every page under this layout already
 * consumed only semantic tokens, so nothing else needed to change for
 * the whole portal to go dark.
 */
export default async function PartnerProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePartnerSession();

  return (
    <div className="theme-partner-dark min-h-dvh bg-background md:flex">
      <PartnerSideNav />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-surface/95 px-4 backdrop-blur md:justify-end">
          <Link href="/partner" className="flex items-center gap-2 md:hidden">
            <Image src="/logo.png" alt="" aria-hidden="true" width={28} height={28} className="rounded-lg" />
            <span className="text-sm font-bold text-foreground">Snack Quest</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/partner"
              aria-label="Notifications"
              className="flex size-10 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
            >
              <Bell className="size-4" aria-hidden="true" />
            </Link>
            <PartnerAccountMenu name={session.name} contactEmail={session.contactEmail} />
          </div>
        </header>
        <main className="flex-1 px-4 pb-24 pt-4 md:px-8 md:pb-8">{children}</main>
      </div>
      <PartnerTabBar />
    </div>
  );
}
