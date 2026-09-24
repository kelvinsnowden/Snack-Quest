import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findByIdMock, updateStatusMock, relocateMock, verifyStaffSessionFromRequestMock } = vi.hoisted(() => ({
  findByIdMock: vi.fn(),
  updateStatusMock: vi.fn(),
  relocateMock: vi.fn(),
  verifyStaffSessionFromRequestMock: vi.fn(),
}));

vi.mock('@/services/machineService', async () => {
  const actual = await vi.importActual<typeof import('@/services/machineService')>('@/services/machineService');
  return { ...actual, machineService: { findById: findByIdMock, updateStatus: updateStatusMock, relocate: relocateMock } };
});

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

import { GET as machineDetailRoute, PATCH as machineDetailPatch } from '@/app/api/vending/machines/[id]/route';
import { IllegalMachineStatusTransitionError } from '@/services/machineService';
import { auditLogRepository } from '@/repositories/auditLogRepository';
import { adminFirestore } from '@/lib/firebase/admin';

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

beforeEach(async () => {
  vi.clearAllMocks();
  await adminFirestore.recursiveDelete(adminFirestore.collection('auditLogs'));
});

function patch(body: unknown, id = 'm-1') {
  return machineDetailPatch(
    new Request(`http://localhost/api/vending/machines/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  );
}

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

describe('PATCH /api/vending/machines/[id]', () => {
  it('401s without a staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await patch({ status: 'active' });
    expect(response.status).toBe(401);
  });

  it('403s a staff session outside admin/warehouse', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue({ ...STAFF_SESSION, roles: ['finance'] });
    const response = await patch({ status: 'active' });
    expect(response.status).toBe(403);
  });

  it('400s a body with neither status nor locationId', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await patch({});
    expect(response.status).toBe(400);
    expect(updateStatusMock).not.toHaveBeenCalled();
  });

  it('400s an invalid status', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await patch({ status: 'not-a-real-status' });
    expect(response.status).toBe(400);
  });

  it('404s a machine that does not exist', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    findByIdMock.mockResolvedValue(null);
    const response = await patch({ status: 'maintenance' }, 'ghost');
    expect(response.status).toBe(404);
  });

  it('200s a status change, calls machineService.updateStatus, and writes a real audit log entry with before/after status', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    findByIdMock.mockResolvedValueOnce(MACHINE).mockResolvedValueOnce({ ...MACHINE, status: 'maintenance' });
    updateStatusMock.mockResolvedValue(undefined);

    const response = await patch({ status: 'maintenance' });
    expect(response.status).toBe(200);
    expect(updateStatusMock).toHaveBeenCalledWith('biz-1', 'm-1', 'maintenance', 'staff-1');
    expect(relocateMock).not.toHaveBeenCalled();

    const { logs } = await auditLogRepository.listByBusiness('biz-1');
    expect(logs).toHaveLength(1);
    expect(logs[0].data).toMatchObject({ action: 'update_machine_configuration', entityType: 'machine', machineId: 'm-1', actorId: 'staff-1' });
    expect(logs[0].data.before).toMatchObject({ status: 'active' });
    expect(logs[0].data.after).toMatchObject({ status: 'maintenance' });
  });

  it('200s a relocation, calling machineService.relocate with the new location fields', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    findByIdMock.mockResolvedValue(MACHINE);
    relocateMock.mockResolvedValue(undefined);

    const response = await patch({ locationId: 'loc-1', venueName: 'New Mall', relocationReason: 'Owner moved it' });
    expect(response.status).toBe(200);
    expect(relocateMock).toHaveBeenCalledWith(
      'biz-1',
      'm-1',
      expect.objectContaining({ locationId: 'loc-1', venueName: 'New Mall' }),
      'staff-1',
      'Owner moved it',
    );
    expect(updateStatusMock).not.toHaveBeenCalled();

    const { logs } = await auditLogRepository.listByBusiness('biz-1');
    expect(logs).toHaveLength(1);
  });

  it('409s an illegal status transition, never writing an audit log for a change that never happened', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    findByIdMock.mockResolvedValue(MACHINE);
    updateStatusMock.mockRejectedValue(new IllegalMachineStatusTransitionError('active', 'provisioning'));

    const response = await patch({ status: 'provisioning' });
    expect(response.status).toBe(409);

    const { logs } = await auditLogRepository.listByBusiness('biz-1');
    expect(logs).toHaveLength(0);
  });
});
