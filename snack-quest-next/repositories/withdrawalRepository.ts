import 'server-only';

import { FieldValue, Timestamp, type Transaction } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { AuditFields, Withdrawal, WithdrawalAuditEntry, WithdrawalStatus } from '@/types';

const COLLECTION = 'withdrawals';

export type WithdrawalInput = Omit<Withdrawal, keyof AuditFields>;

/**
 * A same-instant, real server timestamp for an audit-trail entry —
 * `FieldValue.serverTimestamp()` cannot appear inside an
 * `arrayUnion()` element, so `Timestamp.now()` (Admin SDK server
 * time, not a client clock) is the correct value here, not a
 * compromise. Cast at the boundary: every domain type's `Timestamp`
 * field (`types/*.ts`) is typed against the client SDK for Client
 * Component read access, but every write in this codebase runs
 * through the Admin SDK — the same real timestamp shape, a
 * TypeScript nominal-type mismatch only (`firebase-admin/firestore`'s
 * `Timestamp` has no `toJSON`, `firebase/firestore`'s requires one).
 */
export function auditEntry(action: string, actorId: string, note?: string): WithdrawalAuditEntry {
  return {
    action,
    actorId,
    at: Timestamp.now() as unknown as WithdrawalAuditEntry['at'],
    ...(note !== undefined ? { note } : {}),
  };
}

class WithdrawalRepository {
  async findById(businessId: string, withdrawalId: string): Promise<Withdrawal | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(withdrawalId).get();
    if (!snapshot.exists) {
      return null;
    }
    const data = snapshot.data() as Withdrawal;
    return data.businessId === businessId ? data : null;
  }

  /** Matches a B2C async result callback back to the withdrawal that triggered it — see `Withdrawal.b2cOriginatorConversationId`. */
  async findByOriginatorConversationId(
    businessId: string,
    originatorConversationId: string,
  ): Promise<{ id: string; data: Withdrawal } | null> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('b2cOriginatorConversationId', '==', originatorConversationId)
      .limit(1)
      .get();
    if (snapshot.empty) {
      return null;
    }
    const doc = snapshot.docs[0];
    return { id: doc.id, data: doc.data() as Withdrawal };
  }

  createInTransaction(tx: Transaction, input: WithdrawalInput, actor: string): string {
    const ref = adminFirestore.collection(COLLECTION).doc();
    const now = FieldValue.serverTimestamp();
    tx.set(ref, {
      ...input,
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      updatedBy: actor,
      deletedAt: null,
    });
    return ref.id;
  }

  /** Admin: Withdrawals (§ Admin: Withdrawals) — every status transition goes through here: sets the given fields, appends one audit entry, stamps updatedAt/updatedBy. */
  async applyTransition(
    withdrawalId: string,
    fields: Partial<Omit<Withdrawal, keyof AuditFields | 'auditTrail'>>,
    entry: WithdrawalAuditEntry,
    actor: string,
  ): Promise<void> {
    await adminFirestore
      .collection(COLLECTION)
      .doc(withdrawalId)
      .update({
        ...fields,
        auditTrail: FieldValue.arrayUnion(entry),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor,
      });
  }

  /** Same transition write, usable inside a transaction (e.g. alongside a balance refund) — see `WithdrawalService.rejectWithdrawal()`. */
  applyTransitionInTransaction(
    tx: Transaction,
    withdrawalId: string,
    fields: Partial<Omit<Withdrawal, keyof AuditFields | 'auditTrail'>>,
    entry: WithdrawalAuditEntry,
    actor: string,
  ): void {
    const ref = adminFirestore.collection(COLLECTION).doc(withdrawalId);
    tx.update(ref, {
      ...fields,
      auditTrail: FieldValue.arrayUnion(entry),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor,
    });
  }

  /** § Creator Portal withdrawals — a creator's own request history, newest first. */
  async listByOwner(
    businessId: string,
    ownerId: string,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<{ withdrawals: { id: string; data: Withdrawal }[]; nextCursor: string | null }> {
    const pageSize = options.limit ?? 25;
    let query = adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('ownerId', '==', ownerId)
      .orderBy('createdAt', 'desc')
      .limit(pageSize + 1) as FirebaseFirestore.Query;

    if (options.cursor) {
      const cursorDoc = await adminFirestore.collection(COLLECTION).doc(options.cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snapshot = await query.get();
    const docs = snapshot.docs.slice(0, pageSize);
    const hasMore = snapshot.docs.length > pageSize;

    return {
      withdrawals: docs.map((doc) => ({ id: doc.id, data: doc.data() as Withdrawal })),
      nextCursor: hasMore ? docs[docs.length - 1].id : null,
    };
  }

  async listByBusiness(
    businessId: string,
    options: { status?: WithdrawalStatus; limit?: number; cursor?: string } = {},
  ): Promise<{ withdrawals: { id: string; data: Withdrawal }[]; nextCursor: string | null }> {
    const pageSize = options.limit ?? 25;
    let query = adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId) as FirebaseFirestore.Query;

    if (options.status) {
      query = query.where('status', '==', options.status);
    }
    query = query.orderBy('createdAt', 'desc').limit(pageSize + 1);

    if (options.cursor) {
      const cursorDoc = await adminFirestore.collection(COLLECTION).doc(options.cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snapshot = await query.get();
    const docs = snapshot.docs.slice(0, pageSize);
    const hasMore = snapshot.docs.length > pageSize;

    return {
      withdrawals: docs.map((doc) => ({ id: doc.id, data: doc.data() as Withdrawal })),
      nextCursor: hasMore ? docs[docs.length - 1].id : null,
    };
  }
}

export const withdrawalRepository = new WithdrawalRepository();
