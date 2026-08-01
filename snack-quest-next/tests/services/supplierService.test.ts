import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { supplierRepository } from '@/repositories/supplierRepository';
import { supplierService, SupplierNotFoundError, InvalidSupplierInputError } from '@/services/supplierService';

const BUSINESS_ID = 'biz-supplier-service-test';
const OTHER_BUSINESS_ID = 'biz-supplier-service-other';

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('suppliers'));
});

describe('SupplierService.createSupplier', () => {
  it('creates a supplier with defaults', async () => {
    const id = await supplierService.createSupplier(
      BUSINESS_ID,
      { name: 'Coastal Snacks Ltd', contactName: 'Jane Wanjiru', phone: '254700000000' },
      'staff-1',
    );

    const found = await supplierRepository.findById(BUSINESS_ID, id);
    expect(found).toMatchObject({ name: 'Coastal Snacks Ltd', contactName: 'Jane Wanjiru', phone: '254700000000', email: null, notes: '', isActive: true });
  });

  it('rejects a missing name/contactName/phone', async () => {
    await expect(
      supplierService.createSupplier(BUSINESS_ID, { name: '', contactName: 'Jane', phone: '254700000000' }, 'staff-1'),
    ).rejects.toBeInstanceOf(InvalidSupplierInputError);
    await expect(
      supplierService.createSupplier(BUSINESS_ID, { name: 'Coastal', contactName: '', phone: '254700000000' }, 'staff-1'),
    ).rejects.toBeInstanceOf(InvalidSupplierInputError);
    await expect(
      supplierService.createSupplier(BUSINESS_ID, { name: 'Coastal', contactName: 'Jane', phone: '' }, 'staff-1'),
    ).rejects.toBeInstanceOf(InvalidSupplierInputError);
  });
});

describe('SupplierService.updateSupplier', () => {
  it('updates a supplier belonging to the business', async () => {
    const id = await supplierService.createSupplier(
      BUSINESS_ID,
      { name: 'Coastal Snacks Ltd', contactName: 'Jane Wanjiru', phone: '254700000000' },
      'staff-1',
    );

    await supplierService.updateSupplier(BUSINESS_ID, id, { isActive: false }, 'staff-2');

    const found = await supplierRepository.findById(BUSINESS_ID, id);
    expect(found?.isActive).toBe(false);
  });

  it('rejects a supplier from a different business', async () => {
    const id = await supplierService.createSupplier(
      OTHER_BUSINESS_ID,
      { name: 'Other', contactName: 'X', phone: '254700000001' },
      'staff-1',
    );

    await expect(
      supplierService.updateSupplier(BUSINESS_ID, id, { isActive: false }, 'staff-2'),
    ).rejects.toBeInstanceOf(SupplierNotFoundError);
  });

  it('re-validates required fields when they are part of the patch', async () => {
    const id = await supplierService.createSupplier(
      BUSINESS_ID,
      { name: 'Coastal Snacks Ltd', contactName: 'Jane Wanjiru', phone: '254700000000' },
      'staff-1',
    );

    await expect(supplierService.updateSupplier(BUSINESS_ID, id, { name: '' }, 'staff-2')).rejects.toBeInstanceOf(
      InvalidSupplierInputError,
    );
  });
});

describe('SupplierService.listSuppliers', () => {
  it('lists suppliers scoped to the business', async () => {
    await supplierService.createSupplier(BUSINESS_ID, { name: 'A', contactName: 'X', phone: '254700000000' }, 'staff-1');
    await supplierService.createSupplier(OTHER_BUSINESS_ID, { name: 'B', contactName: 'X', phone: '254700000001' }, 'staff-1');

    const results = await supplierService.listSuppliers(BUSINESS_ID);
    expect(results.map(({ data }) => data.name)).toEqual(['A']);
  });
});
