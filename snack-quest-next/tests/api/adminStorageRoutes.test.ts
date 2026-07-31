import { describe, expect, it, vi } from 'vitest';

const { listFilesMock, deleteFileMock, verifyStaffSessionFromRequestMock } = vi.hoisted(() => ({
  listFilesMock: vi.fn(),
  deleteFileMock: vi.fn(),
  verifyStaffSessionFromRequestMock: vi.fn(),
}));

vi.mock('@/services/storageService', () => ({
  storageService: { listFiles: listFilesMock, deleteFile: deleteFileMock },
}));

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

vi.mock('@/lib/audit/recordAuditLog', () => ({
  recordAuditLog: vi.fn().mockResolvedValue(undefined),
}));

import { GET as storageGetRoute, DELETE as storageDeleteRoute } from '@/app/api/admin/storage/route';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

const STAFF_SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['admin'], businessId: 'biz-1' };

function getRequest(query: string) {
  return new Request(`http://localhost/api/admin/storage${query}`, { method: 'GET' });
}

function deleteRequest(body: unknown) {
  return new Request('http://localhost/api/admin/storage', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/admin/storage', () => {
  it('401s without a valid staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await storageGetRoute(getRequest('?directory=snacks'));
    expect(response.status).toBe(401);
  });

  it('400s an invalid directory', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await storageGetRoute(getRequest('?directory=nope'));
    expect(response.status).toBe(400);
    expect(listFilesMock).not.toHaveBeenCalled();
  });

  it('200s and lists scoped to the session businessId and given directory', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    listFilesMock.mockResolvedValue({
      objects: [{ url: 'https://x/snacks/biz-1/a.png', pathname: 'snacks/biz-1/a.png', size: 10, uploadedAt: '2026-01-15T00:00:00.000Z' }],
      cursor: null,
    });

    const response = await storageGetRoute(getRequest('?directory=snacks'));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.objects).toHaveLength(1);
    expect(listFilesMock).toHaveBeenCalledWith('biz-1', 'snacks', { cursor: undefined });
  });
});

describe('DELETE /api/admin/storage', () => {
  it('401s without a valid staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await storageDeleteRoute(deleteRequest({ url: 'x', directory: 'snacks' }));
    expect(response.status).toBe(401);
  });

  it('403s a URL outside the session business/directory prefix', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await storageDeleteRoute(
      deleteRequest({ url: 'https://x/snacks/other-biz/a.png', directory: 'snacks' }),
    );
    expect(response.status).toBe(403);
    expect(deleteFileMock).not.toHaveBeenCalled();
  });

  it('200s, deletes, and records an audit log entry for a URL within scope', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    deleteFileMock.mockResolvedValue(undefined);

    const response = await storageDeleteRoute(
      deleteRequest({ url: 'https://x/snacks/biz-1/a.png', directory: 'snacks' }),
    );

    expect(response.status).toBe(200);
    expect(deleteFileMock).toHaveBeenCalledWith('https://x/snacks/biz-1/a.png');
    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({ businessId: 'biz-1', actorId: 'staff-1', action: 'storage.delete' }),
    );
  });
});
