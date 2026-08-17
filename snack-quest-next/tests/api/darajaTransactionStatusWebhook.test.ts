import { beforeEach, describe, expect, it, vi } from 'vitest';

const { handleTransactionStatusResultMock, verifyDarajaWebhookRequestMock } =
  vi.hoisted(() => ({
    handleTransactionStatusResultMock: vi.fn(),
    verifyDarajaWebhookRequestMock: vi.fn(),
  }));

vi.mock('@/services/withdrawalService', () => ({
  withdrawalService: {
    handleTransactionStatusResult: handleTransactionStatusResultMock,
  },
}));

vi.mock('@/lib/webhooks/verifyDarajaWebhookRequest', () => ({
  verifyDarajaWebhookRequest: verifyDarajaWebhookRequestMock,
}));

import { POST as resultRoute } from '@/app/api/webhooks/daraja/[businessId]/transaction-status-result/route';
import { POST as timeoutRoute } from '@/app/api/webhooks/daraja/[businessId]/transaction-status-timeout/route';

/**
 * Route-handler-level tests for the Daraja Transaction Status Query
 * ResultURL/QueueTimeOutURL wires (§ Daraja B2C production readiness —
 * stuck-withdrawal reconciliation) — `WithdrawalService.handleTransactionStatusResult()`
 * itself is already covered by tests/services/withdrawalService.test.ts;
 * these prove both routes check origin first, forward the businessId
 * and payload correctly, and always ack 200 on a verified request,
 * matching what Daraja expects — same shape as the B2C result routes.
 */

beforeEach(() => {
  vi.clearAllMocks();
});

function request(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/webhooks/daraja/[businessId]/transaction-status-result', () => {
  it('rejects a request verifyDarajaWebhookRequest flags as invalid, without calling the service', async () => {
    verifyDarajaWebhookRequestMock.mockResolvedValue({
      ok: false,
      response: new Response('Forbidden', { status: 403 }),
    });

    const response = await resultRoute(
      request(
        'http://localhost/api/webhooks/daraja/biz-1/transaction-status-result',
        {},
      ),
      {
        params: Promise.resolve({ businessId: 'biz-1' }),
      },
    );

    expect(response.status).toBe(403);
    expect(handleTransactionStatusResultMock).not.toHaveBeenCalled();
  });

  it('forwards the payload to the service, scoped to the URL businessId, and acks 200', async () => {
    verifyDarajaWebhookRequestMock.mockResolvedValue({ ok: true });
    handleTransactionStatusResultMock.mockResolvedValue(undefined);
    const payload = { Result: { ResultCode: 0 } };

    const response = await resultRoute(
      request(
        'http://localhost/api/webhooks/daraja/biz-1/transaction-status-result',
        payload,
      ),
      {
        params: Promise.resolve({ businessId: 'biz-1' }),
      },
    );

    expect(response.status).toBe(200);
    expect(handleTransactionStatusResultMock).toHaveBeenCalledWith(
      'biz-1',
      payload,
    );
  });
});

describe('POST /api/webhooks/daraja/[businessId]/transaction-status-timeout', () => {
  it('rejects a request verifyDarajaWebhookRequest flags as invalid, without calling the service', async () => {
    verifyDarajaWebhookRequestMock.mockResolvedValue({
      ok: false,
      response: new Response('Forbidden', { status: 403 }),
    });

    const response = await timeoutRoute(
      request(
        'http://localhost/api/webhooks/daraja/biz-1/transaction-status-timeout',
        {},
      ),
      {
        params: Promise.resolve({ businessId: 'biz-1' }),
      },
    );

    expect(response.status).toBe(403);
    expect(handleTransactionStatusResultMock).not.toHaveBeenCalled();
  });

  it('forwards the payload to the same handler and acks 200', async () => {
    verifyDarajaWebhookRequestMock.mockResolvedValue({ ok: true });
    handleTransactionStatusResultMock.mockResolvedValue(undefined);
    const payload = { Result: { ResultCode: 1 } };

    const response = await timeoutRoute(
      request(
        'http://localhost/api/webhooks/daraja/biz-1/transaction-status-timeout',
        payload,
      ),
      {
        params: Promise.resolve({ businessId: 'biz-1' }),
      },
    );

    expect(response.status).toBe(200);
    expect(handleTransactionStatusResultMock).toHaveBeenCalledWith(
      'biz-1',
      payload,
    );
  });
});
