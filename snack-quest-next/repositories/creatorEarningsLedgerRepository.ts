import 'server-only';

import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { CreatorEarningsLedgerEntry } from '@/types';

/**
 * `creatorProfiles/{uid}/earningsLedger` writes + the balance credit
 * that goes with them (PLATFORM_ARCHITECTURE_V2.md §4). Both happen
 * in the same transaction as the referral attribution write
 * (`ReferralService.awardCommission()`) so a creator is never credited
 * without a matching ledger entry, or vice versa.
 */
export function creditInTransaction(
  tx: Transaction,
  creatorId: string,
  entry: Omit<CreatorEarningsLedgerEntry, 'createdAt'>,
): void {
  const creatorRef = adminFirestore.collection('creatorProfiles').doc(creatorId);
  tx.update(creatorRef, {
    availableCashKes: FieldValue.increment(entry.amountKes),
    lifetimeEarningsKes: FieldValue.increment(entry.amountKes),
  });

  const ledgerRef = creatorRef.collection('earningsLedger').doc();
  tx.set(ledgerRef, { ...entry, createdAt: FieldValue.serverTimestamp() });
}
