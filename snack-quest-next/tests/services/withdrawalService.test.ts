import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { businessIntegrationSecretRepository } from '@/repositories/businessIntegrationSecretRepository';
import { creatorRepository } from '@/repositories/creatorRepository';
import { withdrawalRepository } from '@/repositories/withdrawalRepository';
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
} from '@/services/withdrawalService';
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
    expect(withdrawal?.b2cOriginatorConversationId).toBe('orig-approve-1');
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
  async function approvedWithdrawal(originatorConversationId: string) {
    await seedCreator('creator-1', { businessId: BUSINESS_ID, status: 'active', availableCashKes: 5000 });
    const id = await withdrawalService.requestWithdrawal({
      businessId: BUSINESS_ID,
      ownerId: 'creator-1',
      ownerType: 'creator',
      amountKes: 2000,
      phoneNumber: '254712345678',
    });
    stubB2CSuccess(originatorConversationId);
    await withdrawalService.approveWithdrawal(BUSINESS_ID, id, 'staff-1');
    vi.unstubAllGlobals();
    return id;
  }

  it('marks a successful result as paid', async () => {
    const id = await approvedWithdrawal('orig-result-1');

    await withdrawalService.handleB2CResult(BUSINESS_ID, {
      Result: {
        ResultType: 0,
        ResultCode: 0,
        ResultDesc: 'Success',
        OriginatorConversationID: 'orig-result-1',
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
    const id = await approvedWithdrawal('orig-result-2');

    await withdrawalService.handleB2CResult(BUSINESS_ID, {
      Result: {
        ResultType: 0,
        ResultCode: 2001,
        ResultDesc: 'The initiator information is invalid.',
        OriginatorConversationID: 'orig-result-2',
        ConversationID: 'conv-2',
      },
    });

    const withdrawal = await withdrawalRepository.findById(BUSINESS_ID, id);
    expect(withdrawal?.status).toBe('failed');
    const creator = await creatorRepository.findById(BUSINESS_ID, 'creator-1');
    expect(creator?.availableCashKes).toBe(5000);
  });

  it('is idempotent — a redelivered result does not refund twice', async () => {
    const id = await approvedWithdrawal('orig-result-3');
    const payload = {
      Result: {
        ResultType: 0,
        ResultCode: 2001,
        ResultDesc: 'Failed',
        OriginatorConversationID: 'orig-result-3',
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
});
