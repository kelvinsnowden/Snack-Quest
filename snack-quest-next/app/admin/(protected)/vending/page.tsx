import type { Metadata } from 'next';
import Link from 'next/link';
import { Cpu, MapPin, Users, Wifi, WifiOff, Banknote, ClipboardList, Boxes, AlertTriangle, CreditCard, GitCompareArrows, Wrench } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { machineRepository } from '@/repositories/machineRepository';
import { partnerRepository } from '@/repositories/partnerRepository';
import { machineSlotRepository } from '@/repositories/machineSlotRepository';
import { machineTransactionRepository } from '@/repositories/machineTransactionRepository';
import { machineDailySummaryRepository } from '@/repositories/machineDailySummaryRepository';
import { restockTaskRepository } from '@/repositories/restockTaskRepository';
import { alertService } from '@/services/alertService';
import { networkOverviewService } from '@/services/networkOverviewService';
import { trailingWindow } from '@/services/machineAssortmentIntelligenceService';
import { deriveConnectivityStatus } from '@/lib/vending/connectivity';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendStatCard } from '@/components/admin/TrendStatCard';
import { MachineStatusBadge } from '@/components/admin/MachineStatusBadge';
import { MachineConnectivityBadge } from '@/components/admin/MachineConnectivityBadge';
import { formatDateTime } from '@/lib/orders/format';
import type { Alert, Machine } from '@/types';

export const metadata: Metadata = { title: 'Vending Machines' };

type FleetFilter = 'online' | 'offline' | 'lowstock' | 'stockout' | 'fault' | 'subscription' | 'inactive';
const FLEET_FILTERS: { key: FleetFilter; label: string }[] = [
  { key: 'online', label: 'Online' },
  { key: 'offline', label: 'Offline' },
  { key: 'lowstock', label: 'Low stock' },
  { key: 'stockout', label: 'Stockout' },
  { key: 'fault', label: 'Fault' },
  { key: 'subscription', label: 'Subscription issue' },
  { key: 'inactive', label: 'Inactive' },
];

interface FleetRow {
  id: string;
  data: Machine;
  connectivityStatus: ReturnType<typeof deriveConnectivityStatus>;
  ownerName: string | null;
  revenueKes7d: number;
  sellableCount: number;
  slotCount: number;
  lastSaleAt: string | null;
  lastRestockAt: string | null;
  hasFault: boolean;
  hasStockout: boolean;
  hasLowStock: boolean;
  hasSubscriptionIssue: boolean;
}

/**
 * § PART 3 — OPERATIONS COMMAND CENTER. Network Overview
 * (`networkOverviewService`, which itself reads `networkIntelligenceService`
 * for revenue/inventory and `alertService` for fault/stockout/
 * subscription/reconciliation counts — never a second aggregation of
 * facts those two already compute) plus the Machine Fleet table, with
 * the brief's own columns and filter set. Fleet-wide and unpaginated
 * — see `machineRepository.listAllForBusiness`'s own doc comment for
 * why that's an accepted, revisitable bound rather than an oversight.
 */
export default async function AdminVendingPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const session = await requireStaffSession();
  const { filter: filterParam } = await searchParams;
  const activeFilter = FLEET_FILTERS.some((f) => f.key === filterParam) ? (filterParam as FleetFilter) : null;

  await alertService.evaluateAndSync(session.businessId);
  const [machines, partners, openAlerts] = await Promise.all([
    machineRepository.listAllForBusiness(session.businessId),
    partnerRepository.listByBusiness(session.businessId),
    alertService.listOpen(session.businessId),
  ]);
  const overview = await networkOverviewService.getOverview(session.businessId, openAlerts);

  const ownerNameById = new Map(partners.map(({ id, data }) => [id, data.name]));
  const alertsByMachine = new Map<string, Alert[]>();
  for (const { data } of openAlerts) {
    if (!data.machineId) continue;
    alertsByMachine.set(data.machineId, [...(alertsByMachine.get(data.machineId) ?? []), data]);
  }

  const { startDate, endDate } = trailingWindow(7);
  const rows: FleetRow[] = await Promise.all(
    machines.map(async ({ id, data }) => {
      const [rollups, slots, lastSale, restockTasks] = await Promise.all([
        machineDailySummaryRepository.listRange(session.businessId, id, startDate, endDate),
        machineSlotRepository.listByMachine(session.businessId, id),
        machineTransactionRepository.listByBusiness(session.businessId, { machineId: id, limit: 1 }),
        restockTaskRepository.listByMachine(session.businessId, id, 10),
      ]);

      let revenueKes7d = 0;
      for (const rollup of rollups.values()) revenueKes7d += rollup.grossSalesKes;

      const enabledSlots = slots.filter((s) => s.enabled && s.productId);
      const sellableCount = enabledSlots.filter((s) => s.currentQuantity > 0).length;
      const lastReceived = restockTasks.find((t) => t.data.status === 'received');

      const machineAlerts = alertsByMachine.get(id) ?? [];
      return {
        id,
        data,
        connectivityStatus: deriveConnectivityStatus(data.lastSeenAt),
        ownerName: data.ownerPartnerId ? ownerNameById.get(data.ownerPartnerId) ?? null : null,
        revenueKes7d,
        sellableCount,
        slotCount: enabledSlots.length,
        lastSaleAt: lastSale.transactions[0]?.data.createdAt ? lastSale.transactions[0].data.createdAt.toDate().toISOString() : null,
        lastRestockAt: lastReceived?.data.updatedAt ? lastReceived.data.updatedAt.toDate().toISOString() : null,
        hasFault: machineAlerts.some((a) => a.type === 'machine_fault'),
        hasStockout: machineAlerts.some((a) => a.type === 'stockout'),
        hasLowStock: machineAlerts.some((a) => a.type === 'stockout_risk'),
        hasSubscriptionIssue: machineAlerts.some((a) => a.type === 'subscription_issue'),
      };
    }),
  );

  const filtered = rows.filter((row) => {
    switch (activeFilter) {
      case 'online':
        return row.connectivityStatus === 'online';
      case 'offline':
        return row.connectivityStatus === 'offline';
      case 'lowstock':
        return row.hasLowStock;
      case 'stockout':
        return row.hasStockout;
      case 'fault':
        return row.hasFault;
      case 'subscription':
        return row.hasSubscriptionIssue;
      case 'inactive':
        return row.data.status !== 'active';
      default:
        return true;
    }
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Vending Machines</h1>
        <p className="text-sm text-muted-foreground">Network Overview &mdash; {overview.machineCount} machine{overview.machineCount === 1 ? '' : 's'} across the fleet.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-5">
        <TrendStatCard label="Machines" value={String(overview.machineCount)} icon={<Cpu className="size-5" />} tone="secondary" />
        <TrendStatCard label="Locations" value={String(overview.locationCount)} icon={<MapPin className="size-5" />} tone="secondary" />
        <TrendStatCard label="Owners" value={String(overview.ownerCount)} icon={<Users className="size-5" />} tone="secondary" />
        <TrendStatCard label="Online" value={String(overview.onlineMachineCount)} icon={<Wifi className="size-5" />} tone="success" />
        <TrendStatCard label="Offline" value={String(overview.offlineMachineCount)} icon={<WifiOff className="size-5" />} tone="danger" />
        <TrendStatCard label="Revenue (30d)" value={`KES ${overview.revenueKes30d.toLocaleString('en-KE')}`} icon={<Banknote className="size-5" />} tone="success" />
        <TrendStatCard label="Transactions (30d)" value={overview.transactionCount30d.toLocaleString('en-KE')} icon={<ClipboardList className="size-5" />} tone="secondary" />
        <TrendStatCard label="Inventory value" value={`KES ${overview.inventoryDeployedValueKes.toLocaleString('en-KE')}`} icon={<Boxes className="size-5" />} tone="secondary" />
        <TrendStatCard label="Stockout risk" value={String(overview.stockoutRiskCount)} icon={<AlertTriangle className="size-5" />} tone={overview.stockoutRiskCount > 0 ? 'warning' : 'secondary'} />
        <TrendStatCard label="Restock queue" value={String(overview.restockQueueCount)} icon={<Boxes className="size-5" />} tone={overview.restockQueueCount > 0 ? 'warning' : 'secondary'} />
        <TrendStatCard label="Faults" value={String(overview.faultCount)} icon={<Wrench className="size-5" />} tone={overview.faultCount > 0 ? 'danger' : 'secondary'} />
        <TrendStatCard label="Subscription issues" value={String(overview.subscriptionIssueCount)} icon={<CreditCard className="size-5" />} tone={overview.subscriptionIssueCount > 0 ? 'warning' : 'secondary'} />
        <TrendStatCard label="Pending withdrawals" value={String(overview.pendingWithdrawalCount)} icon={<Banknote className="size-5" />} tone="secondary" />
        <TrendStatCard label="Reconciliation issues" value={String(overview.reconciliationIssueCount)} icon={<GitCompareArrows className="size-5" />} tone={overview.reconciliationIssueCount > 0 ? 'warning' : 'secondary'} />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3">
          <CardTitle>Machine Fleet</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/vending"
              className={`rounded-full px-3 py-1 text-xs font-medium ${!activeFilter ? 'bg-primary text-primary-foreground' : 'bg-border/30 text-muted-foreground hover:bg-border/50'}`}
            >
              All ({rows.length})
            </Link>
            {FLEET_FILTERS.map(({ key, label }) => (
              <Link
                key={key}
                href={`/admin/vending?filter=${key}`}
                className={`rounded-full px-3 py-1 text-xs font-medium ${activeFilter === key ? 'bg-primary text-primary-foreground' : 'bg-border/30 text-muted-foreground hover:bg-border/50'}`}
              >
                {label}
              </Link>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              {rows.length === 0
                ? 'No machines have been provisioned yet.'
                : 'No machines match this filter.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-6 py-3 font-medium">Machine</th>
                    <th className="px-6 py-3 font-medium">Owner</th>
                    <th className="px-6 py-3 font-medium">Location</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Last heartbeat</th>
                    <th className="px-6 py-3 font-medium">Revenue (7d)</th>
                    <th className="px-6 py-3 font-medium">Stock health</th>
                    <th className="px-6 py-3 font-medium">Last sale</th>
                    <th className="px-6 py-3 font-medium">Last restock</th>
                    <th className="px-6 py-3 font-medium">Fault</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.id} className="border-b border-border last:border-0 hover:bg-border/20">
                      <td className="px-6 py-3">
                        <Link href={`/admin/vending/${row.id}`} className="font-medium text-primary hover:underline">
                          {row.data.machineCode}
                        </Link>
                        <p className="text-xs text-muted-foreground">{row.data.model}</p>
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">{row.ownerName ?? '—'}</td>
                      <td className="px-6 py-3 text-muted-foreground">{row.data.venueName ?? '—'}</td>
                      <td className="px-6 py-3">
                        <div className="flex flex-col gap-1">
                          <MachineStatusBadge status={row.data.status} />
                          <MachineConnectivityBadge status={row.connectivityStatus} />
                        </div>
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">{row.data.lastSeenAt ? formatDateTime(row.data.lastSeenAt) : 'Never'}</td>
                      <td className="px-6 py-3 text-muted-foreground">KES {row.revenueKes7d.toLocaleString('en-KE')}</td>
                      <td className={`px-6 py-3 ${row.hasStockout ? 'text-danger' : row.hasLowStock ? 'text-warning' : 'text-muted-foreground'}`}>
                        {row.sellableCount}/{row.slotCount} sellable
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">{row.lastSaleAt ? formatDateTime(row.lastSaleAt) : '—'}</td>
                      <td className="px-6 py-3 text-muted-foreground">{row.lastRestockAt ? formatDateTime(row.lastRestockAt) : '—'}</td>
                      <td className="px-6 py-3">{row.hasFault ? <AlertTriangle className="size-4 text-danger" aria-hidden="true" /> : <span className="text-muted-foreground">—</span>}</td>
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
