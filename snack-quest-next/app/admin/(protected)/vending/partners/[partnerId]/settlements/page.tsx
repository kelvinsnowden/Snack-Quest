import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireAdminPage } from '@/lib/auth/requireAdminSection';
import { hasPermission } from '@/lib/auth/permissions';
import { partnerService } from '@/services/partnerService';
import { machineSettlementService } from '@/services/machineSettlementService';
import { machineRepository } from '@/repositories/machineRepository';
import { toWorkbenchSettlement } from '@/lib/vending/serializeSettlementForWorkbench';
import { Card, CardContent } from '@/components/ui/card';
import { SettlementWorkbench } from '@/components/admin/vending/SettlementWorkbench';

export const metadata: Metadata = { title: 'Owner settlements' };

export default async function OwnerSettlementsPage({ params }: { params: Promise<{ partnerId: string }> }) {
  const session = await requireAdminPage('vending', 'owner_finance.view');
  const { partnerId } = await params;
  const partner = await partnerService.findById(session.businessId, partnerId);
  if (!partner) notFound();
  const [owned, settlements, allMachines] = await Promise.all([
    partnerService.listMachines(session.businessId, partnerId),
    machineSettlementService.listByPartner(session.businessId, partnerId),
    machineRepository.listAllForBusiness(session.businessId),
  ]);
  // Settlements can name a machine this owner no longer has; keep its code.
  const codes = new Map(allMachines.map(({ id, data }) => [id, data.machineCode]));

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div>
        <Link href={`/admin/vending/partners/${partnerId}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          {partner.name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">Settlements for {partner.name}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">Balance now: KES {partner.availableCashKes.toLocaleString('en-KE')}. Finalizing a settlement adds its amount to this balance; the owner then withdraws from it.</p>
      </div>
      <Card>
        <CardContent className="p-4 sm:p-6">
          <SettlementWorkbench
            partnerId={partnerId}
            machines={owned.map(({ id, data }) => ({ id, code: data.machineCode })).sort((a, b) => a.code.localeCompare(b.code))}
            settlements={settlements.map(({ id, data }) => toWorkbenchSettlement(id, data, codes.get(data.machineId) ?? data.machineId))}
            canManage={hasPermission(session, 'owner_finance.settlements.manage')}
            canFinalize={hasPermission(session, 'owner_finance.settlements.finalize')}
          />
        </CardContent>
      </Card>
    </div>
  );
}
