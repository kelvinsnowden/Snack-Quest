import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { withdrawalRepository, auditEntry } from '@/repositories/withdrawalRepository';
import type { WithdrawalInput } from '@/repositories/withdrawalRepository';

/** `withdrawalRepository` (§ Admin: Withdrawals) — creation, transitions, and lookups against the real emulator. */

const BUSINESS_ID = 'biz-withdrawal-repo-test';
const OTHER_BUSINESS_ID = 'biz-withdrawal-repo-other';

function withdrawalInput(overrides: Partial<WithdrawalInput> = {}): WithdrawalInput {
  return {
    businessId: BUSINESS_ID,
    ownerId: 'creator-1',
    ownerType: 'creator',
    amountKes: 1000,
    phoneNumber: '254712345678',
    status: 'pending',
    fraudScore: 0,
    auditTrail: [auditEntry('requested', 'creator-1')],
    approvedBy: null,
    approvedAt: null,
    rejectionReason: null,
    paidAt: null,
    b2cOriginatorConversationId: null,
    b2cConversationId: null,
    failureCategory: null,
    pendingStatusQueryOriginatorConversationId: null,
    statusQueryAttemptCount: 0,
    ...overrides,
  };
}

async function seed(overrides: Partial<WithdrawalInput> = {}): Promise<string> {
  return adminFirestore.runTransaction(async (tx) =>
    withdrawalRepository.createInTransaction(tx, withdrawalInput(overrides), 'creator-1'),
  );
}

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('withdrawals'));
});

describe('withdrawalRepository.createInTransaction / findById', () => {
  it('creates and reads back a withdrawal scoped to its business', async () => {
    const id = await seed();

    const found = await withdrawalRepository.findById(BUSINESS_ID, id);
    expect(found?.amountKes).toBe(1000);
    expect(found?.auditTrail).toHaveLength(1);

    const wrongBusiness = await withdrawalRepository.findById(OTHER_BUSINESS_ID, id);
    expect(wrongBusiness).toBeNull();
  });
});

describe('withdrawalRepository.applyTransition', () => {
  it('sets fields, appends an audit entry, and stamps the actor', async () => {
    const id = await seed();

    await withdrawalRepository.applyTransition(
      id,
      { status: 'approved', approvedBy: 'staff-1' },
      auditEntry('approved', 'staff-1'),
      'staff-1',
    );

    const found = await withdrawalRepository.findById(BUSINESS_ID, id);
    expect(found?.status).toBe('approved');
    expect(found?.approvedBy).toBe('staff-1');
    expect(found?.auditTrail).toHaveLength(2);
    expect(found?.updatedBy).toBe('staff-1');
  });
});

describe('withdrawalRepository.findByOriginatorConversationId', () => {
  it('matches a withdrawal by its stored B2C originator id, scoped to the business', async () => {
    const id = await seed();
    await withdrawalRepository.applyTransition(
      id,
      { status: 'approved', b2cOriginatorConversationId: 'orig-123' },
      auditEntry('approved', 'staff-1'),
      'staff-1',
    );

    const match = await withdrawalRepository.findByOriginatorConversationId(BUSINESS_ID, 'orig-123');
    expect(match?.id).toBe(id);

    const wrongBusiness = await withdrawalRepository.findByOriginatorConversationId(OTHER_BUSINESS_ID, 'orig-123');
    expect(wrongBusiness).toBeNull();
  });
});

describe('withdrawalRepository.listByBusiness', () => {
  it('lists only the given business, newest first, filterable by status', async () => {
    await seed({ businessId: OTHER_BUSINESS_ID });
    const first = await seed({ status: 'pending' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await seed({ status: 'paid' });

    const all = await withdrawalRepository.listByBusiness(BUSINESS_ID);
    expect(all.withdrawals.map((w) => w.id)).toEqual([second, first]);

    const paidOnly = await withdrawalRepository.listByBusiness(BUSINESS_ID, { status: 'paid' });
    expect(paidOnly.withdrawals.map((w) => w.id)).toEqual([second]);
  });
});

describe('withdrawalRepository.listByOwner', () => {
  it('lists only the given owner’s withdrawals within the business', async () => {
    await seed({ ownerId: 'creator-1' });
    await seed({ ownerId: 'creator-2' });
    await seed({ businessId: OTHER_BUSINESS_ID, ownerId: 'creator-1' });

    const { withdrawals } = await withdrawalRepository.listByOwner(BUSINESS_ID, 'creator-1');

    expect(withdrawals).toHaveLength(1);
    expect(withdrawals[0].data.ownerId).toBe('creator-1');
  });
});
