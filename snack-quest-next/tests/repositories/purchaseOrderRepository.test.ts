import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { purchaseOrderRepository, auditEntry } from '@/repositories/purchaseOrderRepository';

const BUSINESS_ID = 'biz-po-repo-test';
const OTHER_BUSINESS_ID = 'biz-po-repo-other';

function baseInput(overrides: Partial<Parameters<typeof purchaseOrderRepository.create>[0]> = {}) {
  return {
    businessId: BUSINESS_ID,
    supplierId: 'supplier-1',
    status: 'draft' as const,
    lineItems: [{ packageId: 'pkg-1', description: 'Starter Box', quantity: 10, unitCostKes: 100 }],
    totalCostKes: 1000,
    expectedDeliveryAt: null,
    orderedAt: null,
    receivedAt: null,
    cancelledAt: null,
    notes: '',
    auditTrail: [auditEntry('created', 'staff-1')],
    ...overrides,
  };
}

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('purchaseOrders'));
});

describe('purchaseOrderRepository', () => {
  it('creates and finds a purchase order scoped to its business', async () => {
    const id = await purchaseOrderRepository.create(baseInput(), 'staff-1');

    const found = await purchaseOrderRepository.findById(BUSINESS_ID, id);
    expect(found?.status).toBe('draft');
    expect(found?.totalCostKes).toBe(1000);
    expect(found?.auditTrail).toHaveLength(1);

    expect(await purchaseOrderRepository.findById(OTHER_BUSINESS_ID, id)).toBeNull();
  });

  it('applyTransition sets fields, appends an audit entry, and stamps updatedBy', async () => {
    const id = await purchaseOrderRepository.create(baseInput(), 'staff-1');

    await purchaseOrderRepository.applyTransition(id, { status: 'ordered' }, auditEntry('ordered', 'staff-2'), 'staff-2');

    const found = await purchaseOrderRepository.findById(BUSINESS_ID, id);
    expect(found?.status).toBe('ordered');
    expect(found?.auditTrail).toHaveLength(2);
    expect(found?.auditTrail[1].action).toBe('ordered');
    expect(found?.updatedBy).toBe('staff-2');
  });

  it('applyTransitionInTransaction writes the same shape inside a transaction', async () => {
    const id = await purchaseOrderRepository.create(baseInput(), 'staff-1');

    await adminFirestore.runTransaction(async (tx) => {
      purchaseOrderRepository.applyTransitionInTransaction(tx, id, { status: 'received' }, auditEntry('received', 'staff-3'), 'staff-3');
    });

    const found = await purchaseOrderRepository.findById(BUSINESS_ID, id);
    expect(found?.status).toBe('received');
    expect(found?.auditTrail).toHaveLength(2);
  });

  it('listByBusiness filters by status and scopes per tenant, newest first', async () => {
    const draftId = await purchaseOrderRepository.create(baseInput({ status: 'draft' }), 'staff-1');
    await new Promise((resolve) => setTimeout(resolve, 5));
    const orderedId = await purchaseOrderRepository.create(baseInput({ status: 'ordered' }), 'staff-1');
    await purchaseOrderRepository.create(baseInput({ businessId: OTHER_BUSINESS_ID }), 'staff-1');

    const { purchaseOrders: all } = await purchaseOrderRepository.listByBusiness(BUSINESS_ID);
    expect(all.map((p) => p.id)).toEqual([orderedId, draftId]);

    const { purchaseOrders: draftsOnly } = await purchaseOrderRepository.listByBusiness(BUSINESS_ID, { status: 'draft' });
    expect(draftsOnly.map((p) => p.id)).toEqual([draftId]);
  });
});
