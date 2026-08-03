import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireStaffSession } from '@/lib/auth/session';
import { campaignRepository } from '@/repositories/campaignRepository';
import { CampaignForm } from '@/components/admin/CampaignForm';

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

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-page-title font-bold tracking-tight text-foreground">Edit campaign</h1>
        <p className="mt-1 text-sm text-muted-foreground">Changes are visible to creators immediately.</p>
      </div>
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
        }}
      />
    </div>
  );
}
