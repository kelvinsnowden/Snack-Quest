import 'server-only';

import { randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { MACHINE_TRANSACTION_STATUS_TRANSITIONS, type MachineTransaction, type MachineTransactionStatus } from '@/types';

const COLLECTION = 'machineTransactions';

export type MachineTransactionInput = Omit<
  MachineTransaction,
  | 'createdAt'
  | 'updatedAt'
  | 'transactionRef'
  | 'status'
  | 'paidAt'
  | 'dispensedAt'
  | 'failureReason'
  | 'dispenseFailureStatus'
  | 'appliedTelemetryEventId'
  | 'paymentRef'
  | 'vendRef'
  | 'checkoutRequestId'
  | 'merchantRequestId'
>;

export class MachineTransactionNotFoundError extends Error {
  constructor(transactionId: string) {
    super(`Machine transaction ${transactionId} not found`);
    this.name = 'MachineTransactionNotFoundError';
  }
}

export class IllegalTransactionTransitionError extends Error {
  constructor(from: MachineTransactionStatus, to: MachineTransactionStatus) {
    super(`Cannot move a machine transaction from "${from}" to "${to}"`);
    this.name = 'IllegalTransactionTransitionError';
  }
}

/**
 * `machineTransactions` reads/writes (§ CORE ENTITIES 3). Persistence
 * plus the one piece of logic worth keeping next to the writes it
 * guards: `moveStatus` never trusts a caller's target status without
 * checking `MACHINE_TRANSACTION_STATUS_TRANSITIONS` first, because
 * every caller of this repository already knows *why* it wants a
 * transition — the state machine itself belongs here, where every
 * write path is forced through it, rather than duplicated in each
 * Service method that happens to update a status.
 */
class MachineTransactionRepository {
  async create(input: MachineTransactionInput): Promise<{ id: string; transactionRef: string }> {
    const now = FieldValue.serverTimestamp();
    const transactionRef = `TXN-${randomUUID().slice(0, 8).toUpperCase()}`;
    const ref = await adminFirestore.collection(COLLECTION).add({
      ...input,
      transactionRef,
      status: 'pending' satisfies MachineTransactionStatus,
      paymentRef: null,
      vendRef: null,
      checkoutRequestId: null,
      merchantRequestId: null,
      paidAt: null,
      dispensedAt: null,
      failureReason: null,
      dispenseFailureStatus: null,
      appliedTelemetryEventId: null,
      createdAt: now,
      updatedAt: now,
    });
    return { id: ref.id, transactionRef };
  }

  async findById(businessId: string, transactionId: string): Promise<MachineTransaction | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(transactionId).get();
    if (!snapshot.exists) {
      return null;
    }
    const data = snapshot.data() as MachineTransaction;
    return data.businessId === businessId ? data : null;
  }

  async findByTransactionRef(businessId: string, transactionRef: string): Promise<{ id: string; data: MachineTransaction } | null> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('transactionRef', '==', transactionRef)
      .limit(1)
      .get();
    return snapshot.empty ? null : { id: snapshot.docs[0].id, data: snapshot.docs[0].data() as MachineTransaction };
  }

  /** By the vend authorization's own reference — how a device's vend-result report finds the transaction it belongs to. */
  async findByVendRef(businessId: string, vendRef: string): Promise<{ id: string; data: MachineTransaction } | null> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('vendRef', '==', vendRef)
      .limit(1)
      .get();
    return snapshot.empty ? null : { id: snapshot.docs[0].id, data: snapshot.docs[0].data() as MachineTransaction };
  }

  /**
   * By the M-Pesa STK push's own `CheckoutRequestID` — how the Daraja
   * webhook route's vending branch recognises "this callback belongs
   * to a vending transaction, not the e-commerce checkout flow"
   * before it decides anything else. Businesses only, never a
   * fleet-wide scan across tenants, since Safaricom's ids are unique
   * per push but this collection is not scoped by them alone.
   *
   * Plural, not `.limit(1)`, because one STK push can now cover a
   * whole cart: `MachineTransactionService.initiateCartPayment`
   * creates one `machineTransactions` doc per slot but sends exactly
   * one STK push for the total, and stamps every one of that cart's
   * docs with the same `checkoutRequestId` (§ "record the sale per
   * slot, but the customer pays once"). A single-item cart still
   * finds exactly one document, so every call site written before
   * carts existed reads correctly unchanged.
   *
   * Ordered by `createdAt` — Firestore gives no ordering guarantee
   * for an equality-only query, and `initiateCartPayment` created
   * this group in exactly this order, so a caller that wants "the
   * cart's own item order" back (as opposed to an arbitrary but
   * still complete and correct set) can rely on it.
   */
  async listByCheckoutRequestId(businessId: string, checkoutRequestId: string): Promise<{ id: string; data: MachineTransaction }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('checkoutRequestId', '==', checkoutRequestId)
      .orderBy('createdAt', 'asc')
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as MachineTransaction }));
  }

  /**
   * Records Safaricom's STK-push correlation pair at the moment the
   * push is sent — before any callback exists to verify, which is
   * exactly why this is a separate write from `moveStatus` rather than
   * a field on it: setting these carries no state-machine transition,
   * and a transaction stays `pending` the whole time a real customer
   * is looking at their phone's PIN prompt.
   */
  async setCheckoutRequest(businessId: string, transactionId: string, input: { checkoutRequestId: string; merchantRequestId: string }): Promise<void> {
    const ref = adminFirestore.collection(COLLECTION).doc(transactionId);
    const snapshot = await ref.get();
    const data = snapshot.data() as MachineTransaction | undefined;
    if (!data || data.businessId !== businessId) {
      throw new MachineTransactionNotFoundError(transactionId);
    }
    await ref.update({
      checkoutRequestId: input.checkoutRequestId,
      merchantRequestId: input.merchantRequestId,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  /**
   * Every transaction of one status whose `updatedAt` is older than
   * `before` — the reconciliation sweep's own read (§ transaction
   * timeout). Bounded to one status per call rather than an `in`
   * filter so the sweep's two calls (`paid`, `vend_authorized`) never
   * depend on a composite index this codebase doesn't already need
   * elsewhere for an equality-plus-range query on the same two fields.
   */
  async listByStatusUpdatedBefore(businessId: string, status: MachineTransactionStatus, before: Date, limit = 200): Promise<{ id: string; data: MachineTransaction }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('status', '==', status)
      .where('updatedAt', '<', before)
      .orderBy('updatedAt', 'asc')
      .limit(limit)
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as MachineTransaction }));
  }

  /**
   * The one path that changes `status`. Validates against
   * `MACHINE_TRANSACTION_STATUS_TRANSITIONS` before writing anything
   * — an illegal move (e.g. `pending` straight to `dispensed`, skipping
   * proof of payment) throws rather than silently succeeding.
   *
   * `paidAt`/`dispensedAt` are never accepted from a caller — they are
   * stamped here with `FieldValue.serverTimestamp()` exactly when `to`
   * is `paid`/`dispensed`, the same "server timestamps only, never
   * client-supplied" discipline `AuditFields` already holds everywhere
   * else in this codebase. A caller that could pass its own timestamp
   * for "when was this paid" is a caller that could backdate a refund
   * window; this removes that possibility rather than trusting every
   * call site to avoid it.
   */
  async moveStatus(
    businessId: string,
    transactionId: string,
    to: MachineTransactionStatus,
    fields: Partial<Pick<MachineTransaction, 'paymentRef' | 'vendRef' | 'failureReason' | 'dispenseFailureStatus' | 'appliedTelemetryEventId'>> = {},
  ): Promise<void> {
    const ref = adminFirestore.collection(COLLECTION).doc(transactionId);
    const snapshot = await ref.get();
    const data = snapshot.data() as MachineTransaction | undefined;
    if (!data || data.businessId !== businessId) {
      throw new MachineTransactionNotFoundError(transactionId);
    }
    const allowed = MACHINE_TRANSACTION_STATUS_TRANSITIONS[data.status] ?? [];
    if (!allowed.includes(to)) {
      throw new IllegalTransactionTransitionError(data.status, to);
    }
    const now = FieldValue.serverTimestamp();
    await ref.update({
      ...fields,
      status: to,
      updatedAt: now,
      ...(to === 'paid' ? { paidAt: now } : {}),
      ...(to === 'dispensed' ? { dispensedAt: now } : {}),
    });
  }

  /** One bounded page, newest first — the admin/finance list view's own read, same shape as `machineRepository.listByBusiness`. Never unbounded like `streamRange`, which exists for rollup rebuilds, not a request handler. */
  async listByBusiness(
    businessId: string,
    options: { machineId?: string; status?: MachineTransactionStatus; limit?: number; cursor?: string } = {},
  ): Promise<{ transactions: { id: string; data: MachineTransaction }[]; nextCursor: string | null }> {
    const pageSize = options.limit ?? 50;
    let query = adminFirestore.collection(COLLECTION).where('businessId', '==', businessId) as FirebaseFirestore.Query;
    if (options.machineId) {
      query = query.where('machineId', '==', options.machineId);
    }
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
    return {
      transactions: docs.map((doc) => ({ id: doc.id, data: doc.data() as MachineTransaction })),
      nextCursor: snapshot.docs.length > pageSize ? docs[docs.length - 1].id : null,
    };
  }

  /** Every transaction in a window, cursor-paged — the rollup primitive, same shape as `orderRepository.streamRange` (§ analytics rollups). */
  async *streamRange(
    businessId: string,
    options: { since?: Date; until?: Date; machineId?: string; pageSize?: number } = {},
  ): AsyncGenerator<{ id: string; data: MachineTransaction }> {
    const pageSize = options.pageSize ?? 500;
    let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    for (;;) {
      let query = adminFirestore
        .collection(COLLECTION)
        .where('businessId', '==', businessId) as FirebaseFirestore.Query;
      if (options.machineId) {
        query = query.where('machineId', '==', options.machineId);
      }
      if (options.since) {
        query = query.where('createdAt', '>=', options.since);
      }
      if (options.until) {
        query = query.where('createdAt', '<', options.until);
      }
      query = query.orderBy('createdAt', 'desc').limit(pageSize);
      if (cursor) {
        query = query.startAfter(cursor);
      }
      const snapshot = await query.get();
      if (snapshot.empty) {
        return;
      }
      for (const doc of snapshot.docs) {
        yield { id: doc.id, data: doc.data() as MachineTransaction };
      }
      if (snapshot.size < pageSize) {
        return;
      }
      cursor = snapshot.docs[snapshot.docs.length - 1];
    }
  }

  async countInRange(businessId: string, options: { since?: Date; until?: Date; machineId?: string; status?: MachineTransactionStatus } = {}): Promise<number> {
    let query = adminFirestore.collection(COLLECTION).where('businessId', '==', businessId) as FirebaseFirestore.Query;
    if (options.machineId) {
      query = query.where('machineId', '==', options.machineId);
    }
    if (options.status) {
      query = query.where('status', '==', options.status);
    }
    if (options.since) {
      query = query.where('createdAt', '>=', options.since);
    }
    if (options.until) {
      query = query.where('createdAt', '<', options.until);
    }
    const snapshot = await query.count().get();
    return snapshot.data().count;
  }
}

export const machineTransactionRepository = new MachineTransactionRepository();
