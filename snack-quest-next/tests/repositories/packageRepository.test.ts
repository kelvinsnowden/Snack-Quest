import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { packageRepository } from '@/repositories/packageRepository';

/** `listAllByBusiness` (§ Admin: Products) — the admin catalog view, which unlike `listActive()` must also surface inactive boxes. */

const BUSINESS_ID = 'biz-package-repo-test';
const OTHER_BUSINESS_ID = 'biz-package-repo-other';

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('packages'));
});

describe('packageRepository.listActive', () => {
  it('excludes the exit-intent rescue offer even when active', async () => {
    const normal = await packageRepository.create(
      { businessId: BUSINESS_ID, name: 'Starter Box', description: 'x', priceKes: 2500, isActive: true, imageUrl: null },
      'system',
    );
    await packageRepository.create(
      {
        businessId: BUSINESS_ID,
        name: 'Test Box',
        description: 'x',
        priceKes: 1500,
        isActive: true,
        imageUrl: null,
        isRescueOffer: true,
      },
      'system',
    );

    const active = await packageRepository.listActive(BUSINESS_ID);

    expect(active.map((p) => p.id)).toEqual([normal]);
  });
});

describe('packageRepository.findRescueOffer', () => {
  it('finds the package flagged as the rescue offer, scoped to the business', async () => {
    await packageRepository.create(
      { businessId: BUSINESS_ID, name: 'Starter Box', description: 'x', priceKes: 2500, isActive: true, imageUrl: null },
      'system',
    );
    const rescueId = await packageRepository.create(
      {
        businessId: BUSINESS_ID,
        name: 'Test Box',
        description: 'x',
        priceKes: 1500,
        isActive: true,
        imageUrl: null,
        isRescueOffer: true,
      },
      'system',
    );
    await packageRepository.create(
      {
        businessId: OTHER_BUSINESS_ID,
        name: 'Other Biz Rescue',
        description: 'x',
        priceKes: 1500,
        isActive: true,
        imageUrl: null,
        isRescueOffer: true,
      },
      'system',
    );

    const found = await packageRepository.findRescueOffer(BUSINESS_ID);

    expect(found?.id).toBe(rescueId);
  });

  it('returns null when no package is flagged as the rescue offer', async () => {
    await packageRepository.create(
      { businessId: BUSINESS_ID, name: 'Starter Box', description: 'x', priceKes: 2500, isActive: true, imageUrl: null },
      'system',
    );

    expect(await packageRepository.findRescueOffer(BUSINESS_ID)).toBeNull();
  });
});

describe('packageRepository.listAllByBusiness', () => {
  it('includes inactive packages, scoped to the business, ordered by price', async () => {
    await packageRepository.create(
      { businessId: OTHER_BUSINESS_ID, name: 'Other Biz Box', description: 'x', priceKes: 1000, isActive: true, imageUrl: null },
      'system',
    );
    const expensive = await packageRepository.create(
      { businessId: BUSINESS_ID, name: 'Deluxe Box', description: 'x', priceKes: 5000, isActive: true, imageUrl: null },
      'system',
    );
    const cheap = await packageRepository.create(
      { businessId: BUSINESS_ID, name: 'Starter Box', description: 'x', priceKes: 2500, isActive: false, imageUrl: null },
      'system',
    );

    const products = await packageRepository.listAllByBusiness(BUSINESS_ID);

    expect(products.map((p) => p.id)).toEqual([cheap, expensive]);
    expect(products.find((p) => p.id === cheap)?.data.isActive).toBe(false);
  });
});
