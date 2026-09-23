import { beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyStaffSessionFromRequestMock, listByMachineMock, listOpenByMachineMock, createDraftMock } = vi.hoisted(() => ({
  verifyStaffSessionFromRequestMock: vi.fn(),
  listByMachineMock: vi.fn(),
  listOpenByMachineMock: vi.fn(),
  createDraftMock: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

vi.mock('@/repositories/restockTaskRepository', async () => {
  const actual = await vi.importActual<typeof import('@/repositories/restockTaskRepository')>('@/repositories/restockTaskRepository');
  return { ...actual, restockTaskRepository: { listByMachine: listByMachineMock, listOpenByMachine: listOpenByMachineMock } };
});

vi.mock('@/services/restockTaskService', async () => {
  const actual = await vi.importActual<typeof import('@/services/restockTaskService')>('@/services/restockTaskService');
  return { ...actual, restockTaskService: { createDraft: createDraftMock } };
});

import { GET as restockGet, POST as restockPost } from '@/app/api/vending/restock/route';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { RestockTaskHasNoItemsError, RestockTaskQuantityError, SlotNotFoundError } from '@/services/restockTaskService';

const STAFF_SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['warehouse'], businessId: 'biz-1' };
const AGENT_SESSION = { ...STAFF_SESSION, roles: ['agent'] };

const TASK = {
  businessId: 'biz-1',
  machineId: 'm-1',
  warehouseId: null,
  items: [{ slotId: 'A01', productId: 'pkg-1', quantityNeeded: 8, quantityDispatched: null, quantityReceived: null, discrepancyQuantity: null, batchId: null, expiresAt: null }],
  status: 'draft',
  priority: 'normal',
  pickedBy: null,
  pickedAt: null,
  dispatchedBy: null,
  dispatchedAt: null,
  receivedBy: null,
  discrepancyNote: null,
  note: null,
  createdAt: { toDate: () => new Date('2024-01-01T00:00:00.000Z') },
  completedAt: null,
};

function getReq(query: string) {
  return restockGet(new Request(`http://localhost/api/vending/restock${query}`));
}

function postReq(body: unknown) {
  return restockPost(new Request('http://localhost/api/vending/restock', { method: 'POST', body: JSON.stringify(body) }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/vending/restock', () => {
  it('401s without a staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await getReq('?machineId=m-1');
    expect(response.status).toBe(401);
  });

  it('403s an agent session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(AGENT_SESSION);
    const response = await getReq('?machineId=m-1');
    expect(response.status).toBe(403);
  });

  it('400s a missing machineId', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await getReq('');
    expect(response.status).toBe(400);
  });

  it('lists only open tasks when openOnly=true', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    listOpenByMachineMock.mockResolvedValue([{ id: 'task-1', data: TASK }]);
    const response = await getReq('?machineId=m-1&openOnly=true');
    expect(response.status).toBe(200);
    expect(listOpenByMachineMock).toHaveBeenCalledWith('biz-1', 'm-1');
    expect(listByMachineMock).not.toHaveBeenCalled();
    const body = await response.json();
    expect(body.tasks[0].id).toBe('task-1');
    expect(body.tasks[0].status).toBe('draft');
  });

  it('lists every task by default', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    listByMachineMock.mockResolvedValue([{ id: 'task-1', data: TASK }]);
    const response = await getReq('?machineId=m-1');
    expect(response.status).toBe(200);
    expect(listByMachineMock).toHaveBeenCalledWith('biz-1', 'm-1');
  });
});

describe('POST /api/vending/restock', () => {
  it('401s without a staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await postReq({ machineId: 'm-1', items: [{ slotId: 'A01', quantityNeeded: 8 }] });
    expect(response.status).toBe(401);
    expect(createDraftMock).not.toHaveBeenCalled();
  });

  it('403s an agent session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(AGENT_SESSION);
    const response = await postReq({ machineId: 'm-1', items: [{ slotId: 'A01', quantityNeeded: 8 }] });
    expect(response.status).toBe(403);
  });

  it('400s a missing machineId', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await postReq({ items: [{ slotId: 'A01', quantityNeeded: 8 }] });
    expect(response.status).toBe(400);
  });

  it('400s an empty items array', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await postReq({ machineId: 'm-1', items: [] });
    expect(response.status).toBe(400);
    expect(createDraftMock).not.toHaveBeenCalled();
  });

  it('400s an item missing quantityNeeded', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await postReq({ machineId: 'm-1', items: [{ slotId: 'A01' }] });
    expect(response.status).toBe(400);
  });

  it('400s an invalid priority', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await postReq({ machineId: 'm-1', items: [{ slotId: 'A01', quantityNeeded: 8 }], priority: 'urgent' });
    expect(response.status).toBe(400);
  });

  it('201s and creates a draft task, scoped to the session businessId and actor', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    createDraftMock.mockResolvedValue('task-1');
    const response = await postReq({ machineId: 'm-1', items: [{ slotId: 'A01', quantityNeeded: 8 }], warehouseId: 'wh-1', priority: 'high', note: 'manual top-up' });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.taskId).toBe('task-1');
    expect(createDraftMock).toHaveBeenCalledWith({
      businessId: 'biz-1',
      machineId: 'm-1',
      items: [{ slotId: 'A01', productId: null, quantityNeeded: 8 }],
      warehouseId: 'wh-1',
      priority: 'high',
      note: 'manual top-up',
      actor: 'staff-1',
    });
  });

  it('404s a machine that does not exist', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    createDraftMock.mockRejectedValue(new MachineNotFoundError('m-1'));
    const response = await postReq({ machineId: 'm-1', items: [{ slotId: 'A01', quantityNeeded: 8 }] });
    expect(response.status).toBe(404);
  });

  it('404s a slot that does not exist', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    createDraftMock.mockRejectedValue(new SlotNotFoundError('m-1', 'ghost'));
    const response = await postReq({ machineId: 'm-1', items: [{ slotId: 'ghost', quantityNeeded: 8 }] });
    expect(response.status).toBe(404);
  });

  it('400s when the service reports no items or a bad quantity', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    createDraftMock.mockRejectedValue(new RestockTaskHasNoItemsError());
    const response = await postReq({ machineId: 'm-1', items: [{ slotId: 'A01', quantityNeeded: 8 }] });
    expect(response.status).toBe(400);
  });

  it('propagates a RestockTaskQuantityError as 400', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    createDraftMock.mockRejectedValue(new RestockTaskQuantityError('bad quantity'));
    const response = await postReq({ machineId: 'm-1', items: [{ slotId: 'A01', quantityNeeded: 8 }] });
    expect(response.status).toBe(400);
  });
});
