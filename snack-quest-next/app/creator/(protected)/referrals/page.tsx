import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Link2 } from 'lucide-react';
import { requireCreatorSession } from '@/lib/auth/creatorSession';
import { referralService } from '@/services/referralService';
import { EmptyState } from '@/components/ui/empty-state';
import { CopyLinkButton } from '@/components/creator/CopyLinkButton';
import { PortalPageHeader } from '@/components/creator/design/PortalPageHeader';
import { StatTile } from '@/components/creator/design/StatTile';

export const metadata: Metadata = { title: 'Referral link' };

async function getOrigin(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get('host') ?? 'localhost:3000';
  const protocol =
    headerList.get('x-forwarded-proto') ??
    (host.startsWith('localhost') ? 'http' : 'https');
  return `${protocol}://${host}`;
}

/**
 * Referral link (§ referral system overhaul) — a creator gets exactly
 * one, auto-generated the moment they register, with a fixed
 * discount and a commission locked in permanently by their real
 * registration order (`lib/creators/referralEconomics.ts`). There is
 * nothing left to create or configure here: this screen is copy the
 * link and watch the two numbers that matter, clicks and conversions.
 * A creator can no longer pause their own link either — that's an
 * admin-only lever now (`/admin/referrals`), so a suspected-fraud
 * pause can't just be un-paused by the person being investigated.
 *
 * The code itself is the one bold element on this screen (§ Creator
 * Portal premium rebuild, "calm everywhere except the thing that
 * matters"). Everything a creator does on this page starts with
 * reading or sharing that code, so it gets the same loud-orange-
 * gradient treatment the dashboard gives the balance figure — the
 * stats underneath stay on calm StatTiles, same as every other
 * number-grid in the portal.
 */
export default async function CreatorReferralsPage() {
  const session = await requireCreatorSession();
  const [{ links }, origin] = await Promise.all([
    referralService.listLinksForCreator(session.businessId, session.uid, {
      limit: 1,
    }),
    getOrigin(),
  ]);
  const link = links[0];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <PortalPageHeader
        title="Your referral link"
        description="Share it — every order placed with it gives your follower a discount and credits you a commission."
      />

      {!link ? (
        <EmptyState
          icon={Link2}
          title="Your link isn't ready yet"
          description="This is provisioned automatically when your account is set up. If it's been a while, reach out to support."
        />
      ) : (
        <>
          <section className="from-primary relative overflow-hidden rounded-2xl bg-gradient-to-br to-[#b35400] p-6 text-white shadow-[0_20px_60px_-24px_rgb(255_122_0/0.5)] md:p-8">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-white/10 blur-3xl"
            />
            <div className="relative">
              <div className="flex items-center justify-between gap-3">
                <p className="text-caption font-medium tracking-wide text-white/70 uppercase">
                  Your referral code
                </p>
                <span className="rounded-full bg-white/15 px-2.5 py-1 text-[0.6875rem] font-medium whitespace-nowrap">
                  {link.data.isActive ? 'Active' : 'Paused by admin'}
                </span>
              </div>
              <p className="mt-2 text-[2.25rem] leading-none font-bold tracking-[0.06em] tabular-nums md:text-[3rem]">
                {link.data.code}
              </p>

              {/* The point of the screen: the thing you paste somewhere. */}
              <div className="mt-7 flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 p-2 pl-3 backdrop-blur-sm">
                <code className="min-w-0 flex-1 truncate text-sm text-white/90">
                  {origin}/r/{link.data.code}
                </code>
                <CopyLinkButton
                  url={`${origin}/r/${link.data.code}`}
                  className="text-white hover:bg-white/15"
                />
              </div>
            </div>
          </section>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:gap-4">
            <StatTile
              label="Discount"
              value={`KES ${link.data.discountKes.toLocaleString()}`}
            />
            <StatTile
              label="Commission"
              value={`KES ${link.data.commissionKes.toLocaleString()}`}
            />
            <StatTile
              label="Clicks"
              value={link.data.clickCount.toLocaleString()}
            />
            <StatTile
              label="Conversions"
              value={link.data.conversionCount.toLocaleString()}
            />
          </div>
        </>
      )}
    </div>
  );
}
