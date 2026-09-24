import 'server-only';

import { machineAssortmentRepository } from '@/repositories/machineAssortmentRepository';
import { machineRepository, MachineNotFoundError } from '@/repositories/machineRepository';
import { machineSlotRepository } from '@/repositories/machineSlotRepository';
import { snackItemRepository } from '@/repositories/snackItemRepository';
import { packageRepository } from '@/repositories/packageRepository';
import type { MachineAssortment, MachineAssortmentPromotionalState, SellableCatalogItem } from '@/types';

export class ProductNotFoundError extends Error {
  constructor(productCatalogue: string, productId: string) {
    super(`No ${productCatalogue} found with id ${productId}`);
    this.name = 'ProductNotFoundError';
  }
}

interface ResolvedProduct {
  name: string;
  description: string | null;
  imageUrl: string | null;
  defaultPriceKes: number;
}

/**
 * The machine assortment / sellable-catalog domain
 * (§ MACHINE ASSORTMENT, docs/MACHINE_ASSORTMENT.md). Every method
 * here is either a staff-issued catalog-intent decision
 * (`assortProduct`/`unassortProduct`/`linkSlot`/`setVisible`/
 * `setPriceOverride`) or a pure derivation from already-written facts
 * (`getSellableCatalog`) — nothing here ever writes `MachineSlot` or
 * `MachineInventoryMovement` directly; those stay
 * `machineSlotService`'s and `machineInventoryMovementService`'s own.
 */
class MachineAssortmentService {
  /** Verifies the referenced product actually exists in its catalogue — never assort a product this business's own catalogue doesn't have. */
  private async resolveProduct(
    businessId: string,
    productCatalogue: MachineAssortment['productCatalogue'],
    productId: string,
  ): Promise<ResolvedProduct> {
    if (productCatalogue === 'snackItem') {
      const item = await snackItemRepository.findById(productId);
      if (!item) {
        throw new ProductNotFoundError('snackItem', productId);
      }
      return { name: item.name, description: null, imageUrl: item.imageUrl, defaultPriceKes: item.expectedUnitCostKes };
    }
    const pkg = await packageRepository.findById(businessId, productId);
    if (!pkg) {
      throw new ProductNotFoundError('package', productId);
    }
    return { name: pkg.name, description: pkg.description, imageUrl: pkg.imageUrl, defaultPriceKes: pkg.priceKes };
  }

  /**
   * Adds (or re-enables) a product in a machine's assortment.
   * Idempotent on the assortment side — calling this again for a
   * product already assorted updates its merchandising fields without
   * disturbing `slotCode`/`priceOverrideKes`, which are set through
   * `linkSlot`/`setPriceOverride` instead.
   */
  async assortProduct(input: {
    businessId: string;
    machineId: string;
    productId: string;
    productCatalogue: MachineAssortment['productCatalogue'];
    displayOrder?: number;
    category?: string | null;
    customerFacingName?: string | null;
    customerFacingDescription?: string | null;
    customerFacingImageUrl?: string | null;
    promotionalState?: MachineAssortmentPromotionalState;
    effectiveFrom?: Date | null;
    effectiveTo?: Date | null;
    actor: string;
  }): Promise<void> {
    const machine = await machineRepository.findById(input.businessId, input.machineId);
    if (!machine) {
      throw new MachineNotFoundError(input.machineId);
    }
    await this.resolveProduct(input.businessId, input.productCatalogue, input.productId);

    const existing = await machineAssortmentRepository.findByProduct(
      input.businessId,
      input.machineId,
      input.productCatalogue,
      input.productId,
    );

    await machineAssortmentRepository.upsert({
      businessId: input.businessId,
      machineId: input.machineId,
      productId: input.productId,
      productCatalogue: input.productCatalogue,
      assorted: true,
      slotCode: existing?.slotCode ?? null,
      displayOrder: input.displayOrder ?? existing?.displayOrder ?? 0,
      category: input.category ?? existing?.category ?? null,
      customerFacingName: input.customerFacingName ?? existing?.customerFacingName ?? null,
      customerFacingDescription: input.customerFacingDescription ?? existing?.customerFacingDescription ?? null,
      customerFacingImageUrl: input.customerFacingImageUrl ?? existing?.customerFacingImageUrl ?? null,
      priceOverrideKes: existing?.priceOverrideKes ?? null,
      promotionalState: input.promotionalState ?? existing?.promotionalState ?? 'none',
      effectiveFrom: (input.effectiveFrom as unknown as MachineAssortment['effectiveFrom']) ?? existing?.effectiveFrom ?? null,
      effectiveTo: (input.effectiveTo as unknown as MachineAssortment['effectiveTo']) ?? existing?.effectiveTo ?? null,
      visible: existing?.visible ?? true,
    });
  }

  /**
   * Removes a product from the machine's intended assortment without
   * deleting the row — the same "kept out without deleting history"
   * convention `SnackItem.isActive` already uses. `getSellableCatalog`
   * excludes it immediately; the row (and its price-override history)
   * stays for audit.
   */
  async unassortProduct(
    businessId: string,
    machineId: string,
    productCatalogue: MachineAssortment['productCatalogue'],
    productId: string,
  ): Promise<void> {
    const existing = await machineAssortmentRepository.findByProduct(businessId, machineId, productCatalogue, productId);
    if (!existing) {
      return; // never assorted at all — nothing to undo
    }
    await machineAssortmentRepository.upsert({ ...existing, assorted: false });
  }

  /** Links an assorted product to the physical slot it's been placed in — never invents a slot; `slotCode` must already exist on `MachineSlot`. */
  async linkSlot(
    businessId: string,
    machineId: string,
    productCatalogue: MachineAssortment['productCatalogue'],
    productId: string,
    slotCode: string | null,
  ): Promise<void> {
    const existing = await machineAssortmentRepository.findByProduct(businessId, machineId, productCatalogue, productId);
    if (!existing) {
      throw new Error(`Product ${productId} is not assorted to machine ${machineId} — assort it before linking a slot`);
    }
    if (slotCode !== null) {
      const slot = await machineSlotRepository.findBySlotCode(businessId, machineId, slotCode);
      if (!slot) {
        throw new Error(`Slot ${slotCode} does not exist on machine ${machineId}`);
      }
    }
    await machineAssortmentRepository.upsert({ ...existing, slotCode });
  }

  async setVisible(
    businessId: string,
    machineId: string,
    productCatalogue: MachineAssortment['productCatalogue'],
    productId: string,
    visible: boolean,
  ): Promise<void> {
    const existing = await machineAssortmentRepository.findByProduct(businessId, machineId, productCatalogue, productId);
    if (!existing) {
      throw new Error(`Product ${productId} is not assorted to machine ${machineId}`);
    }
    await machineAssortmentRepository.upsert({ ...existing, visible });
  }

  async setPriceOverride(
    businessId: string,
    machineId: string,
    productCatalogue: MachineAssortment['productCatalogue'],
    productId: string,
    priceOverrideKes: number | null,
    actor: string,
  ): Promise<void> {
    await machineAssortmentRepository.setPriceOverride(businessId, machineId, productCatalogue, productId, priceOverrideKes, actor);
  }

  async listByMachine(businessId: string, machineId: string): Promise<MachineAssortment[]> {
    return machineAssortmentRepository.listByMachine(businessId, machineId);
  }

  /**
   * The customer screen's own read (§ MACHINE CUSTOMER CATALOG,
   * § THREE DIFFERENT PRODUCT STATES). `sellable` is derived here,
   * never stored: `assorted && visible` (the catalog-intent facts) AND
   * a real slot exists, is enabled, and has stock (the physical facts)
   * AND the machine itself is `active` (the operational fact). Any one
   * of those being false makes the product ASSORTED but not
   * SELLABLE — never silently omitted from the assortment, and never
   * fabricated as purchasable.
   *
   * A product not in this machine's `machineAssortments` rows at all
   * has no path into this result, however many other machines carry
   * it or however large the global catalogue is — the isolation the
   * brief's own named test (`Machine A has SKU1 but not SKU2`) checks
   * directly.
   */
  async getSellableCatalog(businessId: string, machineId: string): Promise<SellableCatalogItem[]> {
    const machine = await machineRepository.findById(businessId, machineId);
    if (!machine) {
      throw new MachineNotFoundError(machineId);
    }

    const [assortmentRows, slots] = await Promise.all([
      machineAssortmentRepository.listByMachine(businessId, machineId),
      machineSlotRepository.listByMachine(businessId, machineId),
    ]);
    const assorted = assortmentRows.filter((row) => row.assorted && row.visible);
    const slotByCode = new Map(slots.map((slot) => [slot.slotCode, slot]));

    const snackItemIds = assorted.filter((row) => row.productCatalogue === 'snackItem').map((row) => row.productId);
    const packageRows = assorted.filter((row) => row.productCatalogue === 'package');
    const [snackItemsById, packagesById] = await Promise.all([
      snackItemRepository.findManyById(snackItemIds),
      Promise.all(packageRows.map((row) => packageRepository.findById(businessId, row.productId))).then(
        (results) => new Map(packageRows.map((row, index) => [row.productId, results[index]])),
      ),
    ]);

    const now = Date.now();
    const items: SellableCatalogItem[] = [];
    for (const row of assorted) {
      const slot = row.slotCode ? (slotByCode.get(row.slotCode) ?? null) : null;

      let name = row.customerFacingName;
      let description = row.customerFacingDescription;
      let imageUrl = row.customerFacingImageUrl;
      let fallbackPriceKes = 0;
      if (row.productCatalogue === 'snackItem') {
        const item = snackItemsById.get(row.productId);
        name = name ?? item?.name ?? row.productId;
        imageUrl = imageUrl ?? item?.imageUrl ?? null;
        fallbackPriceKes = item?.expectedUnitCostKes ?? 0;
      } else {
        const pkg = packagesById.get(row.productId) ?? null;
        name = name ?? pkg?.name ?? row.productId;
        description = description ?? pkg?.description ?? null;
        imageUrl = imageUrl ?? pkg?.imageUrl ?? null;
        fallbackPriceKes = pkg?.priceKes ?? 0;
      }

      const priceKes = row.priceOverrideKes ?? slot?.priceKes ?? fallbackPriceKes;
      const sellable = Boolean(slot) && slot!.enabled && slot!.currentQuantity > 0 && machine.status === 'active';

      const withinPromoWindow =
        (!row.effectiveFrom || row.effectiveFrom.toMillis() <= now) &&
        (!row.effectiveTo || row.effectiveTo.toMillis() >= now);

      items.push({
        productId: row.productId,
        productCatalogue: row.productCatalogue,
        slotCode: row.slotCode,
        name,
        description,
        imageUrl,
        category: row.category,
        priceKes,
        sellable,
        displayOrder: row.displayOrder,
        promotionalState: withinPromoWindow ? row.promotionalState : 'none',
      });
    }

    return items.sort((a, b) => a.displayOrder - b.displayOrder);
  }

  /**
   * A deterministic version for the customer catalog
   * (§ LOCAL MACHINE CATALOG CACHE: "version checks, stale detection").
   * Two reads with nothing changed underneath return the exact same
   * string — the latest `updatedAt` across this machine's own
   * assortment rows and slots, both already carrying a real audit
   * timestamp bumped on every write, rather than a fresh
   * `new Date().toISOString()` computed on every call that could never
   * be compared against anything.
   *
   * Reads over *every* row/slot for the machine, not just the ones
   * `getSellableCatalog` would currently render: a row that just
   * became invisible or unassorted is itself a write with a fresh
   * `updatedAt`, so this stays a safe upper bound on "something that
   * could affect the catalog changed" without re-deriving
   * `getSellableCatalog`'s own filtering here — a spurious re-fetch a
   * gateway makes because of an irrelevant change is harmless; a real
   * change this method failed to surface would not be.
   */
  async getCatalogVersion(businessId: string, machineId: string): Promise<string> {
    const machine = await machineRepository.findById(businessId, machineId);
    if (!machine) {
      throw new MachineNotFoundError(machineId);
    }

    const [assortmentRows, slots] = await Promise.all([
      machineAssortmentRepository.listByMachine(businessId, machineId),
      machineSlotRepository.listByMachine(businessId, machineId),
    ]);

    const timestampsMs = [
      ...assortmentRows.map((row) => row.updatedAt.toMillis()),
      ...slots.map((slot) => slot.updatedAt.toMillis()),
    ];
    const latestMs = timestampsMs.length > 0 ? Math.max(...timestampsMs) : machine.updatedAt.toMillis();
    return new Date(latestMs).toISOString();
  }
}

export const machineAssortmentService = new MachineAssortmentService();
export { MachineAssortmentService };
