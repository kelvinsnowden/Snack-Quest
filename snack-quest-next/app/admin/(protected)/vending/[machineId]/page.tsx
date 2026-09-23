import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { machineService } from '@/services/machineService';
import { machineSlotService } from '@/services/machineSlotService';
import { machineTransactionRepository } from '@/repositories/machineTransactionRepository';
import { machineTelemetryEventRepository } from '@/repositories/machineTelemetryEventRepository';
import { machineCommandService } from '@/services/machineCommandService';
import { machineAssortmentService } from '@/services/machineAssortmentService';
import { machineInventoryReserveService } from '@/services/machineInventoryReserveService';
import { machineSubscriptionService } from '@/services/machineSubscriptionService';
import { machineSettlementService } from '@/services/machineSettlementService';
import { deriveConnectivityStatus } from '@/lib/vending/connectivity';
import { defaultVendingAdapterResolver, UnsupportedManufacturerError } from '@/lib/vending/adapterRegistry';
import { ProtocolNotConfiguredError } from '@/lib/vending/hardwareAdapter';
import { ALL_HARDWARE_CAPABILITIES, hasCapability } from '@/lib/vending/protocol/capabilities';
import { findProtocolRegistryEntry } from '@/lib/vending/protocol/registry';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MachineStatusBadge } from '@/components/admin/MachineStatusBadge';
import { MachineConnectivityBadge } from '@/components/admin/MachineConnectivityBadge';
import { MachineTransactionStatusBadge } from '@/components/admin/MachineTransactionStatusBadge';
import { MachineCommandStatusBadge } from '@/components/admin/MachineCommandStatusBadge';
import { IssueMachineCommandAction } from '@/components/admin/IssueMachineCommandAction';
import { formatDateTime } from '@/lib/orders/format';

const CAPABILITY_LABELS: Record<string, string> = {
  vend: 'Vend',
  slot_read: 'Slot read',
  inventory_read: 'Inventory read',
  inventory_write: 'Inventory write',
  dispense_confirmation: 'Dispense confirmation',
  heartbeat: 'Heartbeat',
  telemetry: 'Telemetry',
  faults: 'Faults',
  temperature: 'Temperature',
  door_status: 'Door status',
  remote_price_update: 'Remote pricing',
  remote_enable_disable: 'Remote enable/disable',
  remote_restart: 'Remote restart',
  audit_export: 'Audit export',
};

/**
 * A live diagnostic read through the machine's own resolved adapter —
 * never a fake "connected" state (§ E/I of
 * docs/HARDWARE_COMPATIBILITY_ARCHITECTURE.md). An unimplemented
 * manufacturer or an unconfigured protocol surfaces as exactly that,
 * not as a crash and not as a fabricated success.
 */
async function runDiagnostics(manufacturer: string, machineId: string) {
  let adapter;
  try {
    adapter = defaultVendingAdapterResolver(manufacturer as Parameters<typeof defaultVendingAdapterResolver>[0]);
  } catch (error) {
    if (error instanceof UnsupportedManufacturerError) {
      return { registered: false as const, reason: error.message, capabilities: null, live: null };
    }
    throw error;
  }

  // capabilities() never throws — discoverability is unconditional
  // even when nothing is actually wired behind the adapter.
  const capabilities = adapter.capabilities();

  try {
    const [status, slots, faults] = await Promise.all([
      adapter.getMachineStatus(machineId),
      adapter.getSlots(machineId),
      adapter.getFaults(machineId),
    ]);
    return { registered: true as const, capabilities, live: { ok: true as const, status, slotCount: slots.length, faults } };
  } catch (error) {
    if (error instanceof ProtocolNotConfiguredError) {
      return { registered: true as const, capabilities, live: { ok: false as const, reason: error.message } };
    }
    throw error;
  }
}

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

  const [slots, transactionPage, telemetryEvents, diagnostics, commandHistory, assortment, reserveStatus, activeSubscription, settlements] = await Promise.all([
    machineSlotService.listByMachine(session.businessId, machineId),
    machineTransactionRepository.listByBusiness(session.businessId, { machineId, limit: 20 }),
    machineTelemetryEventRepository.listByMachine(session.businessId, machineId, { limit: 15 }),
    runDiagnostics(machine.manufacturer, machineId),
    machineCommandService.listHistoryForMachine(session.businessId, machineId),
    machineAssortmentService.listByMachine(session.businessId, machineId),
    machineInventoryReserveService.getReserveStatus(session.businessId, machineId),
    machineSubscriptionService.findActiveForMachine(session.businessId, machineId),
    machineSettlementService.listByMachine(session.businessId, machineId),
  ]);

  const connectivityStatus = deriveConnectivityStatus(machine.lastSeenAt);
  const registryEntry = findProtocolRegistryEntry(machine.manufacturer);

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
          <CardTitle>Capabilities &amp; integration diagnostics</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {registryEntry ? (
            <p className="text-sm text-muted-foreground">
              Protocol: <span className="font-medium text-foreground">{registryEntry.label}</span> ({registryEntry.status.replace('_', ' ')}) — {registryEntry.notes}
            </p>
          ) : null}

          {!diagnostics.registered ? (
            <p className="text-sm text-warning">Not yet integrated — {diagnostics.reason}</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {ALL_HARDWARE_CAPABILITIES.map((capability) => {
                  const enabled = hasCapability(diagnostics.capabilities, capability);
                  return (
                    <Badge key={capability} variant={enabled ? 'success' : 'outline'}>
                      {enabled ? '✓' : '○'} {CAPABILITY_LABELS[capability] ?? capability}
                    </Badge>
                  );
                })}
              </div>

              {diagnostics.live.ok ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <DetailStat label="Live status" value={diagnostics.live.status.online ? 'Online' : 'Offline'} />
                  <DetailStat label="Slots reported" value={String(diagnostics.live.slotCount)} />
                  <DetailStat label="Active faults" value={String(diagnostics.live.faults.length)} />
                  <DetailStat label="Temperature" value={diagnostics.live.status.temperatureCelsius !== null ? `${diagnostics.live.status.temperatureCelsius}°C` : '—'} />
                </div>
              ) : (
                <p className="text-sm text-warning">Live read unavailable — {diagnostics.live.reason}</p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Remote commands</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {diagnostics.registered && hasCapability(diagnostics.capabilities, 'remote_restart') ? (
            <IssueMachineCommandAction machineId={machineId} />
          ) : (
            <p className="text-sm text-muted-foreground">
              This machine&apos;s adapter does not declare support for remote restart — no command can be issued yet.
            </p>
          )}

          {commandHistory.commands.length === 0 ? (
            <p className="text-sm text-muted-foreground">No commands issued yet.</p>
          ) : (
            <div className="overflow-x-auto border-t border-border pt-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-6 py-3 font-medium">Reference</th>
                    <th className="px-6 py-3 font-medium">Type</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Issued</th>
                    <th className="px-6 py-3 font-medium">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {commandHistory.commands.map(({ id, data }) => (
                    <tr key={id} className="border-b border-border last:border-0">
                      <td className="px-6 py-3 font-medium text-foreground">{data.commandRef}</td>
                      <td className="px-6 py-3 text-muted-foreground">{data.commandType}</td>
                      <td className="px-6 py-3">
                        <MachineCommandStatusBadge status={data.status} />
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">{formatDateTime(data.createdAt)}</td>
                      <td className="px-6 py-3 text-muted-foreground">{data.error ?? '—'}</td>
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
          <CardTitle>Assortment &amp; inventory reserve</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <DetailStat label="Reserve target" value={`KES ${reserveStatus.targetKes.toLocaleString('en-KE')}`} />
            <DetailStat label="Current (cost)" value={`KES ${reserveStatus.currentAtCostKes.toLocaleString('en-KE')}`} />
            <DetailStat label="Current (retail)" value={`KES ${reserveStatus.currentAtRetailKes.toLocaleString('en-KE')}`} />
            <DetailStat
              label="Variance"
              value={`${reserveStatus.varianceKes >= 0 ? '+' : ''}KES ${reserveStatus.varianceKes.toLocaleString('en-KE')}`}
            />
            <DetailStat label="Replenishment needed" value={`KES ${reserveStatus.replenishmentRequiredKes.toLocaleString('en-KE')}`} />
          </div>
          {reserveStatus.unpricedSlotCount > 0 ? (
            <p className="text-sm text-warning">
              {reserveStatus.unpricedSlotCount} stocked slot{reserveStatus.unpricedSlotCount === 1 ? '' : 's'} carry a product with no
              known unit cost — excluded from the cost figure above, not treated as free.
            </p>
          ) : null}

          {assortment.length === 0 ? (
            <p className="text-sm text-muted-foreground">No products assorted to this machine yet.</p>
          ) : (
            <div className="overflow-x-auto border-t border-border pt-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-6 py-3 font-medium">Product</th>
                    <th className="px-6 py-3 font-medium">Slot</th>
                    <th className="px-6 py-3 font-medium">Price override</th>
                    <th className="px-6 py-3 font-medium">Assorted</th>
                    <th className="px-6 py-3 font-medium">Visible</th>
                  </tr>
                </thead>
                <tbody>
                  {assortment.map((row) => (
                    <tr key={`${row.productCatalogue}:${row.productId}`} className="border-b border-border last:border-0">
                      <td className="px-6 py-3 font-medium text-foreground">
                        {row.customerFacingName ?? row.productId} <span className="text-muted-foreground">({row.productCatalogue})</span>
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">{row.slotCode ?? '—'}</td>
                      <td className="px-6 py-3 text-muted-foreground">
                        {row.priceOverrideKes !== null ? `KES ${row.priceOverrideKes.toLocaleString('en-KE')}` : '—'}
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">{row.assorted ? 'Yes' : 'No'}</td>
                      <td className="px-6 py-3 text-muted-foreground">{row.visible ? 'Yes' : 'No'}</td>
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
          <CardTitle>Machine economics: subscription &amp; settlements</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {activeSubscription ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <DetailStat label="Plan" value={activeSubscription.data.planName} />
              <DetailStat
                label="Amount"
                value={`KES ${activeSubscription.data.amountKes.toLocaleString('en-KE')} / ${activeSubscription.data.frequency}`}
              />
              <DetailStat label="Status" value={activeSubscription.data.status.replace('_', ' ')} />
              <DetailStat label="Arrears" value={`KES ${activeSubscription.data.arrearsKes.toLocaleString('en-KE')}`} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No active subscription on this machine.</p>
          )}

          {settlements.length === 0 ? (
            <p className="text-sm text-muted-foreground">No settlements recorded yet.</p>
          ) : (
            <div className="overflow-x-auto border-t border-border pt-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-6 py-3 font-medium">Period</th>
                    <th className="px-6 py-3 font-medium">Gross</th>
                    <th className="px-6 py-3 font-medium">COGS</th>
                    <th className="px-6 py-3 font-medium">Subscription</th>
                    <th className="px-6 py-3 font-medium">Distributable</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {settlements.map(({ id, data }) => (
                    <tr key={id} className="border-b border-border last:border-0">
                      <td className="px-6 py-3 font-medium text-foreground">
                        {formatDateTime(data.periodStart)} – {formatDateTime(data.periodEnd)}
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">KES {data.grossSalesKes.toLocaleString('en-KE')}</td>
                      <td className="px-6 py-3 text-muted-foreground">
                        KES {data.cogsKes.toLocaleString('en-KE')}
                        {data.unpricedSaleCount > 0 ? ` (${data.unpricedSaleCount} unpriced)` : ''}
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">KES {data.subscriptionChargedKes.toLocaleString('en-KE')}</td>
                      <td className="px-6 py-3 text-muted-foreground">KES {data.distributableOwnerKes.toLocaleString('en-KE')}</td>
                      <td className="px-6 py-3 text-muted-foreground">{data.status}</td>
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
