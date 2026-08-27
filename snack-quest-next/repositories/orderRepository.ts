import 'server-only';

import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { CheckoutLineItem } from '@/types/checkoutLine';
import type { ManualPaymentRecord, Order, OrderFulfillment, OrderItem, OrderStatus } from '@/types';

/**
 * `orders` + `items` subcollection reads/writes (TDD §8, expanded per
 * PLATFORM_ARCHITECTURE_V2.md §16). Persistence only —
 * `OrderService.createFromConversationSnapshot()` owns the business
 * rule of *when* an order gets created (only from a succeeded
 * payment).
 */

const COLLECTION = 'orders';

export type OrderInput = Omit<
  Order,
  'status' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'updatedBy' | 'orderNumber'
> & {
  createdBy: string;
  /** Required here (unlike on `Order` itself) — every new order must allocate one, see `orderNumberCounterRef`. */
  orderNumber: number;
};

/**
 * The per-business sequential-order-number counter (§ order
 * references) — one doc per business, `{ value: <last number issued> }`.
 * Nested under the business the same way `integrationSecrets` is,
 * since it's config-shaped, not another `orders`-style collection of
 * its own. `OrderService` reads it, computes `value + 1`, and writes
 * both the counter and the new order back in the same transaction —
 * this repository only builds the ref, since a bare read-then-write
 * needs to interleave with the caller's own transaction reads/writes
 * in a specific order (see that Service's own comment).
 */
export function orderNumberCounterRef(businessId: string) {
  return adminFirestore.collection('businesses').doc(businessId).collection('counters').doc('orders');
}

/**
 * Runs inside the same Firestore transaction as inventory reservation
 * (`OrderService`) so a payment never results in an order without a
 * matching stock decrement, or vice versa.
 */
export function createInTransaction(
  tx: Transaction,
  input: OrderInput,
  items: OrderItem[],
): string {
  const now = FieldValue.serverTimestamp();
  const orderRef = adminFirestore.collection(COLLECTION).doc();
  tx.set(orderRef, {
    ...input,
    status: 'confirmed' satisfies OrderStatus,
    createdAt: now,
    updatedAt: now,
    updatedBy: input.createdBy,
    deletedAt: null,
  });
  for (const item of items) {
    tx.set(orderRef.collection('items').doc(), item);
  }
  return orderRef.id;
}

/**
 * `FulfillmentBatchService.createFulfillmentBatch()`'s per-order write,
 * applied inside the same transaction as the batch doc itself (§
 * Fulfillment Batches) — every batched order gets its allocation in
 * the same atomic write as the batch that owns it, never a separate
 * later step that could partially fail.
 */
export function applyFulfillmentAllocationInTransaction(
  tx: Transaction,
  orderId: string,
  fulfillmentBatchId: string,
  fulfillment: OrderFulfillment,
): void {
  const ref = adminFirestore.collection(COLLECTION).doc(orderId);
  tx.update(ref, {
    fulfillmentBatchId,
    fulfillment,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: 'system',
  });
}

class OrderRepository {
  async findById(orderId: string): Promise<Order | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(orderId).get();
    if (!snapshot.exists) {
      return null;
    }
    return snapshot.data() as Order;
  }

  async listItems(orderId: string): Promise<OrderItem[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .doc(orderId)
      .collection('items')
      .get();
    return snapshot.docs.map((doc) => doc.data() as OrderItem);
  }

  async updateStatus(
    orderId: string,
    status: OrderStatus,
    actor: string,
    reason?: string,
  ): Promise<void> {
    await adminFirestore
      .collection(COLLECTION)
      .doc(orderId)
      .update({
        status,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor,
        ...(reason !== undefined ? { statusReason: reason } : {}),
      });
  }

  /**
   * What the shop put in to complete each box
   * (§ staff complete the box).
   *
   * Writes the whole `product.items` array, because the curated snacks
   * belong to the box they complete and the box is the line. An order
   * placed before line items existed gains one here — every reader
   * already goes through `orderLines()`, which reconstructs exactly
   * that single line, so nothing sees a change it does not already
   * handle.
   *
   * `guaranteedPicks` on each line is carried through untouched. The
   * customer's promise is not this call's to edit.
   */
  async recordCuratedSnacks(orderId: string, items: CheckoutLineItem[], actor: string): Promise<void> {
    await adminFirestore
      .collection(COLLECTION)
      .doc(orderId)
      .update({
        'product.items': items,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor,
      });
  }

  /**
   * What this box really cost to fulfil, from the person who packed it
   * (§ fulfilment records the real cost).
   *
   * Overwrites rather than appends: a packer correcting a figure they
   * mistyped is the common case, and a history of wrong numbers helps
   * nobody. Who entered it and when are recorded, so the correction is
   * still attributable.
   */
  async recordCosts(
    orderId: string,
    costs: {
      goodsCostKes: number;
      otherCostKes: number;
      note: string | null;
      recordedBy: string;
      recordedByName: string;
    },
  ): Promise<void> {
    await adminFirestore
      .collection(COLLECTION)
      .doc(orderId)
      .update({
        costs: { ...costs, recordedAt: FieldValue.serverTimestamp() },
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: costs.recordedBy,
      });
  }

  /**
   * The money for a pay-on-delivery order has arrived (§ pay on
   * delivery) — the customer paid the prompt at the door.
   *
   * Clears `dueOnDelivery` rather than setting it false, so a settled
   * order is byte-identical to one that was paid up front and no
   * reader has to know both spellings of "paid".
   *
   * Guarded on the flag still being set, in the same transaction as
   * the write: two callbacks for one order — a real one and a
   * reconciliation sweep — must not both believe they are the one
   * settling it, or the deferred commission and wallet effects run
   * twice. Returns whether this call was the one that settled it.
   */
  async markPaidOnDelivery(
    orderId: string,
    payment: { paymentIntentId: string; mpesaReceiptNumber: string | null },
  ): Promise<boolean> {
    const ref = adminFirestore.collection(COLLECTION).doc(orderId);
    return adminFirestore.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.data() as Order | undefined;
      if (!data || data.payment?.dueOnDelivery !== true) {
        return false;
      }
      tx.update(ref, {
        'payment.dueOnDelivery': FieldValue.delete(),
        'payment.paymentIntentId': payment.paymentIntentId,
        'payment.mpesaReceiptNumber': payment.mpesaReceiptNumber,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: 'system',
      });
      return true;
    });
  }

  /**
   * Corrects the recorded details of a payment that arrived outside
   * Daraja (§ correcting a manually recorded payment).
   *
   * Only the details a human typed and can get wrong. The amount is
   * deliberately not among them: changing what an order cost after the
   * money arrived is not a correction, it is a different order, and it
   * belongs to the refund path.
   *
   * `mpesaReceiptNumber` moves with the reference because for a
   * customer-initiated M-Pesa transfer they are the same fact recorded
   * in two places — leaving the receipt behind is precisely how the
   * books stop reconciling.
   */
  async updateManualPayment(
    orderId: string,
    manualPayment: ManualPaymentRecord,
    mpesaReceiptNumber: string | null,
    actor: string,
  ): Promise<void> {
    await adminFirestore
      .collection(COLLECTION)
      .doc(orderId)
      .update({
        'payment.manualPayment': manualPayment,
        'payment.mpesaReceiptNumber': mpesaReceiptNumber,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor,
      });
  }

  /** A real, cheap total for the Admin dashboard (§ Admin: Dashboard). */
  async countByBusiness(businessId: string): Promise<number> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .count()
      .get();
    return snapshot.data().count;
  }

  /**
   * The Admin Orders list (§ Admin: Orders) — real cursor pagination,
   * ordered newest-first, optionally narrowed to one status. Needs a
   * composite index (businessId + status + createdAt, and businessId +
   * createdAt for the unfiltered case) — see firestore.indexes.json.
   */
  async listByBusiness(
    businessId: string,
    options: { status?: OrderStatus; limit?: number; cursor?: string } = {},
  ): Promise<{ orders: { id: string; data: Order }[]; nextCursor: string | null }> {
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
      orders: docs.map((doc) => ({ id: doc.id, data: doc.data() as Order })),
      nextCursor: hasMore ? docs[docs.length - 1].id : null,
    };
  }

  /** The order (if any) a given conversation resulted in — how the Human Sales Agent workspace finds "what did paying this conversation actually create" (§ Human Sales Agent workspace), e.g. to locate its shipment for manual courier booking. */
  async findByConversationId(businessId: string, conversationId: string): Promise<{ id: string; data: Order } | null> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('conversationId', '==', conversationId)
      .limit(1)
      .get();
    if (snapshot.empty) {
      return null;
    }
    const doc = snapshot.docs[0];
    return { id: doc.id, data: doc.data() as Order };
  }

  /**
   * Exact-match search by the customer's WhatsApp number — the one
   * identifier every order always has (§ Admin: Orders "Search
   * orders"), since a guest customer commonly has no name typo-proof
   * enough for prefix search to be reliable and no account id at all.
   */
  async searchByPhoneNumber(
    businessId: string,
    phoneNumber: string,
    limit = 25,
  ): Promise<{ id: string; data: Order }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('customer.phoneNumber', '==', phoneNumber)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as Order }));
  }

  /** Prefix search by customer name — the standard Firestore range-query trick, real (not client-side-only) filtering. */
  async searchByCustomerNamePrefix(
    businessId: string,
    prefix: string,
    limit = 25,
  ): Promise<{ id: string; data: Order }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('customer.customerName', '>=', prefix)
      .where('customer.customerName', '<', prefix + '')
      .orderBy('customer.customerName')
      .limit(limit)
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as Order }));
  }

  /**
   * The most recent orders old enough that the customer has plausibly
   * had their box (§ Mission 2 — review acquisition). Returns
   * candidates; `ReviewService` applies the "already asked" and
   * "already reviewed" filters, since those need the `reviews`
   * collection this repository has no business reading.
   *
   * `reviewRequestedAt` is deliberately *not* a query clause. Firestore
   * cannot match documents where a field is absent, and every order
   * predating that field has no such key — so filtering on it here
   * would silently hide exactly the backlog this queue exists to
   * surface. It is filtered in memory instead, over a bounded window,
   * the same tradeoff `businessAnalyticsService` already accepts.
   */
  async listReviewRequestCandidates(
    businessId: string,
    options: { placedBefore: Date; statuses: OrderStatus[]; limit?: number },
  ): Promise<{ id: string; data: Order }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('status', 'in', options.statuses)
      .where('createdAt', '<=', options.placedBefore)
      .orderBy('createdAt', 'desc')
      .limit(options.limit ?? 100)
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as Order }));
  }

  /** Records that a staff member asked this customer for a review. Idempotent by intent — asking twice just overwrites the timestamp. */
  async markReviewRequested(orderId: string, actor: string): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(orderId).update({
      reviewRequestedAt: FieldValue.serverTimestamp(),
      reviewRequestedBy: actor,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor,
    });
  }

  /**
   * Whether this phone number has a real, standing paid order — the
   * check behind a review's "Verified purchase" badge. Bounded to the
   * statuses the caller considers proof that money changed hands and
   * the order still stands.
   */
  async findPaidOrderForPhone(
    businessId: string,
    phoneNumber: string,
    statuses: OrderStatus[],
  ): Promise<{ id: string } | null> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('customer.phoneNumber', '==', phoneNumber)
      .where('status', 'in', statuses)
      .limit(1)
      .get();
    return snapshot.empty ? null : { id: snapshot.docs[0].id };
  }
}

export const orderRepository = new OrderRepository();
