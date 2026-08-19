import type { Metadata } from 'next';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { creatorAdminService } from '@/services/creatorAdminService';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyCreatorsState } from '@/components/admin/EmptyCreatorsState';
import { CreatorStatusBadge } from '@/components/admin/CreatorStatusBadge';
import { CreatorStatusActions } from '@/components/admin/CreatorStatusActions';
import { CREATOR_STATUS_LABELS } from '@/lib/creators/transitions';
import { FOLLOWER_RANGES } from '@/lib/creators/followerRanges';
import { formatKes } from '@/lib/orders/format';
import type { CreatorStatus } from '@/types';

export const metadata: Metadata = { title: 'Creators' };

const STATUS_FILTERS: CreatorStatus[] = ['pending', 'active', 'suspended'];

/** Builds `/admin/creators` links that carry forward whichever filters are active, so switching status (or paging) never silently drops a search or follower-range filter. */
function creatorsHref(filters: {
  status?: CreatorStatus;
  q?: string;
  followersRange?: string;
  cursor?: string;
}): string {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.q) params.set('q', filters.q);
  if (filters.followersRange) params.set('followersRange', filters.followersRange);
  if (filters.cursor) params.set('cursor', filters.cursor);
  const qs = params.toString();
  return qs ? `/admin/creators?${qs}` : '/admin/creators';
}

export default async function AdminCreatorsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; followersRange?: string; cursor?: string }>;
}) {
  const session = await requireStaffSession();
  const { status, q, followersRange, cursor } = await searchParams;
  const validStatus = STATUS_FILTERS.includes(status as CreatorStatus) ? (status as CreatorStatus) : undefined;
  const validFollowersRange = FOLLOWER_RANGES.includes(followersRange as (typeof FOLLOWER_RANGES)[number])
    ? followersRange
    : undefined;
  const isSearching = Boolean(q?.trim());

  const { creators, nextCursor } = await creatorAdminService.listCreators(session.businessId, {
    status: validStatus,
    followersRange: validFollowersRange,
    q,
    cursor,
  });

  const hasAnyFilter = Boolean(validStatus || validFollowersRange || isSearching);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Creators</h1>
        <p className="hidden sm:block mt-1 text-sm text-muted-foreground">
          Review signups, approve new creators, and search your creator pool by niche or follower range.
        </p>
      </div>

      <Card className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap gap-2">
          <Link
            href={creatorsHref({ q, followersRange: validFollowersRange })}
            className={`inline-flex min-h-10 items-center rounded-full px-3.5 text-sm font-medium transition-colors ${
              !validStatus ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-border/40'
            }`}
          >
            All
          </Link>
          {STATUS_FILTERS.map((value) => (
            <Link
              key={value}
              href={creatorsHref({ status: value, q, followersRange: validFollowersRange })}
              className={`inline-flex min-h-10 items-center rounded-full px-3.5 text-sm font-medium transition-colors ${
                validStatus === value ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-border/40'
              }`}
            >
              {CREATOR_STATUS_LABELS[value]}
            </Link>
          ))}
        </div>

        <form className="flex flex-wrap items-end gap-3 border-t border-border pt-4" action="/admin/creators">
          {validStatus ? <input type="hidden" name="status" value={validStatus} /> : null}
          <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
            <label htmlFor="q" className="text-caption font-medium text-muted-foreground">
              Search by name or niche
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input id="q" name="q" defaultValue={q ?? ''} placeholder="e.g. Wanjiru, or “food”" className="pl-9" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="followersRange" className="text-caption font-medium text-muted-foreground">
              Follower range
            </label>
            <select
              id="followersRange"
              name="followersRange"
              defaultValue={validFollowersRange ?? ''}
              className="border-input bg-background h-9 rounded-md border px-3 text-sm text-foreground"
            >
              <option value="">Any</option>
              {FOLLOWER_RANGES.map((range) => (
                <option key={range} value={range}>
                  {range}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit">Search</Button>
          {hasAnyFilter ? (
            <Button asChild variant="ghost">
              <Link href="/admin/creators">Clear</Link>
            </Button>
          ) : null}
        </form>

        {isSearching ? (
          <p className="text-caption text-muted-foreground">
            Searching your most recent creators — results beyond the newest 500 won&apos;t show yet.
          </p>
        ) : null}
      </Card>

      {creators.length === 0 ? (
        <EmptyCreatorsState hasFilter={hasAnyFilter} />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead className="border-b border-border bg-border/20 text-left text-caption text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Creator</th>
                  <th className="px-4 py-3 font-medium">Niche</th>
                  <th className="px-4 py-3 font-medium">Followers</th>
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
                    <td className="px-4 py-3 text-foreground">{profile.niche || '—'}</td>
                    <td className="px-4 py-3 text-foreground">{profile.followersRange || '—'}</td>
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
            <Link href={creatorsHref({ status: validStatus, q, followersRange: validFollowersRange, cursor: nextCursor })}>
              Load more
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
