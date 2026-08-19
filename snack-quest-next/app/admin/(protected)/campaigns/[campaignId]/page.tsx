import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireStaffSession } from '@/lib/auth/session';
import { campaignRepository } from '@/repositories/campaignRepository';
import { campaignService } from '@/services/campaignService';
import { userRepository } from '@/repositories/userRepository';
import { CampaignForm } from '@/components/admin/CampaignForm';
import { CampaignSubmissionsList } from '@/components/admin/CampaignSubmissionsList';

export const metadata: Metadata = { title: 'Edit campaign' };

export default async function EditAdminCampaignPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const session = await requireStaffSession();
  const { campaignId } = await params;

  const campaign = await campaignRepository.findById(session.businessId, campaignId);
  if (!campaign) {
    notFound();
  }

  const submissions = await campaignService.listSubmissionsForCampaign(session.businessId, campaignId);
  const creators = await Promise.all(
    [...new Set(submissions.map((s) => s.data.creatorId))].map(async (creatorId) => ({
      creatorId,
      user: await userRepository.findById(creatorId),
    })),
  );
  const creatorById = new Map(creators.map(({ creatorId, user }) => [creatorId, user]));

  return (
    <div className="flex max-w-2xl flex-col gap-10">
      <div>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Edit campaign</h1>
          <p className="hidden sm:block mt-1 text-sm text-muted-foreground">Changes are visible to creators immediately.</p>
        </div>
        <div className="mt-6">
          <CampaignForm
            mode="edit"
            campaignId={campaignId}
            initialValues={{
              title: campaign.title,
              status: campaign.status,
              commissionRateKes: campaign.commissionRateKes,
              rules: campaign.rules,
              targetNiche: campaign.targetNiche,
              deadline: campaign.deadline.toDate().toISOString().slice(0, 10),
              assetsUrl: campaign.assetsUrl,
              imageUrls: campaign.imageUrls ?? [],
              documentUrl: campaign.documentUrl ?? null,
              referenceLink: campaign.referenceLink ?? null,
            }}
          />
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Submissions</h2>
        <p className="mt-1 text-sm text-muted-foreground">Everything creators have sent in for this campaign.</p>
        <div className="mt-4">
          <CampaignSubmissionsList
            submissions={submissions.map(({ id, data }) => ({
              id,
              data,
              creator: creatorById.get(data.creatorId) ?? null,
            }))}
          />
        </div>
      </div>
    </div>
  );
}
