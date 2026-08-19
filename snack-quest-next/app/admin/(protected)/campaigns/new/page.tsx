import type { Metadata } from 'next';
import { requireStaffSession } from '@/lib/auth/session';
import { CampaignForm } from '@/components/admin/CampaignForm';

export const metadata: Metadata = { title: 'New campaign' };

export default async function NewAdminCampaignPage() {
  await requireStaffSession();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">New campaign</h1>
        <p className="hidden sm:block mt-1 text-sm text-muted-foreground">
          Creators see this once it&apos;s active and its deadline hasn&apos;t passed.
        </p>
      </div>
      <CampaignForm mode="create" />
    </div>
  );
}
