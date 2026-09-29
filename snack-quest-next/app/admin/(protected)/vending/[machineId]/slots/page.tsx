import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/permissions';
import { machineService } from '@/services/machineService';
import { machineSlotService } from '@/services/machineSlotService';
import { machineRepository } from '@/repositories/machineRepository';
import { listProductOptions } from '@/lib/vending/productOptions';
import { Card, CardContent } from '@/components/ui/card';
import { SlotEditor } from '@/components/admin/vending/SlotEditor';

export const metadata: Metadata = { title: 'Slots' };

/** A machine's slots: what each sells, at what price, how full it is and how its recent vends went. Read by anyone who can see machines; changed by slot setup (prices by pricing). */
export default async function MachineSlotsPage({ params }: { params: Promise<{ machineId: string }> }) {
  const session = await requireStaffSession();
  const { machineId } = await params;
  const machine = await machineService.findById(session.businessId, machineId);
  if (!machine) notFound();
  const [slots, health, products, machines] = await Promise.all([
    machineSlotService.listByMachine(session.businessId, machineId),
    machineSlotService.slotHealth(session.businessId, machineId),
    listProductOptions(session.businessId),
    machineRepository.listAllForBusiness(session.businessId),
  ]);
  const paused = slots.filter((slot) => slot.quarantine).length;

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div>
        <Link href={`/admin/vending/${machineId}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          {machine.machineCode}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">Slots</h1>
        <p className="text-sm text-muted-foreground">
          {slots.length} slot{slots.length === 1 ? '' : 's'}
          {paused > 0 ? ` · ${paused} paused after a bad vend` : ''}. Stock only changes through restocks, sales and stock adjustments.
        </p>
        {hasPermission(session, 'machine_inventory.export') ? (
          <a href={`/api/vending/machines/${machineId}/stock-movements/export`} className="mt-1 inline-block text-sm text-primary hover:underline">
            Download stock movements (last 30 days)
          </a>
        ) : null}
      </div>
      <Card>
        <CardContent className="p-4 sm:p-6">
          <SlotEditor
            machineId={machineId}
            slots={slots.map((slot) => ({
              slotCode: slot.slotCode,
              productCatalogue: slot.productCatalogue,
              productId: slot.productId,
              priceKes: slot.priceKes,
              capacity: slot.capacity,
              currentQuantity: slot.currentQuantity,
              enabled: slot.enabled,
              position: slot.position,
              manufacturerSlotId: slot.manufacturerSlotId ?? null,
              quarantine: slot.quarantine
                ? { reason: slot.quarantine.reason, transactionId: slot.quarantine.transactionId, since: slot.quarantine.since ? (slot.quarantine.since as unknown as { toDate(): Date }).toDate().toISOString() : null }
                : null,
            }))}
            products={products}
            health={Object.fromEntries(health.map((entry) => [entry.slotCode, entry.recent]))}
            otherMachines={machines.filter(({ id, data }) => id !== machineId && data.status !== 'decommissioned').map(({ id, data }) => ({ id, code: data.machineCode })).sort((a, b) => a.code.localeCompare(b.code))}
            canConfigure={hasPermission(session, 'machines.slots.configure')}
            canPrice={hasPermission(session, 'pricing.manage')}
            canToggle={hasPermission(session, 'machines.slots.toggle')}
          />
        </CardContent>
      </Card>
    </div>
  );
}
