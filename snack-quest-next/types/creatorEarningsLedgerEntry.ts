import type { Timestamp } from 'firebase/firestore';

/**
 * `businesses/{businessId}/creatorMemberships/{uid}/earningsLedger/{entryId}`
 * — the immutable record backing `availableCashKes` on the owning
 * membership doc (PLATFORM_ARCHITECTURE_V2.md
 * §4). Fixes the wallet/ledger asymmetry the completeness audit
 * found: the balance field is mutable and derived, this ledger is the
 * append-only source of truth for how it got there.
 */
export interface CreatorEarningsLedgerEntry {
  type: 'referral_commission';
  orderId: string;
  referralLinkId: string;
  amountKes: number;
  createdAt: Timestamp;
}
