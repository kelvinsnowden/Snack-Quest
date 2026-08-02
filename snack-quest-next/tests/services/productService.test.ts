import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { businessRepository } from '@/repositories/businessRepository';
import { businessIntegrationSecretRepository } from '@/repositories/businessIntegrationSecretRepository';
import { packageRepository } from '@/repositories/packageRepository';
import { ProductNotFoundError, productService } from '@/services/productService';

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

  it('syncs a new product to the WhatsApp Product Catalog using the package id as retailer_id', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'whatchimp', {
      apiKey: 'key',
      phoneNumberId: 'wa-product-service-test',
      catalogId: 'catalog-1',
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
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

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/catalog-1/items_batch');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.requests[0].data.id).toBe(packageId); // same identifier both systems use
    expect(body.requests[0].data.price).toBe('3500 KES');
    expect(body.requests[0].data.availability).toBe('in stock');
    expect(body.requests[0].data.image_link).toBe('https://example.blob.vercel-storage.com/deluxe.png');
  });

  it('marks an out-of-stock update as unavailable in the catalog', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'whatchimp', {
      apiKey: 'key',
      phoneNumberId: 'wa-product-service-test',
      catalogId: 'catalog-1',
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const packageId = await packageRepository.create(
      {
        businessId: BUSINESS_ID,
        name: 'Premium Box',
        description: 'A premium box',
        priceKes: 5000,
        isActive: true,
        stockCount: 3,
        imageUrl: null,
      },
      'admin',
    );

    await productService.updateProduct(BUSINESS_ID, packageId, { stockCount: 0 }, 'admin');

    const [, init] = fetchMock.mock.calls.at(-1)!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.requests[0].data.availability).toBe('out of stock');
  });

  it('records a domain event (does not throw) when the catalog sync call fails for a real reason', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'whatchimp', {
      apiKey: 'key',
      phoneNumberId: 'wa-product-service-test',
      catalogId: 'catalog-1',
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'catalog offline' } }), { status: 500 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      productService.createProduct(
        {
          businessId: BUSINESS_ID,
          name: 'Failing Box',
          description: 'desc',
          priceKes: 1000,
          isActive: true,
          imageUrl: null,
        },
        'admin',
      ),
    ).resolves.toEqual(expect.any(String)); // sync failure never blocks the product write

    const events = await adminFirestore.collection('domainEvents').get();
    expect(events.size).toBe(1);
    expect(events.docs[0].data().type).toBe('ProductCatalogSyncFailed');
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
