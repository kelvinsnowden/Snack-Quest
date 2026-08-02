import type { Metadata } from 'next';
import { requireCreatorSession } from '@/lib/auth/creatorSession';
import { creatorDashboardService } from '@/services/creatorDashboardService';
import { Badge } from '@/components/ui/badge';
import { CREATOR_TIER_LABELS } from '@/lib/creators/tier';
import { formatKes } from '@/lib/orders/format';
import { cn } from '@/lib/utils';
import { PortalPageHeader } from '@/components/creator/design/PortalPageHeader';
import { PortalCard } from '@/components/creator/design/PortalCard';
import { StatTile } from '@/components/creator/design/StatTile';

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
        <div className="border-border bg-surface overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border text-caption text-muted-foreground border-b text-left font-medium tracking-wide uppercase">
                <th className="px-4 py-3">Rank</th>
                <th className="px-4 py-3">Creator</th>
                <th className="px-4 py-3">Tier</th>
                <th className="px-4 py-3">Conversions</th>
                <th className="px-4 py-3">Lifetime earned</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.top.map((entry, index) => (
                <tr
                  key={entry.uid}
                  className={cn(
                    'border-border border-b last:border-0',
                    entry.uid === session.uid && 'bg-primary/5',
                  )}
                >
                  <td className="text-muted-foreground px-4 py-3 tabular-nums">
                    #{index + 1}
                  </td>
                  <td className="text-foreground px-4 py-3 font-medium">
                    {entry.displayName}
                    {entry.uid === session.uid ? (
                      <span className="text-primary ml-2 text-xs">(you)</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">
                      {CREATOR_TIER_LABELS[entry.tier]}
                    </Badge>
                  </td>
                  <td className="text-foreground px-4 py-3 tabular-nums">
                    {entry.totalConversions.toLocaleString()}
                  </td>
                  <td className="text-foreground px-4 py-3 font-medium tabular-nums">
                    {formatKes(entry.lifetimeEarningsKes)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
