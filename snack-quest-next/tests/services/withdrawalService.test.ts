import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { businessIntegrationSecretRepository } from '@/repositories/businessIntegrationSecretRepository';
import { creatorRepository } from '@/repositories/creatorRepository';
import { withdrawalRepository, auditEntry } from '@/repositories/withdrawalRepository';
import { userRepository } from '@/repositories/userRepository';
import { notificationTemplateRepository } from '@/repositories/notificationTemplateRepository';
import { outboundMessageRepository } from '@/repositories/outboundMessageRepository';
import {
  withdrawalService,
  InsufficientCreatorBalanceError,
  CreatorNotEligibleForWithdrawalError,
  UnsupportedWithdrawalOwnerTypeError,
  WithdrawalNotFoundError,
  InvalidWithdrawalTransitionError,
  WithdrawalBelowMinimumError,
  WithdrawalAboveMaximumError,
  B2CDisbursementsFrozenError,
} from '@/services/withdrawalService';
import { featureFlagService } from '@/services/featureFlagService';
import { clearCreatorMemberships, seedCreator } from '../helpers/creatorFixtures';

/**
 * `WithdrawalService` end to end (§ Admin: Withdrawals): balance
 * reservation at request time, the real Daraja B2C call at approval
 * time (fetch stubbed, same discipline as
 * tests/integrations/darajaGateway.test.ts — the gateway's own HTTP
 * mechanics are already covered there), and the async result webhook.
 */

const BUSINESS_ID = 'biz-withdrawal-service-test';
const OTHER_BUSINESS_ID = 'biz-withdrawal-service-other';

const B2C_SECRET = {
  consumerKey: 'test-key',
  consumerSecret: 'test-secret',
  shortcode: '174379',
  passkey: 'test-passkey',
  callbackUrl: `https://example.com/api/webhooks/daraja/${BUSINESS_ID}`,
  env: 'sandbox' as const,
  b2cInitiatorName: 'testapiuser',
  b2cSecurityCredential: 'encrypted-credential-base64',
};

function stubB2CSuccess(originatorConversationId = 'orig-1', conversationId = 'conv-1') {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        String(url).includes('/oauth/v1/generate')
          ? new Response(JSON.stringify({ access_token: 'token-abc', expires_in: '3599' }), { status: 200 })
          : new Response(
              JSON.stringify({
                ConversationID: conversationId,
                OriginatorConversationID: originatorConversationId,
                ResponseCode: '0',
                ResponseDescription: 'Accept the service request successfully.',
              }),
              { status: 200 },
            ),
      ),
    ),
  );
}

function stubB2CFailure() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        String(url).includes('/oauth/v1/generate')
          ? new Response(JSON.stringify({ access_token: 'token-abc', expires_in: '3599' }), { status: 200 })
          : new Response(JSON.stringify({ errorMessage: 'Invalid Initiator Information' }), { status: 400 }),
      ),
    ),
  );
}

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('withdrawals'));
  await clearCreatorMemberships(BUSINESS_ID, OTHER_BUSINESS_ID);
  await adminFirestore.recursiveDelete(adminFirestore.collection('webhookEvents'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('users'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('outboundMessages'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('notificationTemplates'));
  // A permanent-configuration B2C failure auto-freezes disbursements
  // (§ Daraja B2C production readiness) — clear it between tests so one
  // test's classified failure doesn't leak into the next.
  await adminFirestore.recursiveDelete(
    adminFirestore.collection('businesses').doc(BUSINESS_ID).collection('featureFlags'),
  );
  await businessIntegrationSecretRepository.set(BUSINESS_ID, 'daraja', B2C_SECRET);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WithdrawalService.requestWithdrawal', () => {
  it('reserves the balance and creates a pending withdrawal', async () => {
    await seedCreator('creator-1', { businessId: BUSINESS_ID, status: 'active', availableCashKes: 5000 });

    const id = await withdrawalService.requestWithdrawal({
      businessId: BUSINESS_ID,
      ownerId: 'creator-1',
      ownerType: 'creator',
      amountKes: 2000,
      phoneNumber: '254712345678',
    });

    const withdrawal = await withdrawalRepository.findById(BUSINESS_ID, id);
    expect(withdrawal?.status).toBe('pending');
    const creator = await creatorRepository.findById(BUSINESS_ID, 'creator-1');
    expect(creator?.availableCashKes).toBe(3000);
  });

  it('rejects a request exceeding the available balance, reserving nothing', async () => {
    await seedCreator('creator-1', { businessId: BUSINESS_ID, status: 'active', availableCashKes: 500 });

    await expect(
      withdrawalService.requestWithdrawal({
        businessId: BUSINESS_ID,
        ownerId: 'creator-1',
        ownerType: 'creator',
        amountKes: 2000,
        phoneNumber: '254712345678',
      }),
    ).rejects.toBeInstanceOf(InsufficientCreatorBalanceError);

    const creator = await creatorRepository.findById(BUSINESS_ID, 'creator-1');
    expect(creator?.availableCashKes).toBe(500);
  });

  it('rejects a creator outside the business', async () => {
    await seedCreator('creator-1', { businessId: OTHER_BUSINESS_ID, status: 'active', availableCashKes: 5000 });

    await expect(
      withdrawalService.requestWithdrawal({
        businessId: BUSINESS_ID,
        ownerId: 'creator-1',
        ownerType: 'creator',
        amountKes: 300,
        phoneNumber: '254712345678',
      }),
    ).rejects.toBeInstanceOf(CreatorNotEligibleForWithdrawalError);
  });

  it('rejects an unsupported ownerType', async () => {
    await expect(
      withdrawalService.requestWithdrawal({
        businessId: BUSINESS_ID,
        ownerId: 'customer-1',
        ownerType: 'customer',
        amountKes: 300,
        phoneNumber: '254712345678',
      }),
    ).rejects.toBeInstanceOf(UnsupportedWithdrawalOwnerTypeError);
  });

  it('rejects an amount below the minimum withdrawal, reserving nothing', async () => {
    await seedCreator('creator-1', { businessId: BUSINESS_ID, status: 'active', availableCashKes: 5000 });

    await expect(
      withdrawalService.requestWithdrawal({
        businessId: BUSINESS_ID,
        ownerId: 'creator-1',
        ownerType: 'creator',
        amountKes: 299,
        phoneNumber: '254712345678',
      }),
    ).rejects.toBeInstanceOf(WithdrawalBelowMinimumError);

    const creator = await creatorRepository.findById(BUSINESS_ID, 'creator-1');
    expect(creator?.availableCashKes).toBe(5000);
  });

  it('rejects an amount above Daraja’s B2C per-transaction maximum, reserving nothing', async () => {
    await seedCreator('creator-1', { businessId: BUSINESS_ID, status: 'active', availableCashKes: 1_000_000 });

    await expect(
      withdrawalService.requestWithdrawal({
        businessId: BUSINESS_ID,
        ownerId: 'creator-1',
        ownerType: 'creator',
        amountKes: 250_001,
        phoneNumber: '254712345678',
      }),
    ).rejects.toBeInstanceOf(WithdrawalAboveMaximumError);

    const creator = await creatorRepository.findById(BUSINESS_ID, 'creator-1');
    expect(creator?.availableCashKes).toBe(1_000_000);
  });

  it('allows a withdrawal request for exactly the maximum', async () => {
    await seedCreator('creator-1', { businessId: BUSINESS_ID, status: 'active', availableCashKes: 1_000_000 });

    const id = await withdrawalService.requestWithdrawal({
      businessId: BUSINESS_ID,
      ownerId: 'creator-1',
      ownerType: 'creator',
      amountKes: 250_000,
      phoneNumber: '254712345678',
    });

    const withdrawal = await withdrawalRepository.findById(BUSINESS_ID, id);
    expect(withdrawal?.status).toBe('pending');
  });

  it('allows a withdrawal request for exactly the minimum', async () => {
    await seedCreator('creator-1', { businessId: BUSINESS_ID, status: 'active', availableCashKes: 5000 });

    const id = await withdrawalService.requestWithdrawal({
      businessId: BUSINESS_ID,
      ownerId: 'creator-1',
      ownerType: 'creator',
      amountKes: 300,
      phoneNumber: '254712345678',
    });

    const withdrawal = await withdrawalRepository.findById(BUSINESS_ID, id);
    expect(withdrawal?.status).toBe('pending');
  });
});

describe('WithdrawalService.listWithdrawalsForOwner', () => {
  it('returns only the given owner’s own withdrawal history', async () => {
    await seedCreator('creator-1', { businessId: BUSINESS_ID, status: 'active', availableCashKes: 5000 });
    await seedCreator('creator-2', { businessId: BUSINESS_ID, status: 'active', availableCashKes: 5000 });
    await withdrawalService.requestWithdrawal({
      businessId: BUSINESS_ID,
      ownerId: 'creator-1',
      ownerType: 'creator',
      amountKes: 300,
      phoneNumber: '254712345678',
    });
    await withdrawalService.requestWithdrawal({
      businessId: BUSINESS_ID,
      ownerId: 'creator-2',
      ownerType: 'creator',
      amountKes: 300,
      phoneNumber: '254712345678',
    });

    const { withdrawals } = await withdrawalService.listWithdrawalsForOwner(BUSINESS_ID, 'creator-1');

    expect(withdrawals).toHaveLength(1);
    expect(withdrawals[0].data.ownerId).toBe('creator-1');
  });
});

describe('WithdrawalService.approveWithdrawal', () => {
  it('initiates a real B2C payout and stores the correlation ids', async () => {
    await seedCreator('creator-1', { businessId: BUSINESS_ID, status: 'active', availableCashKes: 5000 });
    const id = await withdrawalService.requestWithdrawal({
      businessId: BUSINESS_ID,
      ownerId: 'creator-1',
      ownerType: 'creator',
      amountKes: 2000,
      phoneNumber: '254712345678',
    });
    stubB2CSuccess('orig-approve-1', 'conv-approve-1');

    const status = await withdrawalService.approveWithdrawal(BUSINESS_ID, id, 'staff-1');

    expect(status).toBe('approved');
    const withdrawal = await withdrawalRepository.findById(BUSINESS_ID, id);
    expect(withdrawal?.status).toBe('approved');
    // The stored id is one *this codebase* generates and persists
    // before ever calling Daraja (§ Daraja B2C production readiness) —
    // never Safaricom's own echoed-back value — so assert the shape,
    // not the mock response's 'orig-approve-1'.
    expect(withdrawal?.b2cOriginatorConversationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(withdrawal?.b2cConversationId).toBe('conv-approve-1');
    const creator = await creatorRepository.findById(BUSINESS_ID, 'creator-1');
    expect(creator?.availableCashKes).toBe(3000); // still reserved, not refunded
  });

  it('marks the withdrawal failed and refunds the balance when Daraja rejects the B2C request', async () => {
    await seedCreator('creator-1', { businessId: BUSINESS_ID, status: 'active', availableCashKes: 5000 });
    const id = await withdrawalService.requestWithdrawal({
      businessId: BUSINESS_ID,
      ownerId: 'creator-1',
      ownerType: 'creator',
      amountKes: 2000,
      phoneNumber: '254712345678',
    });
    stubB2CFailure();

    const status = await withdrawalService.approveWithdrawal(BUSINESS_ID, id, 'staff-1');

    expect(status).toBe('failed');
    const creator = await creatorRepository.findById(BUSINESS_ID, 'creator-1');
    expect(creator?.availableCashKes).toBe(5000); // refunded
  });

  it('queues a withdrawal-approved email for the owner', async () => {
    await notificationTemplateRepository.upsert({
      templateCode: 'withdrawal_approved_email',
      channel: 'email',
      subject: 'Your KES {{amountKes}} withdrawal is on its way',
      bodyTemplate: 'Hi {{displayName}}, KES {{amountKes}} approved. {{portalUrl}}',
      heading: null,
      ctaLabel: null,
      ctaUrl: null,
      htmlBodyTemplate: null,
      requiredParams: ['displayName', 'amountKes', 'portalUrl'],
      version: 1,
      isActive: true,
    });
    await seedCreator('creator-1', { businessId: BUSINESS_ID, status: 'active', availableCashKes: 5000 });
    await userRepository.create(
      'creator-1',
      { email: 'creator@example.com', roles: ['creator'], displayName: 'Cool Creator', photoURL: null },
      'system',
    );
    const id = await withdrawalService.requestWithdrawal({
      businessId: BUSINESS_ID,
      ownerId: 'creator-1',
      ownerType: 'creator',
      amountKes: 2000,
      phoneNumber: '254712345678',
    });
    stubB2CSuccess();

    await withdrawalService.approveWithdrawal(BUSINESS_ID, id, 'staff-1');

    const outbound = await outboundMessageRepository.findById(`email:withdrawal-approved:${id}`);
    expect(outbound?.recipientRef).toBe('creator@example.com');
    expect(outbound?.renderedBody).toBe('Hi Cool Creator, KES 2000 approved. http://localhost:3000/creator/withdrawals');
  });

  it('throws WithdrawalNotFoundError for a withdrawal in a different business', async () => {
    await seedCreator('creator-1', { businessId: OTHER_BUSINESS_ID, status: 'active', availableCashKes: 5000 });
    const id = await withdrawalService.requestWithdrawal({
      businessId: OTHER_BUSINESS_ID,
      ownerId: 'creator-1',
      ownerType: 'creator',
      amountKes: 300,
      phoneNumber: '254712345678',
    });

    await expect(withdrawalService.approveWithdrawal(BUSINESS_ID, id, 'staff-1')).rejects.toBeInstanceOf(
      WithdrawalNotFoundError,
    );
  });

  it('throws InvalidWithdrawalTransitionError for an already-approved withdrawal', async () => {
    await seedCreator('creator-1', { businessId: BUSINESS_ID, status: 'active', availableCashKes: 5000 });
    const id = await withdrawalService.requestWithdrawal({
      businessId: BUSINESS_ID,
      ownerId: 'creator-1',
      ownerType: 'creator',
      amountKes: 2000,
      phoneNumber: '254712345678',
    });
    stubB2CSuccess();
    await withdrawalService.approveWithdrawal(BUSINESS_ID, id, 'staff-1');

    await expect(withdrawalService.approveWithdrawal(BUSINESS_ID, id, 'staff-1')).rejects.toBeInstanceOf(
      InvalidWithdrawalTransitionError,
    );
  });
});

describe('WithdrawalService.rejectWithdrawal', () => {
  it('refunds the reserved balance and records the reason', async () => {
    await seedCreator('creator-1', { businessId: BUSINESS_ID, status: 'active', availableCashKes: 5000 });
    const id = await withdrawalService.requestWithdrawal({
      businessId: BUSINESS_ID,
      ownerId: 'creator-1',
      ownerType: 'creator',
      amountKes: 2000,
      phoneNumber: '254712345678',
    });

    await withdrawalService.rejectWithdrawal(BUSINESS_ID, id, 'staff-1', 'Could not verify phone number');

    const withdrawal = await withdrawalRepository.findById(BUSINESS_ID, id);
    expect(withdrawal?.status).toBe('rejected');
    expect(withdrawal?.rejectionReason).toBe('Could not verify phone number');
    const creator = await creatorRepository.findById(BUSINESS_ID, 'creator-1');
    expect(creator?.availableCashKes).toBe(5000);
  });
});

describe('WithdrawalService.handleB2CResult', () => {
  /**
   * Approves a fresh withdrawal and returns both its id and the real
   * `b2cOriginatorConversationId` this codebase generated for it —
   * never a hardcoded string, since Daraja's real ResultURL callback
   * always echoes back whatever id the *request* carried (§ Daraja B2C
   * production readiness), and that id is minted internally now, not
   * read from Safaricom's synchronous response.
   */
  async function approvedWithdrawal() {
    await seedCreator('creator-1', { businessId: BUSINESS_ID, status: 'active', availableCashKes: 5000 });
    const id = await withdrawalService.requestWithdrawal({
      businessId: BUSINESS_ID,
      ownerId: 'creator-1',
      ownerType: 'creator',
      amountKes: 2000,
      phoneNumber: '254712345678',
    });
    stubB2CSuccess();
    await withdrawalService.approveWithdrawal(BUSINESS_ID, id, 'staff-1');
    vi.unstubAllGlobals();
    const withdrawal = await withdrawalRepository.findById(BUSINESS_ID, id);
    return { id, originatorConversationId: withdrawal!.b2cOriginatorConversationId! };
  }

  it('marks a successful result as paid', async () => {
    const { id, originatorConversationId } = await approvedWithdrawal();

    await withdrawalService.handleB2CResult(BUSINESS_ID, {
      Result: {
        ResultType: 0,
        ResultCode: 0,
        ResultDesc: 'Success',
        OriginatorConversationID: originatorConversationId,
        ConversationID: 'conv-1',
        TransactionID: 'NLJ41HAY6Q',
        ResultParameters: { ResultParameter: [{ Key: 'TransactionAmount', Value: 2000 }] },
      },
    });

    const withdrawal = await withdrawalRepository.findById(BUSINESS_ID, id);
    expect(withdrawal?.status).toBe('paid');
    expect(withdrawal?.paidAt).not.toBeNull();
  });

  it('marks a failed result as failed and refunds the balance', async () => {
    const { id, originatorConversationId } = await approvedWithdrawal();

    await withdrawalService.handleB2CResult(BUSINESS_ID, {
      Result: {
        ResultType: 0,
        ResultCode: 21,
        ResultDesc: 'Would exceed the recipient maximum balance.',
        OriginatorConversationID: originatorConversationId,
        ConversationID: 'conv-2',
      },
    });

    const withdrawal = await withdrawalRepository.findById(BUSINESS_ID, id);
    expect(withdrawal?.status).toBe('failed');
    expect(withdrawal?.failureCategory).toBe('recipient');
    const creator = await creatorRepository.findById(BUSINESS_ID, 'creator-1');
    expect(creator?.availableCashKes).toBe(5000);
  });

  it('is idempotent — a redelivered result does not refund twice', async () => {
    const { id, originatorConversationId } = await approvedWithdrawal();
    const payload = {
      Result: {
        ResultType: 0,
        ResultCode: 21,
        ResultDesc: 'Failed',
        OriginatorConversationID: originatorConversationId,
        ConversationID: 'conv-3',
      },
    };

    await withdrawalService.handleB2CResult(BUSINESS_ID, payload);
    await withdrawalService.handleB2CResult(BUSINESS_ID, payload);

    const creator = await creatorRepository.findById(BUSINESS_ID, 'creator-1');
    expect(creator?.availableCashKes).toBe(5000); // refunded exactly once
    const withdrawal = await withdrawalRepository.findById(BUSINESS_ID, id);
    expect(withdrawal?.auditTrail.filter((e) => e.action === 'b2c_failed')).toHaveLength(1);
  });

  it('does not throw for a result with no matching withdrawal', async () => {
    await expect(
      withdrawalService.handleB2CResult(BUSINESS_ID, {
        Result: {
          ResultType: 0,
          ResultCode: 0,
          ResultDesc: 'Success',
          OriginatorConversationID: 'no-such-conversation',
          ConversationID: 'conv-x',
        },
      }),
    ).resolves.toBeUndefined();
  });

  it('ignores a late result for a withdrawal already resolved manually — never overwrites the resolution', async () => {
    const { id, originatorConversationId } = await approvedWithdrawal();
    await withdrawalService.resolveAmbiguousWithdrawal(
      BUSINESS_ID,
      id,
      'staff-1',
      'confirmed_failed',
      'Checked the M-Pesa statement directly — no matching debit.',
    );
    const afterManualResolution = await withdrawalRepository.findById(BUSINESS_ID, id);
    expect(afterManualResolution?.status).toBe('failed');
    const creatorAfterManualResolution = await creatorRepository.findById(BUSINESS_ID, 'creator-1');
    expect(creatorAfterManualResolution?.availableCashKes).toBe(5000); // refunded once, by the manual resolution

    // The real callback finally arrives, late, reporting success.
    await withdrawalService.handleB2CResult(BUSINESS_ID, {
      Result: {
        ResultType: 0,
        ResultCode: 0,
        ResultDesc: 'Success',
        OriginatorConversationID: originatorConversationId,
        ConversationID: 'conv-late',
        TransactionID: 'LATE123',
        ResultParameters: { ResultParameter: [{ Key: 'TransactionAmount', Value: 2000 }] },
      },
    });

    const withdrawal = await withdrawalRepository.findById(BUSINESS_ID, id);
    expect(withdrawal?.status).toBe('failed'); // NOT overwritten to 'paid'
    const creator = await creatorRepository.findById(BUSINESS_ID, 'creator-1');
    expect(creator?.availableCashKes).toBe(5000); // not credited/refunded again
  });
});

describe('WithdrawalService — B2C ResultCode classification (§ Daraja B2C production readiness)', () => {
  const cases: { resultCode: number; resultDesc: string; expectedCategory: string }[] = [
    { resultCode: 1, resultDesc: 'Insufficient balance', expectedCategory: 'account_funding' },
    { resultCode: 2006, resultDesc: 'Insufficient funds in the utility account', expectedCategory: 'account_funding' },
    { resultCode: 21, resultDesc: 'Would exceed recipient maximum balance', expectedCategory: 'recipient' },
    { resultCode: 2040, resultDesc: 'Duplicate transaction', expectedCategory: 'ambiguous' },
    { resultCode: 2028, resultDesc: 'Invalid amount', expectedCategory: 'permanent_configuration' },
  ];

  for (const { resultCode, resultDesc, expectedCategory } of cases) {
    it(`classifies ResultCode ${resultCode} as '${expectedCategory}'`, async () => {
      await seedCreator('creator-1', { businessId: BUSINESS_ID, status: 'active', availableCashKes: 5000 });
      const id = await withdrawalService.requestWithdrawal({
        businessId: BUSINESS_ID,
        ownerId: 'creator-1',
        ownerType: 'creator',
        amountKes: 2000,
        phoneNumber: '254712345678',
      });
      stubB2CSuccess();
      await withdrawalService.approveWithdrawal(BUSINESS_ID, id, 'staff-1');
      vi.unstubAllGlobals();
      const approved = await withdrawalRepository.findById(BUSINESS_ID, id);

      await withdrawalService.handleB2CResult(BUSINESS_ID, {
        Result: {
          ResultType: 0,
          ResultCode: resultCode,
          ResultDesc: resultDesc,
          OriginatorConversationID: approved!.b2cOriginatorConversationId,
          ConversationID: 'conv-classify',
        },
      });

      const withdrawal = await withdrawalRepository.findById(BUSINESS_ID, id);
      expect(withdrawal?.status).toBe('failed');
      expect(withdrawal?.failureCategory).toBe(expectedCategory);
    });
  }

  it('a permanent_configuration failure (invalid initiator, 2001) auto-freezes B2C disbursements for the business', async () => {
    await seedCreator('creator-1', { businessId: BUSINESS_ID, status: 'active', availableCashKes: 5000 });
    const id = await withdrawalService.requestWithdrawal({
      businessId: BUSINESS_ID,
      ownerId: 'creator-1',
      ownerType: 'creator',
      amountKes: 2000,
      phoneNumber: '254712345678',
    });
    stubB2CSuccess();
    await withdrawalService.approveWithdrawal(BUSINESS_ID, id, 'staff-1');
    vi.unstubAllGlobals();
    const approved = await withdrawalRepository.findById(BUSINESS_ID, id);

    await withdrawalService.handleB2CResult(BUSINESS_ID, {
      Result: {
        ResultType: 0,
        ResultCode: 2001,
        ResultDesc: 'The initiator information is invalid.',
        OriginatorConversationID: approved!.b2cOriginatorConversationId,
        ConversationID: 'conv-2001',
      },
    });

    const withdrawal = await withdrawalRepository.findById(BUSINESS_ID, id);
    expect(withdrawal?.failureCategory).toBe('permanent_configuration');
    expect(await featureFlagService.isEnabled(BUSINESS_ID, 'b2c_disbursements_frozen')).toBe(true);

    // A second, otherwise-healthy withdrawal must not be approvable while frozen.
    await seedCreator('creator-2', { businessId: BUSINESS_ID, status: 'active', availableCashKes: 5000 });
    const secondId = await withdrawalService.requestWithdrawal({
      businessId: BUSINESS_ID,
      ownerId: 'creator-2',
      ownerType: 'creator',
      amountKes: 2000,
      phoneNumber: '254712345679',
    });
    await expect(withdrawalService.approveWithdrawal(BUSINESS_ID, secondId, 'staff-1')).rejects.toBeInstanceOf(
      B2CDisbursementsFrozenError,
    );
  });

  it('a synchronous gateway rejection classified permanent_configuration also auto-freezes B2C disbursements', async () => {
    await seedCreator('creator-1', { businessId: BUSINESS_ID, status: 'active', availableCashKes: 5000 });
    const id = await withdrawalService.requestWithdrawal({
      businessId: BUSINESS_ID,
      ownerId: 'creator-1',
      ownerType: 'creator',
      amountKes: 2000,
      phoneNumber: '254712345678',
    });
    stubB2CFailure(); // errorMessage 'Invalid Initiator Information'

    const status = await withdrawalService.approveWithdrawal(BUSINESS_ID, id, 'staff-1');

    expect(status).toBe('failed');
    const withdrawal = await withdrawalRepository.findById(BUSINESS_ID, id);
    expect(withdrawal?.failureCategory).toBe('permanent_configuration');
    expect(await featureFlagService.isEnabled(BUSINESS_ID, 'b2c_disbursements_frozen')).toBe(true);
  });
});

describe('WithdrawalService — concurrent admin actions (§ Daraja B2C production readiness)', () => {
  it('two concurrent approve calls result in exactly one B2C request and exactly one approval', async () => {
    await seedCreator('creator-1', { businessId: BUSINESS_ID, status: 'active', availableCashKes: 5000 });
    const id = await withdrawalService.requestWithdrawal({
      businessId: BUSINESS_ID,
      ownerId: 'creator-1',
      ownerType: 'creator',
      amountKes: 2000,
      phoneNumber: '254712345678',
    });

    let b2cCallCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        if (String(url).includes('/oauth/v1/generate')) {
          return new Response(JSON.stringify({ access_token: 'token-abc', expires_in: '3599' }), { status: 200 });
        }
        b2cCallCount += 1;
        // A tiny delay so both concurrent calls are genuinely in flight
        // together, not serialized by the mock itself.
        await new Promise((resolve) => setTimeout(resolve, 20));
        return new Response(
          JSON.stringify({
            ConversationID: `conv-${b2cCallCount}`,
            OriginatorConversationID: `orig-${b2cCallCount}`,
            ResponseCode: '0',
            ResponseDescription: 'Accept the service request successfully.',
          }),
          { status: 200 },
        );
      }),
    );

    const results = await Promise.allSettled([
      withdrawalService.approveWithdrawal(BUSINESS_ID, id, 'staff-1'),
      withdrawalService.approveWithdrawal(BUSINESS_ID, id, 'staff-2'),
    ]);

    expect(b2cCallCount).toBe(1); // exactly one real B2C request was ever sent
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(InvalidWithdrawalTransitionError);

    const withdrawal = await withdrawalRepository.findById(BUSINESS_ID, id);
    expect(withdrawal?.status).toBe('approved');
    const creator = await creatorRepository.findById(BUSINESS_ID, 'creator-1');
    expect(creator?.availableCashKes).toBe(3000); // reserved exactly once, never double-deducted
  });

  it('two concurrent reject calls result in exactly one refund', async () => {
    await seedCreator('creator-1', { businessId: BUSINESS_ID, status: 'active', availableCashKes: 5000 });
    const id = await withdrawalService.requestWithdrawal({
      businessId: BUSINESS_ID,
      ownerId: 'creator-1',
      ownerType: 'creator',
      amountKes: 2000,
      phoneNumber: '254712345678',
    });

    const results = await Promise.allSettled([
      withdrawalService.rejectWithdrawal(BUSINESS_ID, id, 'staff-1', 'First reviewer declines'),
      withdrawalService.rejectWithdrawal(BUSINESS_ID, id, 'staff-2', 'Second reviewer declines'),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(InvalidWithdrawalTransitionError);

    const creator = await creatorRepository.findById(BUSINESS_ID, 'creator-1');
    expect(creator?.availableCashKes).toBe(5000); // refunded exactly once, never double-credited
  });
});

describe('WithdrawalService.reconcileStuckWithdrawals (§ Daraja B2C production readiness)', () => {
  async function stuckWithdrawal() {
    await seedCreator('creator-1', { businessId: BUSINESS_ID, status: 'active', availableCashKes: 5000 });
    const id = await withdrawalService.requestWithdrawal({
      businessId: BUSINESS_ID,
      ownerId: 'creator-1',
      ownerType: 'creator',
      amountKes: 2000,
      phoneNumber: '254712345678',
    });
    stubB2CSuccess();
    await withdrawalService.approveWithdrawal(BUSINESS_ID, id, 'staff-1');
    vi.unstubAllGlobals();
    return id;
  }

  it('ignores a withdrawal that is not old enough to count as stuck yet', async () => {
    await stuckWithdrawal();

    const outcomes = await withdrawalService.reconcileStuckWithdrawals(BUSINESS_ID, { stuckAfterMs: 60 * 60 * 1000 });

    expect(outcomes).toHaveLength(0);
  });

  it('issues a Transaction Status Query for a genuinely stuck withdrawal (crash/ambiguous submission scenario)', async () => {
    const id = await stuckWithdrawal();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) =>
        Promise.resolve(
          String(url).includes('/oauth/v1/generate')
            ? new Response(JSON.stringify({ access_token: 'token-abc', expires_in: '3599' }), { status: 200 })
            : new Response(
                JSON.stringify({
                  ConversationID: 'conv-query-1',
                  OriginatorConversationID: 'query-orig-1',
                  ResponseCode: '0',
                  ResponseDescription: 'Accept the service request successfully.',
                }),
                { status: 200 },
              ),
        ),
      ),
    );

    const outcomes = await withdrawalService.reconcileStuckWithdrawals(BUSINESS_ID, { stuckAfterMs: -1 });

    expect(outcomes).toEqual([{ withdrawalId: id, outcome: 'queried' }]);
    const withdrawal = await withdrawalRepository.findById(BUSINESS_ID, id);
    expect(withdrawal?.statusQueryAttemptCount).toBe(1);
    expect(withdrawal?.pendingStatusQueryOriginatorConversationId).not.toBeNull();
    // Never resolved automatically just because a query was issued —
    // still ambiguous until (and unless) a definitive result arrives.
    expect(withdrawal?.status).toBe('approved');
    const creator = await creatorRepository.findById(BUSINESS_ID, 'creator-1');
    expect(creator?.availableCashKes).toBe(3000); // untouched
  });

  it('escalates to manual review once the query attempt budget is exhausted, without ever auto-resolving', async () => {
    const id = await stuckWithdrawal();
    await withdrawalRepository.applyTransition(
      id,
      { statusQueryAttemptCount: 5 },
      auditEntry('status_query_issued', 'system', 'test setup'),
      'system',
    );

    const outcomes = await withdrawalService.reconcileStuckWithdrawals(BUSINESS_ID, { stuckAfterMs: -1, maxQueryAttempts: 5 });

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].outcome).toBe('needsManualReview');
    const withdrawal = await withdrawalRepository.findById(BUSINESS_ID, id);
    expect(withdrawal?.status).toBe('approved'); // left exactly as-is — never guessed
    const creator = await creatorRepository.findById(BUSINESS_ID, 'creator-1');
    expect(creator?.availableCashKes).toBe(3000); // balance still reserved, never auto-refunded
  });

  it('the async Transaction Status Query result only resolves paid on an unambiguous Completed status', async () => {
    const id = await stuckWithdrawal();
    await withdrawalRepository.applyTransition(
      id,
      { pendingStatusQueryOriginatorConversationId: 'query-conv-1' },
      auditEntry('status_query_issued', 'system'),
      'system',
    );

    await withdrawalService.handleTransactionStatusResult(BUSINESS_ID, {
      Result: {
        ResultType: 0,
        ResultCode: 0,
        ResultDesc: 'The service request has been accepted successfully.',
        OriginatorConversationID: 'query-conv-1',
        ConversationID: 'conv-query-result',
        TransactionID: 'STATUSCONFIRMED1',
        ResultParameters: { ResultParameter: [{ Key: 'TransactionStatus', Value: 'Completed' }] },
      },
    });

    const withdrawal = await withdrawalRepository.findById(BUSINESS_ID, id);
    expect(withdrawal?.status).toBe('paid');
  });

  it('an inconclusive Transaction Status Query result never marks paid or refunds — it stays reserved for manual resolution', async () => {
    const id = await stuckWithdrawal();
    await withdrawalRepository.applyTransition(
      id,
      { pendingStatusQueryOriginatorConversationId: 'query-conv-2' },
      auditEntry('status_query_issued', 'system'),
      'system',
    );

    await withdrawalService.handleTransactionStatusResult(BUSINESS_ID, {
      Result: {
        ResultType: 0,
        ResultCode: 0,
        ResultDesc: 'The service request has been accepted successfully.',
        OriginatorConversationID: 'query-conv-2',
        ConversationID: 'conv-query-result-2',
        // No TransactionStatus parameter at all — genuinely ambiguous.
      },
    });

    const withdrawal = await withdrawalRepository.findById(BUSINESS_ID, id);
    expect(withdrawal?.status).toBe('approved'); // untouched
    const creator = await creatorRepository.findById(BUSINESS_ID, 'creator-1');
    expect(creator?.availableCashKes).toBe(3000); // not refunded on a guess
  });
});
