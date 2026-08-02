import type { Metadata } from 'next';
import { requireCreatorSession } from '@/lib/auth/creatorSession';
import { creatorDashboardService } from '@/services/creatorDashboardService';
import { ProfileForm } from '@/components/creator/ProfileForm';
import { PortalPageHeader } from '@/components/creator/design/PortalPageHeader';
import { PortalCard } from '@/components/creator/design/PortalCard';

export const metadata: Metadata = { title: 'Profile' };

export default async function CreatorProfilePage() {
  const session = await requireCreatorSession();
  const { profile } = await creatorDashboardService.getDashboard(session.uid);

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <PortalPageHeader
        title="Profile"
        description="Keep your details current — brands see this when reviewing campaigns."
      />

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
