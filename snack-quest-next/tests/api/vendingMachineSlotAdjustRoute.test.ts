import { beforeEach, describe, expect, it, vi } from 'vitest';

const { recordDiscrepancyAdjustmentMock, verifyStaffSessionFromRequestMock } = vi.hoisted(() => ({
  recordDiscrepancyAdjustmentMock: vi.fn(),
  verifyStaffSessionFromRequestMock: vi.fn(),
}));

vi.mock('@/services/machineInventoryMovementService', async () => {
  const actual = await vi.importActual<typeof import('@/services/machineInventoryMovementService')>('@/services/machineInventoryMovementService');
  return {
    ...actual,
    machineInventoryMovementService: { recordDiscrepancyAdjustment: recordDiscrepancyAdjustmentMock },
  };
});

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

import { POST as adjustPost } from '@/app/api/vending/machines/[id]/slots/adjust/route';
import { SlotNotFoundError, DiscrepancyReasonRequiredError } from '@/services/machineInventoryMovementService';
import { auditLogRepository } from '@/repositories/auditLogRepository';
import { adminFirestore } from '@/lib/firebase/admin';

const STAFF_SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['warehouse'], businessId: 'biz-1' };
const AGENT_SESSION = { ...STAFF_SESSION, roles: ['agent'] };

function post(body: unknown, id = 'm-1') {
  return adjustPost(
    new Request(`http://localhost/api/vending/machines/${id}/slots/adjust`, { method: 'POST', body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(async () => {
  vi.clearAllMocks();
  await adminFirestore.recursiveDelete(adminFirestore.collection('auditLogs'));
});

describe('POST /api/vending/machines/[id]/slots/adjust', () => {
  it('401s without a session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await post({ slotCode: 'A01', physicalCountQuantity: 5, reason: 'count' });
    expect(response.status).toBe(401);
  });

  it('403s an agent session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(AGENT_SESSION);
    const response = await post({ slotCode: 'A01', physicalCountQuantity: 5, reason: 'count' });
    expect(response.status).toBe(403);
  });

  it('400s a missing reason — never lets the client skip explaining a discrepancy', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await post({ slotCode: 'A01', physicalCountQuantity: 5, reason: '  ' });
    expect(response.status).toBe(400);
    expect(recordDiscrepancyAdjustmentMock).not.toHaveBeenCalled();
  });

  it('400s a missing physicalCountQuantity', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await post({ slotCode: 'A01', reason: 'count' });
    expect(response.status).toBe(400);
  });

  it('201s and records the adjustment, then writes a real audit log entry with the machine and the reason', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    recordDiscrepancyAdjustmentMock.mockResolvedValue({ expectedQuantity: 10, physicalCountQuantity: 7, discrepancy: -3, afterQuantity: 7 });

    const response = await post({ slotCode: 'A01', physicalCountQuantity: 7, reason: 'Weekly audit found 3 missing' });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual({ expectedQuantity: 10, physicalCountQuantity: 7, discrepancy: -3, afterQuantity: 7 });
    expect(recordDiscrepancyAdjustmentMock).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: 'biz-1', machineId: 'm-1', slotId: 'A01', physicalCountQuantity: 7, reason: 'Weekly audit found 3 missing', actor: 'staff-1' }),
    );

    const { logs } = await auditLogRepository.listByBusiness('biz-1');
    expect(logs).toHaveLength(1);
    expect(logs[0].data).toMatchObject({ action: 'record_stock_discrepancy', entityType: 'machineInventoryMovement', machineId: 'm-1', actorId: 'staff-1' });
    expect(logs[0].data.after).toMatchObject({ discrepancy: -3, reason: 'Weekly audit found 3 missing' });
  });

  it('404s a slot that does not exist', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    recordDiscrepancyAdjustmentMock.mockRejectedValue(new SlotNotFoundError('m-1', 'Z99'));
    const response = await post({ slotCode: 'Z99', physicalCountQuantity: 5, reason: 'count' });
    expect(response.status).toBe(404);
  });

  it('maps a service-level reason error to 400', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    recordDiscrepancyAdjustmentMock.mockRejectedValue(new DiscrepancyReasonRequiredError());
    const response = await post({ slotCode: 'A01', physicalCountQuantity: 5, reason: 'count' });
    expect(response.status).toBe(400);
  });
});
