import type { Metadata } from 'next';
import { requireStaffSession } from '@/lib/auth/session';
import { featureFlagService } from '@/services/featureFlagService';
import { FeatureFlagList } from '@/components/admin/FeatureFlagList';

export const metadata: Metadata = { title: 'Feature flags' };

export default async function AdminFeatureFlagsPage() {
  const session = await requireStaffSession();
  const flags = await featureFlagService.listFlags(session.businessId);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Feature flags</h1>
        <p className="hidden sm:block mt-1 text-sm text-muted-foreground">
          Turn platform features on or off for this business — takes effect immediately, no redeploy needed.
        </p>
      </div>

      <FeatureFlagList flags={flags} />
    </div>
  );
}
