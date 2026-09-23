import { beforeEach, describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { businessAnalyticsService } from '@/services/businessAnalyticsService';
import { analyticsRollupService } from '@/services/analyticsRollupService';
import { customerLifetimeRepository } from '@/repositories/customerLifetimeRepository';
import { orderRepository } from '@/repositories/orderRepository';
import { seedOrder } from '../helpers/orderFixtures';
import type { Order } from '@/types';

/**
 * Lifetime metrics computed over a lifetime, not over the newest
 * thousand rows (§ analytics rollups,
 * docs/FLEET_ARCHITECTURE_AUDIT.md finding 5).
 *
 * `getLtv` and `getCac` both reason about a customer's *first-ever*
 * order. Both read `listByBusiness(businessId, { limit: 1000 })`, which
 * returns the newest thousand orders — a window that by construction
 * cannot contain the oldest ones. Past a thousand orders neither metric
 * errors or warns. They quietly report a better number than the truth:
 * a customer whose first order fell outside the window looks like a new
 * customer in whatever month the window *does* reach, which inflates
 * "new customers" and therefore deflates CAC; and a customer's earlier
 * spend is missing from LTV, so lifetime value reads low while the
 * customer count reads high.
 *
 * Production has 34 orders and the limit is 1,000, so this is latent
 * rather than live — which is exactly why it is worth pinning now.
 *
 * `the old newest-N scan` below reproduces the previous algorithm
 * against a window smaller than the dataset and shows it returning the
 * wrong answer, beside the new one returning the right one. Seeding
 * 1,001 real orders would demonstrate nothing further: the failure is a
 * function of "more orders than the window", not of the number 1,000,
 * and it would add minutes to every run of this file.
 */

const BUSINESS_ID = 'biz-lifetime-test';
const DAY = 24 * 60 * 60 * 1000;

function at(daysAgo: number): Order['createdAt'] {
  return Timestamp.fromMillis(Date.now() - daysAgo * DAY) as unknown as Order['createdAt'];
}

function monthOf(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * DAY).toISOString().slice(0, 7);
}

async function seedPaid(phone: string, daysAgo: number, totalKes: number) {
  return seedOrder({
    businessId: BUSINESS_ID,
    status: 'confirmed',
    createdAt: at(daysAgo),
    customer: {
      customerId: null,
      phoneNumber: phone,
      customerName: `Customer ${phone}`,
      county: 'Nairobi',
    },
    pricing: {
      subtotalKes: totalKes,
      discountKes: 0,
      deliveryFeeKes: 0,
      creditsUsedKes: 0,
      totalKes,
    },
  });
}

beforeEach(async () => {
  for (const collection of ['orders', 'customerLifetime', 'marketingSpendEntries']) {
    await adminFirestore.recursiveDelete(adminFirestore.collection(collection));
  }
});

describe('the customer lifetime rollup', () => {
  it('records one document per customer, not per order', async () => {
    await seedPaid('254700000001', 40, 3000);
    await seedPaid('254700000001', 10, 5000);
    await seedPaid('254700000002', 5, 2000);

    await analyticsRollupService.rebuildCustomerLifetime(BUSINESS_ID);

    const customers = await customerLifetimeRepository.listByBusiness(BUSINESS_ID);
    expect(customers).toHaveLength(2);
  });

  it('keeps the earliest order as the first order, whatever order it is rebuilt in', async () => {
    await seedPaid('254700000001', 10, 5000);
    await seedPaid('254700000001', 90, 3000);

    await analyticsRollupService.rebuildCustomerLifetime(BUSINESS_ID);

    const [customer] = await customerLifetimeRepository.listByBusiness(BUSINESS_ID);
    expect(customer.firstOrderAt.toMillis()).toBeCloseTo(Date.now() - 90 * DAY, -5);
    expect(customer.orderCount).toBe(2);
    expect(customer.totalRevenueKes).toBe(8000);
  });

  it('counts only realised revenue', async () => {
    await seedPaid('254700000001', 5, 4000);
    /* A pay-on-delivery order is a real order but not money taken. */
    await seedOrder({
      businessId: BUSINESS_ID,
      status: 'confirmed',
      createdAt: at(4),
      payment: { paymentIntentId: 'intent-pod', mpesaReceiptNumber: null, dueOnDelivery: true },
      customer: {
        customerId: null,
        phoneNumber: '254700000001',
        customerName: 'Customer',
        county: 'Nairobi',
      },
    });
    /* A cancelled order is not revenue either. */
    await seedOrder({
      businessId: BUSINESS_ID,
      status: 'cancelled',
      createdAt: at(3),
      customer: {
        customerId: null,
        phoneNumber: '254700000001',
        customerName: 'Customer',
        county: 'Nairobi',
      },
    });

    await analyticsRollupService.rebuildCustomerLifetime(BUSINESS_ID);

    const [customer] = await customerLifetimeRepository.listByBusiness(BUSINESS_ID);
    expect(customer.orderCount).toBe(1);
    expect(customer.totalRevenueKes).toBe(4000);
  });

  it('is idempotent — rebuilding twice does not double anything', async () => {
    await seedPaid('254700000001', 10, 5000);

    await analyticsRollupService.rebuildCustomerLifetime(BUSINESS_ID);
    await analyticsRollupService.rebuildCustomerLifetime(BUSINESS_ID);

    const customers = await customerLifetimeRepository.listByBusiness(BUSINESS_ID);
    expect(customers).toHaveLength(1);
    expect(customers[0].orderCount).toBe(1);
    expect(customers[0].totalRevenueKes).toBe(5000);
  });

  it('drops customers whose orders no longer qualify', async () => {
    const orderId = await seedPaid('254700000001', 10, 5000);
    await analyticsRollupService.rebuildCustomerLifetime(BUSINESS_ID);
    expect(await customerLifetimeRepository.listByBusiness(BUSINESS_ID)).toHaveLength(1);

    await adminFirestore.collection('orders').doc(orderId).update({ status: 'cancelled' });
    await analyticsRollupService.rebuildCustomerLifetime(BUSINESS_ID);

    expect(await customerLifetimeRepository.listByBusiness(BUSINESS_ID)).toHaveLength(0);
  });

  it('does not mix businesses', async () => {
    await seedPaid('254700000001', 5, 4000);
    await seedOrder({
      businessId: 'biz-lifetime-other',
      status: 'confirmed',
      createdAt: at(5),
      customer: {
        customerId: null,
        phoneNumber: '254700000009',
        customerName: 'Other',
        county: 'Nairobi',
      },
    });

    await analyticsRollupService.rebuildCustomerLifetime(BUSINESS_ID);

    const customers = await customerLifetimeRepository.listByBusiness(BUSINESS_ID);
    expect(customers.map((c) => c.phoneNumber)).toEqual(['254700000001']);
  });
});

describe('the old newest-N scan, reproduced', () => {
  /*
   * Not a test of our code — a test of the claim that the old approach
   * was wrong. It runs the previous algorithm verbatim against a window
   * of two rather than a thousand, over four orders from two customers,
   * and asserts the specific wrong answers it produces. If this ever
   * starts passing with the correct numbers, the premise of the fix was
   * mistaken and the fix should be reconsidered.
   */
  const SMALL_WINDOW = 2;

  beforeEach(async () => {
    await seedPaid('254700000001', 100, 4000);
    await seedPaid('254700000002', 90, 6000);
    await seedPaid('254700000001', 2, 1000);
    await seedPaid('254700000002', 1, 4000);
  });

  it('under-reports lifetime value, without appearing to fail', async () => {
    const { orders } = await orderRepository.listByBusiness(BUSINESS_ID, { limit: SMALL_WINDOW });
    const revenueByPhone = new Map<string, number>();
    for (const { data } of orders) {
      const phone = data.customer.phoneNumber;
      revenueByPhone.set(phone, (revenueByPhone.get(phone) ?? 0) + data.pricing.totalKes);
    }
    const total = [...revenueByPhone.values()].reduce((s, n) => s + n, 0);

    /* Two customers, which looks right, and half the revenue, which is not. */
    expect(revenueByPhone.size).toBe(2);
    expect(total).toBe(5000);
    expect(Math.round(total / revenueByPhone.size)).toBe(2500);

    await analyticsRollupService.rebuildCustomerLifetime(BUSINESS_ID);
    const ltv = await businessAnalyticsService.getLtv(BUSINESS_ID);
    expect(ltv.totalRevenueKes).toBe(15000);
    expect(ltv.averageRevenueKes).toBe(7500);
  });

  it('mistakes returning customers for newly acquired ones', async () => {
    const { orders } = await orderRepository.listByBusiness(BUSINESS_ID, { limit: SMALL_WINDOW });
    const firstMonthByPhone = new Map<string, string>();
    for (const { data } of orders) {
      const orderMonth = new Date(
        (data.createdAt as unknown as Timestamp).toMillis(),
      )
        .toISOString()
        .slice(0, 7);
      const phone = data.customer.phoneNumber;
      const existing = firstMonthByPhone.get(phone);
      if (!existing || orderMonth < existing) {
        firstMonthByPhone.set(phone, orderMonth);
      }
    }
    const thisMonth = monthOf(1);
    const apparentlyNew = [...firstMonthByPhone.values()].filter((m) => m === thisMonth).length;

    /* Both customers first bought months ago. The scan says both are new. */
    expect(apparentlyNew).toBeGreaterThan(0);

    await analyticsRollupService.rebuildCustomerLifetime(BUSINESS_ID);
    const cac = await businessAnalyticsService.getCac(BUSINESS_ID, thisMonth);
    expect(cac.newCustomers).toBe(0);
  });
});

describe('getLtv over the full dataset', () => {
  it('agrees with the old scan when everything fits inside it', async () => {
    await seedPaid('254700000001', 10, 5000);
    await seedPaid('254700000001', 5, 3000);
    await seedPaid('254700000002', 2, 2000);
    await analyticsRollupService.rebuildCustomerLifetime(BUSINESS_ID);

    const ltv = await businessAnalyticsService.getLtv(BUSINESS_ID);

    expect(ltv.customerCount).toBe(2);
    expect(ltv.totalRevenueKes).toBe(10000);
    expect(ltv.averageRevenueKes).toBe(5000);
  });

  /*
   * The cliff. Two customers, four orders; the scan window reaches only
   * the newest two. The old code sees one order each and reports an
   * average of 2,500 — half the truth — while still reporting two
   * customers, so nothing looks obviously wrong.
   */
  it('sees spend that falls outside the old scan window', async () => {
    await seedPaid('254700000001', 100, 4000);
    await seedPaid('254700000002', 90, 6000);
    await seedPaid('254700000001', 2, 1000);
    await seedPaid('254700000002', 1, 4000);
    await analyticsRollupService.rebuildCustomerLifetime(BUSINESS_ID);

    const ltv = await businessAnalyticsService.getLtv(BUSINESS_ID);

    expect(ltv.customerCount).toBe(2);
    expect(ltv.totalRevenueKes).toBe(15000);
    expect(ltv.averageRevenueKes).toBe(7500);
  });

  it('reports zeroes rather than dividing by nothing when there are no customers', async () => {
    const ltv = await businessAnalyticsService.getLtv(BUSINESS_ID);
    expect(ltv).toEqual({ customerCount: 0, totalRevenueKes: 0, averageRevenueKes: 0 });
  });
});

describe('getCac over the full dataset', () => {
  async function setSpend(month: string, amountKes: number) {
    await businessAnalyticsService.setMarketingSpend(BUSINESS_ID, month, amountKes, 'test');
  }

  it('counts a customer as new in the month of their first-ever order', async () => {
    const month = monthOf(45);
    await seedPaid('254700000001', 45, 4000);
    await setSpend(month, 20000);
    await analyticsRollupService.rebuildCustomerLifetime(BUSINESS_ID);

    const cac = await businessAnalyticsService.getCac(BUSINESS_ID, month);

    expect(cac.newCustomers).toBe(1);
    expect(cac.cacKes).toBe(20000);
  });

  /*
   * The damaging case. A customer first bought 100 days ago and bought
   * again this month. They are not a new customer this month — but if
   * the scan window only reaches the recent order, they look like one,
   * and CAC is reported as half what it really is.
   */
  it('does not count a returning customer as newly acquired', async () => {
    const thisMonth = monthOf(1);
    await seedPaid('254700000001', 100, 4000);
    await seedPaid('254700000001', 1, 4000);
    await seedPaid('254700000002', 1, 4000);
    await setSpend(thisMonth, 20000);
    await analyticsRollupService.rebuildCustomerLifetime(BUSINESS_ID);

    const cac = await businessAnalyticsService.getCac(BUSINESS_ID, thisMonth);

    expect(cac.newCustomers).toBe(1);
    expect(cac.cacKes).toBe(20000);
  });

  it('never fabricates a zero when no spend has been entered', async () => {
    const month = monthOf(1);
    await seedPaid('254700000001', 1, 4000);
    await analyticsRollupService.rebuildCustomerLifetime(BUSINESS_ID);

    const cac = await businessAnalyticsService.getCac(BUSINESS_ID, month);

    expect(cac.spendKes).toBeNull();
    expect(cac.cacKes).toBeNull();
    expect(cac.newCustomers).toBe(1);
  });

  /*
   * The channel is frozen at acquisition. A customer first reached
   * through a TikTok ad stays a TikTok acquisition even when they come
   * back later through some other route — otherwise a returning
   * customer would silently re-attribute historic spend to whichever
   * channel they happened to use most recently.
   */
  it('attributes a new customer to the channel of their first order', async () => {
    const month = monthOf(1);
    await seedOrder({
      businessId: BUSINESS_ID,
      status: 'confirmed',
      createdAt: at(1),
      attribution: { channel: 'web', ttclid: 'tt-click-1' },
      customer: {
        customerId: null,
        phoneNumber: '254700000001',
        customerName: 'Customer',
        county: 'Nairobi',
      },
    });
    await setSpend(month, 10000);
    await analyticsRollupService.rebuildCustomerLifetime(BUSINESS_ID);

    const byChannel = await businessAnalyticsService.getCacByChannel(BUSINESS_ID, month);
    const tiktok = byChannel.find((c) => c.channel === 'tiktok');

    expect(byChannel.map((c) => c.channel).sort()).toEqual(['meta', 'tiktok']);
    expect(tiktok?.newCustomers).toBe(1);
  });

  /* An order through a channel with no ad spend is not an ad acquisition. */
  it('leaves an unattributed order out of the paid-channel split', async () => {
    const month = monthOf(1);
    await seedPaid('254700000002', 1, 4000);
    await setSpend(month, 10000);
    await analyticsRollupService.rebuildCustomerLifetime(BUSINESS_ID);

    const byChannel = await businessAnalyticsService.getCacByChannel(BUSINESS_ID, month);

    expect(byChannel.reduce((sum, c) => sum + c.newCustomers, 0)).toBe(0);
    /* …while the overall CAC still counts them, because they are a real customer. */
    const cac = await businessAnalyticsService.getCac(BUSINESS_ID, month);
    expect(cac.newCustomers).toBe(1);
  });
});
