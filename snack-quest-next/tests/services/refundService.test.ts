import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { businessIntegrationSecretRepository } from '@/repositories/businessIntegrationSecretRepository';
import { orderRepository } from '@/repositories/orderRepository';
import { refundRepository } from '@/repositories/refundRepository';
import {
  refundService,
  OrderNotFoundError,
  RefundNotPossibleError,
  RefundAlreadyInProgressError,
} from '@/services/refundService';
import { seedOrder } from '../helpers/orderFixtures';

/**
 * `RefundService` end to end (§ RefundService + Daraja reversal
 * support): the real Daraja reversal call at request time (fetch
 * stubbed, same discipline as tests/integrations/darajaGateway.test.ts),
 * and the async result webhook moving `Order.status` to `refunded`.
 */

const BUSINESS_ID = 'biz-refund-service-test';
const OTHER_BUSINESS_ID = 'biz-refund-service-other';

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

function stubReversalSuccess(originatorConversationId = 'orig-1', conversationId = 'conv-1') {
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

function stubReversalFailure() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        String(url).includes('/oauth/v1/generate')
          ? new Response(JSON.stringify({ access_token: 'token-abc', expires_in: '3599' }), { status: 200 })
          : new Response(JSON.stringify({ errorMessage: 'Invalid TransactionID' }), { status: 400 }),
      ),
    ),
  );
}

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('orders'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('refunds'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('webhookEvents'));
  await businessIntegrationSecretRepository.set(BUSINESS_ID, 'daraja', B2C_SECRET);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RefundService.requestRefund', () => {
  it('initiates a real reversal and stores the correlation ids', async () => {
    const orderId = await seedOrder({ businessId: BUSINESS_ID, status: 'refund_requested', statusReason: 'Wrong item' });
    stubReversalSuccess('orig-refund-1', 'conv-refund-1');

    const status = await refundService.requestRefund(BUSINESS_ID, orderId, 'staff-1');

    expect(status).toBe('processing');
    const refunds = await refundRepository.listByOrderId(BUSINESS_ID, orderId);
    expect(refunds).toHaveLength(1);
    expect(refunds[0].data.status).toBe('processing');
    expect(refunds[0].data.reversalOriginatorConversationId).toBe('orig-refund-1');
    expect(refunds[0].data.reason).toBe('Wrong item');
    const order = await orderRepository.findById(orderId);
    expect(order?.status).toBe('refund_requested'); // unchanged until the async result confirms it
  });

  it('marks the refund failed when Daraja rejects the reversal request', async () => {
    const orderId = await seedOrder({ businessId: BUSINESS_ID, status: 'refund_requested' });
    stubReversalFailure();

    const status = await refundService.requestRefund(BUSINESS_ID, orderId, 'staff-1');

    expect(status).toBe('failed');
    const refunds = await refundRepository.listByOrderId(BUSINESS_ID, orderId);
    expect(refunds[0].data.status).toBe('failed');
  });

  it('throws OrderNotFoundError for an order in a different business', async () => {
    const orderId = await seedOrder({ businessId: OTHER_BUSINESS_ID, status: 'refund_requested' });

    await expect(refundService.requestRefund(BUSINESS_ID, orderId, 'staff-1')).rejects.toBeInstanceOf(
      OrderNotFoundError,
    );
  });

  it('throws RefundNotPossibleError for an order not flagged refund_requested', async () => {
    const orderId = await seedOrder({ businessId: BUSINESS_ID, status: 'confirmed' });

    await expect(refundService.requestRefund(BUSINESS_ID, orderId, 'staff-1')).rejects.toBeInstanceOf(
      RefundNotPossibleError,
    );
  });

  it('throws RefundAlreadyInProgressError when a refund is already processing', async () => {
    const orderId = await seedOrder({ businessId: BUSINESS_ID, status: 'refund_requested' });
    stubReversalSuccess();
    await refundService.requestRefund(BUSINESS_ID, orderId, 'staff-1');

    await expect(refundService.requestRefund(BUSINESS_ID, orderId, 'staff-1')).rejects.toBeInstanceOf(
      RefundAlreadyInProgressError,
    );
  });
});

describe('RefundService.handleReversalResult', () => {
  async function processingRefund(originatorConversationId: string) {
    const orderId = await seedOrder({ businessId: BUSINESS_ID, status: 'refund_requested' });
    stubReversalSuccess(originatorConversationId);
    await refundService.requestRefund(BUSINESS_ID, orderId, 'staff-1');
    vi.unstubAllGlobals();
    return orderId;
  }

  it('marks a successful result as succeeded and moves the order to refunded', async () => {
    const orderId = await processingRefund('orig-result-1');

    await refundService.handleReversalResult(BUSINESS_ID, {
      Result: {
        ResultType: 0,
        ResultCode: 0,
        ResultDesc: 'Success',
        OriginatorConversationID: 'orig-result-1',
        ConversationID: 'conv-1',
        TransactionID: 'RJ34HAY7Q',
        ResultParameters: { ResultParameter: [{ Key: 'Amount', Value: 2700 }] },
      },
    });

    const [refund] = await refundRepository.listByOrderId(BUSINESS_ID, orderId);
    expect(refund.data.status).toBe('succeeded');
    expect(refund.data.reversalTransactionId).toBe('RJ34HAY7Q');
    expect(refund.data.completedAt).not.toBeNull();
    const order = await orderRepository.findById(orderId);
    expect(order?.status).toBe('refunded');
  });

  it('marks a failed result as failed without changing the order status', async () => {
    const orderId = await processingRefund('orig-result-2');

    await refundService.handleReversalResult(BUSINESS_ID, {
      Result: {
        ResultType: 0,
        ResultCode: 2001,
        ResultDesc: 'The initiator information is invalid.',
        OriginatorConversationID: 'orig-result-2',
        ConversationID: 'conv-2',
      },
    });

    const [refund] = await refundRepository.listByOrderId(BUSINESS_ID, orderId);
    expect(refund.data.status).toBe('failed');
    const order = await orderRepository.findById(orderId);
    expect(order?.status).toBe('refund_requested');
  });

  it('is idempotent — a redelivered result does not double-process', async () => {
    const orderId = await processingRefund('orig-result-3');
    const payload = {
      Result: {
        ResultType: 0,
        ResultCode: 0,
        ResultDesc: 'Success',
        OriginatorConversationID: 'orig-result-3',
        ConversationID: 'conv-3',
        TransactionID: 'RJ34HAY8Q',
        ResultParameters: { ResultParameter: [{ Key: 'Amount', Value: 2700 }] },
      },
    };

    await refundService.handleReversalResult(BUSINESS_ID, payload);
    await refundService.handleReversalResult(BUSINESS_ID, payload);

    const [refund] = await refundRepository.listByOrderId(BUSINESS_ID, orderId);
    expect(refund.data.auditTrail.filter((e) => e.action === 'reversal_confirmed')).toHaveLength(1);
  });

  it('does not throw for a result with no matching refund', async () => {
    await expect(
      refundService.handleReversalResult(BUSINESS_ID, {
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
