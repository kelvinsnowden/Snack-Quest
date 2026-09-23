import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  verifyStaffSessionFromRequestMock,
  approveMock,
  startPickingMock,
  dispatchMock,
  markInTransitMock,
  receiveMock,
  cancelMock,
} = vi.hoisted(() => ({
  verifyStaffSessionFromRequestMock: vi.fn(),
  approveMock: vi.fn(),
  startPickingMock: vi.fn(),
  dispatchMock: vi.fn(),
  markInTransitMock: vi.fn(),
  receiveMock: vi.fn(),
  cancelMock: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

vi.mock('@/services/restockTaskService', async () => {
  const actual = await vi.importActual<typeof import('@/services/restockTaskService')>('@/services/restockTaskService');
  return {
    ...actual,
    restockTaskService: {
      approve: approveMock,
      startPicking: startPickingMock,
      dispatch: dispatchMock,
      markInTransit: markInTransitMock,
      receive: receiveMock,
      cancel: cancelMock,
    },
  };
});

import { POST as approvePost } from '@/app/api/vending/restock/[taskId]/approve/route';
import { POST as startPickingPost } from '@/app/api/vending/restock/[taskId]/start-picking/route';
import { POST as dispatchPost } from '@/app/api/vending/restock/[taskId]/dispatch/route';
import { POST as markInTransitPost } from '@/app/api/vending/restock/[taskId]/mark-in-transit/route';
import { POST as receivePost } from '@/app/api/vending/restock/[taskId]/receive/route';
import { POST as cancelPost } from '@/app/api/vending/restock/[taskId]/cancel/route';
import {
  RestockTaskNotFoundError,
  IllegalRestockTaskTransitionError,
  RestockTaskItemMismatchError,
  RestockTaskItemIncompleteError,
  RestockTaskQuantityError,
  SlotNotFoundError,
} from '@/services/restockTaskService';

const STAFF_SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['warehouse'], businessId: 'biz-1' };
const AGENT_SESSION = { ...STAFF_SESSION, roles: ['agent'] };

function req(body?: unknown) {
  return new Request('http://localhost/x', { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/vending/restock/[taskId]/approve', () => {
  it('401s without a session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await approvePost(req(), { params: Promise.resolve({ taskId: 'task-1' }) });
    expect(response.status).toBe(401);
  });

  it('403s an agent session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(AGENT_SESSION);
    const response = await approvePost(req(), { params: Promise.resolve({ taskId: 'task-1' }) });
    expect(response.status).toBe(403);
  });

  it('200s and approves, optionally assigning a warehouseId', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    approveMock.mockResolvedValue(undefined);
    const response = await approvePost(req({ warehouseId: 'wh-1' }), { params: Promise.resolve({ taskId: 'task-1' }) });
    expect(response.status).toBe(200);
    expect(approveMock).toHaveBeenCalledWith('biz-1', 'task-1', 'staff-1', 'wh-1');
  });

  it('200s with no body at all', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    approveMock.mockResolvedValue(undefined);
    const response = await approvePost(new Request('http://localhost/x', { method: 'POST' }), { params: Promise.resolve({ taskId: 'task-1' }) });
    expect(response.status).toBe(200);
    expect(approveMock).toHaveBeenCalledWith('biz-1', 'task-1', 'staff-1', undefined);
  });

  it('404s a task that does not exist', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    approveMock.mockRejectedValue(new RestockTaskNotFoundError('task-1'));
    const response = await approvePost(req(), { params: Promise.resolve({ taskId: 'task-1' }) });
    expect(response.status).toBe(404);
  });

  it('409s an illegal transition', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    approveMock.mockRejectedValue(new IllegalRestockTaskTransitionError('cancelled', 'approved'));
    const response = await approvePost(req(), { params: Promise.resolve({ taskId: 'task-1' }) });
    expect(response.status).toBe(409);
  });
});

describe('POST /api/vending/restock/[taskId]/start-picking', () => {
  it('200s and records the picker', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    startPickingMock.mockResolvedValue(undefined);
    const response = await startPickingPost(req(), { params: Promise.resolve({ taskId: 'task-1' }) });
    expect(response.status).toBe(200);
    expect(startPickingMock).toHaveBeenCalledWith('biz-1', 'task-1', 'staff-1');
  });

  it('409s an illegal transition', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    startPickingMock.mockRejectedValue(new IllegalRestockTaskTransitionError('draft', 'picking'));
    const response = await startPickingPost(req(), { params: Promise.resolve({ taskId: 'task-1' }) });
    expect(response.status).toBe(409);
  });
});

describe('POST /api/vending/restock/[taskId]/dispatch', () => {
  it('400s a missing items array', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await dispatchPost(req({}), { params: Promise.resolve({ taskId: 'task-1' }) });
    expect(response.status).toBe(400);
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it('400s an item missing quantityDispatched', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await dispatchPost(req({ items: [{ slotId: 'A01' }] }), { params: Promise.resolve({ taskId: 'task-1' }) });
    expect(response.status).toBe(400);
  });

  it('200s and dispatches with batch/expiry converted to a real Date', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    dispatchMock.mockResolvedValue(undefined);
    const response = await dispatchPost(
      req({ items: [{ slotId: 'A01', quantityDispatched: 8, batchId: 'batch-1', expiresAt: '2027-01-01T00:00:00.000Z' }] }),
      { params: Promise.resolve({ taskId: 'task-1' }) },
    );
    expect(response.status).toBe(200);
    expect(dispatchMock).toHaveBeenCalledWith('biz-1', 'task-1', 'staff-1', [
      { slotId: 'A01', quantityDispatched: 8, batchId: 'batch-1', expiresAt: new Date('2027-01-01T00:00:00.000Z') },
    ]);
  });

  it('404s a slotId that is not part of the task', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    dispatchMock.mockRejectedValue(new RestockTaskItemMismatchError('task-1', 'A99'));
    const response = await dispatchPost(req({ items: [{ slotId: 'A99', quantityDispatched: 1 }] }), { params: Promise.resolve({ taskId: 'task-1' }) });
    expect(response.status).toBe(404);
  });

  it('400s when an item is missing from the dispatch coverage', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    dispatchMock.mockRejectedValue(new RestockTaskItemIncompleteError('task-1', 'A02', 'dispatched'));
    const response = await dispatchPost(req({ items: [{ slotId: 'A01', quantityDispatched: 8 }] }), { params: Promise.resolve({ taskId: 'task-1' }) });
    expect(response.status).toBe(400);
  });

  it('409s an illegal transition', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    dispatchMock.mockRejectedValue(new IllegalRestockTaskTransitionError('draft', 'dispatched'));
    const response = await dispatchPost(req({ items: [{ slotId: 'A01', quantityDispatched: 8 }] }), { params: Promise.resolve({ taskId: 'task-1' }) });
    expect(response.status).toBe(409);
  });
});

describe('POST /api/vending/restock/[taskId]/mark-in-transit', () => {
  it('200s', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    markInTransitMock.mockResolvedValue(undefined);
    const response = await markInTransitPost(req(), { params: Promise.resolve({ taskId: 'task-1' }) });
    expect(response.status).toBe(200);
    expect(markInTransitMock).toHaveBeenCalledWith('biz-1', 'task-1', 'staff-1');
  });
});

describe('POST /api/vending/restock/[taskId]/receive', () => {
  it('400s a missing items array', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await receivePost(req({}), { params: Promise.resolve({ taskId: 'task-1' }) });
    expect(response.status).toBe(400);
    expect(receiveMock).not.toHaveBeenCalled();
  });

  it('200s and returns the derived terminal status', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    receiveMock.mockResolvedValue({ status: 'partially_received' });
    const response = await receivePost(
      req({ items: [{ slotId: 'A01', quantityReceived: 5 }], discrepancyNote: 'short by 3' }),
      { params: Promise.resolve({ taskId: 'task-1' }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('partially_received');
    expect(receiveMock).toHaveBeenCalledWith('biz-1', 'task-1', 'staff-1', [{ slotId: 'A01', quantityReceived: 5 }], 'short by 3');
  });

  it('404s a slot that does not exist', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    receiveMock.mockRejectedValue(new SlotNotFoundError('m-1', 'A01'));
    const response = await receivePost(req({ items: [{ slotId: 'A01', quantityReceived: 5 }] }), { params: Promise.resolve({ taskId: 'task-1' }) });
    expect(response.status).toBe(404);
  });

  it('400s over-receiving beyond what was dispatched', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    receiveMock.mockRejectedValue(new RestockTaskQuantityError('too much'));
    const response = await receivePost(req({ items: [{ slotId: 'A01', quantityReceived: 99 }] }), { params: Promise.resolve({ taskId: 'task-1' }) });
    expect(response.status).toBe(400);
  });

  it('409s an illegal transition (not yet in_transit)', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    receiveMock.mockRejectedValue(new IllegalRestockTaskTransitionError('dispatched', 'received'));
    const response = await receivePost(req({ items: [{ slotId: 'A01', quantityReceived: 5 }] }), { params: Promise.resolve({ taskId: 'task-1' }) });
    expect(response.status).toBe(409);
  });
});

describe('POST /api/vending/restock/[taskId]/cancel', () => {
  it('200s', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    cancelMock.mockResolvedValue(undefined);
    const response = await cancelPost(req(), { params: Promise.resolve({ taskId: 'task-1' }) });
    expect(response.status).toBe(200);
    expect(cancelMock).toHaveBeenCalledWith('biz-1', 'task-1', 'staff-1');
  });

  it('409s cancelling an in_transit task', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    cancelMock.mockRejectedValue(new IllegalRestockTaskTransitionError('in_transit', 'cancelled'));
    const response = await cancelPost(req(), { params: Promise.resolve({ taskId: 'task-1' }) });
    expect(response.status).toBe(409);
  });
});
