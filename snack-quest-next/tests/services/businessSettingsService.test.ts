import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { businessRepository, type BusinessInput } from '@/repositories/businessRepository';
import {
  businessSettingsService,
  BusinessNotFoundError,
  BusinessSettingsValidationError,
} from '@/services/businessSettingsService';

const BUSINESS_ID = 'biz-settings-test';

const BASE_INPUT: BusinessInput = {
  name: 'Snack Quest',
  currency: 'KES',
  whatsappPhoneNumberId: 'wa-phone-1',
  countyCoverage: ['Nairobi'],
  adminWhatsappPhone: '254712345678',
  whatsappCustomerNumber: null,
  status: 'active',
};

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('businesses'));
  await businessRepository.create(BUSINESS_ID, BASE_INPUT, 'system');
});

describe('BusinessSettingsService.getSettings', () => {
  it('returns the business', async () => {
    const business = await businessSettingsService.getSettings(BUSINESS_ID);
    expect(business.name).toBe('Snack Quest');
  });

  it('throws BusinessNotFoundError for an unknown business', async () => {
    await expect(businessSettingsService.getSettings('missing')).rejects.toBeInstanceOf(BusinessNotFoundError);
  });
});

describe('BusinessSettingsService.updateSettings', () => {
  it('applies a valid patch and returns the before/after pair', async () => {
    const { before, after } = await businessSettingsService.updateSettings(
      BUSINESS_ID,
      { name: 'Snack Quest KE', countyCoverage: ['Nairobi', 'Mombasa'] },
      'staff-1',
    );

    expect(before.name).toBe('Snack Quest');
    expect(after.name).toBe('Snack Quest KE');
    expect(after.countyCoverage).toEqual(['Nairobi', 'Mombasa']);
  });

  it('rejects an empty name', async () => {
    await expect(
      businessSettingsService.updateSettings(BUSINESS_ID, { name: '  ' }, 'staff-1'),
    ).rejects.toBeInstanceOf(BusinessSettingsValidationError);
  });

  it('rejects a malformed currency code', async () => {
    await expect(
      businessSettingsService.updateSettings(BUSINESS_ID, { currency: 'kes' }, 'staff-1'),
    ).rejects.toBeInstanceOf(BusinessSettingsValidationError);
  });

  it('rejects a malformed admin WhatsApp phone', async () => {
    await expect(
      businessSettingsService.updateSettings(BUSINESS_ID, { adminWhatsappPhone: '0712345678' }, 'staff-1'),
    ).rejects.toBeInstanceOf(BusinessSettingsValidationError);
  });

  it('allows clearing the admin WhatsApp phone to null', async () => {
    const { after } = await businessSettingsService.updateSettings(
      BUSINESS_ID,
      { adminWhatsappPhone: null },
      'staff-1',
    );
    expect(after.adminWhatsappPhone).toBeNull();
  });

  it('rejects a malformed customer WhatsApp number', async () => {
    await expect(
      businessSettingsService.updateSettings(BUSINESS_ID, { whatsappCustomerNumber: '0712345678' }, 'staff-1'),
    ).rejects.toBeInstanceOf(BusinessSettingsValidationError);
  });

  it('saves a valid customer WhatsApp number', async () => {
    const { after } = await businessSettingsService.updateSettings(
      BUSINESS_ID,
      { whatsappCustomerNumber: '254712345678' },
      'staff-1',
    );
    expect(after.whatsappCustomerNumber).toBe('254712345678');
  });

  it('rejects an invalid status', async () => {
    await expect(
      businessSettingsService.updateSettings(
        BUSINESS_ID,
        // @ts-expect-error deliberately invalid for the test
        { status: 'deleted' },
        'staff-1',
      ),
    ).rejects.toBeInstanceOf(BusinessSettingsValidationError);
  });

  it('rejects an empty countyCoverage entry', async () => {
    await expect(
      businessSettingsService.updateSettings(BUSINESS_ID, { countyCoverage: ['Nairobi', ''] }, 'staff-1'),
    ).rejects.toBeInstanceOf(BusinessSettingsValidationError);
  });

  it('throws BusinessNotFoundError for an unknown business', async () => {
    await expect(
      businessSettingsService.updateSettings('missing', { name: 'X' }, 'staff-1'),
    ).rejects.toBeInstanceOf(BusinessNotFoundError);
  });
});
