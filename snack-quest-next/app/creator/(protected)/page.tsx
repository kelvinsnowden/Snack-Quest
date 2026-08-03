import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  Banknote,
  Link2,
  Megaphone,
  ShoppingBag,
  Trophy,
} from 'lucide-react';
import { requireCreatorSession } from '@/lib/auth/creatorSession';
import { creatorDashboardService } from '@/services/creatorDashboardService';
import { referralService } from '@/services/referralService';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { CreatorStatusBadge } from '@/components/admin/CreatorStatusBadge';
import { BalanceCard } from '@/components/creator/design/BalanceCard';
import { PortalCard } from '@/components/creator/design/PortalCard';
import { PortalSection } from '@/components/creator/design/PortalSection';
import { QuickActionRow } from '@/components/creator/design/QuickActionRow';
import { NextStepCard } from '@/components/creator/design/NextStepCard';
import { CREATOR_TIER_LABELS } from '@/lib/creators/tier';
import { resolveNextStep } from '@/lib/creator/nextStep';
import { formatDate, formatKes } from '@/lib/orders/format';

export const metadata: Metadata = { title: 'Home' };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

/** Nairobi is the only timezone this product operates in. */
function timeOfDayGreeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'Africa/Nairobi',
    }).format(new Date()),
  );
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

const QUICK_ACTIONS = [
  { href: '/creator/referrals', label: 'Links', icon: Link2 },
  { href: '/creator/earnings', label: 'Earnings', icon: Banknote },
  { href: '/creator/campaigns', label: 'Campaigns', icon: Megaphone },
  { href: '/creator/leaderboard', label: 'Ranking', icon: Trophy },
];

/**
 * Creator dashboard (§ Creator Portal premium rebuild).
 *
 * Restructured on the wallet pattern: balance, then actions, then
 * recent movement. That order is not decoration — it matches the
 * sequence of questions a creator actually arrives with. How much have
 * I made, what can I do next, and what happened recently. The previous
 * version answered the third question first and buried the first in a
 * neutral stat row beside a click count.
 *
 * The commission feed is capped at five. A creator scanning their
 * phone wants "did the last few land", not a ledger — the full
 * statement is one tap away on Earnings, and duplicating it here would
 * make two screens that do the same job badly.
 *
 * Suspended and pending-review are no longer separate banners above
 * the balance — NextStepCard already says the same thing with the
 * right next action attached, and a banner plus a next-step card
 * telling a pending creator the same fact twice was the redundant-copy
 * problem, not a second state to preserve. The header's status badge
 * remains the at-a-glance signal; the balance card's `canWithdraw`
 * still disables the withdraw CTA for anyone without full access.
 */
export default async function CreatorHomePage() {
  const session = await requireCreatorSession();
  const [{ profile, accessLevel }, { attributions }, { links }] =
    await Promise.all([
      creatorDashboardService.getDashboard(session.uid),
      referralService.listCommissionsForCreator(
        session.businessId,
        session.uid,
      ),
      referralService.listLinksForCreator(session.businessId, session.uid),
    ]);

  const firstName = session.displayName.split(' ')[0];
  const recent = attributions.slice(0, 5);
  const nextStep = resolveNextStep({
    accessLevel,
    status: profile.status,
    linkCount: links.length,
    totalClicks: profile.totalClicks,
    totalConversions: profile.totalConversions,
    availableCashKes: profile.availableCashKes,
  });
  const conversionRate =
    profile.totalClicks > 0
      ? (profile.totalConversions / profile.totalClicks) * 100
      : null;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <header className="flex items-start gap-3">
        <Avatar className="size-12 shrink-0">
          {session.photoURL ? <AvatarImage src={session.photoURL} alt="" /> : null}
          <AvatarFallback>{initials(session.displayName)}</AvatarFallback>
        </Avatar>
        <div>
          <p className="text-muted-foreground text-sm">{timeOfDayGreeting()}</p>
          <h1 className="text-foreground mt-1 text-[1.75rem] leading-tight font-semibold tracking-tight md:text-[2rem]">
            {firstName}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <CreatorStatusBadge status={profile.status} />
            <Badge variant="outline">
              {CREATOR_TIER_LABELS[profile.tier]} tier
            </Badge>
          </div>
        </div>
      </header>

      <BalanceCard
        availableKes={profile.availableCashKes}
        pendingKes={profile.pendingEarningsKes}
        lifetimeKes={profile.lifetimeEarningsKes}
        referralCode={profile.referralCode}
        canWithdraw={accessLevel === 'full'}
      />

      <NextStepCard step={nextStep} />

      <QuickActionRow actions={QUICK_ACTIONS} />

      <PortalSection id="performance" title="How you're performing">
        <PortalCard>
          {/*
            One ratio rather than two raw counters. "412 clicks, 18
            conversions" makes the reader do the division; the rate is
            the thing they were computing, so it leads and the counts
            become its supporting detail.
          */}
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-caption text-muted-foreground font-medium tracking-wide uppercase">
                Conversion rate
              </p>
              <p className="text-foreground mt-1.5 text-[2rem] leading-none font-semibold tabular-nums">
                {conversionRate === null
                  ? '—'
                  : `${conversionRate.toFixed(1)}%`}
              </p>
            </div>
            <p className="text-muted-foreground text-sm tabular-nums">
              {profile.totalConversions.toLocaleString()} of{' '}
              {profile.totalClicks.toLocaleString()} clicks
            </p>
          </div>

          {/* Visualised rather than tabulated, per the same reasoning. */}
          <div
            className="bg-muted mt-4 h-2 overflow-hidden rounded-full"
            role="img"
            aria-label={
              conversionRate === null
                ? 'No clicks recorded yet'
                : `${conversionRate.toFixed(1)} percent of clicks converted`
            }
          >
            <div
              className="bg-success h-full rounded-full transition-[width] duration-500 ease-out"
              style={{ width: `${Math.min(conversionRate ?? 0, 100)}%` }}
            />
          </div>

          {conversionRate === null ? (
            <p className="text-muted-foreground mt-3 text-sm">
              Once your link starts getting clicks, your conversion rate shows
              up here.
            </p>
          ) : null}
        </PortalCard>
      </PortalSection>

      <PortalSection
        id="recent-commissions"
        title="Recent commissions"
        action={
          attributions.length > 0 ? (
            <Link
              href="/creator/earnings"
              className="text-primary focus-visible:ring-primary focus-visible:ring-offset-background inline-flex items-center gap-1 rounded-md text-sm font-medium hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              See all
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          ) : undefined
        }
      >
        {recent.length === 0 ? (
          <PortalCard className="text-center">
            <span
              aria-hidden="true"
              className="bg-muted text-muted-foreground mx-auto flex size-11 items-center justify-center rounded-full"
            >
              <ShoppingBag className="size-5" />
            </span>
            <p className="text-foreground mt-3 font-medium">
              No commissions yet
            </p>
            <p className="text-small text-muted-foreground mx-auto mt-1 max-w-sm">
              Share a referral link and the first one lands here the moment
              someone orders with your code.
            </p>
            <Link
              href="/creator/referrals"
              className="bg-primary text-primary-foreground focus-visible:ring-primary focus-visible:ring-offset-background mt-5 inline-flex h-10 items-center gap-2 rounded-full px-5 text-sm font-semibold transition-transform duration-150 ease-out hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:translate-y-0"
            >
              Get your link
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </PortalCard>
        ) : (
          <ul className="border-border divide-border bg-surface divide-y overflow-hidden rounded-lg border">
            {recent.map(({ id, data }) => (
              <li key={id} className="flex items-center gap-3 p-4">
                <span
                  aria-hidden="true"
                  className="bg-success/10 text-success flex size-10 shrink-0 items-center justify-center rounded-full"
                >
                  <ShoppingBag className="size-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-foreground truncate font-medium">
                    Order {data.orderId}
                  </p>
                  <p className="text-muted-foreground text-sm tabular-nums">
                    {formatDate(data.createdAt)}
                  </p>
                </div>
                <p className="text-success shrink-0 font-semibold tabular-nums">
                  +{formatKes(data.commissionKes)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </PortalSection>
    </div>
  );
}
