import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { customerService } from '@/services/customerService';
import { seedOrder } from '../helpers/orderFixtures';

/**
 * `CustomerService` (§ Admin: Customers) aggregates real orders into
 * per-customer rows — there is no `customerProfiles` data to read
 * (nothing in this codebase writes that collection; see the Service's
 * own doc comment), so this proves the aggregation itself: order
 * counts, spend totals, and "most recent order wins" for name/county,
 * all scoped correctly per business.
 */

const BUSINESS_ID = 'biz-customer-service-test';
const OTHER_BUSINESS_ID = 'biz-customer-service-other';
const PHONE = '254700111222';

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('orders'));
});

describe('CustomerService.listCustomers', () => {
  it('aggregates multiple orders from the same customer into one row', async () => {
    await seedOrder({
      businessId: BUSINESS_ID,
      customer: { customerId: null, phoneNumber: PHONE, customerName: 'Jane Wanjiru', county: 'Nairobi' },
      pricing: { subtotalKes: 2500, discountKes: 0, deliveryFeeKes: 200, creditsUsedKes: 0, totalKes: 2700 },
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await seedOrder({
      businessId: BUSINESS_ID,
      customer: { customerId: null, phoneNumber: PHONE, customerName: 'Jane W.', county: 'Kiambu' },
      pricing: { subtotalKes: 3500, discountKes: 0, deliveryFeeKes: 0, creditsUsedKes: 0, totalKes: 3500 },
    });
    await seedOrder({ businessId: OTHER_BUSINESS_ID, customer: { customerId: null, phoneNumber: PHONE, customerName: 'Other biz', county: 'Nairobi' } });

    const customers = await customerService.listCustomers(BUSINESS_ID);

    expect(customers).toHaveLength(1);
    expect(customers[0]).toMatchObject({
      phoneNumber: PHONE,
      customerName: 'Jane W.',
      county: 'Kiambu',
      orderCount: 2,
      totalSpentKes: 6200,
    });
  });

  it('lists each distinct customer separately, newest first', async () => {
    const older = await seedOrder({
      businessId: BUSINESS_ID,
      customer: { customerId: null, phoneNumber: '254700000001', customerName: 'First', county: 'Nairobi' },
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const newer = await seedOrder({
      businessId: BUSINESS_ID,
      customer: { customerId: null, phoneNumber: '254700000002', customerName: 'Second', county: 'Nairobi' },
    });
    expect(older).toBeTruthy();
    expect(newer).toBeTruthy();

    const customers = await customerService.listCustomers(BUSINESS_ID);

    expect(customers.map((c) => c.customerName)).toEqual(['Second', 'First']);
  });
});

describe('CustomerService.getCustomerOrders', () => {
  it('returns null summary and no orders for an unknown phone number', async () => {
    const result = await customerService.getCustomerOrders(BUSINESS_ID, '254799999999');
    expect(result.summary).toBeNull();
    expect(result.orders).toEqual([]);
  });

  it('returns the summary and every order for a known customer', async () => {
    await seedOrder({
      businessId: BUSINESS_ID,
      customer: { customerId: null, phoneNumber: PHONE, customerName: 'Jane Wanjiru', county: 'Nairobi' },
    });

    const result = await customerService.getCustomerOrders(BUSINESS_ID, PHONE);

    expect(result.summary?.orderCount).toBe(1);
    expect(result.orders).toHaveLength(1);
  });
});
