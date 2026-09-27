import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, Boxes } from 'lucide-react';
import { requirePartnerSession } from '@/lib/auth/partnerSession';
import { ownerPortalService } from '@/services/ownerPortalService';
import { Card, CardContent } from '@/components/ui/card';
import { StockLevelBar } from '@/components/partner/StockLevelBar';

export const metadata: Metadata = { title: 'Inventory' };

/**
 * § INVENTORY (fleet-wide). A per-slot breakdown already exists on
 * each machine's own Inventory tab (`/partner/machines/[machineId]`) —
 * this is the fleet-level view the sidebar's own "Inventory" item
 * needs, built from the same `stockHealth` figure the Overview page's
 * "Your Machines" list and quick-nav cards already use, just for every
 * machine rather than the top three.
 */
export default async function PartnerInventoryPage() {
  const session = await requirePartnerSession();
  const dashboard = await ownerPortalService.getDashboard(session.businessId, session.partnerId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Inventory</h1>
        <p className="text-sm text-muted-foreground">Stock health across every machine in your fleet.</p>
      </div>

      {dashboard.machines.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No machines yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {dashboard.machines.map((machine) => {
            const percent = machine.stockHealth.assortmentCount > 0 ? (machine.stockHealth.sellableCount / machine.stockHealth.assortmentCount) * 100 : 100;
            return (
              <Link key={machine.machineId} href={`/partner/machines/${machine.machineId}`} className="block">
                <Card className="transition-colors hover:bg-border/10">
                  <CardContent className="flex items-center gap-4 p-4">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-border/30 text-muted-foreground">
                      <Boxes className="size-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1.5 flex items-center justify-between gap-3">
                        <p className="truncate font-semibold text-foreground">{machine.machineCode}</p>
                        <p className="shrink-0 text-xs text-muted-foreground">
                          {machine.stockHealth.sellableCount} / {machine.stockHealth.assortmentCount} sellable
                        </p>
                      </div>
                      <StockLevelBar percent={percent} />
                    </div>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
