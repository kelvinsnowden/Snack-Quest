import { describe, expect, it, vi } from 'vitest';

const { markResolvedMock, verifyStaffSessionFromRequestMock } = vi.hoisted(() => ({
  markResolvedMock: vi.fn(),
  verifyStaffSessionFromRequestMock: vi.fn(),
}));

vi.mock('@/repositories/webhookEventRepository', () => ({
  webhookEventRepository: { markResolved: markResolvedMock },
}));

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

vi.mock('@/lib/audit/recordAuditLog', () => ({
  recordAuditLog: vi.fn().mockResolvedValue(undefined),
}));

import { POST as resolveRoute } from '@/app/api/admin/reconciliation/resolve/route';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

const STAFF_SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['admin'], businessId: 'biz-1' };

function request(body: unknown): Request {
  return new Request('http://localhost/api/admin/reconciliation/resolve', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/reconciliation/resolve', () => {
  it('401s without a valid staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await resolveRoute(request({ providerEventId: 'evt-1', note: 'checked' }));
    expect(response.status).toBe(401);
    expect(markResolvedMock).not.toHaveBeenCalled();
  });

  it('400s a missing providerEventId', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await resolveRoute(request({ note: 'checked' }));
    expect(response.status).toBe(400);
    expect(markResolvedMock).not.toHaveBeenCalled();
  });

  it('400s a missing note', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await resolveRoute(request({ providerEventId: 'evt-1' }));
    expect(response.status).toBe(400);
    expect(markResolvedMock).not.toHaveBeenCalled();
  });

  it('200s, resolves scoped to the session businessId, and records an audit log entry', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    markResolvedMock.mockResolvedValue(undefined);

    const response = await resolveRoute(request({ providerEventId: 'evt-1', note: 'Duplicate payment, refunded manually.' }));

    expect(response.status).toBe(200);
    expect(markResolvedMock).toHaveBeenCalledWith('biz-1', 'daraja', 'evt-1', 'staff-1', 'Duplicate payment, refunded manually.');
    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({ businessId: 'biz-1', actorId: 'staff-1', action: 'reconciliation.resolve' }),
    );
  });
});
