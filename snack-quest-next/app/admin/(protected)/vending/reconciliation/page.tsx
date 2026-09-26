import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, GitCompareArrows } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { vendingReconciliationService } from '@/services/vendingReconciliationService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';

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
  const totalIssues = summary.manualReviewTransactions.length + summary.unmatchedVendReports.length;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Payment Reconciliation</h1>
        <p className="text-sm text-muted-foreground">
          {totalIssues === 0 ? 'No open issues.' : `${totalIssues} issue${totalIssues === 1 ? '' : 's'} need attention.`}
        </p>
      </div>

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
                      <td className="px-6 py-3 font-mono text-xs text-foreground">{issue.transactionId}</td>
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
