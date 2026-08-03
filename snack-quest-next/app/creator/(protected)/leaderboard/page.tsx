import type { Metadata } from 'next';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { requireCreatorSession } from '@/lib/auth/creatorSession';
import { creatorDashboardService } from '@/services/creatorDashboardService';
import { Badge } from '@/components/ui/badge';
import { CREATOR_TIER_LABELS } from '@/lib/creators/tier';
import { formatKes } from '@/lib/orders/format';
import { cn } from '@/lib/utils';
import { PortalPageHeader } from '@/components/creator/design/PortalPageHeader';
import { PortalCard } from '@/components/creator/design/PortalCard';
import { StatTile } from '@/components/creator/design/StatTile';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

/** Top 3 by real rank position get a medal accent — nothing about tier, just where they placed today. */
const RANK_ACCENT: Record<number, string> = {
  1: 'bg-[#F5C518] text-[#4a3800]',
  2: 'bg-[#C6CBD4] text-[#3a3d42]',
  3: 'bg-[#D99A5B] text-[#4a2e12]',
};

export const metadata: Metadata = { title: 'Leaderboard' };

/**
 * A creator's performance metrics + the business leaderboard
 * (§ Creator Portal leaderboards). Click-through rate and average
 * commission are the two real ratios derivable from existing counters
 * (`totalClicks`/`totalConversions`/`lifetimeEarningsKes`) — nothing
 * fabricated. `tier` itself is shown as-is: it's a real schema field,
 * but there's no threshold-based auto-upgrade logic anywhere in this
 * codebase (see `lib/creators/tier.ts`), so this page doesn't imply
 * one exists.
 */
export default async function CreatorLeaderboardPage() {
  const session = await requireCreatorSession();
  const [{ profile }, leaderboard] = await Promise.all([
    creatorDashboardService.getDashboard(session.uid),
    creatorDashboardService.getLeaderboard(session.businessId, session.uid),
  ]);

  const clickThroughRate =
    profile.totalClicks > 0
      ? (profile.totalConversions / profile.totalClicks) * 100
      : null;
  const averageCommission =
    profile.totalConversions > 0
      ? profile.lifetimeEarningsKes / profile.totalConversions
      : null;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <PortalPageHeader
        title="Leaderboard"
        description="Your performance and how you rank among active creators."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4">
        <StatTile
          label="Click-through rate"
          value={
            clickThroughRate === null ? '—' : `${clickThroughRate.toFixed(1)}%`
          }
        />
        <StatTile
          label="Avg. commission / order"
          value={
            averageCommission === null
              ? '—'
              : formatKes(Math.round(averageCommission))
          }
        />
        <StatTile
          label="Your rank"
          value={
            leaderboard.myRank === null
              ? 'Not ranked'
              : `#${leaderboard.myRank} of ${leaderboard.totalActiveCreators}`
          }
        />
      </div>

      {leaderboard.myRank === null ? (
        <PortalCard className="text-muted-foreground text-sm">
          Rankings only include active creators. Once an admin approves your
          account, you&apos;ll appear here.
        </PortalCard>
      ) : null}

      {leaderboard.top.length === 0 ? (
        <PortalCard className="text-muted-foreground text-sm">
          No active creators to rank yet.
        </PortalCard>
      ) : (
        <ul className="border-border divide-border bg-surface divide-y overflow-hidden rounded-lg border">
          {leaderboard.top.map((entry, index) => {
            const rank = index + 1;
            const isYou = entry.uid === session.uid;
            return (
              <li
                key={entry.uid}
                className={cn(
                  'flex items-center gap-3 p-4',
                  isYou && 'bg-primary/5',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums',
                    RANK_ACCENT[rank] ?? 'bg-muted text-muted-foreground',
                  )}
                >
                  {rank}
                </span>
                <Avatar className="size-9 shrink-0">
                  {entry.photoURL ? <AvatarImage src={entry.photoURL} alt="" /> : null}
                  <AvatarFallback>{initials(entry.displayName)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline gap-1.5">
                    <span className="text-foreground truncate font-medium">
                      {entry.displayName}
                    </span>
                    {isYou ? (
                      <span className="text-primary shrink-0 text-xs font-normal">
                        (you)
                      </span>
                    ) : null}
                  </p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <Badge variant="outline">
                      {CREATOR_TIER_LABELS[entry.tier]}
                    </Badge>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {entry.totalConversions.toLocaleString()} conversions
                    </span>
                  </div>
                </div>
                <p className="text-foreground shrink-0 font-semibold tabular-nums">
                  {formatKes(entry.lifetimeEarningsKes)}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
