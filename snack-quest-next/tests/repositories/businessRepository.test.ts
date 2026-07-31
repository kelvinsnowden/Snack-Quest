import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { businessRepository, type BusinessInput } from '@/repositories/businessRepository';

const BUSINESS_ID = 'biz-repo-test';

const BASE_INPUT: BusinessInput = {
  name: 'Snack Quest',
  currency: 'KES',
  whatsappPhoneNumberId: 'wa-phone-1',
  countyCoverage: ['Nairobi'],
  adminWhatsappPhone: '254712345678',
  status: 'active',
};

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('businesses'));
});

describe('BusinessRepository', () => {
  it('creates and reads back a business', async () => {
    await businessRepository.create(BUSINESS_ID, BASE_INPUT, 'system');

    const business = await businessRepository.findById(BUSINESS_ID);
    expect(business?.name).toBe('Snack Quest');
    expect(business?.createdBy).toBe('system');
  });

  it('returns null for a business that does not exist', async () => {
    await expect(businessRepository.findById('missing')).resolves.toBeNull();
  });

  it('update() patches only the given fields and stamps updatedBy/updatedAt', async () => {
    await businessRepository.create(BUSINESS_ID, BASE_INPUT, 'system');

    await businessRepository.update(BUSINESS_ID, { name: 'Snack Quest KE', status: 'suspended' }, 'staff-1');

    const business = await businessRepository.findById(BUSINESS_ID);
    expect(business?.name).toBe('Snack Quest KE');
    expect(business?.status).toBe('suspended');
    expect(business?.currency).toBe('KES');
    expect(business?.updatedBy).toBe('staff-1');
  });

  it('findByWhatsappPhoneNumberId resolves the tenant a shared webhook needs', async () => {
    await businessRepository.create(BUSINESS_ID, BASE_INPUT, 'system');

    const found = await businessRepository.findByWhatsappPhoneNumberId('wa-phone-1');
    expect(found?.id).toBe(BUSINESS_ID);
    expect(found?.data.name).toBe('Snack Quest');
  });
});
