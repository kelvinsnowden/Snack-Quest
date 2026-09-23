import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { machineService } from '@/services/machineService';
import { machineSlotService } from '@/services/machineSlotService';
import { machineTransactionRepository } from '@/repositories/machineTransactionRepository';
import { machineTelemetryEventRepository } from '@/repositories/machineTelemetryEventRepository';
import { deriveConnectivityStatus } from '@/lib/vending/connectivity';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MachineStatusBadge } from '@/components/admin/MachineStatusBadge';
import { MachineConnectivityBadge } from '@/components/admin/MachineConnectivityBadge';
import { MachineTransactionStatusBadge } from '@/components/admin/MachineTransactionStatusBadge';
import { formatDateTime } from '@/lib/orders/format';

export const metadata: Metadata = { title: 'Machine detail' };

/**
 * One machine's own command-center page — deliberately the "Overview
 * / Slots / Transactions / Telemetry" slice of the fuller sketch in
 * the brief (§27), not the whole thing. Faults, commands, financials
 * and configuration all need capabilities (an alert engine, a
 * command model, machine-level economics) this codebase doesn't have
 * yet — see docs/VENDING_OS_BENCHMARK.md §0's own gap analysis for
 * exactly why those are NEXT/SCALE, not missing by oversight.
 */
export default async function AdminMachineDetailPage({ params }: { params: Promise<{ machineId: string }> }) {
  const session = await requireStaffSession();
  const { machineId } = await params;

  const machine = await machineService.findById(session.businessId, machineId);
  if (!machine) {
    notFound();
  }

  const [slots, transactionPage, telemetryEvents] = await Promise.all([
    machineSlotService.listByMachine(session.businessId, machineId),
    machineTransactionRepository.listByBusiness(session.businessId, { machineId, limit: 20 }),
    machineTelemetryEventRepository.listByMachine(session.businessId, machineId, { limit: 15 }),
  ]);

  const connectivityStatus = deriveConnectivityStatus(machine.lastSeenAt);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <Link href="/admin/vending" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to Vending Machines
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{machine.machineCode}</h1>
          <p className="text-sm text-muted-foreground">
            {machine.model} · {machine.manufacturer} · Serial {machine.serialNumber}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MachineStatusBadge status={machine.status} />
          <MachineConnectivityBadge status={connectivityStatus} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <DetailStat label="Last heartbeat" value={machine.lastSeenAt ? formatDateTime(machine.lastSeenAt) : 'Never'} />
        <DetailStat label="Location" value={machine.venueName ?? '—'} />
        <DetailStat label="Firmware" value={machine.firmwareVersion ?? '—'} />
        <DetailStat label="Owner partner" value={machine.ownerPartnerId ?? 'Snack Quest'} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Slots</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {slots.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No slots configured yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-6 py-3 font-medium">Slot</th>
                    <th className="px-6 py-3 font-medium">Product</th>
                    <th className="px-6 py-3 font-medium">Price</th>
                    <th className="px-6 py-3 font-medium">Stock</th>
                    <th className="px-6 py-3 font-medium">Enabled</th>
                  </tr>
                </thead>
                <tbody>
                  {slots.map((slot) => (
                    <tr key={slot.slotCode} className="border-b border-border last:border-0">
                      <td className="px-6 py-3 font-medium text-foreground">{slot.slotCode}</td>
                      <td className="px-6 py-3 text-muted-foreground">{slot.productId ?? '—'}</td>
                      <td className="px-6 py-3 text-muted-foreground">KES {slot.priceKes.toLocaleString('en-KE')}</td>
                      <td className="px-6 py-3 text-muted-foreground">
                        {slot.currentQuantity} / {slot.capacity}
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">{slot.enabled ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent transactions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {transactionPage.transactions.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No transactions yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-6 py-3 font-medium">Reference</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Amount</th>
                    <th className="px-6 py-3 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {transactionPage.transactions.map(({ id, data }) => (
                    <tr key={id} className="border-b border-border last:border-0">
                      <td className="px-6 py-3 font-medium text-foreground">{data.transactionRef}</td>
                      <td className="px-6 py-3">
                        <MachineTransactionStatusBadge status={data.status} />
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">KES {data.amountKes.toLocaleString('en-KE')}</td>
                      <td className="px-6 py-3 text-muted-foreground">{formatDateTime(data.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent telemetry</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {telemetryEvents.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No telemetry received yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-6 py-3 font-medium">Event</th>
                    <th className="px-6 py-3 font-medium">Received</th>
                    <th className="px-6 py-3 font-medium">Processed</th>
                  </tr>
                </thead>
                <tbody>
                  {telemetryEvents.map(({ id, data }) => (
                    <tr key={id} className="border-b border-border last:border-0">
                      <td className="px-6 py-3 font-medium text-foreground">{data.eventType}</td>
                      <td className="px-6 py-3 text-muted-foreground">{formatDateTime(data.receivedAt)}</td>
                      <td className="px-6 py-3 text-muted-foreground">{data.processed ? 'Yes' : data.processingError ?? 'Pending'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-caption text-muted-foreground font-medium tracking-wide uppercase">{label}</p>
        <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}
