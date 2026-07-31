import 'server-only';

import { adminFirestore } from '@/lib/firebase/admin';
import { createInTransaction as createOrderInTransaction } from '@/repositories/orderRepository';
import { reserveStockInTransaction } from '@/repositories/packageRepository';
import { publishEvent } from '@/lib/events/eventBus';
import type { ConversationCheckoutSnapshot } from '@/types';

/**
 * Owns order finalization (PLATFORM_ARCHITECTURE_V2.md §14/§16): an
 * order only ever exists as the result of a succeeded payment, never
 * created any other way. Order creation and inventory reservation run
 * in the same Firestore transaction — a payment can never result in an
 * order without a matching stock decrement, or vice versa.
 */

export interface CreateOrderInput {
  snapshotId: string;
  snapshot: ConversationCheckoutSnapshot;
  paymentIntentId: string;
}

class OrderService {
  async createFromConversationSnapshot(input: CreateOrderInput): Promise<string> {
    const { snapshotId, snapshot, paymentIntentId } = input;

    const deliveryAddress =
      snapshot.deliveryMethod === 'door_delivery'
        ? `${snapshot.county} (door delivery)`
        : `${snapshot.county} — Jumia pickup station`;

    const orderId = await adminFirestore.runTransaction(async (tx) => {
      // Stock check/decrement first — if this throws (OutOfStockError),
      // the whole transaction aborts and no order is created.
      await reserveStockInTransaction(tx, snapshot.packageId);

      return createOrderInTransaction(
        tx,
        {
          customerId: snapshot.customerId,
          phoneNumber: snapshot.phoneNumber,
          customerName: snapshot.customerName,
          county: snapshot.county,
          conversationId: snapshot.conversationId,
          conversationCheckoutSnapshotId: snapshotId,
          paymentIntentId,
          packageId: snapshot.packageId,
          totalAmountKes: snapshot.totalKes,
          creditsUsedKes: 0,
          deliveryMethod: snapshot.deliveryMethod,
          deliveryAddress,
          referralLinkId: snapshot.referralLinkId,
          createdBy: 'system',
        },
        [
          {
            packageId: snapshot.packageId,
            packageLabel: snapshot.packageLabel,
            quantity: 1,
            unitCostKes: snapshot.subtotalKes,
          },
        ],
      );
    });

    await publishEvent('OrderCreated', 'order', orderId, {
      conversationId: snapshot.conversationId,
      totalKes: snapshot.totalKes,
    });

    return orderId;
  }
}

export const orderService = new OrderService();
