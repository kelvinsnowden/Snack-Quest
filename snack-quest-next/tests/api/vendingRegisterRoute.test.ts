import { beforeEach, describe, expect, it, vi } from 'vitest';

const { provisionDeviceMock, verifyStaffSessionFromRequestMock } = vi.hoisted(() => ({
  provisionDeviceMock: vi.fn(),
  verifyStaffSessionFromRequestMock: vi.fn(),
}));

vi.mock('@/services/machineService', () => ({
  machineService: { provisionDevice: provisionDeviceMock },
}));

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

import { POST as registerRoute } from '@/app/api/vending/register/route';

const STAFF_SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['admin'], businessId: 'biz-1' };
const WAREHOUSE_SESSION = { ...STAFF_SESSION, roles: ['warehouse'] };
const AGENT_SESSION = { ...STAFF_SESSION, roles: ['agent'] };

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/vending/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = { machineCode: 'SQ-M001', serialNumber: 'SN-1', manufacturer: 'mock', model: 'Vendo 3000' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/vending/register', () => {
  it('401s without a staff session — a machine can never provision itself', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await registerRoute(jsonRequest(VALID_BODY));
    expect(response.status).toBe(401);
    expect(provisionDeviceMock).not.toHaveBeenCalled();
  });

  it('403s a staff session with no admin/warehouse role', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(AGENT_SESSION);
    const response = await registerRoute(jsonRequest(VALID_BODY));
    expect(response.status).toBe(403);
    expect(provisionDeviceMock).not.toHaveBeenCalled();
  });

  it('200s for warehouse, provisioning and returning the one-time credential', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(WAREHOUSE_SESSION);
    provisionDeviceMock.mockResolvedValue({
      machineId: 'm-1',
      credential: { credentialId: 'cred-1', machineId: 'm-1', secret: 'plaintext-secret', issuedAt: '2024-01-01T00:00:00.000Z' },
    });

    const response = await registerRoute(jsonRequest(VALID_BODY));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.machineId).toBe('m-1');
    expect(body.credential.secret).toBe('plaintext-secret');
    expect(provisionDeviceMock).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: 'biz-1', machineCode: 'SQ-M001', manufacturer: 'mock', actor: 'staff-1' }),
    );
  });

  it('400s a missing machineCode', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await registerRoute(jsonRequest({ ...VALID_BODY, machineCode: undefined }));
    expect(response.status).toBe(400);
    expect(provisionDeviceMock).not.toHaveBeenCalled();
  });

  it('400s an unrecognised manufacturer', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await registerRoute(jsonRequest({ ...VALID_BODY, manufacturer: 'acme' }));
    expect(response.status).toBe(400);
    expect(provisionDeviceMock).not.toHaveBeenCalled();
  });

  it('400s invalid JSON', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const request = new Request('http://localhost/api/vending/register', { method: 'POST', body: 'not json' });
    const response = await registerRoute(request);
    expect(response.status).toBe(400);
  });

  it('400s a duplicate machineCode reported by the service', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    provisionDeviceMock.mockRejectedValue(new Error('machineCode "SQ-M001" is already in use by machine m-0'));
    const response = await registerRoute(jsonRequest(VALID_BODY));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('already in use');
  });
});
