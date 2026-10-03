import 'server-only';

import { machineTransactionRepository } from '@/repositories/machineTransactionRepository';
import { machineInventoryMovementRepository } from '@/repositories/machineInventoryMovementRepository';
import { machineDispenseCommandRepository } from '@/repositories/machineDispenseCommandRepository';
import { alertRepository } from '@/repositories/alertRepository';
import { ALERT_SEVERITY_BY_TYPE, isCustomerSale, type MachineTransaction, type MachineTransactionStatus } from '@/types';
import { logger } from '@/lib/observability/logger';

export type LedgerDiscrepancyKind =
  | 'dispensed_without_stock_movement'
  | 'stock_moved_without_dispensed_sale'
  | 'duplicate_stock_movement'
  | 'command_transaction_mismatch'
  | 'refund_owed_too_long'
  | 'unresolved_outcome_conflict';

export interface LedgerDiscrepancy {
  kind: LedgerDiscrepancyKind;
  transactionId: string;
  machineId: string;
  detail: string;
}

export interface DeepReconciliationReport {
  since: string;
  until: string;
  transactionsChecked: number;
  saleMovementsChecked: number;
  commandsChecked: number;
  discrepancies: LedgerDiscrepancy[];
}

/** A refund owed longer than this without being requested is a customer waiting on money. */
const REFUND_OWED_ALERT_MS = 24 * 60 * 60 * 1000;

const COMMAND_EXPECTS: Record<string, MachineTransactionStatus[]> = {
  dispensed: ['dispensed', 'manual_review'],
  failed: ['paid_vend_failed', 'refund_requested', 'refunded', 'manual_review', 'dispensed'],
  rejected: ['paid_vend_failed', 'refund_requested', 'refunded', 'manual_review'],
  timeout: ['manual_review', 'paid_vend_failed', 'refund_requested', 'refunded', 'dispensed'],
  unknown: ['manual_review', 'paid_vend_failed', 'refund_requested', 'refunded', 'dispensed'],
};

/**
 * Deep reconciliation: the three ledgers — money
 * (`machineTransactions`), physical dispense (`machineDispenseCommands`)
 * and stock (`machineInventoryMovements`) — checked against each other
 * over a window. Each real-time path keeps them consistent; this proves
 * it after the fact and catches whatever a crash, a bug or a human edit
 * slipped past.
 *
 * Invariants:
 * - every dispensed sale has exactly one `sale` stock movement, and
 *   every `sale` movement belongs to a dispensed sale (or to a recorded
 *   outcome conflict — the product left even though money didn't move);
 * - a finished dispense command agrees with its transaction;
 * - no refund has been owed for more than a day without being requested;
 * - no outcome conflict sits unresolved.
 *
 * **Reports, never repairs.** Every discrepancy becomes an alert for a
 * human; nothing here moves money or stock. Safe to re-run: alerts are
 * deduplicated per discrepancy.
 */
class DeepReconciliationService {
  async run(businessId: string, options: { since?: Date; until?: Date; now?: Date } = {}): Promise<DeepReconciliationReport> {
    const now = options.now ?? new Date();
    const until = options.until ?? now;
    const since = options.since ?? new Date(until.getTime() - 7 * 24 * 60 * 60 * 1000);
    const discrepancies: LedgerDiscrepancy[] = [];

    const transactions = new Map<string, MachineTransaction>();
    for await (const { id, data } of machineTransactionRepository.streamRange(businessId, { since, until })) {
      transactions.set(id, data);
    }

    // Movements can trail their sale slightly; look a day past the window.
    const salesByTransaction = new Map<string, number>();
    let saleMovementsChecked = 0;
    for await (const { data } of machineInventoryMovementRepository.streamMovementsInRange(businessId, { reason: 'sale', since, until: new Date(until.getTime() + 24 * 60 * 60 * 1000) })) {
      saleMovementsChecked += 1;
      if (data.sourceTransactionId) {
        salesByTransaction.set(data.sourceTransactionId, (salesByTransaction.get(data.sourceTransactionId) ?? 0) + 1);
      }
    }
    // A staff test vend's product leaves as waste, keyed to its transaction like a sale.
    for await (const { data } of machineInventoryMovementRepository.streamMovementsInRange(businessId, { reason: 'waste', since, until: new Date(until.getTime() + 24 * 60 * 60 * 1000) })) {
      const transaction = data.sourceTransactionId ? transactions.get(data.sourceTransactionId) : undefined;
      if (transaction && !isCustomerSale(transaction)) {
        salesByTransaction.set(data.sourceTransactionId!, (salesByTransaction.get(data.sourceTransactionId!) ?? 0) + 1);
      }
    }

    for (const [transactionId, transaction] of transactions) {
      const sales = salesByTransaction.get(transactionId) ?? 0;
      const conflictWithStock = transaction.outcomeConflict?.reportedStatus === 'success';
      if (transaction.status === 'dispensed' && sales === 0) {
        discrepancies.push({ kind: 'dispensed_without_stock_movement', transactionId, machineId: transaction.machineId, detail: 'Sale completed but slot stock was never decremented.' });
      }
      if (sales > 1) {
        discrepancies.push({ kind: 'duplicate_stock_movement', transactionId, machineId: transaction.machineId, detail: `${sales} sale movements for one sale — stock under-counted by ${sales - 1}.` });
      }
      if (sales > 0 && transaction.status !== 'dispensed' && !conflictWithStock) {
        discrepancies.push({ kind: 'stock_moved_without_dispensed_sale', transactionId, machineId: transaction.machineId, detail: `Stock moved but the sale is "${transaction.status}".` });
      }
      // Owed and not yet sent: failed vends nobody has acted on, and refunds decided but never paid out.
      if ((transaction.status === 'paid_vend_failed' || transaction.status === 'refund_requested') && isCustomerSale(transaction) && now.getTime() - transaction.updatedAt.toMillis() > REFUND_OWED_ALERT_MS) {
        discrepancies.push({ kind: 'refund_owed_too_long', transactionId, machineId: transaction.machineId, detail: `KES ${transaction.amountKes} owed back since ${transaction.updatedAt.toDate().toISOString()}.` });
      }
      if (transaction.outcomeConflict && !transaction.outcomeConflict.resolved) {
        discrepancies.push({ kind: 'unresolved_outcome_conflict', transactionId, machineId: transaction.machineId, detail: `Machine reported "${transaction.outcomeConflict.reportedStatus}" after the sale was "${transaction.outcomeConflict.previousStatus}".` });
      }
    }

    let commandsChecked = 0;
    for await (const command of machineDispenseCommandRepository.streamRange(businessId, { since, until })) {
      commandsChecked += 1;
      const expected = COMMAND_EXPECTS[command.status];
      const transaction = transactions.get(command.transactionId) ?? (await machineTransactionRepository.findById(businessId, command.transactionId));
      if (expected && transaction && !expected.includes(transaction.status)) {
        discrepancies.push({
          kind: 'command_transaction_mismatch',
          transactionId: command.transactionId,
          machineId: command.machineId,
          detail: `Dispense ${command.commandRef} is "${command.status}" but the sale is "${transaction.status}".`,
        });
      }
    }

    for (const discrepancy of discrepancies) {
      const type = discrepancy.kind === 'dispensed_without_stock_movement' || discrepancy.kind === 'stock_moved_without_dispensed_sale' || discrepancy.kind === 'duplicate_stock_movement' ? 'inventory_discrepancy' : 'payment_reconciliation_issue';
      await alertRepository.recordEventOnce(
        {
          businessId,
          type,
          severity: ALERT_SEVERITY_BY_TYPE[type],
          machineId: discrepancy.machineId,
          locationId: null,
          dedupeKey: `ledger:${discrepancy.kind}:${discrepancy.transactionId}`,
          title: `Ledger check: ${discrepancy.kind.replace(/_/g, ' ')}`,
          detail: `${discrepancy.detail} (transaction ${discrepancy.transactionId})`,
        },
        `ledger_${discrepancy.kind}_${discrepancy.transactionId}`,
      );
    }
    if (discrepancies.length > 0) {
      logger.warn('deep reconciliation found discrepancies', { businessId, count: discrepancies.length, kinds: [...new Set(discrepancies.map((d) => d.kind))] });
    }
    return {
      since: since.toISOString(),
      until: until.toISOString(),
      transactionsChecked: transactions.size,
      saleMovementsChecked,
      commandsChecked,
      discrepancies,
    };
  }
}

export const deepReconciliationService = new DeepReconciliationService();
export { DeepReconciliationService };
