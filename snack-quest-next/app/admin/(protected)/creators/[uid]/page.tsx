import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { creatorAdminService, CreatorNotFoundError } from '@/services/creatorAdminService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CreatorStatusBadge } from '@/components/admin/CreatorStatusBadge';
import { CreatorStatusActions } from '@/components/admin/CreatorStatusActions';
import { formatKes } from '@/lib/orders/format';

export const metadata: Metadata = { title: 'Creator detail' };

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

export default async function AdminCreatorDetailPage({
  params,
}: {
  params: Promise<{ uid: string }>;
}) {
  const session = await requireStaffSession();
  const { uid } = await params;

  let creator;
  try {
    creator = await creatorAdminService.getCreator(session.businessId, uid);
  } catch (error) {
    if (error instanceof CreatorNotFoundError) {
      notFound();
    }
    throw error;
  }

  const { profile, user } = creator;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/admin/creators"
            className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Creators
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-page-title font-bold tracking-tight text-foreground">{user?.displayName ?? 'Unknown creator'}</h1>
            <CreatorStatusBadge status={profile.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{user?.email ?? uid}</p>
        </div>
        <CreatorStatusActions uid={uid} status={profile.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Earnings</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            <DetailRow label="Available cash" value={formatKes(profile.availableCashKes)} />
            <DetailRow label="Pending earnings" value={formatKes(profile.pendingEarningsKes)} />
            <DetailRow label="Lifetime earnings" value={formatKes(profile.lifetimeEarningsKes)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Performance</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            <DetailRow label="Total clicks" value={profile.totalClicks} />
            <DetailRow label="Total conversions" value={profile.totalConversions} />
            <DetailRow label="Referral code" value={<span className="tabular-nums">{profile.referralCode}</span>} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            <DetailRow label="Tier" value={<span className="capitalize">{profile.tier}</span>} />
            <DetailRow label="Niche" value={profile.niche || '—'} />
            <DetailRow label="Followers" value={profile.followersRange || '—'} />
            <DetailRow label="Onboarding" value={profile.onboardingCompleted ? 'Completed' : 'Incomplete'} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payout details</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            <DetailRow label="Preference" value={<span className="uppercase">{profile.paymentPreference}</span>} />
            {Object.entries(profile.socialHandles).length === 0 ? (
              <DetailRow label="Social handles" value="—" />
            ) : (
              Object.entries(profile.socialHandles).map(([platform, handle]) => (
                <DetailRow key={platform} label={platform} value={handle} />
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {profile.bio ? (
        <Card>
          <CardHeader>
            <CardTitle>Bio</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground">{profile.bio}</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
