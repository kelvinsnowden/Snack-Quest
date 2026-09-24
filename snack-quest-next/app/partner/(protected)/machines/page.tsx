import type { Metadata } from 'next';
import { requirePartnerSession } from '@/lib/auth/partnerSession';
import { ownerPortalService } from '@/services/ownerPortalService';
import { MachineListFilter } from '@/components/partner/MachineListFilter';

export const metadata: Metadata = { title: 'My Machines' };

/** § MY MACHINES. Reuses `getDashboard`'s own machine cards — the same fleet the Dashboard page's "Your Machines" section shows, just the full list with client-side search. */
export default async function PartnerMachinesPage() {
  const session = await requirePartnerSession();
  const dashboard = await ownerPortalService.getDashboard(session.businessId, session.partnerId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Machines</h1>
        <p className="text-sm text-muted-foreground">
          {dashboard.machines.length} machine{dashboard.machines.length === 1 ? '' : 's'} in your fleet.
        </p>
      </div>
      <MachineListFilter machines={dashboard.machines} />
    </div>
  );
}
