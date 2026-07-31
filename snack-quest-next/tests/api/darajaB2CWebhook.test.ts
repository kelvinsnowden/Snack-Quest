import { describe, expect, it, vi } from 'vitest';

const { handleB2CResultMock } = vi.hoisted(() => ({ handleB2CResultMock: vi.fn() }));

vi.mock('@/services/withdrawalService', () => ({
  withdrawalService: { handleB2CResult: handleB2CResultMock },
}));

import { POST as resultRoute } from '@/app/api/webhooks/daraja/[businessId]/b2c-result/route';
import { POST as timeoutRoute } from '@/app/api/webhooks/daraja/[businessId]/b2c-timeout/route';

/**
 * Route-handler-level tests for the Daraja B2C ResultURL/QueueTimeOutURL
 * wires (§ Admin: Withdrawals — Daraja B2C) — `WithdrawalService.handleB2CResult()`
 * itself is already covered by tests/services/withdrawalService.test.ts;
 * these prove both routes forward the businessId and payload correctly
 * and always ack 200, matching what Daraja expects.
 */

function request(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/webhooks/daraja/[businessId]/b2c-result', () => {
  it('forwards the payload to the service, scoped to the URL businessId, and acks 200', async () => {
    handleB2CResultMock.mockResolvedValue(undefined);
    const payload = { Result: { ResultCode: 0 } };

    const response = await resultRoute(request('http://localhost/api/webhooks/daraja/biz-1/b2c-result', payload), {
      params: Promise.resolve({ businessId: 'biz-1' }),
    });

    expect(response.status).toBe(200);
    expect(handleB2CResultMock).toHaveBeenCalledWith('biz-1', payload);
  });
});

describe('POST /api/webhooks/daraja/[businessId]/b2c-timeout', () => {
  it('forwards the payload to the same handler and acks 200', async () => {
    handleB2CResultMock.mockResolvedValue(undefined);
    const payload = { Result: { ResultCode: 1 } };

    const response = await timeoutRoute(request('http://localhost/api/webhooks/daraja/biz-1/b2c-timeout', payload), {
      params: Promise.resolve({ businessId: 'biz-1' }),
    });

    expect(response.status).toBe(200);
    expect(handleB2CResultMock).toHaveBeenCalledWith('biz-1', payload);
  });
});
