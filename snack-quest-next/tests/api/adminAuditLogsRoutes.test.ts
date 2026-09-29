import { describe, expect, it, vi } from 'vitest';

const { listByBusinessMock, verifyStaffSessionFromRequestMock } = vi.hoisted(() => ({
  listByBusinessMock: vi.fn(),
  verifyStaffSessionFromRequestMock: vi.fn(),
}));

// The route searches with the page's filters; `listByBusinessMock` stands in for that search.
vi.mock('@/repositories/auditLogRepository', () => ({
  auditLogRepository: { search: listByBusinessMock },
}));

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

import { GET as auditLogsRoute } from '@/app/api/admin/audit-logs/route';

const STAFF_SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['admin'], businessId: 'biz-1' };

function getRequest(query = '') {
  return new Request(`http://localhost/api/admin/audit-logs${query}`, { method: 'GET' });
}

describe('GET /api/admin/audit-logs', () => {
  it('401s without a valid staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await auditLogsRoute(getRequest());
    expect(response.status).toBe(401);
    expect(listByBusinessMock).not.toHaveBeenCalled();
  });

  it('200s with logs scoped to the session businessId, flattening id + data', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    listByBusinessMock.mockResolvedValue({
      logs: [
        {
          id: 'log-1',
          data: {
            businessId: 'biz-1',
            actorId: 'staff-1',
            action: 'business_settings.update',
            entityType: 'business',
            entityId: 'biz-1',
            before: null,
            after: null,
            ipAddress: '10.0.0.1',
            createdAt: 'x',
          },
        },
      ],
      nextCursor: null,
    });

    const response = await auditLogsRoute(getRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.logs).toEqual([
      {
        id: 'log-1',
        businessId: 'biz-1',
        actorId: 'staff-1',
        action: 'business_settings.update',
        entityType: 'business',
        entityId: 'biz-1',
        before: null,
        after: null,
        ipAddress: '10.0.0.1',
        createdAt: 'x',
      },
    ]);
    expect(body.nextCursor).toBeNull();
    expect(listByBusinessMock).toHaveBeenCalledWith('biz-1', expect.objectContaining({ entityType: undefined, actorId: undefined, machineId: undefined, cursor: undefined }));
  });

  it('passes the area (or the older entityType), person, dates and cursor through', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    listByBusinessMock.mockResolvedValue({ logs: [], nextCursor: null });

    await auditLogsRoute(getRequest('?entityType=withdrawal&cursor=log-5'));
    expect(listByBusinessMock).toHaveBeenLastCalledWith('biz-1', expect.objectContaining({ entityType: 'withdrawal', cursor: 'log-5' }));

    await auditLogsRoute(getRequest('?area=machineSlot&actor=staff-9&from=2026-09-01&to=2026-09-30'));
    expect(listByBusinessMock).toHaveBeenLastCalledWith(
      'biz-1',
      expect.objectContaining({ entityType: 'machineSlot', actorId: 'staff-9', since: new Date('2026-08-31T21:00:00.000Z'), until: new Date('2026-09-30T21:00:00.000Z') }),
    );

    // An unknown area is ignored rather than trusted into the query.
    await auditLogsRoute(getRequest('?area=__proto__'));
    expect(listByBusinessMock).toHaveBeenLastCalledWith('biz-1', expect.objectContaining({ entityType: undefined }));
  });
});
