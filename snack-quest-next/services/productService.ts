import 'server-only';

import { packageRepository, type PackageInput } from '@/repositories/packageRepository';
import { whatchimpGateway } from '@/lib/integrations/whatchimp/whatchimpGateway';
import {
  CatalogNotConfiguredError,
  WhatchimpCapabilityNotSupportedError,
} from '@/lib/integrations/whatchimp/config';
import { publishEvent } from '@/lib/events/eventBus';
import type { Package } from '@/types';

export class ProductNotFoundError extends Error {
  constructor(productId: string) {
    super(`Product ${productId} not found`);
    this.name = 'ProductNotFoundError';
  }
}

export class ProductNotAvailableError extends Error {
  constructor(
    productId: string,
    public readonly reason: 'inactive' | 'out_of_stock',
  ) {
    super(
      reason === 'inactive' ? `Product ${productId} is not active` : `Product ${productId} is out of stock`,
    );
    this.name = 'ProductNotAvailableError';
  }
}

/**
 * Owns product writes (§ product catalog sync — "there must never be
 * two independently managed catalogs"). Every create/update goes
 * through here, never `packageRepository` directly from outside this
 * Service, so a WhatsApp catalog sync can never be forgotten at a call
 * site — Snack Quest's Firestore `packages` collection stays the one
 * master record, and Whatchimp's Product Catalog is kept as a mirror
 * of it, not a second source of truth.
 *
 * Sync is best-effort, same resilience discipline as shipment creation
 * not blocking a paid order: a Whatchimp outage must never block
 * adding or editing a product. A tenant with no `catalogId` configured
 * yet (`CatalogNotConfiguredError`) is a documented, expected no-op,
 * not logged as a failure — as is WhatChimp having no per-item catalog
 * push at all (`WhatchimpCapabilityNotSupportedError`), a standing
 * platform limitation rather than an incident. Any other sync error is
 * recorded as a domain event for follow-up, never silently swallowed.
 */
class ProductService {
  async createProduct(data: PackageInput, actor: string): Promise<string> {
    const packageId = await packageRepository.create(data, actor);
    await this.syncToCatalog(data.businessId, packageId, data);
    return packageId;
  }

  async updateProduct(
    businessId: string,
    packageId: string,
    patch: Partial<PackageInput>,
    actor: string,
  ): Promise<void> {
    await packageRepository.update(packageId, patch, actor);
    const updated = await packageRepository.findById(businessId, packageId);
    if (updated) {
      await this.syncToCatalog(businessId, packageId, updated);
    }
  }

  async deactivateProduct(businessId: string, packageId: string, actor: string): Promise<void> {
    await this.updateProduct(businessId, packageId, { isActive: false }, actor);
  }

  /**
   * The one product-validity check both catalog checkout entry points
   * share (`app/api/checkout/start/route.ts` and the webhook's inbound
   * `catalogOrder` handling — § "Whatchimp should never assume the
   * displayed catalog price is the final payable amount"): exists,
   * active, in stock. Never re-implemented at a call site, so both
   * paths reject the exact same way.
   */
  async getCheckoutableProduct(businessId: string, productId: string): Promise<Package> {
    const product = await packageRepository.findById(businessId, productId);
    if (!product) {
      throw new ProductNotFoundError(productId);
    }
    if (!product.isActive) {
      throw new ProductNotAvailableError(productId, 'inactive');
    }
    if (product.stockCount !== undefined && product.stockCount <= 0) {
      throw new ProductNotAvailableError(productId, 'out_of_stock');
    }
    return product;
  }

  private async syncToCatalog(
    businessId: string,
    packageId: string,
    data: Pick<PackageInput, 'name' | 'description' | 'priceKes' | 'imageUrl' | 'isActive' | 'stockCount'>,
  ): Promise<void> {
    const inStock = data.isActive && (data.stockCount === undefined || data.stockCount > 0);
    try {
      await whatchimpGateway.syncItem(businessId, {
        retailerId: packageId,
        name: data.name,
        description: data.description,
        priceKes: data.priceKes,
        imageUrl: data.imageUrl,
        availability: inStock ? 'in stock' : 'out of stock',
      });
    } catch (error) {
      const isExpectedNoOp =
        error instanceof CatalogNotConfiguredError ||
        error instanceof WhatchimpCapabilityNotSupportedError;
      if (!isExpectedNoOp) {
        await publishEvent(businessId, 'ProductCatalogSyncFailed', 'package', packageId, {
          reason: error instanceof Error ? error.message : 'unknown error',
        });
      }
    }
  }
}

export const productService = new ProductService();
export { ProductService };
