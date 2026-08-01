import 'server-only';

import { supplierRepository, type SupplierInput } from '@/repositories/supplierRepository';
import type { Supplier } from '@/types';

export class SupplierNotFoundError extends Error {
  constructor(supplierId: string) {
    super(`Supplier ${supplierId} not found`);
    this.name = 'SupplierNotFoundError';
  }
}

export class InvalidSupplierInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSupplierInputError';
  }
}

function validate(input: { name: string; contactName: string; phone: string }): void {
  if (!input.name.trim()) {
    throw new InvalidSupplierInputError('"name" is required.');
  }
  if (!input.contactName.trim()) {
    throw new InvalidSupplierInputError('"contactName" is required.');
  }
  if (!input.phone.trim()) {
    throw new InvalidSupplierInputError('"phone" is required.');
  }
}

/**
 * Owns the supplier directory (§ Inventory: batches, purchase orders,
 * suppliers, movements, low-stock alerts, expiry, audit trail) — thin
 * on purpose, since a supplier is reference data a purchase order
 * points to, not a stateful workflow like `PurchaseOrderService`.
 */
class SupplierService {
  async createSupplier(
    businessId: string,
    input: { name: string; contactName: string; phone: string; email?: string | null; notes?: string },
    actor: string,
  ): Promise<string> {
    validate(input);
    return supplierRepository.create(
      {
        businessId,
        name: input.name.trim(),
        contactName: input.contactName.trim(),
        phone: input.phone.trim(),
        email: input.email?.trim() || null,
        notes: input.notes?.trim() ?? '',
        isActive: true,
      },
      actor,
    );
  }

  async updateSupplier(
    businessId: string,
    supplierId: string,
    patch: Partial<{ name: string; contactName: string; phone: string; email: string | null; notes: string; isActive: boolean }>,
    actor: string,
  ): Promise<void> {
    const existing = await supplierRepository.findById(businessId, supplierId);
    if (!existing) {
      throw new SupplierNotFoundError(supplierId);
    }
    if (patch.name !== undefined || patch.contactName !== undefined || patch.phone !== undefined) {
      validate({
        name: patch.name ?? existing.name,
        contactName: patch.contactName ?? existing.contactName,
        phone: patch.phone ?? existing.phone,
      });
    }
    await supplierRepository.update(supplierId, patch as Partial<SupplierInput>, actor);
  }

  async listSuppliers(businessId: string, options: { activeOnly?: boolean } = {}): Promise<{ id: string; data: Supplier }[]> {
    return supplierRepository.listByBusiness(businessId, options);
  }
}

export const supplierService = new SupplierService();
export { SupplierService };
