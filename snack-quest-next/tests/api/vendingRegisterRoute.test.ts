import { beforeEach, describe, expect, it, vi } from 'vitest';

const { provisionDeviceMock, verifyStaffSessionFromRequestMock, relocateMock, findLocationMock, recordAuditLogMock } = vi.hoisted(() => ({
  provisionDeviceMock: vi.fn(),
  verifyStaffSessionFromRequestMock: vi.fn(),
  relocateMock: vi.fn(),
  findLocationMock: vi.fn(),
  recordAuditLogMock: vi.fn(),
}));

vi.mock('@/services/machineService', () => ({
  machineService: { provisionDevice: provisionDeviceMock, relocate: relocateMock },
}));
vi.mock('@/services/locationService', () => ({ locationService: { findById: findLocationMock } }));
vi.mock('@/lib/audit/recordAuditLog', () => ({ recordAuditLog: recordAuditLogMock }));

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

  it('403s every role but admin — warehouse included, since registering hands out a device secret', async () => {
    for (const session of [AGENT_SESSION, WAREHOUSE_SESSION, { ...STAFF_SESSION, roles: ['finance'] }]) {
      verifyStaffSessionFromRequestMock.mockResolvedValue(session);
      const response = await registerRoute(jsonRequest(VALID_BODY));
      expect(response.status).toBe(403);
    }
    expect(provisionDeviceMock).not.toHaveBeenCalled();
  });

  it('201s for an admin, provisioning and returning the one-time credential', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
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

  it('lets Snack Quest generate the machine code when none is supplied, and returns it', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    provisionDeviceMock.mockResolvedValue({ machineId: 'm-1', machineCode: 'SQ-MCH-000001', credential: { secret: 's' } });
    const response = await registerRoute(jsonRequest({ ...VALID_BODY, machineCode: undefined }));
    expect(response.status).toBe(201);
    expect(provisionDeviceMock).toHaveBeenCalledWith(expect.objectContaining({ machineCode: null }));
    expect(await response.json()).toMatchObject({ machineCode: 'SQ-MCH-000001' });
  });

  it('400s an empty-string machineCode', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await registerRoute(jsonRequest({ ...VALID_BODY, machineCode: '' }));
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

describe('POST /api/vending/register — owner, place and audit', () => {
  const REGISTERED = { machineId: 'm-9', machineCode: 'SQ-MCH-000009', credential: { credentialId: 'cred-9', machineId: 'm-9', secret: 'f'.repeat(64), issuedAt: '2026-01-01T00:00:00.000Z' } };
  const withPermissions = (permissions: string[]) => ({ ...STAFF_SESSION, roles: ['admin'], effectivePermissions: permissions });

  it('audits the registration without the key, and never lets the response be cached', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    provisionDeviceMock.mockResolvedValue(REGISTERED);
    const response = await registerRoute(jsonRequest(VALID_BODY));
    expect(response.status).toBe(201);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(recordAuditLogMock).toHaveBeenCalledWith(expect.any(Request), expect.objectContaining({ action: 'register_machine', entityId: 'm-9', machineId: 'm-9' }));
    expect(JSON.stringify(recordAuditLogMock.mock.calls)).not.toContain('f'.repeat(64));
  });

  it('needs owners.manage to set an owner and machines.relocate to place it, checked before anything is created', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(withPermissions(['machines.create']));
    const owner = await registerRoute(jsonRequest({ ...VALID_BODY, ownerPartnerId: 'p-1' }));
    expect(owner.status).toBe(403);
    expect((await owner.json()).permission).toBe('owners.manage');
    const place = await registerRoute(jsonRequest({ ...VALID_BODY, locationId: 'loc-1' }));
    expect(place.status).toBe(403);
    expect((await place.json()).permission).toBe('machines.relocate');
    expect(provisionDeviceMock).not.toHaveBeenCalled();
  });

  it('places the new machine at a real location, and refuses an unknown one before registering', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(withPermissions(['machines.create', 'machines.relocate']));
    findLocationMock.mockResolvedValueOnce(null);
    expect((await registerRoute(jsonRequest({ ...VALID_BODY, locationId: 'nowhere' }))).status).toBe(400);
    expect(provisionDeviceMock).not.toHaveBeenCalled();

    findLocationMock.mockResolvedValueOnce({ name: 'Campus', latitude: -1.3, longitude: 36.8, address: 'Madaraka' });
    provisionDeviceMock.mockResolvedValue(REGISTERED);
    expect((await registerRoute(jsonRequest({ ...VALID_BODY, locationId: 'loc-1' }))).status).toBe(201);
    expect(relocateMock).toHaveBeenCalledWith('biz-1', 'm-9', { locationId: 'loc-1', latitude: -1.3, longitude: 36.8, address: 'Madaraka', venueName: 'Campus' }, 'staff-1', 'Placed at registration');
  });
});
