import 'server-only';

import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { Order, OrderItem, OrderStatus } from '@/types';

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
  'status' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'updatedBy'
> & {
  createdBy: string;
};

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

  async updateStatus(orderId: string, status: OrderStatus): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(orderId).update({
      status,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
}

export const orderRepository = new OrderRepository();
