import 'server-only';

import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { CustomerWallet, WalletLedgerEntry } from '@/types';

const COLLECTION = 'customerWallets';
const LEDGER_SUBCOLLECTION = 'ledger';
const LEDGER_LIST_LIMIT = 50;

export class InsufficientWalletBalanceError extends Error {
  constructor(phoneNumber: string, requestedKes: number, availableKes: number) {
    super(`${phoneNumber} has KES ${availableKes} available, cannot debit KES ${requestedKes}`);
    this.name = 'InsufficientWalletBalanceError';
  }
}

/** Deterministic, so a credit/debit for the same customer always targets the same doc — same pattern as `deliveryZoneRuleRepository`'s composite key. */
export function walletId(businessId: string, phoneNumber: string): string {
  return `${businessId}:${phoneNumber}`;
}

function walletRef(businessId: string, phoneNumber: string) {
  return adminFirestore.collection(COLLECTION).doc(walletId(businessId, phoneNumber));
}

class CustomerWalletRepository {
  async get(businessId: string, phoneNumber: string): Promise<CustomerWallet | null> {
    const snapshot = await walletRef(businessId, phoneNumber).get();
    return snapshot.exists ? (snapshot.data() as CustomerWallet) : null;
  }

  /** Newest first — the customer's own ledger, or an admin's view of it. */
  async getLedger(businessId: string, phoneNumber: string, limit = LEDGER_LIST_LIMIT): Promise<{ id: string; data: WalletLedgerEntry }[]> {
    const snapshot = await walletRef(businessId, phoneNumber)
      .collection(LEDGER_SUBCOLLECTION)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as WalletLedgerEntry }));
  }

  /** Every wallet with a positive balance, highest first — the admin overview (§ Admin: Customers). Bounded scan, same discipline as `customerService`'s own aggregation — real and correct at today's volumes. */
  async listByBusiness(businessId: string, limit = 500): Promise<{ id: string; data: CustomerWallet }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .orderBy('balanceKes', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as CustomerWallet }));
  }

  /**
   * Credits (or, for a negative `amountKes`, debits) a wallet and
   * appends the matching ledger entry in the same transaction — same
   * split as `creatorEarningsLedgerRepository.creditInTransaction()`.
   * Creates the wallet doc on first use (a customer's first credit is
   * usually also their first wallet doc). Throws
   * `InsufficientWalletBalanceError` if a debit would go negative —
   * reads the current balance first, so this is transaction-safe
   * against a concurrent credit/debit for the same customer.
   */
  async applyInTransaction(
    tx: Transaction,
    businessId: string,
    phoneNumber: string,
    entry: Omit<WalletLedgerEntry, 'createdAt' | 'balanceAfterKes'>,
  ): Promise<number> {
    const ref = walletRef(businessId, phoneNumber);
    const existing = await tx.get(ref);
    const current = existing.exists ? (existing.data() as CustomerWallet) : null;
    const currentBalanceKes = current?.balanceKes ?? 0;
    const balanceAfterKes = currentBalanceKes + entry.amountKes;

    if (balanceAfterKes < 0) {
      throw new InsufficientWalletBalanceError(phoneNumber, -entry.amountKes, currentBalanceKes);
    }

    const now = FieldValue.serverTimestamp();
    tx.set(
      ref,
      {
        businessId,
        phoneNumber,
        balanceKes: balanceAfterKes,
        lifetimeCreditsEarnedKes: (current?.lifetimeCreditsEarnedKes ?? 0) + Math.max(entry.amountKes, 0),
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
      },
      { merge: true },
    );

    const ledgerRef = ref.collection(LEDGER_SUBCOLLECTION).doc();
    tx.set(ledgerRef, { ...entry, balanceAfterKes, createdAt: now });

    return balanceAfterKes;
  }
}

export const customerWalletRepository = new CustomerWalletRepository();
