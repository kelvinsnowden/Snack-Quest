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
  await adminFirestore.recursiveDelete(adminFirestore.collection('shipments'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('pageViews'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('refunds'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('paymentIntents'));
});

function seedRefund(overrides: {
  businessId?: string;
  orderId: string;
  amountKes: number;
  status?: 'pending' | 'processing' | 'succeeded' | 'failed';
  createdAtMillis?: number;
}) {
  const now = FieldValue.serverTimestamp();
  return adminFirestore.collection('refunds').add({
    businessId: overrides.businessId ?? BUSINESS_ID,
    orderId: overrides.orderId,
    amountKes: overrides.amountKes,
    reason: 'test refund',
    status: overrides.status ?? 'succeeded',
    auditTrail: [],
    requestedBy: 'staff-1',
    originalMpesaReceiptNumber: 'ABC123XYZ',
    reversalOriginatorConversationId: null,
    reversalConversationId: null,
    reversalTransactionId: null,
    completedAt: null,
    createdAt: overrides.createdAtMillis !== undefined ? Timestamp.fromMillis(overrides.createdAtMillis) : now,
    updatedAt: now,
    createdBy: 'staff-1',
    updatedBy: 'staff-1',
    deletedAt: null,
  });
}

function seedPaymentIntent(overrides: {
  businessId?: string;
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'expired';
  createdAtMillis?: number;
}) {
  const now = FieldValue.serverTimestamp();
  return adminFirestore.collection('paymentIntents').add({
    businessId: overrides.businessId ?? BUSINESS_ID,
    conversationId: 'conv-1',
    conversationCheckoutSnapshotId: 'snapshot-1',
    customerId: null,
    phoneNumber: '254712345678',
    amountKes: 2500,
    status: overrides.status,
    createdAt: overrides.createdAtMillis !== undefined ? Timestamp.fromMillis(overrides.createdAtMillis) : now,
    updatedAt: now,
  });
}

function seedPageView(overrides: {
  businessId?: string;
  path: string;
  visitorId: string;
  createdAtMillis?: number;
}) {
  return adminFirestore.collection('pageViews').add({
    businessId: overrides.businessId ?? BUSINESS_ID,
    path: overrides.path,
    visitorId: overrides.visitorId,
    referrer: null,
    createdAt: Timestamp.fromMillis(overrides.createdAtMillis ?? Date.now()),
  });
}

function seedShipment(overrides: {
  businessId?: string;
  status: 'pending' | 'pending_manual_booking' | 'created' | 'in_transit' | 'delivered' | 'failed';
  method?: 'door' | 'pickup';
  createdAtMillis?: number;
  deliveredAtMillis?: number | null;
}) {
  return adminFirestore.collection('shipments').add({
    businessId: overrides.businessId ?? BUSINESS_ID,
    orderId: 'order-1',
    method: overrides.method ?? 'door',
    provider: 'jumia',
    courierShipmentRef: null,
    trackingUrl: null,
    status: overrides.status,
    recipientName: 'Jane',
    recipientPhone: '254700000000',
    county: 'Nairobi',
    addressText: null,
    trackingEvents: [],
    deliveredAt:
      overrides.deliveredAtMillis !== undefined && overrides.deliveredAtMillis !== null
        ? Timestamp.fromMillis(overrides.deliveredAtMillis)
        : null,
    createdAt: Timestamp.fromMillis(overrides.createdAtMillis ?? Date.now()),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

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

  it('computes the previous equal-length window separately, for a real "vs last period" comparison', async () => {
    // Current 30-day window.
    await seedOrder({ businessId: BUSINESS_ID, status: 'confirmed', createdAt: daysAgo(1), pricing: { subtotalKes: 4000, discountKes: 0, deliveryFeeKes: 0, creditsUsedKes: 0, totalKes: 4000 } });
    // Previous 30-day window (days 31-60 ago).
    await seedOrder({ businessId: BUSINESS_ID, status: 'delivered', createdAt: daysAgo(35), pricing: { subtotalKes: 1000, discountKes: 0, deliveryFeeKes: 0, creditsUsedKes: 0, totalKes: 1000 } });
    await seedOrder({ businessId: BUSINESS_ID, status: 'confirmed', createdAt: daysAgo(50), pricing: { subtotalKes: 500, discountKes: 0, deliveryFeeKes: 0, creditsUsedKes: 0, totalKes: 500 } });
    // Older than the previous window entirely (61+ days ago) — excluded from both.
    await seedOrder({ businessId: BUSINESS_ID, status: 'confirmed', createdAt: daysAgo(90), pricing: { subtotalKes: 9000, discountKes: 0, deliveryFeeKes: 0, creditsUsedKes: 0, totalKes: 9000 } });

    const overview = await businessAnalyticsService.getRevenueOverview(BUSINESS_ID, 30);

    expect(overview.totalRevenueKes).toBe(4000);
    expect(overview.previousPeriod.totalRevenueKes).toBe(1500);
    expect(overview.previousPeriod.orderCount).toBe(2);
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

describe('BusinessAnalyticsService.getDeliveryPerformance', () => {
  it('returns zeroed-out defaults with no shipments', async () => {
    const result = await businessAnalyticsService.getDeliveryPerformance(BUSINESS_ID);
    expect(result).toEqual({
      totalShipments: 0,
      statusBreakdown: [],
      methodBreakdown: [],
      deliveredCount: 0,
      failedCount: 0,
      medianDeliveryHours: null,
    });
  });

  it('breaks down by status and method, scoped to the business', async () => {
    const now = Date.now();
    await seedShipment({ status: 'delivered', method: 'door', createdAtMillis: now, deliveredAtMillis: now + 5 * 60 * 60 * 1000 });
    await seedShipment({ status: 'in_transit', method: 'pickup', createdAtMillis: now });
    await seedShipment({ status: 'failed', method: 'door', createdAtMillis: now });
    await seedShipment({ businessId: OTHER_BUSINESS_ID, status: 'delivered', createdAtMillis: now, deliveredAtMillis: now });

    const result = await businessAnalyticsService.getDeliveryPerformance(BUSINESS_ID);

    expect(result.totalShipments).toBe(3);
    expect(result.deliveredCount).toBe(1);
    expect(result.failedCount).toBe(1);
    expect(result.statusBreakdown).toEqual(
      expect.arrayContaining([
        { status: 'delivered', label: 'Delivered', count: 1 },
        { status: 'in_transit', label: 'In transit', count: 1 },
        { status: 'failed', label: 'Failed', count: 1 },
      ]),
    );
    expect(result.methodBreakdown).toEqual(expect.arrayContaining([{ method: 'door', count: 2 }, { method: 'pickup', count: 1 }]));
  });

  it('computes the median delivery time in hours across delivered shipments only', async () => {
    const now = Date.now();
    await seedShipment({ status: 'delivered', createdAtMillis: now, deliveredAtMillis: now + 2 * 60 * 60 * 1000 });
    await seedShipment({ status: 'delivered', createdAtMillis: now, deliveredAtMillis: now + 4 * 60 * 60 * 1000 });
    await seedShipment({ status: 'delivered', createdAtMillis: now, deliveredAtMillis: now + 12 * 60 * 60 * 1000 });
    // Not delivered — must not contribute to the median.
    await seedShipment({ status: 'in_transit', createdAtMillis: now });

    const result = await businessAnalyticsService.getDeliveryPerformance(BUSINESS_ID);

    expect(result.medianDeliveryHours).toBe(4);
  });
});

describe('BusinessAnalyticsService.getTraffic', () => {
  it('counts total visits and distinct visitors within the window, scoped to the business', async () => {
    await seedPageView({ path: '/', visitorId: 'visitor-1', createdAtMillis: daysAgo(1).toMillis() });
    // Same visitor, a second page — counts as another visit, not another visitor.
    await seedPageView({ path: '/boxes', visitorId: 'visitor-1', createdAtMillis: daysAgo(1).toMillis() });
    await seedPageView({ path: '/', visitorId: 'visitor-2', createdAtMillis: daysAgo(2).toMillis() });
    // Outside the 30-day window entirely.
    await seedPageView({ path: '/', visitorId: 'visitor-3', createdAtMillis: daysAgo(45).toMillis() });
    // A different business's traffic — must never leak in.
    await seedPageView({ businessId: OTHER_BUSINESS_ID, path: '/', visitorId: 'visitor-4', createdAtMillis: daysAgo(1).toMillis() });

    const traffic = await businessAnalyticsService.getTraffic(BUSINESS_ID, 30);

    expect(traffic.totalVisits).toBe(3);
    expect(traffic.uniqueVisitors).toBe(2);
    expect(traffic.days).toHaveLength(30);
  });

  it('computes the previous equal-length window separately, same as revenue', async () => {
    await seedPageView({ path: '/', visitorId: 'v1', createdAtMillis: daysAgo(1).toMillis() });
    await seedPageView({ path: '/', visitorId: 'v2', createdAtMillis: daysAgo(35).toMillis() });
    await seedPageView({ path: '/', visitorId: 'v3', createdAtMillis: daysAgo(40).toMillis() });

    const traffic = await businessAnalyticsService.getTraffic(BUSINESS_ID, 30);

    expect(traffic.totalVisits).toBe(1);
    expect(traffic.previousPeriod.totalVisits).toBe(2);
    expect(traffic.previousPeriod.uniqueVisitors).toBe(2);
  });

  it('ranks top pages by visit count', async () => {
    await seedPageView({ path: '/boxes', visitorId: 'v1', createdAtMillis: daysAgo(1).toMillis() });
    await seedPageView({ path: '/boxes', visitorId: 'v2', createdAtMillis: daysAgo(1).toMillis() });
    await seedPageView({ path: '/', visitorId: 'v1', createdAtMillis: daysAgo(1).toMillis() });

    const traffic = await businessAnalyticsService.getTraffic(BUSINESS_ID, 30);

    expect(traffic.topPages[0]).toEqual({ path: '/boxes', visits: 2 });
    expect(traffic.topPages[1]).toEqual({ path: '/', visits: 1 });
  });

  it('reports zeroes rather than throwing when nothing has been recorded', async () => {
    const traffic = await businessAnalyticsService.getTraffic(BUSINESS_ID, 30);

    expect(traffic.totalVisits).toBe(0);
    expect(traffic.uniqueVisitors).toBe(0);
    expect(traffic.topPages).toEqual([]);
  });
});

describe('BusinessAnalyticsService.getTrafficForRange', () => {
  it('counts only visits inside the given [start, end) window, scoped to the business', async () => {
    const start = new Date('2026-08-15T00:00:00.000Z');
    const end = new Date('2026-08-16T00:00:00.000Z');

    await seedPageView({ path: '/', visitorId: 'v1', createdAtMillis: Date.parse('2026-08-15T09:00:00.000Z') });
    await seedPageView({ path: '/boxes', visitorId: 'v1', createdAtMillis: Date.parse('2026-08-15T10:00:00.000Z') });
    // The day before — outside the window.
    await seedPageView({ path: '/', visitorId: 'v2', createdAtMillis: Date.parse('2026-08-14T23:00:00.000Z') });
    // A different business's traffic — must never leak in.
    await seedPageView({ businessId: OTHER_BUSINESS_ID, path: '/', visitorId: 'v3', createdAtMillis: Date.parse('2026-08-15T09:30:00.000Z') });

    const traffic = await businessAnalyticsService.getTrafficForRange(BUSINESS_ID, { start, end });

    expect(traffic.totalVisits).toBe(2);
    expect(traffic.uniqueVisitors).toBe(1);
  });

  it('computes the equal-length window immediately before "start" as the previous period', async () => {
    const start = new Date('2026-08-10T00:00:00.000Z');
    const end = new Date('2026-08-17T00:00:00.000Z'); // 7-day window

    await seedPageView({ path: '/', visitorId: 'in-window', createdAtMillis: Date.parse('2026-08-12T00:00:00.000Z') });
    // 5 days before "start" — inside the previous 7-day window.
    await seedPageView({ path: '/', visitorId: 'prev-1', createdAtMillis: Date.parse('2026-08-05T00:00:00.000Z') });
    // Outside both windows entirely.
    await seedPageView({ path: '/', visitorId: 'too-old', createdAtMillis: Date.parse('2026-07-01T00:00:00.000Z') });

    const traffic = await businessAnalyticsService.getTrafficForRange(BUSINESS_ID, { start, end });

    expect(traffic.totalVisits).toBe(1);
    expect(traffic.previousPeriod.totalVisits).toBe(1);
    expect(traffic.previousPeriod.uniqueVisitors).toBe(1);
  });

  it('produces one day bucket per calendar date in range, including zero-visit days', async () => {
    const start = new Date('2026-08-01T00:00:00.000Z');
    const end = new Date('2026-08-04T00:00:00.000Z'); // Aug 1, 2, 3

    await seedPageView({ path: '/', visitorId: 'v1', createdAtMillis: Date.parse('2026-08-01T12:00:00.000Z') });

    const traffic = await businessAnalyticsService.getTrafficForRange(BUSINESS_ID, { start, end });

    expect(traffic.days.map((d) => d.date)).toEqual(['2026-08-01', '2026-08-02', '2026-08-03']);
    expect(traffic.days[0].visits).toBe(1);
    expect(traffic.days[1].visits).toBe(0);
    expect(traffic.days[2].visits).toBe(0);
  });

  it('reports zeroes rather than throwing for a range with no recorded visits', async () => {
    const traffic = await businessAnalyticsService.getTrafficForRange(BUSINESS_ID, {
      start: new Date('2026-08-01T00:00:00.000Z'),
      end: new Date('2026-08-02T00:00:00.000Z'),
    });

    expect(traffic.totalVisits).toBe(0);
    expect(traffic.uniqueVisitors).toBe(0);
    expect(traffic.topPages).toEqual([]);
    expect(traffic.days).toHaveLength(1);
  });
});

describe('BusinessAnalyticsService.getRevenueByChannel', () => {
  it('buckets orders by acquisition channel, referral taking priority over an ad click id', async () => {
    await seedOrder({
      businessId: BUSINESS_ID,
      status: 'confirmed',
      pricing: { subtotalKes: 2500, discountKes: 0, deliveryFeeKes: 0, creditsUsedKes: 0, totalKes: 2500 },
      referralLinkId: 'link-1',
      attribution: { channel: 'web', ttclid: 'tt-abc' },
    });
    await seedOrder({
      businessId: BUSINESS_ID,
      status: 'confirmed',
      pricing: { subtotalKes: 3000, discountKes: 0, deliveryFeeKes: 0, creditsUsedKes: 0, totalKes: 3000 },
      referralLinkId: null,
      attribution: { channel: 'web', ttclid: 'tt-xyz' },
    });
    await seedOrder({
      businessId: BUSINESS_ID,
      status: 'confirmed',
      pricing: { subtotalKes: 1500, discountKes: 0, deliveryFeeKes: 0, creditsUsedKes: 0, totalKes: 1500 },
      referralLinkId: null,
      attribution: { channel: 'web', fbclid: 'fb-123' },
    });
    await seedOrder({
      businessId: BUSINESS_ID,
      status: 'confirmed',
      pricing: { subtotalKes: 1000, discountKes: 0, deliveryFeeKes: 0, creditsUsedKes: 0, totalKes: 1000 },
      referralLinkId: null,
      attribution: { channel: 'web' },
    });
    await seedOrder({
      businessId: BUSINESS_ID,
      status: 'confirmed',
      pricing: { subtotalKes: 500, discountKes: 0, deliveryFeeKes: 0, creditsUsedKes: 0, totalKes: 500 },
      referralLinkId: null,
      attribution: null,
    });

    const result = await businessAnalyticsService.getRevenueByChannel(BUSINESS_ID, 30);

    expect(result.channels).toEqual(
      expect.arrayContaining([
        { channel: 'referral', orderCount: 1, revenueKes: 2500 },
        { channel: 'tiktok', orderCount: 1, revenueKes: 3000 },
        { channel: 'meta', orderCount: 1, revenueKes: 1500 },
        { channel: 'organic-web', orderCount: 1, revenueKes: 1000 },
        { channel: 'other', orderCount: 1, revenueKes: 500 },
      ]),
    );
  });

  it('excludes cancelled orders and orders outside the window', async () => {
    await seedOrder({
      businessId: BUSINESS_ID,
      status: 'cancelled',
      pricing: { subtotalKes: 9000, discountKes: 0, deliveryFeeKes: 0, creditsUsedKes: 0, totalKes: 9000 },
      attribution: null,
    });
    await seedOrder({
      businessId: BUSINESS_ID,
      status: 'confirmed',
      createdAt: daysAgo(45),
      pricing: { subtotalKes: 9000, discountKes: 0, deliveryFeeKes: 0, creditsUsedKes: 0, totalKes: 9000 },
      attribution: null,
    });

    const result = await businessAnalyticsService.getRevenueByChannel(BUSINESS_ID, 30);

    expect(result.channels).toEqual([]);
  });
});

describe('BusinessAnalyticsService.getCacByChannel', () => {
  it('computes CAC per platform from that platform\'s spend and new customers whose first order came through it', async () => {
    const monthStart = new Date('2026-02-10T00:00:00.000Z').getTime();
    await businessAnalyticsService.setMarketingSpend(BUSINESS_ID, '2026-02', 10000, 'staff-1', {
      metaSpendKes: 4000,
      tiktokSpendKes: 6000,
    });
    await seedOrder({
      businessId: BUSINESS_ID,
      status: 'confirmed',
      createdAt: Timestamp.fromMillis(monthStart) as unknown as Order['createdAt'],
      customer: { customerId: null, phoneNumber: '254700000021', customerName: 'Meta Customer', county: 'Nairobi' },
      attribution: { channel: 'web', fbclid: 'fb-1' },
    });
    await seedOrder({
      businessId: BUSINESS_ID,
      status: 'confirmed',
      createdAt: Timestamp.fromMillis(monthStart) as unknown as Order['createdAt'],
      customer: { customerId: null, phoneNumber: '254700000022', customerName: 'TikTok Customer 1', county: 'Nairobi' },
      attribution: { channel: 'web', ttclid: 'tt-1' },
    });
    await seedOrder({
      businessId: BUSINESS_ID,
      status: 'confirmed',
      createdAt: Timestamp.fromMillis(monthStart) as unknown as Order['createdAt'],
      customer: { customerId: null, phoneNumber: '254700000023', customerName: 'TikTok Customer 2', county: 'Nairobi' },
      attribution: { channel: 'web', ttclid: 'tt-2' },
    });

    const result = await businessAnalyticsService.getCacByChannel(BUSINESS_ID, '2026-02');

    expect(result).toEqual(
      expect.arrayContaining([
        { channel: 'meta', month: '2026-02', spendKes: 4000, newCustomers: 1, cacKes: 4000 },
        { channel: 'tiktok', month: '2026-02', spendKes: 6000, newCustomers: 2, cacKes: 3000 },
      ]),
    );
  });

  it('returns a null CAC for a channel with no spend entered, never a fabricated zero', async () => {
    const result = await businessAnalyticsService.getCacByChannel(BUSINESS_ID, '2026-03');

    expect(result).toEqual([
      { channel: 'meta', month: '2026-03', spendKes: null, newCustomers: 0, cacKes: null },
      { channel: 'tiktok', month: '2026-03', spendKes: null, newCustomers: 0, cacKes: null },
    ]);
  });
});

describe('BusinessAnalyticsService.getCreatorRoi', () => {
  it('sums real revenue and commission per creator and computes ROI', async () => {
    await userRepository.create('creator-1', { email: 'a@example.com', roles: ['creator'], displayName: 'Alice', photoURL: null }, 'system');

    const order1 = await seedOrder({
      businessId: BUSINESS_ID,
      status: 'confirmed',
      pricing: { subtotalKes: 2500, discountKes: 0, deliveryFeeKes: 0, creditsUsedKes: 0, totalKes: 2500 },
    });
    const order2 = await seedOrder({
      businessId: BUSINESS_ID,
      status: 'confirmed',
      pricing: { subtotalKes: 3500, discountKes: 0, deliveryFeeKes: 0, creditsUsedKes: 0, totalKes: 3500 },
    });

    await adminFirestore.runTransaction(async (tx) => {
      createAttributionInTransaction(tx, { businessId: BUSINESS_ID, referralLinkId: 'l1', creatorId: 'creator-1', orderId: order1, conversationId: 'c1', discountKes: 0, commissionKes: 250 });
    });
    await adminFirestore.runTransaction(async (tx) => {
      createAttributionInTransaction(tx, { businessId: BUSINESS_ID, referralLinkId: 'l1', creatorId: 'creator-1', orderId: order2, conversationId: 'c2', discountKes: 0, commissionKes: 350 });
    });

    const roi = await businessAnalyticsService.getCreatorRoi(BUSINESS_ID, 30);

    expect(roi).toEqual([
      { creatorId: 'creator-1', displayName: 'Alice', orderCount: 2, revenueKes: 6000, commissionKes: 600, roi: 10 },
    ]);
  });

  it('reports a null ROI when no commission has been paid, never a fabricated infinity', async () => {
    await userRepository.create('creator-1', { email: 'a@example.com', roles: ['creator'], displayName: 'Alice', photoURL: null }, 'system');
    const order1 = await seedOrder({ businessId: BUSINESS_ID, status: 'confirmed' });
    await adminFirestore.runTransaction(async (tx) => {
      createAttributionInTransaction(tx, { businessId: BUSINESS_ID, referralLinkId: 'l1', creatorId: 'creator-1', orderId: order1, conversationId: 'c1', discountKes: 0, commissionKes: 0 });
    });

    const roi = await businessAnalyticsService.getCreatorRoi(BUSINESS_ID, 30);

    expect(roi[0].roi).toBeNull();
  });
});

describe('BusinessAnalyticsService.getRefundRate', () => {
  it('computes the refund rate from real succeeded refunds against real paid orders', async () => {
    const order1 = await seedOrder({
      businessId: BUSINESS_ID,
      status: 'refunded',
      pricing: { subtotalKes: 2500, discountKes: 0, deliveryFeeKes: 0, creditsUsedKes: 0, totalKes: 2500 },
    });
    await seedOrder({
      businessId: BUSINESS_ID,
      status: 'confirmed',
      pricing: { subtotalKes: 7500, discountKes: 0, deliveryFeeKes: 0, creditsUsedKes: 0, totalKes: 7500 },
    });
    await seedRefund({ orderId: order1, amountKes: 2500, status: 'succeeded' });
    // A pending refund must not count yet — no money has actually moved back.
    await seedRefund({ orderId: order1, amountKes: 2500, status: 'pending' });

    const result = await businessAnalyticsService.getRefundRate(BUSINESS_ID, 30);

    expect(result.orderCount).toBe(2);
    expect(result.revenueKes).toBe(10000);
    expect(result.refundedOrderCount).toBe(1);
    expect(result.refundedAmountKes).toBe(2500);
    expect(result.refundRatePct).toBe(25);
  });

  it('excludes refunds outside the window', async () => {
    const order1 = await seedOrder({ businessId: BUSINESS_ID, status: 'refunded' });
    await seedRefund({ orderId: order1, amountKes: 2500, status: 'succeeded', createdAtMillis: daysAgo(45).toMillis() });

    const result = await businessAnalyticsService.getRefundRate(BUSINESS_ID, 30);

    expect(result.refundedOrderCount).toBe(0);
    expect(result.refundedAmountKes).toBe(0);
  });

  it('reports zero rather than NaN when there is no revenue in the window', async () => {
    const result = await businessAnalyticsService.getRefundRate(BUSINESS_ID, 30);
    expect(result.refundRatePct).toBe(0);
  });
});

describe('BusinessAnalyticsService.getRepeatPurchaseRate', () => {
  it('counts a customer with 2+ orders in the window as repeat', async () => {
    const repeatCustomer = { customerId: null, phoneNumber: '254700000031', customerName: 'Repeat Customer', county: 'Nairobi' };
    const singleCustomer = { customerId: null, phoneNumber: '254700000032', customerName: 'One-time Customer', county: 'Nairobi' };
    await seedOrder({ businessId: BUSINESS_ID, status: 'confirmed', customer: repeatCustomer });
    await seedOrder({ businessId: BUSINESS_ID, status: 'delivered', customer: repeatCustomer });
    await seedOrder({ businessId: BUSINESS_ID, status: 'confirmed', customer: singleCustomer });

    const result = await businessAnalyticsService.getRepeatPurchaseRate(BUSINESS_ID, 30);

    expect(result.customerCount).toBe(2);
    expect(result.repeatCustomerCount).toBe(1);
    expect(result.repeatRatePct).toBe(50);
  });

  it('reports zero rather than NaN with no orders in the window', async () => {
    const result = await businessAnalyticsService.getRepeatPurchaseRate(BUSINESS_ID, 30);
    expect(result.repeatRatePct).toBe(0);
  });
});

describe('BusinessAnalyticsService.getCheckoutAbandonment', () => {
  it('counts every non-succeeded payment intent as abandoned', async () => {
    await seedPaymentIntent({ status: 'succeeded' });
    await seedPaymentIntent({ status: 'succeeded' });
    await seedPaymentIntent({ status: 'failed' });
    await seedPaymentIntent({ status: 'expired' });
    await seedPaymentIntent({ status: 'pending' });

    const result = await businessAnalyticsService.getCheckoutAbandonment(BUSINESS_ID, 30);

    expect(result.totalIntents).toBe(5);
    expect(result.succeededIntents).toBe(2);
    expect(result.abandonedIntents).toBe(3);
    expect(result.abandonmentRatePct).toBe(60);
  });

  it('excludes intents outside the window', async () => {
    await seedPaymentIntent({ status: 'failed', createdAtMillis: daysAgo(45).toMillis() });

    const result = await businessAnalyticsService.getCheckoutAbandonment(BUSINESS_ID, 30);

    expect(result.totalIntents).toBe(0);
  });
});

describe('BusinessAnalyticsService.getLtv', () => {
  it('averages real total revenue per distinct customer, all-time', async () => {
    const customerA = { customerId: null, phoneNumber: '254700000041', customerName: 'Customer A', county: 'Nairobi' };
    const customerB = { customerId: null, phoneNumber: '254700000042', customerName: 'Customer B', county: 'Nairobi' };
    await seedOrder({
      businessId: BUSINESS_ID,
      status: 'confirmed',
      customer: customerA,
      pricing: { subtotalKes: 1000, discountKes: 0, deliveryFeeKes: 0, creditsUsedKes: 0, totalKes: 1000 },
    });
    await seedOrder({
      businessId: BUSINESS_ID,
      status: 'delivered',
      customer: customerA,
      pricing: { subtotalKes: 1500, discountKes: 0, deliveryFeeKes: 0, creditsUsedKes: 0, totalKes: 1500 },
    });
    await seedOrder({
      businessId: BUSINESS_ID,
      status: 'confirmed',
      customer: customerB,
      pricing: { subtotalKes: 2000, discountKes: 0, deliveryFeeKes: 0, creditsUsedKes: 0, totalKes: 2000 },
    });
    // Cancelled — never real revenue, must not count toward LTV.
    await seedOrder({
      businessId: BUSINESS_ID,
      status: 'cancelled',
      customer: customerB,
      pricing: { subtotalKes: 9000, discountKes: 0, deliveryFeeKes: 0, creditsUsedKes: 0, totalKes: 9000 },
    });

    const result = await businessAnalyticsService.getLtv(BUSINESS_ID);

    expect(result.customerCount).toBe(2);
    expect(result.totalRevenueKes).toBe(4500);
    expect(result.averageRevenueKes).toBe(2250);
  });

  it('reports zero rather than NaN with no revenue orders yet', async () => {
    const result = await businessAnalyticsService.getLtv(BUSINESS_ID);
    expect(result.customerCount).toBe(0);
    expect(result.averageRevenueKes).toBe(0);
  });
});
