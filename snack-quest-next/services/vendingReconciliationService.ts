import 'server-only';

import { machineTransactionRepository } from '@/repositories/machineTransactionRepository';
import { machineTelemetryEventRepository } from '@/repositories/machineTelemetryEventRepository';

export interface ManualReviewTransactionIssue {
  transactionId: string;
  machineId: string;
  amountKes: number;
  status: string;
  failureReason: string | null;
  createdAt: string;
}

export interface UnmatchedVendReportIssue {
  eventId: string;
  machineId: string;
  processingError: string;
  receivedAt: string;
}

export interface ReconciliationSummary {
  windowDays: number;
  manualReviewTransactions: ManualReviewTransactionIssue[];
  unmatchedVendReports: UnmatchedVendReportIssue[];
}

/**
 * § PART 4 — CENTRAL PAYMENT RECONCILIATION, § FAILURE SCENARIOS
 * ("payment without vend", "vend without payment", "duplicate
 * payment", "unknown payment", "unknown vend"). This is the honest
 * subset of that list this codebase can actually detect today,
 * assembled from signals the transaction/telemetry state machines
 * already produce rather than inventing a parallel correlation
 * engine:
 *
 *   - **payment-without-vend / stuck reconciliation issues**: every
 *     transaction currently sitting in `manual_review`
 *     (`MachineTransaction.status`) — the state machine's own single
 *     catch-all for "a human needs to look at this": an amount
 *     mismatch, a stuck-transaction timeout with no device report
 *     ever arriving, or an explicit device `unknown` vend result.
 *     This *is* the payment-reconciliation-issue queue, not an
 *     approximation of it — `machineTransactionService`'s own state
 *     machine has already done the correlation work; this reads its
 *     output.
 *   - **unknown vend / vend-without-payment**: a device's own vend
 *     report whose `vendRef` matched no transaction at all
 *     (`machineTelemetryEventRepository`'s `vend_result` events with
 *     `processingError` set — see
 *     `machineTransactionService.applyVendResult`'s own "no
 *     transaction found for vendRef" branch). In this architecture a
 *     vend is only ever authorized from an already-paid transaction,
 *     so this is reachable only from a genuine hardware/protocol
 *     anomaly (a stray report, a replay with a stale vendRef) — never
 *     from the diagnostic Test Vend action, which doesn't create a
 *     transaction at all and is excluded from this signal by
 *     definition (there is nothing to match against, but also nothing
 *     to reconcile — it's a staff-authenticated diagnostic, not a
 *     customer charge).
 *
 * Deliberately **not** attempted here, rather than faked:
 * **duplicate payment** and **unknown payment** (a vending STK
 * callback that matched no transaction). Both would need to be told
 * apart from this business's *e-commerce* checkout's own unmatched-
 * payment bucket (`webhookEventRepository.listUnmatchedPayments`,
 * scoped to `eventKind: 'stk_callback'`) — the vending branch of the
 * Daraja webhook falls through to that same e-commerce handler on a
 * miss, and today records nothing that distinguishes "this looked
 * like a vending payment" from "this was never vending's in the first
 * place". Building that distinction needs a schema change to the
 * webhook ledger (a `vending_stk_callback_unmatched` kind recorded at
 * the fallthrough point), not a read over data that doesn't carry the
 * fact — see docs/VENDING_OPERATIONS_RUNBOOK.md's own NEXT list.
 */
class VendingReconciliationService {
  async getReconciliationIssues(businessId: string): Promise<ReconciliationSummary> {
    const [{ transactions }, telemetryIssues] = await Promise.all([
      machineTransactionRepository.listByBusiness(businessId, { status: 'manual_review', limit: 200 }),
      this.listUnmatchedVendReports(businessId),
    ]);

    return {
      windowDays: 0, // manual_review has no fixed window — it's every currently-open issue, however old.
      manualReviewTransactions: transactions.map(({ id, data }) => ({
        transactionId: id,
        machineId: data.machineId,
        amountKes: data.amountKes,
        status: data.status,
        failureReason: data.failureReason,
        createdAt: data.createdAt.toDate().toISOString(),
      })),
      unmatchedVendReports: telemetryIssues,
    };
  }

  /**
   * Scans this business's own `vend_result` telemetry for reports
   * `applyVendResult` could not match to any transaction
   * (`processingError` set, `processed` still false). Bounded to a
   * recent window via `streamRange`, not an unbounded collection scan
   * — the "windowed question, query the range directly" rule
   * (docs/ANALYTICS_ROLLUPS.md) applies here exactly as it does to a
   * dashboard read, since this is a live reconciliation view, not a
   * rollup.
   */
  private async listUnmatchedVendReports(businessId: string, windowDays = 14): Promise<UnmatchedVendReportIssue[]> {
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const issues: UnmatchedVendReportIssue[] = [];
    for await (const { id, data } of machineTelemetryEventRepository.streamRange(businessId, { since, eventType: 'vend_result' })) {
      if (!data.processed && data.processingError) {
        issues.push({
          eventId: id,
          machineId: data.machineId,
          processingError: data.processingError,
          receivedAt: data.receivedAt.toDate().toISOString(),
        });
      }
    }
    return issues;
  }
}

export const vendingReconciliationService = new VendingReconciliationService();
export { VendingReconciliationService };
