import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { packageRepository } from '@/repositories/packageRepository';
import { supplierRepository } from '@/repositories/supplierRepository';
import { purchaseOrderRepository } from '@/repositories/purchaseOrderRepository';
import { conversationRepository } from '@/repositories/conversationRepository';
import { creatorRepository } from '@/repositories/creatorRepository';
import { userRepository } from '@/repositories/userRepository';
import { featureFlagService } from '@/services/featureFlagService';
import { globalSearchService } from '@/services/globalSearchService';
import { clearCreatorMemberships } from '../helpers/creatorFixtures';

const BUSINESS_ID = 'biz-global-search-test';
const OTHER_BUSINESS_ID = 'biz-global-search-other';
const everything = () => true;

beforeEach(async () => {
  await Promise.all(
    [
      'packages',
      'suppliers',
      'purchaseOrders',
      'conversations',
      'users',
      'machines',
      'machineTransactions',
      'partners',
      'locations',
      'manufacturers',
    ].map((name) =>
      adminFirestore.recursiveDelete(adminFirestore.collection(name)),
    ),
  );
  await clearCreatorMemberships(BUSINESS_ID, OTHER_BUSINESS_ID);
  await adminFirestore.recursiveDelete(
    adminFirestore
      .collection('businesses')
      .doc(BUSINESS_ID)
      .collection('featureFlags'),
  );
});

describe('GlobalSearchService.search', () => {
  it('returns disabled with no results when the global_search flag is off', async () => {
    await featureFlagService.setEnabled(
      BUSINESS_ID,
      'global_search',
      false,
      'staff-1',
    );
    const response = await globalSearchService.search(BUSINESS_ID, 'Starter', everything);
    expect(response).toEqual({ enabled: false, results: [] });
  });

  it('returns no results for a query shorter than 2 characters', async () => {
    const response = await globalSearchService.search(BUSINESS_ID, 'a', everything);
    expect(response.results).toHaveLength(0);
  });

  it('finds a product by name', async () => {
    await packageRepository.create(
      {
        businessId: BUSINESS_ID,
        name: 'Starter Box',
        priceKes: 2500,
        description: '',
        isActive: true,
        imageUrl: null,
        stockCount: 10,
      },
      'staff-1',
    );
    await packageRepository.create(
      {
        businessId: BUSINESS_ID,
        name: 'Deluxe Box',
        priceKes: 5000,
        description: '',
        isActive: true,
        imageUrl: null,
        stockCount: 3,
      },
      'staff-1',
    );

    const response = await globalSearchService.search(BUSINESS_ID, 'starter', everything);
    const productHit = response.results.find((r) => r.type === 'product');
    expect(productHit).toMatchObject({ title: 'Starter Box' });
    expect(
      response.results.some(
        (r) => r.type === 'product' && r.title === 'Deluxe Box',
      ),
    ).toBe(false);
  });

  it('finds inventory by product name, linked to the inventory page', async () => {
    await packageRepository.create(
      {
        businessId: BUSINESS_ID,
        name: 'Starter Box',
        priceKes: 2500,
        description: '',
        isActive: true,
        imageUrl: null,
        stockCount: 42,
      },
      'staff-1',
    );
    const response = await globalSearchService.search(BUSINESS_ID, 'starter', everything);
    const inventoryHit = response.results.find((r) => r.type === 'inventory');
    expect(inventoryHit).toMatchObject({
      title: 'Starter Box',
      href: '/admin/inventory',
      subtitle: '42 in stock',
    });
  });

  it('finds a supplier by name, contact name, or phone', async () => {
    await supplierRepository.create(
      {
        businessId: BUSINESS_ID,
        name: 'Coastal Snacks Ltd',
        contactName: 'Jane Wanjiru',
        phone: '254700000001',
        email: null,
        notes: '',
        isActive: true,
      },
      'staff-1',
    );
    const byName = await globalSearchService.search(BUSINESS_ID, 'coastal', everything);
    expect(byName.results.some((r) => r.type === 'supplier')).toBe(true);
    const byPhone = await globalSearchService.search(
      BUSINESS_ID,
      '254700000001',
      everything,
    );
    expect(byPhone.results.some((r) => r.type === 'supplier')).toBe(true);
  });

  it('finds a purchase order by its resolved supplier name', async () => {
    const supplierId = await supplierRepository.create(
      {
        businessId: BUSINESS_ID,
        name: 'Coastal Snacks Ltd',
        contactName: 'Jane',
        phone: '254700000001',
        email: null,
        notes: '',
        isActive: true,
      },
      'staff-1',
    );
    await purchaseOrderRepository.create(
      {
        businessId: BUSINESS_ID,
        supplierId,
        status: 'draft',
        lineItems: [],
        totalCostKes: 10000,
        expectedDeliveryAt: null,
        orderedAt: null,
        receivedAt: null,
        cancelledAt: null,
        notes: '',
        auditTrail: [],
      },
      'staff-1',
    );

    const response = await globalSearchService.search(BUSINESS_ID, 'coastal', everything);
    expect(response.results.some((r) => r.type === 'purchaseOrder')).toBe(true);
  });

  it('finds a conversation by phone number', async () => {
    await conversationRepository.create({
      businessId: BUSINESS_ID,
      phoneNumber: '254712345678',
    });
    const response = await globalSearchService.search(
      BUSINESS_ID,
      '254712345678',
      everything,
    );
    expect(response.results.some((r) => r.type === 'conversation')).toBe(true);
  });

  it('finds a creator by their user display name', async () => {
    const uid = 'creator-uid-1';
    await userRepository.create(
      uid,
      {
        email: 'amina@example.com',
        roles: ['creator'],
        displayName: 'Amina Hassan',
        photoURL: null,
      },
      'system',
    );
    await creatorRepository.create(uid, {
      businessId: BUSINESS_ID,
      referralCode: 'AMINA10',
      tier: 'bronze',
      availableCashKes: 0,
      pendingEarningsKes: 0,
      lifetimeEarningsKes: 0,
      commissionRateKes: 500,
      totalClicks: 0,
      totalConversions: 0,
      bio: '',
      niche: '',
      followersRange: '',
      paymentPreference: 'mpesa',
      payoutPhoneNumber: null,
      socialHandles: {},
      onboardingCompleted: true,
      status: 'active',
      schemaVersion: 1,
    });

    const response = await globalSearchService.search(BUSINESS_ID, 'amina', everything);
    const hit = response.results.find((r) => r.type === 'creator');
    expect(hit).toMatchObject({ title: 'Amina Hassan' });
  });

  it("never leaks another business's data", async () => {
    await packageRepository.create(
      {
        businessId: OTHER_BUSINESS_ID,
        name: 'Rival Starter Box',
        priceKes: 2500,
        description: '',
        isActive: true,
        imageUrl: null,
        stockCount: 10,
      },
      'staff-1',
    );
    const response = await globalSearchService.search(
      BUSINESS_ID,
      'rival starter',
      everything,
    );
    expect(response.results).toHaveLength(0);
  });

  it('finds machines by code or serial, owners, locations, manufacturers, and a sale by its M-Pesa receipt', async () => {
    await adminFirestore.collection('machines').doc('m-search-1').set({ businessId: BUSINESS_ID, machineCode: 'SQ-SEARCH-01', serialNumber: 'SN-778899', venueName: 'Library', status: 'active' });
    await adminFirestore.collection('partners').doc('p-search-1').set({ businessId: BUSINESS_ID, name: 'Wanjiru Vending', contactPhone: '254711000111', contactEmail: null, status: 'active' });
    await adminFirestore.collection('locations').doc('l-search-1').set({ businessId: BUSINESS_ID, name: 'Westlands Mall', area: 'Westlands', city: 'Nairobi', address: null });
    await adminFirestore.collection('manufacturers').doc('mf-search-1').set({ businessId: BUSINESS_ID, name: 'Acme Vending Co', slug: 'acme' });
    await adminFirestore.collection('machineTransactions').doc('t-search-1').set({ businessId: BUSINESS_ID, machineId: 'm-search-1', transactionRef: 'TXREF-000123', paymentRef: 'SKL8ABC123', amountKes: 150, status: 'dispensed' });

    const types = async (q: string) => (await globalSearchService.search(BUSINESS_ID, q, everything)).results.map((r) => `${r.type}:${r.id}`);
    expect(await types('SN-778899')).toContain('machine:m-search-1');
    expect(await types('sq-search')).toContain('machine:m-search-1');
    expect(await types('wanjiru')).toContain('machineOwner:p-search-1');
    expect(await types('westlands')).toContain('location:l-search-1');
    expect(await types('acme')).toContain('manufacturer:mf-search-1');
    expect(await types('skl8abc123')).toContain('machineSale:t-search-1');
    expect(await types('TXREF-000123')).toContain('machineSale:t-search-1');
  });

  it('only returns kinds of results the person can open, and never reads the rest', async () => {
    await adminFirestore.collection('machines').doc('m-search-2').set({ businessId: BUSINESS_ID, machineCode: 'SQ-HIDDEN-02', serialNumber: 'SN-1', venueName: null, status: 'active' });
    await adminFirestore.collection('partners').doc('p-search-2').set({ businessId: BUSINESS_ID, name: 'Hidden Owner', contactPhone: null, contactEmail: null, status: 'active' });
    const asked: string[] = [];
    const onlyMachines = (permission: string) => {
      asked.push(permission);
      return permission === 'machines.view';
    };
    const hidden = await globalSearchService.search(BUSINESS_ID, 'hidden', onlyMachines);
    expect(hidden.results.map((r) => r.type)).toEqual(['machine']);
    expect(asked).toContain('owners.view');
    const nothing = await globalSearchService.search(BUSINESS_ID, 'hidden', () => false);
    expect(nothing.results).toEqual([]);
  });

  it('does not find another business\'s machines', async () => {
    await adminFirestore.collection('machines').doc('m-search-3').set({ businessId: OTHER_BUSINESS_ID, machineCode: 'SQ-RIVAL-03', serialNumber: 'SN-3', venueName: null, status: 'active' });
    const response = await globalSearchService.search(BUSINESS_ID, 'rival-03', everything);
    expect(response.results).toEqual([]);
  });
});
