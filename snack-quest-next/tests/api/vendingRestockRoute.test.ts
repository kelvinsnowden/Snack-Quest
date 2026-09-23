import { beforeEach, describe, expect, it, vi } from 'vitest';

const { recordMovementMock, listByMachineMock, listOpenByMachineMock, updateStatusMock, verifyStaffSessionFromRequestMock } = vi.hoisted(() => ({
  recordMovementMock: vi.fn(),
  listByMachineMock: vi.fn(),
  listOpenByMachineMock: vi.fn(),
  updateStatusMock: vi.fn(),
  verifyStaffSessionFromRequestMock: vi.fn(),
}));

vi.mock('@/services/machineInventoryMovementService', async () => {
  const actual = await vi.importActual<typeof import('@/services/machineInventoryMovementService')>('@/services/machineInventoryMovementService');
  return { ...actual, machineInventoryMovementService: { recordMovement: recordMovementMock } };
});

vi.mock('@/repositories/restockTaskRepository', () => ({
  restockTaskRepository: { listByMachine: listByMachineMock, listOpenByMachine: listOpenByMachineMock, updateStatus: updateStatusMock },
}));

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

import { GET as restockGet, POST as restockPost } from '@/app/api/vending/restock/route';
import { SlotNotFoundError, InsufficientMachineStockError } from '@/services/machineInventoryMovementService';

const STAFF_SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['warehouse'], businessId: 'biz-1' };
const AGENT_SESSION = { ...STAFF_SESSION, roles: ['agent'] };

const TASK = {
  businessId: 'biz-1',
  machineId: 'm-1',
  items: [{ slotId: 'A01', productId: 'pkg-1', quantityNeeded: 8 }],
  status: 'pending',
  priority: 'normal',
  assignedTo: null,
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
    const response = await postReq({ machineId: 'm-1', slotId: 'A01', quantityAdded: 5 });
    expect(response.status).toBe(401);
    expect(recordMovementMock).not.toHaveBeenCalled();
  });

  it('400s a zero quantityAdded', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await postReq({ machineId: 'm-1', slotId: 'A01', quantityAdded: 0 });
    expect(response.status).toBe(400);
    expect(recordMovementMock).not.toHaveBeenCalled();
  });

  it('400s a negative quantityAdded', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await postReq({ machineId: 'm-1', slotId: 'A01', quantityAdded: -3 });
    expect(response.status).toBe(400);
  });

  it('records the movement, scoped to the session businessId and actor', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    recordMovementMock.mockResolvedValue({ afterQuantity: 12 });
    const response = await postReq({ machineId: 'm-1', slotId: 'A01', quantityAdded: 8 });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.afterQuantity).toBe(12);
    expect(body.taskCompleted).toBe(false);
    expect(recordMovementMock).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: 'biz-1', machineId: 'm-1', slotId: 'A01', reason: 'restock', quantityDelta: 8, actor: 'staff-1' }),
    );
  });

  it('completes the named restock task when taskId is given', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    recordMovementMock.mockResolvedValue({ afterQuantity: 12 });
    updateStatusMock.mockResolvedValue(undefined);

    const response = await postReq({ machineId: 'm-1', slotId: 'A01', quantityAdded: 8, taskId: 'task-1' });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.taskCompleted).toBe(true);
    expect(updateStatusMock).toHaveBeenCalledWith('biz-1', 'task-1', 'completed', 'staff-1');
  });

  it('404s a slot that does not exist', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    recordMovementMock.mockRejectedValue(new SlotNotFoundError('m-1', 'ghost'));
    const response = await postReq({ machineId: 'm-1', slotId: 'ghost', quantityAdded: 5 });
    expect(response.status).toBe(404);
  });

  it('409s an over-restock the service reports as inconsistent', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    recordMovementMock.mockRejectedValue(new InsufficientMachineStockError('m-1', 'A01', 5, 2));
    const response = await postReq({ machineId: 'm-1', slotId: 'A01', quantityAdded: 5 });
    expect(response.status).toBe(409);
  });
});
