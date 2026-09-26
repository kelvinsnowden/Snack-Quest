import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authenticateDeviceMock, ingestMock } = vi.hoisted(() => ({
  authenticateDeviceMock: vi.fn(),
  ingestMock: vi.fn(),
}));

vi.mock('@/lib/vending/deviceAuth', () => ({
  authenticateDevice: authenticateDeviceMock,
}));

vi.mock('@/services/machineTelemetryService', () => ({
  machineTelemetryService: { ingest: ingestMock },
}));

import { POST as telemetryRoute } from '@/app/api/vending/telemetry/route';
import { UnrecognisedHardwarePayloadError } from '@/lib/vending/hardwareAdapter';
import { MachineNotFoundError } from '@/repositories/machineRepository';

function request(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/vending/telemetry', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

const PAYLOAD = { machineId: 'm-1', eventType: 'heartbeat', idempotencyKey: 'evt-1' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/vending/telemetry', () => {
  it('401s a request with no valid device credential — never reaches the ingest service', async () => {
    authenticateDeviceMock.mockResolvedValue({ ok: false, reason: 'invalid_secret' });
    const response = await telemetryRoute(request(PAYLOAD));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe('invalid_secret');
    expect(ingestMock).not.toHaveBeenCalled();
  });

  it("trusts the authenticated token's machineId, passing it to the service rather than re-deriving it from the payload", async () => {
    authenticateDeviceMock.mockResolvedValue({ ok: true, businessId: 'biz-1', machineId: 'm-1', credentialId: 'cred-1' });
    ingestMock.mockResolvedValue({ isNew: true, eventId: 'evt-doc-1', eventType: 'heartbeat' });

    // The payload itself claims a different machine — the route must not trust that.
    const response = await telemetryRoute(request({ ...PAYLOAD, machineId: 'someone-elses-machine' }));

    expect(response.status).toBe(200);
    expect(ingestMock).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: 'biz-1', machineId: 'm-1' }),
    );
  });

  it('400s a malformed payload the adapter cannot parse', async () => {
    authenticateDeviceMock.mockResolvedValue({ ok: true, businessId: 'biz-1', machineId: 'm-1', credentialId: 'cred-1' });
    ingestMock.mockRejectedValue(new UnrecognisedHardwarePayloadError('mock', 'missing eventType'));

    const response = await telemetryRoute(request({}));
    expect(response.status).toBe(400);
  });

  it('404s a credential whose machine no longer exists', async () => {
    authenticateDeviceMock.mockResolvedValue({ ok: true, businessId: 'biz-1', machineId: 'm-1', credentialId: 'cred-1' });
    ingestMock.mockRejectedValue(new MachineNotFoundError('m-1'));

    const response = await telemetryRoute(request(PAYLOAD));
    expect(response.status).toBe(404);
  });

  it('400s invalid JSON before ever authenticating is irrelevant — auth still runs first, but a bad body still 400s', async () => {
    authenticateDeviceMock.mockResolvedValue({ ok: true, businessId: 'biz-1', machineId: 'm-1', credentialId: 'cred-1' });
    const badRequest = new Request('http://localhost/api/vending/telemetry', { method: 'POST', body: 'not json' });
    const response = await telemetryRoute(badRequest);
    expect(response.status).toBe(400);
    expect(ingestMock).not.toHaveBeenCalled();
  });
});
