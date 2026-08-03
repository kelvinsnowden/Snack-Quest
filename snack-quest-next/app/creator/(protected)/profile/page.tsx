import type { Metadata } from 'next';
import { requireCreatorSession } from '@/lib/auth/creatorSession';
import { creatorDashboardService } from '@/services/creatorDashboardService';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { CreatorStatusBadge } from '@/components/admin/CreatorStatusBadge';
import { ProfileForm } from '@/components/creator/ProfileForm';
import { PortalPageHeader } from '@/components/creator/design/PortalPageHeader';
import { PortalCard } from '@/components/creator/design/PortalCard';
import { CREATOR_TIER_LABELS } from '@/lib/creators/tier';

export const metadata: Metadata = { title: 'Profile' };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

export default async function CreatorProfilePage() {
  const session = await requireCreatorSession();
  const { profile } = await creatorDashboardService.getDashboard(session.uid);

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <PortalPageHeader
        title="Profile"
        description="Keep your details current — brands see this when reviewing campaigns."
      />

      <PortalCard className="flex flex-col items-center gap-3 text-center">
        <Avatar className="size-16">
          <AvatarFallback className="text-lg">
            {initials(session.displayName)}
          </AvatarFallback>
        </Avatar>
        <div>
          <p className="text-foreground text-lg font-semibold">
            {session.displayName}
          </p>
          <p className="text-muted-foreground text-sm">{session.email}</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <CreatorStatusBadge status={profile.status} />
          <span className="text-caption text-muted-foreground font-medium tracking-wide uppercase">
            {CREATOR_TIER_LABELS[profile.tier]} tier
          </span>
        </div>
      </PortalCard>

      <PortalCard>
        <ProfileForm
          initialValues={{
            bio: profile.bio,
            niche: profile.niche,
            followersRange: profile.followersRange,
            paymentPreference: profile.paymentPreference,
            payoutPhoneNumber: profile.payoutPhoneNumber,
            socialHandles: profile.socialHandles,
          }}
        />
      </PortalCard>
    </div>
  );
}
