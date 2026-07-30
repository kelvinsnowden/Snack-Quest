import type { Timestamp } from 'firebase/firestore';

export type WalletTransactionType = 'credit' | 'debit';

/**
 * `walletTransactions/{transactionId}` — append-only customer credit
 * ledger. Immutable once written (rules §9: write is server/Cloud-
 * Function-only, ever), so this does not extend AuditFields —
 * there is no updatedAt/updatedBy/deletedAt for a document that's
 * never updated or deleted.
 */
export interface WalletTransaction {
  customerId: string;
  amount: number;
  balanceAfter: number;
  transactionType: WalletTransactionType;
  note: string;
  createdAt: Timestamp;
  createdBy: string;
}
