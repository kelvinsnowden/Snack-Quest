import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import {
  createInTransaction as createOrderInTransaction,
  orderNumberCounterRef,
  orderRepository,
} from '@/repositories/orderRepository';
import { OutOfStockError, reserveStockInTransaction } from '@/repositories/packageRepository';
import { publishEvent } from '@/lib/events/eventBus';
import { notificationService } from '@/services/notificationService';
import { formatPaymentReference } from '@/services/conversationService';
import { outboundMessageRepository } from '@/repositories/outboundMessageRepository';
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
 * by a human agent (Fargo door
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
            // Absent rather than `[]` for a curated box — Firestore
            // rejects `undefined`, and an empty array would read as
            // "picked nothing" rather than "nothing to pick".
            ...(snapshot.guaranteedPicks?.length ? { guaranteedPicks: snapshot.guaranteedPicks } : {}),
          },
          customer: {
            customerId: snapshot.customerId,
            phoneNumber: snapshot.phoneNumber,
            customerName: snapshot.customerName,
            // Absent key rather than `undefined`, which Firestore
            // rejects outright — most orders have no email, since the
            // field is optional and WhatsApp orders never collect one.
            ...(snapshot.customerEmail ? { email: snapshot.customerEmail } : {}),
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

  /**
   * Sends the order confirmation text on demand (§ manual confirmation
   * SMS) — the other half of not sending it automatically for an order
   * recorded by hand.
   *
   * Staff place those orders while they are still with the customer, so
   * the text goes out when they say so rather than the instant they hit
   * save. This is that moment.
   *
   * Shares `order-confirmed:{orderId}` with the automatic path, so an
   * order can only ever produce one confirmation text however it was
   * paid, and a double-tap on the button cannot send a second. Already
   * sent is reported back rather than silently swallowed — a staff
   * member pressing send deserves to know whether anything left.
   */
  async sendConfirmationSms(
    businessId: string,
    orderId: string,
  ): Promise<{ sent: boolean; reason?: string }> {
    const order = await orderRepository.findById(orderId);
    if (!order || order.businessId !== businessId) {
      return { sent: false, reason: 'Order not found' };
    }

    const dedupeId = `sms:order-confirmed:${orderId}`;
    const existing = await outboundMessageRepository.findById(dedupeId);
    if (existing) {
      return {
        sent: false,
        reason:
          existing.status === 'failed'
            ? 'A confirmation text was already attempted and failed — the retry sweep will pick it up.'
            : 'The customer has already been sent a confirmation text for this order.',
      };
    }

    await notificationService.send(businessId, {
      channel: 'sms',
      templateCode: 'order_confirmed_sms',
      recipientType: 'customer',
      recipientId: orderId,
      recipientRef: order.customer.phoneNumber,
      params: {
        orderRef: order.orderNumber ? formatOrderNumber(order.orderNumber) : orderId,
        // What the order is worth now, which is what the customer
        // should be told — a corrected box changes this.
        totalKes: String(order.pricing.totalKes),
        paymentRef: formatPaymentReference(order.payment.mpesaReceiptNumber, order.payment.manualPayment),
      },
      dedupeKey: `order-confirmed:${orderId}`,
    });

    await publishEvent(businessId, 'OrderConfirmationSmsSentManually', 'order', orderId, {
      phoneNumber: order.customer.phoneNumber,
    });

    return { sent: true };
  }

  /**
   * Changes which box a paid order is for (§ correcting the box on an
   * order) — the wrong one picked while recording a sale by hand.
   *
   * Everything that has to move, moves together in one transaction:
   * the old box's stock goes back, the new box's comes out, the line
   * item is rewritten and the total is recomputed. Doing any of those
   * outside the transaction is how an order ends up promising a box
   * the warehouse does not have.
   *
   * What it will not do is silently balance the books. The money that
   * arrived is a fact and does not change because somebody picked the
   * wrong box, so when the new total differs, the difference is
   * recorded as `amountPaidKes` and surfaced as a balance to collect
   * or refund. Rewriting the total to match what was paid would be the
   * easy version and would quietly turn a 1,000-shilling shortfall
   * into a discount nobody approved.
   *
   * Delivery fee, discount and any wallet credit are left alone: they
   * were priced against this customer and this address, and none of
   * them is what was picked wrong.
   */
  async changeBox(input: {
    businessId: string;
    orderId: string;
    packageId: string;
    quantity: number;
    changedByUid: string;
  }): Promise<
    | { changed: true; before: { packageLabel: string; totalKes: number }; after: { packageLabel: string; totalKes: number }; amountPaidKes: number; balanceKes: number }
    | { changed: false; reason: string }
  > {
    const quantity = Math.trunc(input.quantity);
    if (!Number.isFinite(quantity) || quantity < 1) {
      return { changed: false, reason: 'Quantity must be at least 1.' };
    }

    try {
      const result = await adminFirestore.runTransaction(async (tx) => {
        const orderRef = adminFirestore.collection('orders').doc(input.orderId);
        const newPackageRef = adminFirestore.collection('packages').doc(input.packageId);

        // Every read first — Firestore forbids a read after a write in
        // the same transaction, and there are three of them here.
        const [orderSnap, newPackageSnap] = await Promise.all([tx.get(orderRef), tx.get(newPackageRef)]);
        const order = orderSnap.data() as Order | undefined;
        if (!order || order.businessId !== input.businessId) {
          return { changed: false as const, reason: 'Order not found' };
        }
        if (order.status === 'refunded' || order.status === 'cancelled') {
          // A box that is not going anywhere is not a box to correct.
          return { changed: false as const, reason: `This order is ${order.status} — the box cannot be changed.` };
        }
        const newPackage = newPackageSnap.data() as { name?: string; priceKes?: number; stockCount?: number } | undefined;
        if (!newPackageSnap.exists || typeof newPackage?.priceKes !== 'number') {
          return { changed: false as const, reason: 'That box does not exist.' };
        }

        const itemsSnap = await tx.get(orderRef.collection('items'));
        const previousItems = itemsSnap.docs.map((doc) => doc.data() as { packageId: string; quantity: number });

        const oldPackageId = order.product.packageId;
        const oldPackageRef = adminFirestore.collection('packages').doc(oldPackageId);
        const oldPackageSnap = oldPackageId === input.packageId ? newPackageSnap : await tx.get(oldPackageRef);
        const oldPackage = oldPackageSnap.data() as { stockCount?: number } | undefined;

        // Net the two movements when it is the same box — reading it
        // once and writing twice would lose the first write.
        const previousQuantity = previousItems.reduce((sum, item) => sum + (item.quantity ?? 0), 0) || 1;
        if (oldPackageId === input.packageId) {
          if (newPackage.stockCount !== undefined) {
            const available = newPackage.stockCount + previousQuantity;
            if (available < quantity) {
              throw new OutOfStockError(input.packageId);
            }
            tx.update(newPackageRef, { stockCount: available - quantity });
          }
        } else {
          if (newPackage.stockCount !== undefined) {
            if (newPackage.stockCount < quantity) {
              throw new OutOfStockError(input.packageId);
            }
            tx.update(newPackageRef, { stockCount: newPackage.stockCount - quantity });
          }
          if (oldPackage?.stockCount !== undefined) {
            tx.update(oldPackageRef, { stockCount: oldPackage.stockCount + previousQuantity });
          }
        }

        const packageLabel = newPackage.name ?? 'Box';
        const subtotalKes = newPackage.priceKes * quantity;
        const totalKes =
          subtotalKes - order.pricing.discountKes - order.pricing.creditsUsedKes + order.pricing.deliveryFeeKes;
        // What was actually received. Already-corrected orders keep
        // their original figure rather than compounding.
        const amountPaidKes = order.pricing.amountPaidKes ?? order.pricing.totalKes;

        itemsSnap.docs.forEach((doc) => tx.delete(doc.ref));
        tx.set(orderRef.collection('items').doc(), {
          packageId: input.packageId,
          packageLabel,
          quantity,
          unitCostKes: newPackage.priceKes,
        });

        tx.update(orderRef, {
          'product.packageId': input.packageId,
          'product.packageLabel': packageLabel,
          'pricing.subtotalKes': subtotalKes,
          'pricing.totalKes': totalKes,
          // Recorded even when it equals the total, so a corrected
          // order always states what arrived rather than leaving it to
          // be inferred.
          'pricing.amountPaidKes': amountPaidKes,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: input.changedByUid,
        });

        return {
          changed: true as const,
          before: { packageLabel: order.product.packageLabel, totalKes: order.pricing.totalKes },
          after: { packageLabel, totalKes },
          amountPaidKes,
          balanceKes: amountPaidKes - totalKes,
        };
      });

      if (result.changed) {
        await publishEvent(input.businessId, 'OrderBoxChanged', 'order', input.orderId, {
          packageId: input.packageId,
          quantity,
          totalKes: result.after.totalKes,
          balanceKes: result.balanceKes,
          changedByUid: input.changedByUid,
        });
      }
      return result;
    } catch (error) {
      if (error instanceof OutOfStockError) {
        return { changed: false, reason: 'That box is out of stock — the order was left as it was.' };
      }
      throw error;
    }
  }
}

export const orderService = new OrderService();
