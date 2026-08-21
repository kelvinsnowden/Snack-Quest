import { describe, expect, it, vi } from 'vitest';

const { processCallbackMock, handlePaymentResultMock, verifyDarajaWebhookRequestMock } = vi.hoisted(() => ({
  processCallbackMock: vi.fn(),
  handlePaymentResultMock: vi.fn(),
  verifyDarajaWebhookRequestMock: vi.fn(),
}));

vi.mock('@/services/paymentService', () => ({
  paymentService: { processCallback: processCallbackMock },
}));

vi.mock('@/services/conversationService', () => ({
  conversationService: { handlePaymentResult: handlePaymentResultMock },
}));

vi.mock('@/lib/webhooks/verifyDarajaWebhookRequest', () => ({
  verifyDarajaWebhookRequest: verifyDarajaWebhookRequestMock,
}));

import { POST as stkRoute } from '@/app/api/webhooks/daraja/[businessId]/route';

/**
 * Route-handler-level tests for Daraja's STK Push callback
 * (PLATFORM_ARCHITECTURE_V2.md §7) — `PaymentService.processCallback()`
 * and `ConversationService.handlePaymentResult()` are already covered
 * by their own service tests, and `verifyDarajaWebhookRequest`'s real
 * behavior by tests/lib/verifyDarajaWebhookRequest.test.ts; this proves
 * the route checks origin first, forwards the payload, and always acks
 * 200 on a verified request.
 */

function request(businessId: string, body: unknown): Request {
  return new Request(`http://localhost/api/webhooks/daraja/${businessId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/webhooks/daraja/[businessId]', () => {
  it('rejects a request verifyDarajaWebhookRequest flags as invalid, without calling paymentService', async () => {
    verifyDarajaWebhookRequestMock.mockResolvedValue({ ok: false, response: new Response('Forbidden', { status: 403 }) });

    const response = await stkRoute(request('biz-1', {}), { params: Promise.resolve({ businessId: 'biz-1' }) });

    expect(response.status).toBe(403);
    expect(processCallbackMock).not.toHaveBeenCalled();
  });

  it('processes a verified callback and acks 200', async () => {
    verifyDarajaWebhookRequestMock.mockResolvedValue({ ok: true, businessId: 'biz-1' });
    const payload = { Body: { stkCallback: { ResultCode: 0 } } };
    const result = { status: 'succeeded' as const, intentId: 'i1', conversationId: 'c1', snapshotId: 's1', amountKes: 2500, mpesaReceiptNumber: 'ABC123' };
    processCallbackMock.mockResolvedValue(result);
    handlePaymentResultMock.mockResolvedValue(undefined);

    const response = await stkRoute(request('biz-1', payload), { params: Promise.resolve({ businessId: 'biz-1' }) });

    expect(response.status).toBe(200);
    expect(processCallbackMock).toHaveBeenCalledWith('biz-1', payload);
    expect(handlePaymentResultMock).toHaveBeenCalledWith(result);
  });
});
