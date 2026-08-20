import 'server-only';

import { adminFirestore } from '@/lib/firebase/admin';
import {
  createInTransaction as createOrderInTransaction,
  orderNumberCounterRef,
  orderRepository,
} from '@/repositories/orderRepository';
import { reserveStockInTransaction } from '@/repositories/packageRepository';
import { publishEvent } from '@/lib/events/eventBus';
import { notificationService } from '@/services/notificationService';
import { VALID_ORDER_TRANSITIONS } from '@/lib/orders/transitions';
import { formatOrderNumber } from '@/lib/orders/format';
import type {
  ConversationCheckoutSnapshot,
  ConversionAttribution,
  ManualPaymentRecord,
  Order,
  OrderStatus,
} from '@/types';

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
  /**
   * The real Safaricom receipt for a Daraja-settled order. Empty for a
   * manually-recorded payment with no M-Pesa code behind it (cash, bank
   * transfer) — never a placeholder that would read as a receipt to a
   * downstream report; see `manualPayment` below.
   */
  mpesaReceiptNumber: string;
  /**
   * Set only when a super admin recorded that payment already arrived
   * outside Daraja (§ super-admin manual payment orders). Its presence
   * is what distinguishes an asserted payment from a verified one on
   * the order itself, without a join back to `paymentIntents`.
   */
  manualPayment?: ManualPaymentRecord | null;
  /** `Conversation.attributionSnapshot` (§ close the loop: ad-conversion attribution) — copied onto the order verbatim, null for a native WhatsApp-originated conversation. */
  attribution: ConversionAttribution | null;
}

export class OrderNotFoundError extends Error {
  constructor(orderId: string) {
    super(`Order ${orderId} not found`);
    this.name = 'OrderNotFoundError';
  }
}

export class InvalidOrderTransitionError extends Error {
  constructor(from: OrderStatus, to: OrderStatus) {
    super(`Cannot move an order from '${from}' to '${to}'`);
    this.name = 'InvalidOrderTransitionError';
  }
}

class OrderService {
  async createFromConversationSnapshot(input: CreateOrderInput): Promise<{ orderId: string; orderNumber: number }> {
    const { snapshotId, snapshot, paymentIntentId, mpesaReceiptNumber, manualPayment, attribution } = input;

    // Absent on every snapshot frozen before the website checkout
    // existed, and on every WhatsApp one since — a conversation can
    // only ever buy one box.
    const quantity = snapshot.quantity ?? 1;

    const { orderId, orderNumber } = await adminFirestore.runTransaction(async (tx) => {
      // Read before any write anywhere in this transaction — Firestore
      // requires it. Reading the counter here, ahead of
      // `reserveStockInTransaction`'s own read+write, is what makes it
      // legal to write the counter's new value after that call: by
      // then both reads (counter, stock) are already done, and only
      // writes remain (stock, counter, order, items).
      const counterRef = orderNumberCounterRef(snapshot.businessId);
      const counterSnap = await tx.get(counterRef);
      const orderNumber = ((counterSnap.data()?.value as number | undefined) ?? 0) + 1;

      // Stock check/decrement — if this throws (OutOfStockError), the
      // whole transaction aborts and neither the counter nor the order
      // is written.
      await reserveStockInTransaction(tx, snapshot.packageId, quantity);

      tx.set(counterRef, { value: orderNumber }, { merge: true });

      const orderId = createOrderInTransaction(
        tx,
        {
          businessId: snapshot.businessId,
          orderNumber,
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
            // Normalised to null rather than stored as '' — an empty
            // string would render as a blank receipt field in Admin
            // instead of the honest "no receipt" this represents.
            mpesaReceiptNumber: mpesaReceiptNumber || null,
            manualPayment: manualPayment ?? null,
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
          attribution: (attribution as Record<string, unknown> | null) ?? null,
          fulfillmentBatchId: null,
          fulfillment: null,
          packingRecipeVersionId: null,
          packing: null,
          createdBy: 'system',
        },
        [
          {
            packageId: snapshot.packageId,
            packageLabel: snapshot.packageLabel,
            quantity,
            // `subtotalKes` is the extended amount, so the unit price
            // has to be divided back out — a line item recording the
            // whole subtotal as its unit cost would overstate revenue
            // per unit by `quantity`x everywhere it's read.
            unitCostKes: Math.round(snapshot.subtotalKes / quantity),
          },
        ],
      );

      return { orderId, orderNumber };
    });

    await publishEvent(snapshot.businessId, 'OrderCreated', 'order', orderId, {
      conversationId: snapshot.conversationId,
      totalKes: snapshot.totalKes,
      orderNumber,
    });

    return { orderId, orderNumber };
  }

  /**
   * Every admin status change (§ Admin: Orders "Update status /
   * Dispatch / Complete / Cancel / Refund") goes through here, never
   * a direct `orderRepository.updateStatus()` call from a route —
   * this is the one place transition legality is enforced and the
   * audit event is published, so a route/Server Action can never skip
   * either by mistake.
   */
  async updateStatus(
    businessId: string,
    orderId: string,
    next: OrderStatus,
    actor: string,
    reason?: string,
  ): Promise<Order> {
    const order = await orderRepository.findById(orderId);
    if (!order || order.businessId !== businessId) {
      throw new OrderNotFoundError(orderId);
    }
    if (!VALID_ORDER_TRANSITIONS[order.status].includes(next)) {
      throw new InvalidOrderTransitionError(order.status, next);
    }

    await orderRepository.updateStatus(orderId, next, actor, reason);
    await publishEvent(businessId, 'OrderStatusChanged', 'order', orderId, {
      from: order.status,
      to: next,
      actor,
      reason: reason ?? null,
    });

    /*
     * Shipment SMS, sent from the one chokepoint every admin status
     * change already goes through — a route that dispatched an order
     * without texting the customer would have to bypass this method,
     * which this method's own doc comment above exists to prevent.
     *
     * Guarded on the transition, not the resulting status: re-saving an
     * already-dispatched order must not text again. `dedupeKey` makes
     * that a second, independent guarantee rather than relying on the
     * transition table alone.
     *
     * Best-effort by design. The status change is already committed and
     * is the real source of truth; a texting failure is recorded on
     * `outboundMessages` for the retry sweep and must never roll back
     * or fail a dispatch a staff member just performed.
     */
    if (next === 'dispatched') {
      try {
        await notificationService.send(businessId, {
          channel: 'sms',
          templateCode: 'order_dispatched_sms',
          recipientType: 'customer',
          recipientId: orderId,
          recipientRef: order.customer.phoneNumber,
          params: {
            orderRef: order.orderNumber ? formatOrderNumber(order.orderNumber) : orderId,
          },
          dedupeKey: `order-dispatched:${orderId}`,
        });
      } catch (error) {
        await publishEvent(businessId, 'OrderDispatchedSmsFailed', 'order', orderId, {
          reason: error instanceof Error ? error.message : 'unknown error',
        });
      }
    }

    return { ...order, status: next };
  }
}

export const orderService = new OrderService();
