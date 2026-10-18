import type { Metadata } from 'next';
import { requirePartnerSession } from '@/lib/auth/partnerSession';
import { ownerPortalService } from '@/services/ownerPortalService';
import { MachineListFilter } from '@/components/partner/MachineListFilter';

export const metadata: Metadata = { title: 'My Machines' };

/** § MY MACHINES. Reuses the overview's machine cards (`getMachineCards`) — the same fleet the Dashboard page's "Your Machines" section shows, just the full list with client-side search. */
export default async function PartnerMachinesPage() {
  const session = await requirePartnerSession();
  const machines = await ownerPortalService.getMachineCards(session.businessId, session.partnerId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Machines</h1>
        <p className="text-sm text-muted-foreground">
          {machines.length} machine{machines.length === 1 ? '' : 's'} in your fleet.
        </p>
      </div>
      <MachineListFilter machines={machines} />
    </div>
  );
}
