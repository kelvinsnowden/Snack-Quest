import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { supplierRepository } from '@/repositories/supplierRepository';

const BUSINESS_ID = 'biz-supplier-repo-test';
const OTHER_BUSINESS_ID = 'biz-supplier-repo-other';

function baseInput(overrides: Partial<Parameters<typeof supplierRepository.create>[0]> = {}) {
  return {
    businessId: BUSINESS_ID,
    name: 'Coastal Snacks Ltd',
    contactName: 'Jane Wanjiru',
    phone: '254700000000',
    email: null,
    notes: '',
    isActive: true,
    ...overrides,
  };
}

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('suppliers'));
});

describe('supplierRepository', () => {
  it('creates and finds a supplier scoped to its business', async () => {
    const id = await supplierRepository.create(baseInput(), 'staff-1');

    const found = await supplierRepository.findById(BUSINESS_ID, id);
    expect(found?.name).toBe('Coastal Snacks Ltd');
    expect(found?.createdBy).toBe('staff-1');

    expect(await supplierRepository.findById(OTHER_BUSINESS_ID, id)).toBeNull();
  });

  it('updates fields and stamps updatedBy', async () => {
    const id = await supplierRepository.create(baseInput(), 'staff-1');

    await supplierRepository.update(id, { isActive: false }, 'staff-2');

    const found = await supplierRepository.findById(BUSINESS_ID, id);
    expect(found?.isActive).toBe(false);
    expect(found?.updatedBy).toBe('staff-2');
  });

  it('listByBusiness scopes per tenant and filters by activeOnly', async () => {
    await supplierRepository.create(baseInput({ name: 'Active Co', isActive: true }), 'staff-1');
    await supplierRepository.create(baseInput({ name: 'Inactive Co', isActive: false }), 'staff-1');
    await supplierRepository.create(baseInput({ businessId: OTHER_BUSINESS_ID, name: 'Other Tenant Co' }), 'staff-1');

    const all = await supplierRepository.listByBusiness(BUSINESS_ID);
    expect(all.map(({ data }) => data.name).sort()).toEqual(['Active Co', 'Inactive Co']);

    const activeOnly = await supplierRepository.listByBusiness(BUSINESS_ID, { activeOnly: true });
    expect(activeOnly.map(({ data }) => data.name)).toEqual(['Active Co']);
  });
});
