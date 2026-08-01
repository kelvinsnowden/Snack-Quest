import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { purchaseOrderRepository, auditEntry, type PurchaseOrderInput } from '@/repositories/purchaseOrderRepository';
import { supplierRepository } from '@/repositories/supplierRepository';
import { packageRepository } from '@/repositories/packageRepository';
import { createInTransaction as createBatchInTransaction } from '@/repositories/inventoryBatchRepository';
import { createInTransaction as createMovementInTransaction } from '@/repositories/inventoryMovementRepository';
import { publishEvent } from '@/lib/events/eventBus';
import type { PurchaseOrder, PurchaseOrderLineItem, InventoryBatch, Package } from '@/types';

export class PurchaseOrderNotFoundError extends Error {
  constructor(purchaseOrderId: string) {
    super(`Purchase order ${purchaseOrderId} not found`);
    this.name = 'PurchaseOrderNotFoundError';
  }
}

export class InvalidPurchaseOrderInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPurchaseOrderInputError';
  }
}

export class InvalidPurchaseOrderTransitionError extends Error {
  constructor(from: PurchaseOrder['status'], to: string) {
    super(`Cannot move a purchase order from "${from}" to "${to}"`);
    this.name = 'InvalidPurchaseOrderTransitionError';
  }
}

export interface CreatePurchaseOrderLineItemInput {
  packageId: string;
  quantity: number;
  unitCostKes: number;
}

async function validateLineItems(
  businessId: string,
  lineItems: CreatePurchaseOrderLineItemInput[],
): Promise<{ resolved: PurchaseOrderLineItem[]; totalCostKes: number; packagesById: Map<string, Package> }> {
  if (lineItems.length === 0) {
    throw new InvalidPurchaseOrderInputError('At least one line item is required.');
  }
  const seenPackageIds = new Set<string>();
  const resolved: PurchaseOrderLineItem[] = [];
  const packagesById = new Map<string, Package>();
  let totalCostKes = 0;

  for (const item of lineItems) {
    if (seenPackageIds.has(item.packageId)) {
      throw new InvalidPurchaseOrderInputError('Each product can only appear once per purchase order.');
    }
    seenPackageIds.add(item.packageId);

    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new InvalidPurchaseOrderInputError('Each line item\'s quantity must be a positive whole number.');
    }
    if (!Number.isFinite(item.unitCostKes) || item.unitCostKes < 0) {
      throw new InvalidPurchaseOrderInputError('Each line item\'s unit cost must be a non-negative number.');
    }

    const product = await packageRepository.findById(businessId, item.packageId);
    if (!product) {
      throw new InvalidPurchaseOrderInputError(`Product ${item.packageId} not found.`);
    }
    packagesById.set(item.packageId, product);

    resolved.push({
      packageId: item.packageId,
      description: product.name,
      quantity: item.quantity,
      unitCostKes: item.unitCostKes,
    });
    totalCostKes += item.quantity * item.unitCostKes;
  }

  return { resolved, totalCostKes, packagesById };
}

/**
 * Owns the purchase-order lifecycle: draft → ordered → received (or
 * cancelled) — the real path stock enters this platform through
 * (§ Inventory: batches, purchase orders, suppliers, movements,
 * low-stock alerts, expiry, audit trail). `receivePurchaseOrder` is
 * the one place a PO turns into real inventory: one `inventoryBatch` +
 * one `inventoryMovements` entry per line item, plus each line item's
 * `packages.stockCount` increment, all inside a single transaction.
 */
class PurchaseOrderService {
  async createPurchaseOrder(
    businessId: string,
    input: { supplierId: string; lineItems: CreatePurchaseOrderLineItemInput[]; expectedDeliveryAt?: string | null; notes?: string },
    actor: string,
  ): Promise<string> {
    const supplier = await supplierRepository.findById(businessId, input.supplierId);
    if (!supplier) {
      throw new InvalidPurchaseOrderInputError(`Supplier ${input.supplierId} not found.`);
    }
    const { resolved, totalCostKes } = await validateLineItems(businessId, input.lineItems);

    const poInput: PurchaseOrderInput = {
      businessId,
      supplierId: input.supplierId,
      status: 'draft',
      lineItems: resolved,
      totalCostKes,
      expectedDeliveryAt: input.expectedDeliveryAt ? (new Date(input.expectedDeliveryAt) as unknown as PurchaseOrder['expectedDeliveryAt']) : null,
      orderedAt: null,
      receivedAt: null,
      cancelledAt: null,
      notes: input.notes?.trim() ?? '',
      auditTrail: [auditEntry('created', actor)],
    };
    return purchaseOrderRepository.create(poInput, actor);
  }

  private async requireByStatus(businessId: string, purchaseOrderId: string, allowed: PurchaseOrder['status'][]): Promise<PurchaseOrder> {
    const po = await purchaseOrderRepository.findById(businessId, purchaseOrderId);
    if (!po) {
      throw new PurchaseOrderNotFoundError(purchaseOrderId);
    }
    if (!allowed.includes(po.status)) {
      throw new InvalidPurchaseOrderTransitionError(po.status, allowed.join(' or '));
    }
    return po;
  }

  async markOrdered(businessId: string, purchaseOrderId: string, actor: string): Promise<void> {
    await this.requireByStatus(businessId, purchaseOrderId, ['draft']);
    await purchaseOrderRepository.applyTransition(
      purchaseOrderId,
      { status: 'ordered', orderedAt: FieldValue.serverTimestamp() as unknown as PurchaseOrder['orderedAt'] },
      auditEntry('ordered', actor),
      actor,
    );
    await publishEvent(businessId, 'PurchaseOrderOrdered', 'purchaseOrder', purchaseOrderId, {});
  }

  async cancelPurchaseOrder(businessId: string, purchaseOrderId: string, actor: string, reason?: string): Promise<void> {
    await this.requireByStatus(businessId, purchaseOrderId, ['draft', 'ordered']);
    await purchaseOrderRepository.applyTransition(
      purchaseOrderId,
      { status: 'cancelled', cancelledAt: FieldValue.serverTimestamp() as unknown as PurchaseOrder['cancelledAt'] },
      auditEntry('cancelled', actor, reason),
      actor,
    );
    await publishEvent(businessId, 'PurchaseOrderCancelled', 'purchaseOrder', purchaseOrderId, { reason: reason ?? null });
  }

  /**
   * Turns an `ordered` PO into real stock — one batch + one movement
   * per line item, plus that line item's `stockCount` increment, in
   * one transaction. `expiresAtByPackageId` is real expiry data read
   * off the physical delivery at receiving time (never guessed at PO
   * creation time, when it isn't known yet) — omitted or null for a
   * packageId whose goods have no real expiry.
   */
  async receivePurchaseOrder(
    businessId: string,
    purchaseOrderId: string,
    actor: string,
    expiresAtByPackageId: Record<string, string | null> = {},
  ): Promise<void> {
    const po = await this.requireByStatus(businessId, purchaseOrderId, ['ordered']);

    await adminFirestore.runTransaction(async (tx) => {
      // Firestore transactions require every read before any write — read
      // every line item's package first, then do all the writes below.
      // Reading each line item's package inside the same loop that also
      // writes would break the moment a second line item's read landed
      // after the first line item's write.
      const packageDataByPackageId = new Map<string, Package | undefined>();
      for (const item of po.lineItems) {
        const packageRef = adminFirestore.collection('packages').doc(item.packageId);
        const packageSnapshot = await tx.get(packageRef);
        packageDataByPackageId.set(item.packageId, packageSnapshot.data() as Package | undefined);
      }

      for (const item of po.lineItems) {
        const packageRef = adminFirestore.collection('packages').doc(item.packageId);
        const packageData = packageDataByPackageId.get(item.packageId);

        const expiresAtRaw = expiresAtByPackageId[item.packageId];
        const expiresAt = expiresAtRaw ? (new Date(expiresAtRaw) as unknown as InventoryBatch['expiresAt']) : null;

        const batchId = createBatchInTransaction(
          tx,
          {
            businessId,
            packageId: item.packageId,
            purchaseOrderId,
            supplierId: po.supplierId,
            quantityReceived: item.quantity,
            quantityRemaining: item.quantity,
            unitCostKes: item.unitCostKes,
            expiresAt,
            status: 'active',
            receivedAt: FieldValue.serverTimestamp() as unknown as InventoryBatch['receivedAt'],
          },
          actor,
        );

        let resultingStockCount: number | null = null;
        if (packageData && packageData.stockCount !== undefined) {
          resultingStockCount = packageData.stockCount + item.quantity;
          tx.update(packageRef, { stockCount: resultingStockCount, updatedAt: FieldValue.serverTimestamp() });
        }

        createMovementInTransaction(tx, {
          businessId,
          packageId: item.packageId,
          delta: item.quantity,
          resultingStockCount,
          reason: 'purchase_order_received',
          batchId,
          note: `Received from purchase order ${purchaseOrderId}`,
          actor,
        });
      }

      purchaseOrderRepository.applyTransitionInTransaction(
        tx,
        purchaseOrderId,
        { status: 'received', receivedAt: FieldValue.serverTimestamp() as unknown as PurchaseOrder['receivedAt'] },
        auditEntry('received', actor),
        actor,
      );
    });

    await publishEvent(businessId, 'PurchaseOrderReceived', 'purchaseOrder', purchaseOrderId, {
      lineItemCount: po.lineItems.length,
    });
  }
}

export const purchaseOrderService = new PurchaseOrderService();
export { PurchaseOrderService };
