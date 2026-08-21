import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { smsOptOutRepository } from '@/repositories/smsOptOutRepository';

const BUSINESS_ID = 'biz-sms-opt-out-test';
const OTHER_BUSINESS_ID = 'biz-sms-opt-out-other';

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('smsOptOuts'));
});

describe('smsOptOutRepository', () => {
  it('records an opt-out and reports it', async () => {
    await smsOptOutRepository.recordOptOut({
      businessId: BUSINESS_ID,
      phoneNumber: '254712345678',
      source: 'customer_link',
    });

    expect(await smsOptOutRepository.isOptedOut(BUSINESS_ID, '254712345678')).toBe(true);
    const stored = await smsOptOutRepository.findOne(BUSINESS_ID, '254712345678');
    expect(stored).toMatchObject({ phoneNumber: '254712345678', source: 'customer_link', recordedBy: null });
    expect(stored?.optedOutAt).not.toBeNull();
  });

  it('reports a number that was never recorded as not opted out', async () => {
    expect(await smsOptOutRepository.isOptedOut(BUSINESS_ID, '254700000000')).toBe(false);
  });

  /** A customer taps the link in three different campaigns; they belong on the register once, not three times. */
  it('is idempotent — recording twice leaves one row', async () => {
    await smsOptOutRepository.recordOptOut({
      businessId: BUSINESS_ID,
      phoneNumber: '254712345678',
      source: 'customer_link',
    });
    await smsOptOutRepository.recordOptOut({
      businessId: BUSINESS_ID,
      phoneNumber: '254712345678',
      source: 'customer_link',
    });

    expect(await smsOptOutRepository.countByBusiness(BUSINESS_ID)).toBe(1);
  });

  it('lets a later opt-out overwrite the source, so the register describes current intent', async () => {
    await smsOptOutRepository.recordOptOut({
      businessId: BUSINESS_ID,
      phoneNumber: '254712345678',
      source: 'admin',
      recordedBy: 'staff-1',
      note: 'asked on the phone',
    });
    await smsOptOutRepository.recordOptOut({
      businessId: BUSINESS_ID,
      phoneNumber: '254712345678',
      source: 'customer_link',
    });

    const stored = await smsOptOutRepository.findOne(BUSINESS_ID, '254712345678');
    expect(stored).toMatchObject({ source: 'customer_link', recordedBy: null, note: null });
  });

  it('removes a number from the register', async () => {
    await smsOptOutRepository.recordOptOut({
      businessId: BUSINESS_ID,
      phoneNumber: '254712345678',
      source: 'admin',
      recordedBy: 'staff-1',
    });
    await smsOptOutRepository.removeOptOut(BUSINESS_ID, '254712345678');

    expect(await smsOptOutRepository.isOptedOut(BUSINESS_ID, '254712345678')).toBe(false);
  });

  it('returns the register as a Set for filtering a recipient list', async () => {
    await smsOptOutRepository.recordOptOut({
      businessId: BUSINESS_ID,
      phoneNumber: '254712345678',
      source: 'customer_link',
    });
    await smsOptOutRepository.recordOptOut({
      businessId: BUSINESS_ID,
      phoneNumber: '254700000001',
      source: 'admin',
      recordedBy: 'staff-1',
    });

    const optedOut = await smsOptOutRepository.listOptedOutNumbers(BUSINESS_ID);

    expect(optedOut.has('254712345678')).toBe(true);
    expect(optedOut.has('254700000001')).toBe(true);
    expect(optedOut.has('254799999999')).toBe(false);
    expect(optedOut.size).toBe(2);
  });

  it('never leaks one business’s register into another’s', async () => {
    await smsOptOutRepository.recordOptOut({
      businessId: OTHER_BUSINESS_ID,
      phoneNumber: '254712345678',
      source: 'customer_link',
    });

    expect(await smsOptOutRepository.isOptedOut(BUSINESS_ID, '254712345678')).toBe(false);
    expect((await smsOptOutRepository.listOptedOutNumbers(BUSINESS_ID)).size).toBe(0);
    expect(await smsOptOutRepository.countByBusiness(BUSINESS_ID)).toBe(0);
  });
});
