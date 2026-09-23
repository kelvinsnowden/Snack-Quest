import { beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyStaffSessionFromRequestMock, getReserveStatusMock } = vi.hoisted(() => ({
  verifyStaffSessionFromRequestMock: vi.fn(),
  getReserveStatusMock: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

vi.mock('@/services/machineInventoryReserveService', async () => {
  const actual = await vi.importActual<typeof import('@/services/machineInventoryReserveService')>('@/services/machineInventoryReserveService');
  return { ...actual, machineInventoryReserveService: { getReserveStatus: getReserveStatusMock } };
});

import { GET as reserveGet } from '@/app/api/vending/machines/[id]/reserve/route';
import { MachineNotFoundError } from '@/repositories/machineRepository';

const STAFF_SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['admin'], businessId: 'biz-1' };
const AGENT_SESSION = { ...STAFF_SESSION, roles: ['agent'] };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/vending/machines/[id]/reserve', () => {
  it('401s without a session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await reserveGet(new Request('http://localhost/x'), { params: Promise.resolve({ id: 'm-1' }) });
    expect(response.status).toBe(401);
  });

  it('403s an agent session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(AGENT_SESSION);
    const response = await reserveGet(new Request('http://localhost/x'), { params: Promise.resolve({ id: 'm-1' }) });
    expect(response.status).toBe(403);
  });

  it('200s the KSh 100,000 reserve status', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    getReserveStatusMock.mockResolvedValue({
      targetKes: 100_000,
      currentAtCostKes: 60_000,
      currentAtRetailKes: 90_000,
      varianceKes: -40_000,
      replenishmentRequiredKes: 40_000,
      unpricedSlotCount: 0,
    });
    const response = await reserveGet(new Request('http://localhost/x'), { params: Promise.resolve({ id: 'm-1' }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      targetKes: 100_000,
      currentAtCostKes: 60_000,
      currentAtRetailKes: 90_000,
      varianceKes: -40_000,
      replenishmentRequiredKes: 40_000,
      unpricedSlotCount: 0,
    });
  });

  it('404s a machine that does not exist', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    getReserveStatusMock.mockRejectedValue(new MachineNotFoundError('m-1'));
    const response = await reserveGet(new Request('http://localhost/x'), { params: Promise.resolve({ id: 'm-1' }) });
    expect(response.status).toBe(404);
  });
});
