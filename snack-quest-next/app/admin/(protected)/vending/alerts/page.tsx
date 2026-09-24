import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertOctagon, AlertTriangle, Info } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { alertService } from '@/services/alertService';
import { serializeAlert, type SerializedAlert } from '@/lib/vending/serialize';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { AlertActions } from '@/components/admin/AlertActions';

export const metadata: Metadata = { title: 'Alert Center' };

const SEVERITY_RANK: Record<SerializedAlert['severity'], number> = { critical: 0, warning: 1, info: 2 };
const SEVERITY_ICON = { critical: AlertOctagon, warning: AlertTriangle, info: Info } as const;
const SEVERITY_CLASS: Record<SerializedAlert['severity'], string> = {
  critical: 'bg-danger/10 text-danger',
  warning: 'bg-warning/10 text-warning',
  info: 'bg-border/40 text-muted-foreground',
};
const TYPE_LABEL: Record<SerializedAlert['type'], string> = {
  machine_offline: 'Machine offline',
  heartbeat_missing: 'Heartbeat missing',
  stockout: 'Stockout',
  stockout_risk: 'Stockout risk',
  machine_fault: 'Machine fault',
  payment_reconciliation_issue: 'Payment reconciliation',
  inventory_discrepancy: 'Inventory discrepancy',
  expiry_risk: 'Expiry risk',
  subscription_issue: 'Subscription issue',
  settlement_failure: 'Settlement failure',
};

/**
 * § PART 6 — ALERT CENTER. Runs the sweep on every load (cheap,
 * idempotent — see `alertService.evaluateAndSync`'s own doc comment)
 * so this page is never a stale, separately-maintained view of the
 * fleet's own state.
 */
export default async function AdminVendingAlertsPage() {
  const session = await requireStaffSession();
  await alertService.evaluateAndSync(session.businessId);
  const alerts = await alertService.listOpen(session.businessId);
  const serialized = alerts
    .map(({ id, data }) => serializeAlert(id, data))
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.createdAt.localeCompare(a.createdAt));

  const criticalCount = serialized.filter((a) => a.severity === 'critical').length;
  const warningCount = serialized.filter((a) => a.severity === 'warning').length;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Alert Center</h1>
        <p className="text-sm text-muted-foreground">
          {serialized.length === 0
            ? 'No open alerts across the fleet.'
            : `${criticalCount} critical, ${warningCount} warning — ${serialized.length} open in total.`}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Open alerts</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {serialized.length === 0 ? (
            <EmptyState icon={AlertTriangle} title="All clear" description="Every machine, payment, and settlement signal this page watches is currently healthy." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-6 py-3 font-medium">Severity</th>
                    <th className="px-6 py-3 font-medium">Type</th>
                    <th className="px-6 py-3 font-medium">Machine</th>
                    <th className="px-6 py-3 font-medium">Detail</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Since</th>
                    <th className="px-6 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {serialized.map((alert) => {
                    const Icon = SEVERITY_ICON[alert.severity];
                    return (
                      <tr key={alert.id} className="border-b border-border last:border-0 align-top">
                        <td className="px-6 py-3">
                          <span className={`flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_CLASS[alert.severity]}`}>
                            <Icon className="size-3.5" aria-hidden="true" />
                            {alert.severity}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-foreground">{TYPE_LABEL[alert.type]}</td>
                        <td className="px-6 py-3">
                          {alert.machineId ? (
                            <Link href={`/admin/vending/${alert.machineId}`} className="text-primary hover:underline">
                              {alert.machineId}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">&mdash;</span>
                          )}
                        </td>
                        <td className="px-6 py-3 text-muted-foreground">
                          <p>{alert.title}</p>
                          <p className="text-xs">{alert.detail}</p>
                          {alert.status === 'acknowledged' ? (
                            <p className="mt-1 text-xs text-muted-foreground">Acknowledged by {alert.assignee ?? 'staff'}</p>
                          ) : null}
                        </td>
                        <td className="px-6 py-3 capitalize text-muted-foreground">{alert.status}</td>
                        <td className="px-6 py-3 text-muted-foreground">{new Date(alert.createdAt).toLocaleString('en-KE')}</td>
                        <td className="px-6 py-3">
                          <AlertActions alert={alert} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
