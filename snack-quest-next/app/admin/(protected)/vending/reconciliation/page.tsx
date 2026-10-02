import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, GitCompareArrows } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { vendingReconciliationService } from '@/services/vendingReconciliationService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { alertService } from '@/services/alertService';
import { scheduledJobRunRepository } from '@/repositories/scheduledJobRunRepository';
import { machineRepository } from '@/repositories/machineRepository';
import { hasPermission } from '@/lib/auth/permissions';
import { serializeAlert } from '@/lib/vending/serialize';
import { AlertActions } from '@/components/admin/AlertActions';
import { RunJobNowButton } from '@/components/admin/JobControls';
import { formatDateTime } from '@/lib/orders/format';

/** What each nightly ledger check looks for, in words. */
const LEDGER_KIND_LABEL: Record<string, string> = {
  dispensed_without_stock_movement: 'Sold, but stock never went down',
  stock_moved_without_dispensed_sale: 'Stock went down, but the sale didn’t complete',
  duplicate_stock_movement: 'Stock taken twice for one sale',
  command_transaction_mismatch: 'Machine and sale disagree',
  refund_owed_too_long: 'Refund owed for over a day',
  unresolved_outcome_conflict: 'Machine contradicted a money decision',
};

export const metadata: Metadata = { title: 'Payment Reconciliation' };

/**
 * § PART 4 — CENTRAL PAYMENT RECONCILIATION. See
 * `vendingReconciliationService`'s own doc comment for the exact
 * scope of what this detects (manual-review backlog, unmatched vend
 * reports) and what it honestly does not (duplicate/unknown payment
 * correlation for vending specifically).
 */
export default async function AdminVendingReconciliationPage() {
  const session = await requireStaffSession();
  const summary = await vendingReconciliationService.getReconciliationIssues(session.businessId);
  const [openAlerts, [lastLedgerRun], machines] = await Promise.all([
    alertService.listOpen(session.businessId),
    scheduledJobRunRepository.listRecentForJob(session.businessId, 'reconcile-vending-transactions', 1),
    machineRepository.listAllForBusiness(session.businessId),
  ]);
  const machineCodes = new Map(machines.map(({ id, data }) => [id, data.machineCode]));
  // Findings of the nightly ledger check are alerts keyed `ledger:<kind>:<transactionId>`.
  const ledgerFindings = openAlerts
    .filter(({ data }) => data.dedupeKey.startsWith('ledger:'))
    .map(({ id, data }) => {
      const [, kind, transactionId] = data.dedupeKey.split(':');
      return { alert: serializeAlert(id, data), kind, transactionId };
    });
  const canResolve = hasPermission(session, 'alerts.resolve');
  const totalIssues = summary.manualReviewTransactions.length + summary.unmatchedVendReports.length + ledgerFindings.length;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Payment Reconciliation</h1>
        <p className="text-sm text-muted-foreground">
          {totalIssues === 0 ? 'No open issues.' : `${totalIssues} issue${totalIssues === 1 ? '' : 's'} need attention.`}{' '}
          <Link href="/admin/vending/reconciliation/checks" className="text-primary hover:underline">
            Check prices, owner stock, settlements and ad revenue
          </Link>
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="size-4 text-warning" aria-hidden="true" />
                Ledger check ({ledgerFindings.length} open)
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Each night money, dispenses and stock are checked against each other for the last 7 days. Findings stay here until someone resolves them.{' '}
                {lastLedgerRun ? `Last run ${formatDateTime(lastLedgerRun.data.startedAt)} (${lastLedgerRun.data.status}).` : 'Not run yet.'}
              </p>
            </div>
            {hasPermission(session, 'ops.jobs.run') ? (
              <div className="flex flex-col items-end gap-1">
                <RunJobNowButton jobName="reconcile-vending-transactions" />
                <p className="max-w-56 text-right text-xs text-muted-foreground">Runs the whole nightly reconciliation, including refunds it can prove are owed.</p>
              </div>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {ledgerFindings.length === 0 ? (
            <EmptyState icon={GitCompareArrows} title="Ledgers agree" description="The last check found no sale, dispense or stock record out of line with the others." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-6 py-3 font-medium">Finding</th>
                    <th className="px-6 py-3 font-medium">Machine</th>
                    <th className="px-6 py-3 font-medium">Sale</th>
                    <th className="px-6 py-3 font-medium">Found</th>
                    {canResolve ? <th className="px-6 py-3 font-medium" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {ledgerFindings.map(({ alert, kind, transactionId }) => (
                    <tr key={alert.id} className="border-b border-border last:border-0 align-top">
                      <td className="px-6 py-3">
                        <p className="text-foreground">{LEDGER_KIND_LABEL[kind] ?? kind.replace(/_/g, ' ')}</p>
                        <p className="text-xs text-muted-foreground">{alert.detail}</p>
                      </td>
                      <td className="px-6 py-3">
                        {alert.machineId ? (
                          <Link href={`/admin/vending/${alert.machineId}`} className="text-primary hover:underline">
                            {machineCodes.get(alert.machineId) ?? alert.machineId}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-6 py-3 font-mono text-xs">
                        {transactionId ? (
                          <Link href={`/admin/vending/sales/${encodeURIComponent(transactionId)}`} className="text-primary hover:underline">
                            {transactionId}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">{new Date(alert.createdAt).toLocaleString('en-KE')}</td>
                      {canResolve ? (
                        <td className="px-6 py-3">
                          <AlertActions alert={alert} />
                        </td>
                      ) : null}
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
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="size-4 text-warning" aria-hidden="true" />
            Manual review backlog ({summary.manualReviewTransactions.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {summary.manualReviewTransactions.length === 0 ? (
            <EmptyState icon={GitCompareArrows} title="No transactions need review" description="Every payment either resolved cleanly or is still in flight." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-6 py-3 font-medium">Transaction</th>
                    <th className="px-6 py-3 font-medium">Machine</th>
                    <th className="px-6 py-3 font-medium">Amount</th>
                    <th className="px-6 py-3 font-medium">Reason</th>
                    <th className="px-6 py-3 font-medium">Since</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.manualReviewTransactions.map((issue) => (
                    <tr key={issue.transactionId} className="border-b border-border last:border-0">
                      <td className="px-6 py-3 font-mono text-xs">
                        <Link href={`/admin/vending/sales/${issue.transactionId}`} className="text-primary hover:underline">
                          {issue.transactionId}
                        </Link>
                      </td>
                      <td className="px-6 py-3">
                        <Link href={`/admin/vending/${issue.machineId}`} className="text-primary hover:underline">
                          {issue.machineId}
                        </Link>
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">KES {issue.amountKes.toLocaleString('en-KE')}</td>
                      <td className="px-6 py-3 text-muted-foreground">{issue.failureReason ?? '—'}</td>
                      <td className="px-6 py-3 text-muted-foreground">{new Date(issue.createdAt).toLocaleString('en-KE')}</td>
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
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="size-4 text-warning" aria-hidden="true" />
            Unmatched vend reports ({summary.unmatchedVendReports.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {summary.unmatchedVendReports.length === 0 ? (
            <EmptyState icon={GitCompareArrows} title="No unmatched vend reports" description="Every device vend report in the last 14 days matched a real transaction." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-6 py-3 font-medium">Event</th>
                    <th className="px-6 py-3 font-medium">Machine</th>
                    <th className="px-6 py-3 font-medium">Reason</th>
                    <th className="px-6 py-3 font-medium">Received</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.unmatchedVendReports.map((issue) => (
                    <tr key={issue.eventId} className="border-b border-border last:border-0">
                      <td className="px-6 py-3 font-mono text-xs text-foreground">{issue.eventId}</td>
                      <td className="px-6 py-3">
                        <Link href={`/admin/vending/${issue.machineId}`} className="text-primary hover:underline">
                          {issue.machineId}
                        </Link>
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">{issue.processingError}</td>
                      <td className="px-6 py-3 text-muted-foreground">{new Date(issue.receivedAt).toLocaleString('en-KE')}</td>
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
