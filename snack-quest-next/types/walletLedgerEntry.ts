import type { Timestamp } from 'firebase/firestore';

export type WalletLedgerEntryType = 'milestone_bonus' | 'checkout_redemption' | 'admin_adjustment';

/**
 * `customerWallets/{walletId}/ledger/{entryId}` — the immutable
 * record backing `CustomerWallet.balanceKes` (§ Phase 4: Customer
 * loyalty / Quest system). Same split as `CreatorEarningsLedgerEntry`:
 * the balance field is mutable and derived, this ledger is the
 * append-only source of truth for how it got there. `amountKes` is
 * signed (positive for a credit, negative for a debit) so the ledger
 * alone — without inspecting `type` — always sums to the balance.
 */
export interface WalletLedgerEntry {
  type: WalletLedgerEntryType;
  amountKes: number;
  balanceAfterKes: number;
  note: string;
  /** The order this entry relates to, if any — a milestone bonus or a checkout redemption always has one; an admin adjustment usually doesn't. */
  orderId: string | null;
  createdAt: Timestamp;
  /** `'system'` for automatic milestone bonuses and checkout redemptions, a staff uid for a manual admin adjustment. */
  createdBy: string;
}
