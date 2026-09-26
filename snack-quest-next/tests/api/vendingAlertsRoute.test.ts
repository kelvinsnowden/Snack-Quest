import { beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyStaffSessionFromRequestMock, evaluateAndSyncMock, listOpenMock, acknowledgeMock, resolveMock } = vi.hoisted(() => ({
  verifyStaffSessionFromRequestMock: vi.fn(),
  evaluateAndSyncMock: vi.fn(),
  listOpenMock: vi.fn(),
  acknowledgeMock: vi.fn(),
  resolveMock: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

vi.mock('@/services/alertService', async () => {
  const actual = await vi.importActual<typeof import('@/services/alertService')>('@/services/alertService');
  return {
    ...actual,
    alertService: { evaluateAndSync: evaluateAndSyncMock, listOpen: listOpenMock, acknowledge: acknowledgeMock, resolve: resolveMock },
  };
});

import { GET as alertsGet } from '@/app/api/vending/alerts/route';
import { POST as acknowledgePost } from '@/app/api/vending/alerts/[id]/acknowledge/route';
import { POST as resolvePost } from '@/app/api/vending/alerts/[id]/resolve/route';
import { AlertNotFoundError, AlertNotOpenError } from '@/repositories/alertRepository';
import { auditLogRepository } from '@/repositories/auditLogRepository';
import { adminFirestore } from '@/lib/firebase/admin';

const STAFF_SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['warehouse'], businessId: 'biz-1' };
const AGENT_SESSION = { ...STAFF_SESSION, roles: ['agent'] };

const ALERT = {
  businessId: 'biz-1',
  type: 'stockout' as const,
  severity: 'critical' as const,
  machineId: 'm-1',
  locationId: null,
  title: 'Slot out of stock',
  detail: 'Slot A01 is empty.',
  dedupeKey: 'stockout:m-1:A01',
  status: 'open' as const,
  assignee: null,
  resolution: null,
  resolvedAt: null,
  resolvedBy: null,
  createdAt: { toDate: () => new Date('2024-01-01T00:00:00.000Z') },
  updatedAt: { toDate: () => new Date('2024-01-01T00:00:00.000Z') },
};

beforeEach(async () => {
  vi.clearAllMocks();
  await adminFirestore.recursiveDelete(adminFirestore.collection('auditLogs'));
});

describe('GET /api/vending/alerts', () => {
  it('401s without a staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await alertsGet(new Request('http://localhost/api/vending/alerts'));
    expect(response.status).toBe(401);
    expect(evaluateAndSyncMock).not.toHaveBeenCalled();
  });

  it('403s an agent session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(AGENT_SESSION);
    const response = await alertsGet(new Request('http://localhost/api/vending/alerts'));
    expect(response.status).toBe(403);
  });

  it('syncs before listing, and returns the serialized open alerts', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    evaluateAndSyncMock.mockResolvedValue(undefined);
    listOpenMock.mockResolvedValue([{ id: 'alert-1', data: ALERT }]);

    const response = await alertsGet(new Request('http://localhost/api/vending/alerts'));
    expect(response.status).toBe(200);
    expect(evaluateAndSyncMock).toHaveBeenCalledWith('biz-1');
    expect(listOpenMock).toHaveBeenCalledWith('biz-1', { type: undefined, severity: undefined, machineId: undefined });
    const body = await response.json();
    expect(body.alerts).toEqual([expect.objectContaining({ id: 'alert-1', type: 'stockout', severity: 'critical', machineId: 'm-1' })]);
  });

  it('passes a recognised type/severity/machineId query param through to listOpen', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    listOpenMock.mockResolvedValue([]);
    await alertsGet(new Request('http://localhost/api/vending/alerts?type=machine_fault&severity=critical&machineId=m-1'));
    expect(listOpenMock).toHaveBeenCalledWith('biz-1', { type: 'machine_fault', severity: 'critical', machineId: 'm-1' });
  });

  it('ignores an unrecognised type/severity query param rather than passing it through', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    listOpenMock.mockResolvedValue([]);
    await alertsGet(new Request('http://localhost/api/vending/alerts?type=not_a_real_type&severity=extreme'));
    expect(listOpenMock).toHaveBeenCalledWith('biz-1', { type: undefined, severity: undefined, machineId: undefined });
  });
});

describe('POST /api/vending/alerts/[id]/acknowledge', () => {
  function post(id = 'alert-1') {
    return acknowledgePost(new Request('http://localhost/x', { method: 'POST' }), { params: Promise.resolve({ id }) });
  }

  it('401s without a staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await post();
    expect(response.status).toBe(401);
    expect(acknowledgeMock).not.toHaveBeenCalled();
  });

  it('403s an agent session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(AGENT_SESSION);
    const response = await post();
    expect(response.status).toBe(403);
  });

  it('200s, acknowledges as the staff uid, and writes a real audit log entry', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    acknowledgeMock.mockResolvedValue({ ...ALERT, status: 'acknowledged', assignee: 'staff-1' });

    const response = await post();
    expect(response.status).toBe(200);
    expect(acknowledgeMock).toHaveBeenCalledWith('biz-1', 'alert-1', 'staff-1');
    const body = await response.json();
    expect(body.alert).toMatchObject({ id: 'alert-1', status: 'acknowledged', assignee: 'staff-1' });

    const { logs } = await auditLogRepository.listByBusiness('biz-1');
    expect(logs).toHaveLength(1);
    expect(logs[0].data).toMatchObject({ action: 'acknowledge_alert', entityType: 'alert', entityId: 'alert-1', machineId: 'm-1', actorId: 'staff-1' });
  });

  it('404s an alert that does not exist', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    acknowledgeMock.mockRejectedValue(new AlertNotFoundError('alert-1'));
    const response = await post();
    expect(response.status).toBe(404);
  });

  it('409s an alert that is not open (already resolved)', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    acknowledgeMock.mockRejectedValue(new AlertNotOpenError('alert-1', 'resolved'));
    const response = await post();
    expect(response.status).toBe(409);
  });
});

describe('POST /api/vending/alerts/[id]/resolve', () => {
  function post(body: unknown, id = 'alert-1') {
    return resolvePost(new Request('http://localhost/x', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
  }

  it('401s without a staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await post({ resolution: 'Restocked manually.' });
    expect(response.status).toBe(401);
  });

  it('400s a missing resolution', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await post({ resolution: '   ' });
    expect(response.status).toBe(400);
    expect(resolveMock).not.toHaveBeenCalled();
  });

  it('200s, resolves with the given note, and writes a real audit log entry', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    resolveMock.mockResolvedValue({ ...ALERT, status: 'resolved', resolution: 'Restocked manually.', resolvedBy: 'staff-1' });

    const response = await post({ resolution: 'Restocked manually.' });
    expect(response.status).toBe(200);
    expect(resolveMock).toHaveBeenCalledWith('biz-1', 'alert-1', 'staff-1', 'Restocked manually.');

    const { logs } = await auditLogRepository.listByBusiness('biz-1');
    expect(logs).toHaveLength(1);
    expect(logs[0].data).toMatchObject({ action: 'resolve_alert', entityType: 'alert', entityId: 'alert-1', machineId: 'm-1' });
    expect(logs[0].data.after).toMatchObject({ status: 'resolved', resolution: 'Restocked manually.' });
  });

  it('404s an alert that does not exist', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    resolveMock.mockRejectedValue(new AlertNotFoundError('alert-1'));
    const response = await post({ resolution: 'note' });
    expect(response.status).toBe(404);
  });

  it('409s an alert that is already resolved', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    resolveMock.mockRejectedValue(new AlertNotOpenError('alert-1', 'resolved'));
    const response = await post({ resolution: 'note' });
    expect(response.status).toBe(409);
  });
});
