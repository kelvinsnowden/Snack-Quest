import type { AuditFields } from './common';

/**
 * `suppliers/{supplierId}` — the vendor directory a purchase order is
 * placed against (§ Inventory: batches, purchase orders, suppliers,
 * movements, low-stock alerts, expiry, audit trail). Deliberately not
 * `isActive`-deleted from `purchaseOrders`/`inventoryBatches` history —
 * `isActive: false` just hides a discontinued supplier from the "new
 * purchase order" picker, the same soft-hide convention `packages.isActive`
 * already uses for boxes.
 */
export interface Supplier extends AuditFields {
  businessId: string;
  name: string;
  contactName: string;
  phone: string;
  email: string | null;
  notes: string;
  isActive: boolean;
}
