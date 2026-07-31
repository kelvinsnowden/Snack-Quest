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
 *
 * `snapshot.delivery` is copied onto the order as-is — the snapshot is
 * already the single source of truth for method/provider/fee/tracking
 * URL by the time payment succeeds, whether it was priced
 * automatically (Jumia pickup) or by a human agent (Bolt door
 * delivery); this Service never re-derives delivery details itself.
 */

export interface CreateOrderInput {
  snapshotId: string;
  snapshot: ConversationCheckoutSnapshot;
  paymentIntentId: string;
  mpesaReceiptNumber: string;
}

class OrderService {
  async createFromConversationSnapshot(input: CreateOrderInput): Promise<string> {
    const { snapshotId, snapshot, paymentIntentId, mpesaReceiptNumber } = input;

    const orderId = await adminFirestore.runTransaction(async (tx) => {
      // Stock check/decrement first — if this throws (OutOfStockError),
      // the whole transaction aborts and no order is created.
      await reserveStockInTransaction(tx, snapshot.packageId);

      return createOrderInTransaction(
        tx,
        {
          businessId: snapshot.businessId,
          product: {
            packageId: snapshot.packageId,
            packageLabel: snapshot.packageLabel,
          },
          customer: {
            customerId: snapshot.customerId,
            phoneNumber: snapshot.phoneNumber,
            customerName: snapshot.customerName,
            county: snapshot.county,
          },
          delivery: snapshot.delivery,
          payment: {
            paymentIntentId,
            mpesaReceiptNumber,
          },
          pricing: {
            subtotalKes: snapshot.subtotalKes,
            discountKes: snapshot.discountKes,
            deliveryFeeKes: snapshot.deliveryFeeKes,
            creditsUsedKes: 0,
            totalKes: snapshot.totalKes,
          },
          conversationId: snapshot.conversationId,
          conversationCheckoutSnapshotId: snapshotId,
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

    await publishEvent(snapshot.businessId, 'OrderCreated', 'order', orderId, {
      conversationId: snapshot.conversationId,
      totalKes: snapshot.totalKes,
    });

    return orderId;
  }
}

export const orderService = new OrderService();
