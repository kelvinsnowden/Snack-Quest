import 'server-only';

import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { Order, OrderFulfillment, OrderItem, OrderStatus } from '@/types';

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
}

export const orderRepository = new OrderRepository();
