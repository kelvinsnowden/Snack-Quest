import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findByIdMock, verifyStaffSessionFromRequestMock } = vi.hoisted(() => ({
  findByIdMock: vi.fn(),
  verifyStaffSessionFromRequestMock: vi.fn(),
}));

vi.mock('@/services/machineService', async () => {
  const actual = await vi.importActual<typeof import('@/services/machineService')>('@/services/machineService');
  return { ...actual, machineService: { findById: findByIdMock } };
});

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

import { GET as machineDetailRoute } from '@/app/api/vending/machines/[id]/route';

const STAFF_SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['warehouse'], businessId: 'biz-1' };
const AGENT_SESSION = { ...STAFF_SESSION, roles: ['agent'] };

function call(id = 'm-1') {
  return machineDetailRoute(new Request('http://localhost/api/vending/machines/m-1'), { params: Promise.resolve({ id }) });
}

const MACHINE = {
  businessId: 'biz-1',
  machineCode: 'SQ-M001',
  serialNumber: 'SN-1',
  manufacturer: 'mock',
  model: 'Vendo 3000',
  hardwareVersion: null,
  firmwareVersion: null,
  status: 'active',
  ownerPartnerId: null,
  locationId: null,
  latitude: null,
  longitude: null,
  address: null,
  venueName: null,
  installedAt: null,
  lastSeenAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/vending/machines/[id]', () => {
  it('401s without a staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await call();
    expect(response.status).toBe(401);
  });

  it('403s a staff session outside admin/finance/warehouse', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(AGENT_SESSION);
    const response = await call();
    expect(response.status).toBe(403);
  });

  it('404s a machine that does not exist', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    findByIdMock.mockResolvedValue(null);
    const response = await call('ghost');
    expect(response.status).toBe(404);
  });

  it("200s and derives connectivityStatus from lastSeenAt, never returning it as a raw stored field", async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    findByIdMock.mockResolvedValue(MACHINE);

    const response = await call();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.machine.id).toBe('m-1');
    expect(body.machine.machineCode).toBe('SQ-M001');
    expect(body.machine.connectivityStatus).toBe('unknown'); // lastSeenAt is null
    expect(findByIdMock).toHaveBeenCalledWith('biz-1', 'm-1');
  });
});
