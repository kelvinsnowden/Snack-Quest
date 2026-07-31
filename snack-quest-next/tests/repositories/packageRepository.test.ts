import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { packageRepository } from '@/repositories/packageRepository';

/** `listAllByBusiness` (§ Admin: Products) — the admin catalog view, which unlike `listActive()` must also surface inactive boxes. */

const BUSINESS_ID = 'biz-package-repo-test';
const OTHER_BUSINESS_ID = 'biz-package-repo-other';

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('packages'));
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
