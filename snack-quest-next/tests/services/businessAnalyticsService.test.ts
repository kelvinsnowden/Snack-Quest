import { beforeEach, describe, expect, it } from 'vitest';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { userRepository } from '@/repositories/userRepository';
import { createInTransaction as createAttributionInTransaction } from '@/repositories/referralAttributionRepository';
import { businessAnalyticsService } from '@/services/businessAnalyticsService';
import { seedOrder } from '../helpers/orderFixtures';
import type { Order } from '@/types';

/**
 * `BusinessAnalyticsService` (§ Admin: Analytics) — revenue bucketing,
 * funnel counting, top creators, and CAC, all against the real
 * emulator with real seeded data (no mocking of our own aggregation
 * logic — that's the thing under test).
 */

const BUSINESS_ID = 'biz-analytics-test';
const OTHER_BUSINESS_ID = 'biz-analytics-other';

function daysAgo(n: number) {
  return Timestamp.fromMillis(Date.now() - n * 24 * 60 * 60 * 1000) as unknown as Order['createdAt'];
}

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('orders'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('conversations'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('referralAttributions'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('marketingSpendEntries'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('users'));
});

describe('BusinessAnalyticsService.getRevenueOverview', () => {
  it('sums only revenue-counting statuses within the window, excluding cancelled/refund_requested and older orders', async () => {
    await seedOrder({ businessId: BUSINESS_ID, status: 'confirmed', createdAt: daysAgo(1), pricing: { subtotalKes: 2500, discountKes: 0, deliveryFeeKes: 0, creditsUsedKes: 0, totalKes: 2500 } });
    await seedOrder({ businessId: BUSINESS_ID, status: 'delivered', createdAt: daysAgo(2), pricing: { subtotalKes: 3500, discountKes: 0, deliveryFeeKes: 0, creditsUsedKes: 0, totalKes: 3500 } });
    await seedOrder({ businessId: BUSINESS_ID, status: 'cancelled', createdAt: daysAgo(1), pricing: { subtotalKes: 9000, discountKes: 0, deliveryFeeKes: 0, creditsUsedKes: 0, totalKes: 9000 } });
    await seedOrder({ businessId: BUSINESS_ID, status: 'confirmed', createdAt: daysAgo(45), pricing: { subtotalKes: 9000, discountKes: 0, deliveryFeeKes: 0, creditsUsedKes: 0, totalKes: 9000 } });
    await seedOrder({ businessId: OTHER_BUSINESS_ID, status: 'confirmed', createdAt: daysAgo(1), pricing: { subtotalKes: 9000, discountKes: 0, deliveryFeeKes: 0, creditsUsedKes: 0, totalKes: 9000 } });

    const overview = await businessAnalyticsService.getRevenueOverview(BUSINESS_ID, 30);

    expect(overview.totalRevenueKes).toBe(6000);
    expect(overview.orderCount).toBe(2);
    expect(overview.averageOrderValueKes).toBe(3000);
    expect(overview.days).toHaveLength(30);
  });
});

describe('BusinessAnalyticsService.getFunnel', () => {
  it('counts real milestones from conversation state', async () => {
    await adminFirestore.collection('conversations').add({
      businessId: BUSINESS_ID,
      phoneNumber: '254700000001',
      customerId: null,
      status: 'active',
      currentStep: 'awaiting_package_selection',
      stateBlob: {},
      referralLinkId: null,
      attributionSnapshot: null,
      assignedAgentId: null,
      escalationReason: null,
      conversationCheckoutSnapshotId: null,
      startedAt: FieldValue.serverTimestamp(),
      lastMessageAt: FieldValue.serverTimestamp(),
    });
    await adminFirestore.collection('conversations').add({
      businessId: BUSINESS_ID,
      phoneNumber: '254700000002',
      customerId: null,
      status: 'active',
      currentStep: 'awaiting_delivery_selection',
      stateBlob: { packageId: 'pkg-1' },
      referralLinkId: null,
      attributionSnapshot: null,
      assignedAgentId: null,
      escalationReason: null,
      conversationCheckoutSnapshotId: null,
      startedAt: FieldValue.serverTimestamp(),
      lastMessageAt: FieldValue.serverTimestamp(),
    });
    await adminFirestore.collection('conversations').add({
      businessId: BUSINESS_ID,
      phoneNumber: '254700000003',
      customerId: null,
      status: 'completed',
      currentStep: 'completed',
      stateBlob: { packageId: 'pkg-1', deliveryMethod: 'pickup' },
      referralLinkId: null,
      attributionSnapshot: null,
      assignedAgentId: null,
      escalationReason: null,
      conversationCheckoutSnapshotId: null,
      startedAt: FieldValue.serverTimestamp(),
      lastMessageAt: FieldValue.serverTimestamp(),
    });

    const funnel = await businessAnalyticsService.getFunnel(BUSINESS_ID);

    expect(funnel).toEqual([
      { step: 'Started a conversation', count: 3 },
      { step: 'Selected a box', count: 2 },
      { step: 'Chose a delivery method', count: 1 },
      { step: 'Completed purchase', count: 1 },
    ]);
  });
});

describe('BusinessAnalyticsService.getTopCreators', () => {
  it('sums commissions per creator, joined with identity, sorted descending', async () => {
    await userRepository.create('creator-1', { email: 'a@example.com', roles: ['creator'], displayName: 'Alice', photoURL: null }, 'system');
    await userRepository.create('creator-2', { email: 'b@example.com', roles: ['creator'], displayName: 'Bob', photoURL: null }, 'system');

    await adminFirestore.runTransaction(async (tx) => {
      createAttributionInTransaction(tx, { businessId: BUSINESS_ID, referralLinkId: 'l1', creatorId: 'creator-1', orderId: 'o1', conversationId: 'c1', discountKes: 100, commissionKes: 50 });
    });
    await adminFirestore.runTransaction(async (tx) => {
      createAttributionInTransaction(tx, { businessId: BUSINESS_ID, referralLinkId: 'l1', creatorId: 'creator-1', orderId: 'o2', conversationId: 'c2', discountKes: 100, commissionKes: 50 });
    });
    await adminFirestore.runTransaction(async (tx) => {
      createAttributionInTransaction(tx, { businessId: BUSINESS_ID, referralLinkId: 'l2', creatorId: 'creator-2', orderId: 'o3', conversationId: 'c3', discountKes: 100, commissionKes: 30 });
    });

    const top = await businessAnalyticsService.getTopCreators(BUSINESS_ID);

    expect(top).toEqual([
      { creatorId: 'creator-1', displayName: 'Alice', conversions: 2, commissionKes: 100 },
      { creatorId: 'creator-2', displayName: 'Bob', conversions: 1, commissionKes: 30 },
    ]);
  });
});

describe('BusinessAnalyticsService.getCac / setMarketingSpend', () => {
  it('returns null spend/cac when no spend has been entered', async () => {
    const cac = await businessAnalyticsService.getCac(BUSINESS_ID, '2026-01');
    expect(cac.spendKes).toBeNull();
    expect(cac.cacKes).toBeNull();
  });

  it('computes CAC from entered spend and new customers in that month', async () => {
    const monthStart = new Date('2026-01-15T00:00:00.000Z').getTime();
    await seedOrder({
      businessId: BUSINESS_ID,
      status: 'confirmed',
      createdAt: Timestamp.fromMillis(monthStart) as unknown as Order['createdAt'],
      customer: { customerId: null, phoneNumber: '254700000010', customerName: 'New Customer', county: 'Nairobi' },
    });
    await businessAnalyticsService.setMarketingSpend(BUSINESS_ID, '2026-01', 5000, 'staff-1');

    const cac = await businessAnalyticsService.getCac(BUSINESS_ID, '2026-01');

    expect(cac.spendKes).toBe(5000);
    expect(cac.newCustomers).toBe(1);
    expect(cac.cacKes).toBe(5000);
  });
});
