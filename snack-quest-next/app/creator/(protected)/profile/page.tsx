import type { Metadata } from 'next';
import { requireCreatorSession } from '@/lib/auth/creatorSession';
import { creatorDashboardService } from '@/services/creatorDashboardService';
import { Card, CardContent } from '@/components/ui/card';
import { ProfileForm } from '@/components/creator/ProfileForm';

export const metadata: Metadata = { title: 'Profile' };

export default async function CreatorProfilePage() {
  const session = await requireCreatorSession();
  const { profile } = await creatorDashboardService.getDashboard(session.uid);

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div>
        <h1 className="text-page-title font-bold tracking-tight text-foreground">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">Keep your details current — brands see this when reviewing campaigns.</p>
      </div>

      <Card>
        <CardContent className="pt-6">
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
        </CardContent>
      </Card>
    </div>
  );
}
