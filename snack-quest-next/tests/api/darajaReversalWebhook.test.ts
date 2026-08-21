import { beforeEach, describe, expect, it, vi } from 'vitest';

const { handleReversalResultMock, verifyDarajaWebhookRequestMock } = vi.hoisted(() => ({
  handleReversalResultMock: vi.fn(),
  verifyDarajaWebhookRequestMock: vi.fn(),
}));

vi.mock('@/services/refundService', () => ({
  refundService: { handleReversalResult: handleReversalResultMock },
}));

vi.mock('@/lib/webhooks/verifyDarajaWebhookRequest', () => ({
  verifyDarajaWebhookRequest: verifyDarajaWebhookRequestMock,
}));

import { POST as resultRoute } from '@/app/api/webhooks/daraja/[businessId]/reversal-result/route';
import { POST as timeoutRoute } from '@/app/api/webhooks/daraja/[businessId]/reversal-timeout/route';

/**
 * Route-handler-level tests for the Daraja reversal ResultURL/
 * QueueTimeOutURL wires (§ RefundService + Daraja reversal support) —
 * `RefundService.handleReversalResult()` itself is already covered by
 * tests/services/refundService.test.ts, and `verifyDarajaWebhookRequest`'s
 * own real behavior by tests/lib/verifyDarajaWebhookRequest.test.ts;
 * these prove both routes check origin first, forward the businessId
 * and payload correctly, and always ack 200 on a verified request.
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

describe('POST /api/webhooks/daraja/[businessId]/reversal-result', () => {
  it('rejects a request verifyDarajaWebhookRequest flags as invalid, without calling the service', async () => {
    verifyDarajaWebhookRequestMock.mockResolvedValue({ ok: false, response: new Response('Forbidden', { status: 403 }) });

    const response = await resultRoute(
      request('http://localhost/api/webhooks/daraja/biz-1/reversal-result', {}),
      { params: Promise.resolve({ businessId: 'biz-1' }) },
    );

    expect(response.status).toBe(403);
    expect(handleReversalResultMock).not.toHaveBeenCalled();
  });

  it('forwards the payload to the service, scoped to the URL businessId, and acks 200', async () => {
    verifyDarajaWebhookRequestMock.mockResolvedValue({ ok: true, businessId: 'biz-1' });
    handleReversalResultMock.mockResolvedValue(undefined);
    const payload = { Result: { ResultCode: 0 } };

    const response = await resultRoute(
      request('http://localhost/api/webhooks/daraja/biz-1/reversal-result', payload),
      { params: Promise.resolve({ businessId: 'biz-1' }) },
    );

    expect(response.status).toBe(200);
    expect(handleReversalResultMock).toHaveBeenCalledWith('biz-1', payload);
  });
});

describe('POST /api/webhooks/daraja/[businessId]/reversal-timeout', () => {
  it('rejects a request verifyDarajaWebhookRequest flags as invalid, without calling the service', async () => {
    verifyDarajaWebhookRequestMock.mockResolvedValue({ ok: false, response: new Response('Forbidden', { status: 403 }) });

    const response = await timeoutRoute(
      request('http://localhost/api/webhooks/daraja/biz-1/reversal-timeout', {}),
      { params: Promise.resolve({ businessId: 'biz-1' }) },
    );

    expect(response.status).toBe(403);
    expect(handleReversalResultMock).not.toHaveBeenCalled();
  });

  it('forwards the payload to the same handler and acks 200', async () => {
    verifyDarajaWebhookRequestMock.mockResolvedValue({ ok: true, businessId: 'biz-1' });
    handleReversalResultMock.mockResolvedValue(undefined);
    const payload = { Result: { ResultCode: 1 } };

    const response = await timeoutRoute(
      request('http://localhost/api/webhooks/daraja/biz-1/reversal-timeout', payload),
      { params: Promise.resolve({ businessId: 'biz-1' }) },
    );

    expect(response.status).toBe(200);
    expect(handleReversalResultMock).toHaveBeenCalledWith('biz-1', payload);
  });
});
