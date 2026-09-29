import type { Metadata } from 'next';
import Link from 'next/link';
import { Cpu, MapPin, Users, Wifi, WifiOff, Banknote, ClipboardList, Boxes, AlertTriangle, CreditCard, GitCompareArrows, Wrench } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { machineRepository } from '@/repositories/machineRepository';
import { partnerRepository } from '@/repositories/partnerRepository';
import { alertService } from '@/services/alertService';
import { networkOverviewService } from '@/services/networkOverviewService';
import { machineFleetSummaryService } from '@/services/machineFleetSummaryService';
import { machineLiveness, connectivityOf, LIVENESS_REASON_LABEL } from '@/lib/vending/machineStatus';
import { machineIntegrationRepository } from '@/repositories/machineIntegrationRepository';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendStatCard } from '@/components/admin/TrendStatCard';
import { MachineStatusBadge } from '@/components/admin/MachineStatusBadge';
import { MachineConnectivityBadge } from '@/components/admin/MachineConnectivityBadge';
import { formatDateTime } from '@/lib/orders/format';
import { hasPermission } from '@/lib/auth/permissions';
import { Button } from '@/components/ui/button';
import type { Alert, Machine, MachineConnectivityStatus } from '@/types';

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
  connectivityStatus: MachineConnectivityStatus;
  connectivityReason: string;
  ownerName: string | null;
  revenueKes7d: number;
  sellableCount: number;
  slotCount: number;
  pausedSlotCount: number;
  lastSaleAt: string | null;
  lastRestockAt: string | null;
  figuresAt: string | null;
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
const PAGE_SIZE = 50;

export default async function AdminVendingPage({ searchParams }: { searchParams: Promise<{ filter?: string; q?: string; owner?: string; page?: string }> }) {
  const session = await requireStaffSession();
  const { filter: filterParam, q: rawQuery, owner: ownerParam, page: pageParam } = await searchParams;
  const activeFilter = FLEET_FILTERS.some((f) => f.key === filterParam) ? (filterParam as FleetFilter) : null;
  const query = (rawQuery ?? '').trim().toLowerCase();

  // Alerts are as the last scheduled sweep left them (see the Alert Center); this page never runs the sweep.
  const [machines, partners, openAlerts, integrations] = await Promise.all([
    machineRepository.listAllForBusiness(session.businessId),
    partnerRepository.listByBusiness(session.businessId),
    alertService.listOpen(session.businessId),
    machineIntegrationRepository.listByBusiness(session.businessId),
  ]);
  const integrationByMachine = new Map(integrations.map((integration) => [integration.machineId, integration]));
  const overview = await networkOverviewService.getOverview(session.businessId, openAlerts);

  const ownerNameById = new Map(partners.map(({ id, data }) => [id, data.name]));
  const alertsByMachine = new Map<string, Alert[]>();
  for (const { data } of openAlerts) {
    if (!data.machineId) continue;
    alertsByMachine.set(data.machineId, [...(alertsByMachine.get(data.machineId) ?? []), data]);
  }

  // Filter and sort using only what's already on each machine document and in the alert list;
  // the per-machine figures are read for the page shown, not the whole fleet (G-C9).
  const candidates = machines
    .map(({ id, data }) => {
      const machineAlerts = alertsByMachine.get(id) ?? [];
      const liveness = machineLiveness(data, integrationByMachine.get(id) ?? null);
      return {
        id,
        data,
        connectivityStatus: connectivityOf(liveness),
        connectivityReason: LIVENESS_REASON_LABEL[liveness.reason],
        ownerName: data.ownerPartnerId ? ownerNameById.get(data.ownerPartnerId) ?? null : null,
        hasFault: machineAlerts.some((a) => a.type === 'machine_fault'),
        hasStockout: machineAlerts.some((a) => a.type === 'stockout'),
        hasLowStock: machineAlerts.some((a) => a.type === 'stockout_risk'),
        hasSubscriptionIssue: machineAlerts.some((a) => a.type === 'subscription_issue'),
      };
    })
    .filter((row) => {
      if (ownerParam && (ownerParam === 'none' ? row.data.ownerPartnerId : row.data.ownerPartnerId !== ownerParam)) return false;
      if (query && ![row.data.machineCode, row.data.serialNumber, row.data.venueName ?? '', row.ownerName ?? ''].some((value) => value.toLowerCase().includes(query))) return false;
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
    })
    .sort((a, b) => a.data.machineCode.localeCompare(b.data.machineCode));

  const pageCount = Math.max(1, Math.ceil(candidates.length / PAGE_SIZE));
  const page = Math.min(pageCount, Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1));
  const pageSlice = candidates.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const summaries = await machineFleetSummaryService.getForPage(session.businessId, pageSlice.map((row) => row.id));
  const iso = (value: { toDate(): Date } | null | undefined) => (value ? value.toDate().toISOString() : null);
  const filtered: FleetRow[] = pageSlice.map((row) => {
    const summary = summaries.get(row.id);
    return {
      ...row,
      revenueKes7d: summary?.revenueKes7d ?? 0,
      sellableCount: summary?.sellableCount ?? 0,
      slotCount: summary?.slotCount ?? 0,
      pausedSlotCount: summary?.pausedSlotCount ?? 0,
      lastSaleAt: iso(summary?.lastSaleAt),
      lastRestockAt: iso(summary?.lastRestockAt),
      figuresAt: iso(summary?.refreshedAt),
    };
  });
  const rows = machines;
  const pageHref = (target: number) => {
    const params = new URLSearchParams();
    if (activeFilter) params.set('filter', activeFilter);
    if (rawQuery) params.set('q', rawQuery);
    if (ownerParam) params.set('owner', ownerParam);
    if (target > 1) params.set('page', String(target));
    const text = params.toString();
    return text ? `/admin/vending?${text}` : '/admin/vending';
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Vending Machines</h1>
          <p className="text-sm text-muted-foreground">Network Overview &mdash; {overview.machineCount} machine{overview.machineCount === 1 ? '' : 's'} across the fleet.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/admin/vending/products">Products on machines</Link>
          </Button>
          {hasPermission(session, 'machines.create') ? (
            <Button asChild>
              <Link href="/admin/vending/new">Register a machine</Link>
            </Button>
          ) : null}
        </div>
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
          <form action="/admin/vending" className="flex flex-wrap items-end gap-2">
            {activeFilter ? <input type="hidden" name="filter" value={activeFilter} /> : null}
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Search
              <input name="q" defaultValue={rawQuery ?? ''} placeholder="Code, serial, place or owner" className="h-9 w-64 rounded-lg border border-border bg-background px-3 text-sm text-foreground" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Owner
              <select name="owner" defaultValue={ownerParam ?? ''} className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground">
                <option value="">Any</option>
                <option value="none">Snack Quest</option>
                {[...partners].sort((a, b) => a.data.name.localeCompare(b.data.name)).map(({ id, data }) => <option key={id} value={id}>{data.name}</option>)}
              </select>
            </label>
            <button type="submit" className="h-9 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-border/30">Apply</button>
          </form>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/admin/vending${rawQuery || ownerParam ? `?${new URLSearchParams({ ...(rawQuery ? { q: rawQuery } : {}), ...(ownerParam ? { owner: ownerParam } : {}) }).toString()}` : ''}`}
              className={`rounded-full px-3 py-1 text-xs font-medium ${!activeFilter ? 'bg-primary text-primary-foreground' : 'bg-border/30 text-muted-foreground hover:bg-border/50'}`}
            >
              All ({rows.length})
            </Link>
            {FLEET_FILTERS.map(({ key, label }) => (
              <Link
                key={key}
                href={`/admin/vending?${new URLSearchParams({ filter: key, ...(rawQuery ? { q: rawQuery } : {}), ...(ownerParam ? { owner: ownerParam } : {}) }).toString()}`}
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
                          <span title={row.connectivityReason}>
                            <MachineConnectivityBadge status={row.connectivityStatus} />
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">{row.data.lastSeenAt ? formatDateTime(row.data.lastSeenAt) : 'Never'}</td>
                      <td className="px-6 py-3 text-muted-foreground">KES {row.revenueKes7d.toLocaleString('en-KE')}</td>
                      <td className={`px-6 py-3 ${row.hasStockout ? 'text-danger' : row.hasLowStock ? 'text-warning' : 'text-muted-foreground'}`}>
                        {row.sellableCount}/{row.slotCount} sellable
                        {row.pausedSlotCount > 0 ? <span className="block text-xs text-warning">{row.pausedSlotCount} paused</span> : null}
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
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-3 text-sm text-muted-foreground">
            <span>
              {candidates.length === 0 ? 'No machines' : `${(page - 1) * PAGE_SIZE + 1}–${(page - 1) * PAGE_SIZE + filtered.length} of ${candidates.length}`}. Revenue, stock and last sale are usually no more than 15 minutes old.
            </span>
            {pageCount > 1 ? (
              <span className="flex gap-2">
                {page > 1 ? <Link href={pageHref(page - 1)} className="rounded-lg border border-border px-3 py-1 hover:bg-border/30">Previous</Link> : null}
                <span className="px-2 py-1">Page {page} of {pageCount}</span>
                {page < pageCount ? <Link href={pageHref(page + 1)} className="rounded-lg border border-border px-3 py-1 hover:bg-border/30">Next</Link> : null}
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
