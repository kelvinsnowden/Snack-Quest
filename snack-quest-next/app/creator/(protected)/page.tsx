import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Clock, Link2, ShieldAlert } from 'lucide-react';
import { requireCreatorSession } from '@/lib/auth/creatorSession';
import { creatorDashboardService } from '@/services/creatorDashboardService';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CreatorStatusBadge } from '@/components/admin/CreatorStatusBadge';
import { PortalCard } from '@/components/creator/design/PortalCard';
import { PortalSection } from '@/components/creator/design/PortalSection';
import { StatTile } from '@/components/creator/design/StatTile';
import { CREATOR_TIER_LABELS } from '@/lib/creators/tier';

export const metadata: Metadata = { title: 'Home' };

/**
 * Creator dashboard (§ Creator Portal premium rebuild).
 *
 * Rebuilt around the question a creator actually opens this screen to
 * answer — "how am I doing, and what do I do next" — rather than
 * around the shape of the profile document. Available balance is the
 * figure that matters, so it is the one marked `strong`; the referral
 * code is an action, not a statistic, so it moved out of the stat row
 * and into a card that can be shared.
 *
 * The three account states (suspended, pending review, active) are
 * handled as distinct first-class states rather than notices bolted
 * above a dashboard that assumes success — a pending creator seeing
 * click and balance figures that can only ever read zero learns
 * nothing, so they get told what happens next instead.
 */
export default async function CreatorHomePage() {
  const session = await requireCreatorSession();
  const { profile, accessLevel } = await creatorDashboardService.getDashboard(
    session.uid,
  );
  const firstName = session.displayName.split(' ')[0];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <header>
        <h1 className="text-foreground text-[1.75rem] leading-tight font-semibold tracking-tight md:text-[2rem]">
          Welcome back, {firstName}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <CreatorStatusBadge status={profile.status} />
          <Badge variant="outline">
            {CREATOR_TIER_LABELS[profile.tier]} tier
          </Badge>
        </div>
      </header>

      {accessLevel === 'suspended' ? (
        <PortalCard className="border-danger/30 bg-danger/5">
          <div className="flex gap-3">
            <ShieldAlert
              className="text-danger mt-0.5 size-5 shrink-0"
              aria-hidden="true"
            />
            <div>
              <h2 className="text-foreground font-semibold">
                Your account is suspended
              </h2>
              <p className="text-small text-muted-foreground mt-1">
                Your referral code and earnings history are preserved, but new
                referrals won&apos;t earn commission while suspended. Contact
                support if you think this is a mistake.
              </p>
            </div>
          </div>
        </PortalCard>
      ) : null}

      {accessLevel === 'limited' && profile.status === 'pending' ? (
        <PortalCard className="border-warning/30 bg-warning/5">
          <div className="flex gap-3">
            <Clock
              className="text-warning mt-0.5 size-5 shrink-0"
              aria-hidden="true"
            />
            <div>
              <h2 className="text-foreground font-semibold">
                Your profile is under review
              </h2>
              <p className="text-small text-muted-foreground mt-1">
                You&apos;ll be able to start sharing your referral code as soon
                as an admin approves your account. We usually review within a
                working day.
              </p>
            </div>
          </div>
        </PortalCard>
      ) : null}

      <PortalSection id="performance" title="Your performance">
        <div className="grid grid-cols-2 gap-3 md:gap-4">
          <StatTile
            label="Available balance"
            value={`KES ${profile.availableCashKes.toLocaleString()}`}
            emphasis="strong"
            hint="Ready to withdraw"
          />
          <StatTile
            label="Total clicks"
            value={profile.totalClicks.toLocaleString()}
            hint={`${profile.totalConversions.toLocaleString()} converted`}
          />
        </div>
      </PortalSection>

      <PortalSection
        id="referral-code"
        title="Your referral code"
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href="/creator/referrals">
              Manage links
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        }
      >
        <PortalCard>
          <div className="flex flex-wrap items-center gap-3">
            <Link2
              className="text-primary size-5 shrink-0"
              aria-hidden="true"
            />
            <code className="text-foreground text-[1.25rem] font-semibold tracking-wider">
              {profile.referralCode}
            </code>
          </div>
          <p className="text-small text-muted-foreground mt-3">
            Share a link built from this code and you earn commission on every
            order it brings in.
          </p>
        </PortalCard>
      </PortalSection>

      <PortalSection id="about-you" title="About you">
        <PortalCard>
          <dl className="grid gap-5 sm:grid-cols-2">
            <div>
              <dt className="text-caption text-muted-foreground font-medium tracking-wide uppercase">
                Niche
              </dt>
              <dd className="text-foreground mt-1.5">{profile.niche || '—'}</dd>
            </div>
            <div>
              <dt className="text-caption text-muted-foreground font-medium tracking-wide uppercase">
                Followers
              </dt>
              <dd className="text-foreground mt-1.5">
                {profile.followersRange || '—'}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-caption text-muted-foreground font-medium tracking-wide uppercase">
                Bio
              </dt>
              <dd className="text-foreground mt-1.5">{profile.bio || '—'}</dd>
            </div>
          </dl>
        </PortalCard>
      </PortalSection>
    </div>
  );
}
