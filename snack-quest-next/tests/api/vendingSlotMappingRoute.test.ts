import { beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyStaffSessionFromRequestMock, setSlotMappingsMock, listForMachineMock } = vi.hoisted(() => ({
  verifyStaffSessionFromRequestMock: vi.fn(),
  setSlotMappingsMock: vi.fn(),
  listForMachineMock: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/session', () => ({ verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock }));
vi.mock('@/lib/audit/recordAuditLog', () => ({ recordAuditLog: vi.fn() }));
vi.mock('@/services/machineSlotService', async () => {
  const actual = await vi.importActual<typeof import('@/services/machineSlotService')>('@/services/machineSlotService');
  return { ...actual, machineSlotService: { setSlotMappings: setSlotMappingsMock } };
});
vi.mock('@/repositories/slotMappingHistoryRepository', () => ({ slotMappingHistoryRepository: { listForMachine: listForMachineMock } }));

import { GET as historyRoute, PUT as mappingRoute } from '@/app/api/vending/machines/[id]/slot-mapping/route';

/**
 * The slot mapping decides which motor turns for a paid sale, so only
 * an admin may change it. Warehouse staff can still read its history
 * (they are the ones standing at the machine when a lane misbehaves).
 */

const ADMIN = { uid: 'staff-1', email: 'a@example.com', displayName: 'A', roles: ['admin'], businessId: 'biz-1' };
const WAREHOUSE = { ...ADMIN, roles: ['warehouse'] };
const params = { params: Promise.resolve({ id: 'm-1' }) };
const put = (body: unknown) =>
  mappingRoute(new Request('http://localhost/api/vending/machines/m-1/slot-mapping', { method: 'PUT', body: JSON.stringify(body) }), params);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('/api/vending/machines/[id]/slot-mapping', () => {
  it('403s warehouse on a change, and never touches the mapping', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(WAREHOUSE);
    expect((await put({ mappings: [{ slotCode: 'A01', manufacturerSlotId: '12' }] })).status).toBe(403);
    expect(setSlotMappingsMock).not.toHaveBeenCalled();
  });

  it('lets warehouse read the history', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(WAREHOUSE);
    listForMachineMock.mockResolvedValue([]);
    const response = await historyRoute(new Request('http://localhost/api/vending/machines/m-1/slot-mapping'), params);
    expect(response.status).toBe(200);
    expect(listForMachineMock).toHaveBeenCalledWith('biz-1', 'm-1');
  });

  it('applies an admin’s change to the session’s business', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(ADMIN);
    setSlotMappingsMock.mockResolvedValue([{ slotCode: 'A01', manufacturerSlotId: '12' }]);
    const response = await put({ mappings: [{ slotCode: 'A01', manufacturerSlotId: '12' }] });
    expect(response.status).toBe(200);
    expect(setSlotMappingsMock).toHaveBeenCalledWith('biz-1', 'm-1', [{ slotCode: 'A01', manufacturerSlotId: '12' }], 'staff-1');
  });
});
