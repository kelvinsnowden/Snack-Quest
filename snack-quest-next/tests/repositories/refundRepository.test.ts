import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { refundRepository, refundAuditEntry } from '@/repositories/refundRepository';
import type { RefundInput } from '@/repositories/refundRepository';

/** `refundRepository` (§ RefundService + Daraja reversal support) — creation, transitions, and lookups against the real emulator. */

const BUSINESS_ID = 'biz-refund-repo-test';
const OTHER_BUSINESS_ID = 'biz-refund-repo-other';

function refundInput(overrides: Partial<RefundInput> = {}): RefundInput {
  return {
    businessId: BUSINESS_ID,
    orderId: 'order-1',
    amountKes: 2500,
    reason: 'Customer requested cancellation',
    status: 'pending',
    auditTrail: [refundAuditEntry('requested', 'staff-1')],
    requestedBy: 'staff-1',
    originalMpesaReceiptNumber: 'NLJ7RT61SV',
    reversalOriginatorConversationId: null,
    reversalConversationId: null,
    reversalTransactionId: null,
    completedAt: null,
    ...overrides,
  };
}

async function seed(overrides: Partial<RefundInput> = {}): Promise<string> {
  return refundRepository.create(refundInput(overrides), 'staff-1');
}

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('refunds'));
});

describe('refundRepository.create / findById', () => {
  it('creates and reads back a refund scoped to its business', async () => {
    const id = await seed();

    const found = await refundRepository.findById(BUSINESS_ID, id);
    expect(found?.amountKes).toBe(2500);
    expect(found?.auditTrail).toHaveLength(1);

    const wrongBusiness = await refundRepository.findById(OTHER_BUSINESS_ID, id);
    expect(wrongBusiness).toBeNull();
  });
});

describe('refundRepository.applyTransition', () => {
  it('sets fields, appends an audit entry, and stamps the actor', async () => {
    const id = await seed();

    await refundRepository.applyTransition(
      id,
      { status: 'processing', reversalOriginatorConversationId: 'orig-123' },
      refundAuditEntry('reversal_accepted', 'staff-1'),
      'staff-1',
    );

    const found = await refundRepository.findById(BUSINESS_ID, id);
    expect(found?.status).toBe('processing');
    expect(found?.reversalOriginatorConversationId).toBe('orig-123');
    expect(found?.auditTrail).toHaveLength(2);
    expect(found?.updatedBy).toBe('staff-1');
  });
});

describe('refundRepository.listByOrderId', () => {
  it('returns every refund for an order, scoped to the business', async () => {
    const first = await seed({ orderId: 'order-1' });
    await seed({ orderId: 'order-2' });
    await seed({ businessId: OTHER_BUSINESS_ID, orderId: 'order-1' });

    const results = await refundRepository.listByOrderId(BUSINESS_ID, 'order-1');
    expect(results.map((r) => r.id)).toEqual([first]);
  });
});

describe('refundRepository.findByOriginatorConversationId', () => {
  it('matches a refund by its stored reversal originator id, scoped to the business', async () => {
    const id = await seed();
    await refundRepository.applyTransition(
      id,
      { status: 'processing', reversalOriginatorConversationId: 'orig-123' },
      refundAuditEntry('reversal_accepted', 'staff-1'),
      'staff-1',
    );

    const match = await refundRepository.findByOriginatorConversationId(BUSINESS_ID, 'orig-123');
    expect(match?.id).toBe(id);

    const wrongBusiness = await refundRepository.findByOriginatorConversationId(OTHER_BUSINESS_ID, 'orig-123');
    expect(wrongBusiness).toBeNull();
  });
});

describe('refundRepository.listByBusiness', () => {
  it('lists only the given business, newest first, filterable by status', async () => {
    await seed({ businessId: OTHER_BUSINESS_ID });
    const first = await seed({ status: 'pending' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await seed({ status: 'succeeded' });

    const all = await refundRepository.listByBusiness(BUSINESS_ID);
    expect(all.refunds.map((r) => r.id)).toEqual([second, first]);

    const succeededOnly = await refundRepository.listByBusiness(BUSINESS_ID, { status: 'succeeded' });
    expect(succeededOnly.refunds.map((r) => r.id)).toEqual([second]);
  });
});
