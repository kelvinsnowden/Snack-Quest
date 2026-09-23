import { beforeEach, describe, expect, it, vi } from 'vitest';

const { processCallbackMock, handlePaymentResultMock, verifyDarajaWebhookRequestMock, verifyCallbackMock, handleMpesaCallbackMock } = vi.hoisted(() => ({
  processCallbackMock: vi.fn(),
  handlePaymentResultMock: vi.fn(),
  verifyDarajaWebhookRequestMock: vi.fn(),
  verifyCallbackMock: vi.fn(),
  handleMpesaCallbackMock: vi.fn(),
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

vi.mock('@/lib/integrations/daraja/darajaGateway', () => ({
  darajaGateway: { verifyCallback: verifyCallbackMock },
}));

vi.mock('@/services/machineTransactionService', () => ({
  machineTransactionService: { handleMpesaCallback: handleMpesaCallbackMock },
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
 *
 * Also proves the vending branch added in
 * docs/VENDING_OS_BENCHMARK.md §C: a vending `checkoutRequestId` is
 * claimed by `machineTransactionService.handleMpesaCallback` and
 * never reaches `paymentService.processCallback`; anything that
 * isn't reaches `processCallback` exactly as it always did — this is
 * the regression proof that the existing e-commerce path is
 * unmodified, not just untested.
 */

function request(businessId: string, body: unknown): Request {
  return new Request(`http://localhost/api/webhooks/daraja/${businessId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const PARSED_CALLBACK = {
  checkoutRequestId: 'ws_CO_1',
  merchantRequestId: 'mr_1',
  resultCode: 0,
  resultDesc: 'Success',
  amountKes: 350,
  mpesaReceiptNumber: 'ABC123',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/webhooks/daraja/[businessId]', () => {
  it('rejects a request verifyDarajaWebhookRequest flags as invalid, without calling paymentService', async () => {
    verifyDarajaWebhookRequestMock.mockResolvedValue({ ok: false, response: new Response('Forbidden', { status: 403 }) });

    const response = await stkRoute(request('biz-1', {}), { params: Promise.resolve({ businessId: 'biz-1' }) });

    expect(response.status).toBe(403);
    expect(processCallbackMock).not.toHaveBeenCalled();
    expect(handleMpesaCallbackMock).not.toHaveBeenCalled();
  });

  it('processes a verified callback through the e-commerce path when it is not a vending transaction, and acks 200', async () => {
    verifyDarajaWebhookRequestMock.mockResolvedValue({ ok: true, businessId: 'biz-1' });
    const payload = { Body: { stkCallback: { ResultCode: 0, CheckoutRequestID: 'ws_CO_other' } } };
    verifyCallbackMock.mockReturnValue({ ...PARSED_CALLBACK, checkoutRequestId: 'ws_CO_other' });
    handleMpesaCallbackMock.mockResolvedValue({ handled: false });
    const result = { status: 'succeeded' as const, intentId: 'i1', conversationId: 'c1', snapshotId: 's1', amountKes: 2500, mpesaReceiptNumber: 'ABC123' };
    processCallbackMock.mockResolvedValue(result);
    handlePaymentResultMock.mockResolvedValue(undefined);

    const response = await stkRoute(request('biz-1', payload), { params: Promise.resolve({ businessId: 'biz-1' }) });

    expect(response.status).toBe(200);
    expect(handleMpesaCallbackMock).toHaveBeenCalledWith('biz-1', { ...PARSED_CALLBACK, checkoutRequestId: 'ws_CO_other' });
    expect(processCallbackMock).toHaveBeenCalledWith('biz-1', payload);
    expect(handlePaymentResultMock).toHaveBeenCalledWith(result);
  });

  it('routes a vending checkoutRequestId to machineTransactionService and never calls the e-commerce path', async () => {
    verifyDarajaWebhookRequestMock.mockResolvedValue({ ok: true, businessId: 'biz-1' });
    const payload = { Body: { stkCallback: { ResultCode: 0, CheckoutRequestID: 'ws_CO_1' } } };
    verifyCallbackMock.mockReturnValue(PARSED_CALLBACK);
    handleMpesaCallbackMock.mockResolvedValue({ handled: true, transactionId: 'txn-1', outcome: 'succeeded' });

    const response = await stkRoute(request('biz-1', payload), { params: Promise.resolve({ businessId: 'biz-1' }) });

    expect(response.status).toBe(200);
    expect(handleMpesaCallbackMock).toHaveBeenCalledWith('biz-1', PARSED_CALLBACK);
    expect(processCallbackMock).not.toHaveBeenCalled();
    expect(handlePaymentResultMock).not.toHaveBeenCalled();
  });

  it('falls through to the e-commerce path when the payload cannot be parsed as an STK callback at all', async () => {
    verifyDarajaWebhookRequestMock.mockResolvedValue({ ok: true, businessId: 'biz-1' });
    const payload = { not: 'a daraja callback' };
    verifyCallbackMock.mockImplementation(() => {
      throw new Error('Malformed Daraja callback payload: missing Body.stkCallback');
    });
    processCallbackMock.mockResolvedValue({ status: 'unmatched' as const, checkoutRequestId: '' });
    handlePaymentResultMock.mockResolvedValue(undefined);

    const response = await stkRoute(request('biz-1', payload), { params: Promise.resolve({ businessId: 'biz-1' }) });

    expect(response.status).toBe(200);
    expect(handleMpesaCallbackMock).not.toHaveBeenCalled();
    expect(processCallbackMock).toHaveBeenCalledWith('biz-1', payload);
  });

  it('does NOT swallow a real failure inside handleMpesaCallback into a silent fallthrough', async () => {
    verifyDarajaWebhookRequestMock.mockResolvedValue({ ok: true, businessId: 'biz-1' });
    const payload = { Body: { stkCallback: { ResultCode: 0, CheckoutRequestID: 'ws_CO_1' } } };
    verifyCallbackMock.mockReturnValue(PARSED_CALLBACK);
    handleMpesaCallbackMock.mockRejectedValue(new Error('Firestore is down'));

    await expect(stkRoute(request('biz-1', payload), { params: Promise.resolve({ businessId: 'biz-1' }) })).rejects.toThrow('Firestore is down');
    expect(processCallbackMock).not.toHaveBeenCalled();
  });
});
