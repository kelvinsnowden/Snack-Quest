import type { Timestamp } from 'firebase/firestore';

/**
 * `creatorProfiles/{uid}/earningsLedger/{entryId}` — the immutable
 * record backing `creatorProfiles.availableCashKes` (PLATFORM_ARCHITECTURE_V2.md
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
