import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { businessRepository } from '@/repositories/businessRepository';
import { businessIntegrationSecretRepository } from '@/repositories/businessIntegrationSecretRepository';
import { packageRepository } from '@/repositories/packageRepository';
import { ProductNotFoundError, productService } from '@/services/productService';
import type { Package } from '@/types';

/**
 * `productService` owns every product write (§ product catalog sync —
 * "there must never be two independently managed catalogs") and the
 * one product-validity check both catalog checkout entry points share.
 * Real Firestore (via the emulator) for `packages`/`domainEvents`, a
 * stubbed global `fetch` for the WhatsApp Catalog Batch API call —
 * same mocking discipline as `tests/integrations/whatchimpGateway.test.ts`.
 */

const BUSINESS_ID = 'biz-product-service-test';

async function cleanCollections() {
  for (const name of ['businesses', 'packages', 'domainEvents']) {
    await adminFirestore.recursiveDelete(adminFirestore.collection(name));
  }
}

beforeEach(async () => {
  await cleanCollections();
  await businessRepository.create(
    BUSINESS_ID,
    {
      name: 'Product Service Test Biz',
      currency: 'KES',
      whatsappPhoneNumberId: 'wa-product-service-test',
      countyCoverage: [],
      adminWhatsappPhone: '254799999000',
      whatsappCustomerNumber: null,
      status: 'active',
    },
    'system',
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ProductService.createProduct / updateProduct — catalog sync', () => {
  it('is a documented no-op (not a failure) when the business has no catalogId configured', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'whatchimp', {
      apiKey: 'key',
      phoneNumberId: 'wa-product-service-test',
      // no catalogId
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const packageId = await productService.createProduct(
      {
        businessId: BUSINESS_ID,
        name: 'Starter Box',
        description: 'A starter box',
        priceKes: 2500,
        isActive: true,
        imageUrl: null,
      },
      'admin',
    );

    expect(fetchMock).not.toHaveBeenCalled();
    const events = await adminFirestore.collection('domainEvents').get();
    expect(events.empty).toBe(true); // not logged as a failure — it's expected

    const stored = await packageRepository.findById(BUSINESS_ID, packageId);
    expect(stored?.name).toBe('Starter Box');
  });


  /**
   * WhatChimp's catalog API only lists catalogs, triggers a *whole-
   * catalog* pull from Meta Commerce Manager, and manages catalog
   * orders — there is no per-item push, so `syncItem` reports the gap
   * (`WhatchimpCapabilityNotSupportedError`) instead of calling the
   * fabricated Meta Catalog Batch endpoint this Gateway used to aim at.
   *
   * That makes it a standing platform limitation rather than an
   * incident, which is why nothing is logged. The
   * `ProductCatalogSyncFailed` event branch stays for a future Gateway
   * that really can push items; no WhatChimp call can reach it today.
   */
  it('never calls the WhatsApp catalog for the exit-intent rescue offer', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'whatchimp', {
      apiKey: 'key',
      phoneNumberId: 'wa-product-service-test',
      catalogId: 'catalog-1',
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await productService.createProduct(
      {
        businessId: BUSINESS_ID,
        name: 'Test Box',
        description: 'Try before you commit',
        priceKes: 1500,
        isActive: true,
        imageUrl: null,
        isRescueOffer: true,
      },
      'admin',
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('saves the product and logs nothing when the provider cannot push catalog items at all', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'whatchimp', {
      apiKey: 'key',
      phoneNumberId: 'wa-product-service-test',
      catalogId: 'catalog-1',
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const packageId = await productService.createProduct(
      {
        businessId: BUSINESS_ID,
        name: 'Deluxe Box',
        description: 'A deluxe box',
        priceKes: 3500,
        isActive: true,
        imageUrl: 'https://example.blob.vercel-storage.com/deluxe.png',
      },
      'admin',
    );

    expect(fetchMock).not.toHaveBeenCalled();
    const events = await adminFirestore.collection('domainEvents').get();
    expect(events.empty).toBe(true);

    const stored = await packageRepository.findById(BUSINESS_ID, packageId);
    expect(stored?.name).toBe('Deluxe Box');
  });

});

describe('ProductService.getRescueOffer', () => {
  it('returns null when no package is flagged as the rescue offer', async () => {
    expect(await productService.getRescueOffer(BUSINESS_ID)).toBeNull();
  });

  it('returns null when the flagged package is inactive', async () => {
    await packageRepository.create(
      {
        businessId: BUSINESS_ID,
        name: 'Test Box',
        description: 'desc',
        priceKes: 1500,
        isActive: false,
        imageUrl: null,
        isRescueOffer: true,
      },
      'admin',
    );
    expect(await productService.getRescueOffer(BUSINESS_ID)).toBeNull();
  });

  it('returns null once the offer has expired', async () => {
    await packageRepository.create(
      {
        businessId: BUSINESS_ID,
        name: 'Test Box',
        description: 'desc',
        priceKes: 1500,
        isActive: true,
        imageUrl: null,
        isRescueOffer: true,
        offerExpiresAt: Timestamp.fromMillis(Date.now() - 1000) as unknown as Package['offerExpiresAt'],
      },
      'admin',
    );
    expect(await productService.getRescueOffer(BUSINESS_ID)).toBeNull();
  });

  it('returns the offer when active and not expired', async () => {
    const packageId = await packageRepository.create(
      {
        businessId: BUSINESS_ID,
        name: 'Test Box',
        description: 'desc',
        priceKes: 1500,
        isActive: true,
        imageUrl: null,
        isRescueOffer: true,
        offerExpiresAt: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000) as unknown as Package['offerExpiresAt'],
      },
      'admin',
    );
    const offer = await productService.getRescueOffer(BUSINESS_ID);
    expect(offer?.id).toBe(packageId);
    expect(offer?.data.priceKes).toBe(1500);
  });

  it('returns the offer when it has no expiration set at all', async () => {
    const packageId = await packageRepository.create(
      {
        businessId: BUSINESS_ID,
        name: 'Test Box',
        description: 'desc',
        priceKes: 1500,
        isActive: true,
        imageUrl: null,
        isRescueOffer: true,
      },
      'admin',
    );
    expect((await productService.getRescueOffer(BUSINESS_ID))?.id).toBe(packageId);
  });
});

describe('ProductService.getCheckoutableProduct', () => {
  it('throws ProductNotFoundError for an unknown product', async () => {
    await expect(
      productService.getCheckoutableProduct(BUSINESS_ID, 'does-not-exist'),
    ).rejects.toBeInstanceOf(ProductNotFoundError);
  });

  it('throws ProductNotAvailableError for an inactive product', async () => {
    const packageId = await packageRepository.create(
      {
        businessId: BUSINESS_ID,
        name: 'Retired Box',
        description: 'desc',
        priceKes: 2000,
        isActive: false,
        imageUrl: null,
      },
      'admin',
    );
    await expect(
      productService.getCheckoutableProduct(BUSINESS_ID, packageId),
    ).rejects.toMatchObject({ reason: 'inactive' });
  });

  it('throws ProductNotAvailableError for an out-of-stock product', async () => {
    const packageId = await packageRepository.create(
      {
        businessId: BUSINESS_ID,
        name: 'Sold Out Box',
        description: 'desc',
        priceKes: 2000,
        isActive: true,
        stockCount: 0,
        imageUrl: null,
      },
      'admin',
    );
    await expect(
      productService.getCheckoutableProduct(BUSINESS_ID, packageId),
    ).rejects.toMatchObject({ reason: 'out_of_stock' });
  });

  it('returns the product when it is active and in stock', async () => {
    const packageId = await packageRepository.create(
      {
        businessId: BUSINESS_ID,
        name: 'Good Box',
        description: 'desc',
        priceKes: 2000,
        isActive: true,
        imageUrl: null,
      },
      'admin',
    );
    const product = await productService.getCheckoutableProduct(BUSINESS_ID, packageId);
    expect(product.name).toBe('Good Box');
  });
});
