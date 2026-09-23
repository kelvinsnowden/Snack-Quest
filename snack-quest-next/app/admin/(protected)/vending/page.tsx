import type { Metadata } from 'next';
import Link from 'next/link';
import { Cpu, Wrench, WifiOff, Clock } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { machineService } from '@/services/machineService';
import { deriveConnectivityStatus } from '@/lib/vending/connectivity';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendStatCard } from '@/components/admin/TrendStatCard';
import { MachineStatusBadge } from '@/components/admin/MachineStatusBadge';
import { MachineConnectivityBadge } from '@/components/admin/MachineConnectivityBadge';
import { formatDateTime } from '@/lib/orders/format';

export const metadata: Metadata = { title: 'Vending Machines' };

/**
 * The fleet list — the minimal machine dashboard the vending
 * foundation's own brief asked for (§ ADMIN UX, docs/VENDING_OS_BENCHMARK.md
 * §C/§H). Deliberately not the full "operations center" sketched in
 * that brief: alerts, machine-level economics, and location
 * intelligence all need data or infrastructure this codebase doesn't
 * have yet (§0's own gap analysis) — this is the list + detail view
 * a first physical prototype actually needs, not a mockup of a
 * dashboard nothing behind it can support yet.
 */
export default async function AdminVendingPage({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const session = await requireStaffSession();
  const { cursor } = await searchParams;

  const [{ machines, nextCursor }, summary] = await Promise.all([
    machineService.listByBusiness(session.businessId, { cursor, limit: 50 }),
    machineService.fleetStatusSummary(session.businessId),
  ]);

  const rows = machines.map(({ id, data }) => ({ id, data, connectivityStatus: deriveConnectivityStatus(data.lastSeenAt) }));

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Vending Machines</h1>
        <p className="text-sm text-muted-foreground">
          The Discovery Machine fleet — {summary.total} machine{summary.total === 1 ? '' : 's'} total.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <TrendStatCard label="Active" value={String(summary.active)} icon={<Cpu className="size-5" />} tone="success" />
        <TrendStatCard
          label="Provisioning"
          value={String(summary.provisioning + summary.installing + summary.testing)}
          icon={<Clock className="size-5" />}
          tone="secondary"
        />
        <TrendStatCard label="Maintenance" value={String(summary.maintenance)} icon={<Wrench className="size-5" />} tone="warning" />
        <TrendStatCard label="Offline" value={String(summary.offline)} icon={<WifiOff className="size-5" />} tone="danger" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Machines</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              No machines have been provisioned yet. Provision one with <code className="rounded bg-border/40 px-1 py-0.5">POST /api/vending/register</code>.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-6 py-3 font-medium">Machine</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Connectivity</th>
                    <th className="px-6 py-3 font-medium">Location</th>
                    <th className="px-6 py-3 font-medium">Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ id, data, connectivityStatus }) => (
                    <tr key={id} className="border-b border-border last:border-0 hover:bg-border/20">
                      <td className="px-6 py-3">
                        <Link href={`/admin/vending/${id}`} className="font-medium text-primary hover:underline">
                          {data.machineCode}
                        </Link>
                        <p className="text-xs text-muted-foreground">{data.model}</p>
                      </td>
                      <td className="px-6 py-3">
                        <MachineStatusBadge status={data.status} />
                      </td>
                      <td className="px-6 py-3">
                        <MachineConnectivityBadge status={connectivityStatus} />
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">{data.venueName ?? '—'}</td>
                      <td className="px-6 py-3 text-muted-foreground">{data.lastSeenAt ? formatDateTime(data.lastSeenAt) : 'Never'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {nextCursor && (
        <Link href={`/admin/vending?cursor=${nextCursor}`} className="text-sm font-medium text-primary hover:underline">
          Next page →
        </Link>
      )}
    </div>
  );
}
