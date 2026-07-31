import type { Metadata } from 'next';
import { MousePointerClick, ShoppingBag, Wallet } from 'lucide-react';
import { requireCreatorSession } from '@/lib/auth/creatorSession';
import { creatorDashboardService } from '@/services/creatorDashboardService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CreatorStatusBadge } from '@/components/admin/CreatorStatusBadge';
import type { CreatorTier } from '@/types';

export const metadata: Metadata = { title: 'Home' };

const TIER_LABELS: Record<CreatorTier, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
};

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

export default async function CreatorHomePage() {
  const session = await requireCreatorSession();
  const { profile, accessLevel } = await creatorDashboardService.getDashboard(session.uid);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-page-title font-bold tracking-tight text-foreground">
          Welcome back, {session.displayName.split(' ')[0]}
        </h1>
        <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
          <CreatorStatusBadge status={profile.status} />
          <Badge variant="outline">{TIER_LABELS[profile.tier]} tier</Badge>
        </p>
      </div>

      {accessLevel === 'suspended' ? (
        <Card>
          <CardContent className="p-6 text-sm text-danger">
            Your creator account is suspended. Contact support if you think this is a mistake — your
            referral code and earnings history are preserved, but new referrals won&apos;t earn commission
            while suspended.
          </CardContent>
        </Card>
      ) : null}

      {accessLevel === 'limited' && profile.status === 'pending' ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Your profile is under review. You&apos;ll be able to start sharing your referral code as soon
            as an admin approves your account.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Referral code" value={profile.referralCode} icon={ShoppingBag} />
        <StatCard label="Total clicks" value={profile.totalClicks.toLocaleString()} icon={MousePointerClick} />
        <StatCard
          label="Available balance"
          value={`KES ${profile.availableCashKes.toLocaleString()}`}
          icon={Wallet}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>About you</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 pt-0 sm:grid-cols-2">
          <div>
            <p className="text-caption font-medium tracking-wide text-muted-foreground uppercase">Niche</p>
            <p className="mt-1 text-sm text-foreground">{profile.niche || '—'}</p>
          </div>
          <div>
            <p className="text-caption font-medium tracking-wide text-muted-foreground uppercase">Followers</p>
            <p className="mt-1 text-sm text-foreground">{profile.followersRange || '—'}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-caption font-medium tracking-wide text-muted-foreground uppercase">Bio</p>
            <p className="mt-1 text-sm text-foreground">{profile.bio || '—'}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>More is on the way</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 text-sm text-muted-foreground">
          Campaign browsing, named referral links with click/conversion tracking, commission and earnings
          statements, and withdrawals land here next, each with real data the moment it&apos;s ready.
        </CardContent>
      </Card>
    </div>
  );
}
