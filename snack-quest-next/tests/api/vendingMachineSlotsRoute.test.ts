import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listByMachineMock, setPriceMock, setEnabledMock, verifyStaffSessionFromRequestMock } = vi.hoisted(() => ({
  listByMachineMock: vi.fn(),
  setPriceMock: vi.fn(),
  setEnabledMock: vi.fn(),
  verifyStaffSessionFromRequestMock: vi.fn(),
}));

vi.mock('@/services/machineSlotService', () => ({
  machineSlotService: { listByMachine: listByMachineMock, setPrice: setPriceMock, setEnabled: setEnabledMock },
}));

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

import { GET as slotsGet, PATCH as slotsPatch } from '@/app/api/vending/machines/[id]/slots/route';

const STAFF_SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['warehouse'], businessId: 'biz-1' };
const FINANCE_SESSION = { ...STAFF_SESSION, roles: ['finance'] };
const AGENT_SESSION = { ...STAFF_SESSION, roles: ['agent'] };

const SLOT = {
  businessId: 'biz-1',
  machineId: 'm-1',
  slotCode: 'A01',
  productId: 'pkg-1',
  productCatalogue: 'package',
  priceKes: 350,
  capacity: 10,
  currentQuantity: 4,
  enabled: true,
  position: 1,
};

function getReq(id = 'm-1') {
  return slotsGet(new Request('http://localhost/api/vending/machines/m-1/slots'), { params: Promise.resolve({ id }) });
}

function patchReq(body: unknown, id = 'm-1') {
  return slotsPatch(
    new Request('http://localhost/api/vending/machines/m-1/slots', { method: 'PATCH', body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/vending/machines/[id]/slots', () => {
  it('401s without a staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await getReq();
    expect(response.status).toBe(401);
  });

  it('403s an agent session (not warehouse/finance/admin)', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(AGENT_SESSION);
    const response = await getReq();
    expect(response.status).toBe(403);
  });

  it('200s for finance, listing every slot on the machine', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(FINANCE_SESSION);
    listByMachineMock.mockResolvedValue([SLOT]);
    const response = await getReq();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.slots).toHaveLength(1);
    expect(body.slots[0].slotCode).toBe('A01');
  });
});

describe('PATCH /api/vending/machines/[id]/slots', () => {
  it('401s without a staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await patchReq({ slotCode: 'A01', priceKes: 400 });
    expect(response.status).toBe(401);
    expect(setPriceMock).not.toHaveBeenCalled();
  });

  it('403s finance — price/enable changes are an operations action, not a finance one', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(FINANCE_SESSION);
    const response = await patchReq({ slotCode: 'A01', priceKes: 400 });
    expect(response.status).toBe(403);
  });

  it('400s when neither priceKes nor enabled is provided', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await patchReq({ slotCode: 'A01' });
    expect(response.status).toBe(400);
    expect(setPriceMock).not.toHaveBeenCalled();
  });

  it('400s a negative price', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await patchReq({ slotCode: 'A01', priceKes: -50 });
    expect(response.status).toBe(400);
    expect(setPriceMock).not.toHaveBeenCalled();
  });

  it('updates price and enabled together, scoped to the session businessId', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    setPriceMock.mockResolvedValue(undefined);
    setEnabledMock.mockResolvedValue(undefined);
    listByMachineMock.mockResolvedValue([{ ...SLOT, priceKes: 400, enabled: false }]);

    const response = await patchReq({ slotCode: 'A01', priceKes: 400, enabled: false });
    expect(response.status).toBe(200);
    expect(setPriceMock).toHaveBeenCalledWith('biz-1', 'm-1', 'A01', 400);
    expect(setEnabledMock).toHaveBeenCalledWith('biz-1', 'm-1', 'A01', false);
    const body = await response.json();
    expect(body.slot.priceKes).toBe(400);
    expect(body.slot.enabled).toBe(false);
  });
});
