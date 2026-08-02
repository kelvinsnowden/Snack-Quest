import type { Metadata } from 'next';
import { MousePointerClick, Target, Trophy } from 'lucide-react';
import { requireCreatorSession } from '@/lib/auth/creatorSession';
import { creatorDashboardService } from '@/services/creatorDashboardService';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CREATOR_TIER_LABELS } from '@/lib/creators/tier';
import { formatKes } from '@/lib/orders/format';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Leaderboard' };

interface StatCardProps {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}

function StatCard({ label, value, icon: Icon }: StatCardProps) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4 p-6">
        <div>
          <p className="text-caption font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">{value}</p>
        </div>
        <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="size-5" />
        </div>
      </CardContent>
    </Card>
  );
}

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

  const clickThroughRate = profile.totalClicks > 0 ? (profile.totalConversions / profile.totalClicks) * 100 : null;
  const averageCommission = profile.totalConversions > 0 ? profile.lifetimeEarningsKes / profile.totalConversions : null;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-page-title font-bold tracking-tight text-foreground">Leaderboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your performance and how you rank among active creators.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Click-through rate"
          value={clickThroughRate === null ? '—' : `${clickThroughRate.toFixed(1)}%`}
          icon={Target}
        />
        <StatCard
          label="Avg. commission / order"
          value={averageCommission === null ? '—' : formatKes(Math.round(averageCommission))}
          icon={MousePointerClick}
        />
        <StatCard
          label="Your rank"
          value={leaderboard.myRank === null ? 'Not ranked' : `#${leaderboard.myRank} of ${leaderboard.totalActiveCreators}`}
          icon={Trophy}
        />
      </div>

      {leaderboard.myRank === null ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Rankings only include active creators. Once an admin approves your account, you&apos;ll appear here.
          </CardContent>
        </Card>
      ) : null}

      {leaderboard.top.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">No active creators to rank yet.</CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-caption font-medium tracking-wide text-muted-foreground uppercase">
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
                  className={cn('border-b border-border last:border-0', entry.uid === session.uid && 'bg-primary/5')}
                >
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">#{index + 1}</td>
                  <td className="px-4 py-3 font-medium text-foreground">
                    {entry.displayName}
                    {entry.uid === session.uid ? <span className="ml-2 text-xs text-primary">(you)</span> : null}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">{CREATOR_TIER_LABELS[entry.tier]}</Badge>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-foreground">{entry.totalConversions.toLocaleString()}</td>
                  <td className="px-4 py-3 font-medium tabular-nums text-foreground">{formatKes(entry.lifetimeEarningsKes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
