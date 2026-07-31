import type { Metadata } from 'next';
import Link from 'next/link';
import { requireStaffSession } from '@/lib/auth/session';
import { creatorAdminService } from '@/services/creatorAdminService';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyCreatorsState } from '@/components/admin/EmptyCreatorsState';
import { CreatorStatusBadge } from '@/components/admin/CreatorStatusBadge';
import { CreatorStatusActions } from '@/components/admin/CreatorStatusActions';
import { CREATOR_STATUS_LABELS } from '@/lib/creators/transitions';
import { formatKes } from '@/lib/orders/format';
import type { CreatorStatus } from '@/types';

export const metadata: Metadata = { title: 'Creators' };

const STATUS_FILTERS: CreatorStatus[] = ['pending', 'active', 'suspended'];

export default async function AdminCreatorsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; cursor?: string }>;
}) {
  const session = await requireStaffSession();
  const { status, cursor } = await searchParams;
  const validStatus = STATUS_FILTERS.includes(status as CreatorStatus) ? (status as CreatorStatus) : undefined;

  const { creators, nextCursor } = await creatorAdminService.listCreators(session.businessId, {
    status: validStatus,
    cursor,
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-page-title font-bold tracking-tight text-foreground">Creators</h1>
        <p className="mt-1 text-sm text-muted-foreground">Review signups, approve new creators, and monitor earnings.</p>
      </div>

      <Card className="flex flex-wrap gap-2 p-4">
        <Link
          href="/admin/creators"
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            !status ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-border/40'
          }`}
        >
          All
        </Link>
        {STATUS_FILTERS.map((value) => (
          <Link
            key={value}
            href={`/admin/creators?status=${value}`}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              status === value ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-border/40'
            }`}
          >
            {CREATOR_STATUS_LABELS[value]}
          </Link>
        ))}
      </Card>

      {creators.length === 0 ? (
        <EmptyCreatorsState hasFilter={Boolean(status)} />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-border bg-border/20 text-left text-caption text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Creator</th>
                  <th className="px-4 py-3 font-medium">Tier</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Available</th>
                  <th className="px-4 py-3 font-medium">Lifetime</th>
                  <th className="px-4 py-3 font-medium">Conversions</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {creators.map(({ uid, profile, user }) => (
                  <tr key={uid} className="border-b border-border last:border-0 hover:bg-border/20">
                    <td className="px-4 py-3">
                      <Link href={`/admin/creators/${uid}`} className="block">
                        <span className="font-medium text-foreground">{user?.displayName ?? 'Unknown'}</span>
                        <span className="block text-caption text-muted-foreground">{user?.email ?? uid}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-foreground capitalize">{profile.tier}</td>
                    <td className="px-4 py-3">
                      <CreatorStatusBadge status={profile.status} />
                    </td>
                    <td className="px-4 py-3 tabular-nums text-foreground">{formatKes(profile.availableCashKes)}</td>
                    <td className="px-4 py-3 tabular-nums text-foreground">{formatKes(profile.lifetimeEarningsKes)}</td>
                    <td className="px-4 py-3 tabular-nums text-foreground">{profile.totalConversions}</td>
                    <td className="px-4 py-3 text-right">
                      <CreatorStatusActions uid={uid} status={profile.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {nextCursor ? (
        <div className="flex justify-center">
          <Button asChild variant="outline">
            <Link href={`/admin/creators?${status ? `status=${status}&` : ''}cursor=${nextCursor}`}>Load more</Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
