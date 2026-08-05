import 'server-only';

import { adminFirestore } from '@/lib/firebase/admin';
import {
  fulfillmentBatchRepository,
  createInTransaction as createFulfillmentBatchInTransaction,
  type FulfillmentBatchInput,
} from '@/repositories/fulfillmentBatchRepository';
import { applyFulfillmentAllocationInTransaction } from '@/repositories/orderRepository';
import { OrderNotFoundError } from '@/services/orderService';
import { allocateEqualSplit } from '@/lib/fulfillmentBatches/allocation';
import { BATCHABLE_ORDER_STATUSES } from '@/lib/fulfillmentBatches/eligibility';
import { publishEvent } from '@/lib/events/eventBus';
import type { FulfillmentBatch, Order, OrderStatus } from '@/types';

export { OrderNotFoundError };

export class FulfillmentBatchNotFoundError extends Error {
  constructor(batchId: string) {
    super(`Fulfillment batch ${batchId} not found`);
    this.name = 'FulfillmentBatchNotFoundError';
  }
}

export class InvalidFulfillmentBatchInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidFulfillmentBatchInputError';
  }
}

export class OrderAlreadyBatchedError extends Error {
  constructor(orderId: string) {
    super(`Order ${orderId} is already part of a fulfillment batch`);
    this.name = 'OrderAlreadyBatchedError';
  }
}

export class OrderNotEligibleForBatchError extends Error {
  constructor(orderId: string, status: OrderStatus) {
    super(`Order ${orderId} cannot be batched — status is "${status}"`);
    this.name = 'OrderNotEligibleForBatchError';
  }
}

export interface CreateFulfillmentBatchInput {
  orderIds: string[];
  productsPurchasedKes: number;
  packagingKes?: number;
  deliveryKes?: number;
  miscKes?: number;
  notes?: string;
}

function requireNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new InvalidFulfillmentBatchInputError(`"${label}" must be a non-negative number.`);
  }
}

/**
 * Owns Fulfillment Batches (§ Fulfillment Batches) — one real shopping
 * trip that covers several orders at once, and the equal-split
 * cost/profit allocation each of those orders gets from it.
 */
class FulfillmentBatchService {
  /**
   * Reads every order first, then writes the batch and every order's
   * allocation together in one transaction — Firestore requires every
   * read before any write, and this codebase's own discipline
   * (`PurchaseOrderService.receivePurchaseOrder()`) is to never let a
   * batch and its per-order effects land as separate, partially-
   * failable steps.
   */
  async createFulfillmentBatch(businessId: string, input: CreateFulfillmentBatchInput, actor: string): Promise<string> {
    const orderIds = Array.from(new Set(input.orderIds));
    if (orderIds.length === 0) {
      throw new InvalidFulfillmentBatchInputError('At least one order is required.');
    }
    requireNonNegativeFinite(input.productsPurchasedKes, 'Products purchased');
    const packagingKes = input.packagingKes ?? 0;
    const deliveryKes = input.deliveryKes ?? 0;
    const miscKes = input.miscKes ?? 0;
    requireNonNegativeFinite(packagingKes, 'Packaging');
    requireNonNegativeFinite(deliveryKes, 'Delivery');
    requireNonNegativeFinite(miscKes, 'Misc');

    const totalCostKes = input.productsPurchasedKes + packagingKes + deliveryKes + miscKes;
    const allocations = allocateEqualSplit(totalCostKes, orderIds);

    const batchId = await adminFirestore.runTransaction(async (tx) => {
      const orderRefs = orderIds.map((orderId) => adminFirestore.collection('orders').doc(orderId));
      const orderSnapshots = await Promise.all(orderRefs.map((ref) => tx.get(ref)));

      const orders: { id: string; data: Order }[] = [];
      orderSnapshots.forEach((snapshot, index) => {
        const orderId = orderIds[index];
        if (!snapshot.exists) {
          throw new OrderNotFoundError(orderId);
        }
        const data = snapshot.data() as Order;
        if (data.businessId !== businessId) {
          throw new OrderNotFoundError(orderId);
        }
        if (data.fulfillmentBatchId !== null) {
          throw new OrderAlreadyBatchedError(orderId);
        }
        if (!BATCHABLE_ORDER_STATUSES.includes(data.status)) {
          throw new OrderNotEligibleForBatchError(orderId, data.status);
        }
        orders.push({ id: orderId, data });
      });

      const totalRevenueKes = orders.reduce((sum, order) => sum + order.data.pricing.totalKes, 0);
      const grossProfitKes = totalRevenueKes - totalCostKes;
      const profitMarginPct = totalRevenueKes > 0 ? (grossProfitKes / totalRevenueKes) * 100 : 0;

      const batchInput: FulfillmentBatchInput = {
        businessId,
        orderIds,
        orderCount: orderIds.length,
        totalRevenueKes,
        costs: { productsPurchasedKes: input.productsPurchasedKes, packagingKes, deliveryKes, miscKes, totalCostKes },
        grossProfitKes,
        profitMarginPct,
        notes: input.notes?.trim() ?? '',
      };
      const newBatchId = createFulfillmentBatchInTransaction(tx, batchInput, actor);

      for (const order of orders) {
        const allocatedCostKes = allocations[order.id];
        applyFulfillmentAllocationInTransaction(tx, order.id, newBatchId, {
          allocatedCostKes,
          orderRevenueKes: order.data.pricing.totalKes,
          estimatedProfitKes: order.data.pricing.totalKes - allocatedCostKes,
        });
      }

      return newBatchId;
    });

    await publishEvent(businessId, 'FulfillmentBatchClosed', 'fulfillmentBatch', batchId, {
      orderCount: orderIds.length,
      totalCostKes,
    });

    return batchId;
  }

  async getFulfillmentBatchWithOrders(
    businessId: string,
    batchId: string,
  ): Promise<{ batch: FulfillmentBatch; orders: { id: string; data: Order }[] }> {
    const batch = await fulfillmentBatchRepository.findById(businessId, batchId);
    if (!batch) {
      throw new FulfillmentBatchNotFoundError(batchId);
    }
    const snapshots = await Promise.all(
      batch.orderIds.map((orderId) => adminFirestore.collection('orders').doc(orderId).get()),
    );
    const orders = snapshots
      .map((snapshot, index) => ({ id: batch.orderIds[index], data: snapshot.data() as Order | undefined }))
      .filter((entry): entry is { id: string; data: Order } => Boolean(entry.data) && entry.data!.businessId === businessId);
    return { batch, orders };
  }
}

export const fulfillmentBatchService = new FulfillmentBatchService();
export { FulfillmentBatchService };
