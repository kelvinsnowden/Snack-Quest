import type { Timestamp } from 'firebase/firestore';

/**
 * `customerWallets/{businessId}:{phoneNumber}` — the loyalty/credit
 * balance for a real Snack Quest customer (§ Phase 4: Customer
 * loyalty / Quest system). Keyed by `businessId` + WhatsApp
 * `phoneNumber`, deliberately not by a Firebase Auth uid: almost
 * every real customer is a guest WhatsApp shopper with no Auth
 * account at all (see `OrderCustomer.customerId`'s own doc comment
 * and `services/customerService.ts`) — `phoneNumber` is the identity
 * that always exists, exactly like `conversations`/`orders` are
 * already keyed. Supersedes the dead, uid-keyed
 * `customerProfile.walletBalanceKes` / `lifetimeCreditsEarnedKes`
 * fields, which nothing ever wrote to.
 *
 * `balanceKes` is a cached, incrementally-maintained total — the
 * `ledger` subcollection below is the append-only source of truth it's
 * derived from, same split as `creatorProfiles.availableCashKes` /
 * `earningsLedger` (`types/creatorEarningsLedgerEntry.ts`).
 */
export interface CustomerWallet {
  businessId: string;
  phoneNumber: string;
  balanceKes: number;
  lifetimeCreditsEarnedKes: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
