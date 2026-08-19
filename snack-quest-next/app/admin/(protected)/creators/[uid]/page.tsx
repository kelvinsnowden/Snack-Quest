import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Mail } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { creatorAdminService, CreatorNotFoundError } from '@/services/creatorAdminService';
import { notificationService } from '@/services/notificationService';
import { templateEventLabel } from '@/lib/notifications/templateLabels';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CreatorStatusBadge } from '@/components/admin/CreatorStatusBadge';
import { CreatorStatusActions } from '@/components/admin/CreatorStatusActions';
import { formatKes } from '@/lib/orders/format';
import type { OutboundMessageStatus } from '@/types';

export const metadata: Metadata = { title: 'Creator detail' };

const MESSAGE_STATUS_VARIANT: Record<OutboundMessageStatus, 'success' | 'danger' | 'outline'> = {
  sent: 'success',
  delivered: 'success',
  failed: 'danger',
  bounced: 'danger',
  queued: 'outline',
};

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

function formatDateTime(value: string | null): string {
  return value ? new Date(value).toLocaleString() : '—';
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

  const { profile, user, registeredAt, lastSignInAt } = creator;

  const recipientRefs = [user?.email, user?.phoneNumber].filter((ref): ref is string => Boolean(ref));
  const { messages } = recipientRefs.length > 0
    ? await notificationService.listMessagesForRecipient(session.businessId, recipientRefs)
    : { messages: [] };

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
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">{user?.displayName ?? 'Unknown creator'}</h1>
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
            <DetailRow label="Registered" value={formatDateTime(registeredAt)} />
            <DetailRow label="Last login" value={formatDateTime(lastSignInAt)} />
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

      <Card>
        <CardHeader>
          <CardTitle>Notifications sent</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <Mail className="size-6 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                {recipientRefs.length === 0
                  ? 'No email or phone on file for this creator, so nothing could ever have been sent to them.'
                  : 'Nothing sent to this creator yet.'}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {messages.map(({ id, data }) => (
                <li key={id} className="flex flex-col gap-1 px-6 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">{templateEventLabel(data.templateCode)}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="uppercase">
                        {data.channel}
                      </Badge>
                      <Badge variant={MESSAGE_STATUS_VARIANT[data.status]}>{data.status}</Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {data.createdAt?.toDate ? data.createdAt.toDate().toLocaleString() : '—'}
                    {data.failureReason ? ` · ${data.failureReason}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
