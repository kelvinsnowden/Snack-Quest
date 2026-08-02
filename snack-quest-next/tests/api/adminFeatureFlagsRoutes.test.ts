import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listFlagsMock, setEnabledMock, verifyStaffSessionFromRequestMock } = vi.hoisted(() => ({
  listFlagsMock: vi.fn(),
  setEnabledMock: vi.fn(),
  verifyStaffSessionFromRequestMock: vi.fn(),
}));

vi.mock('@/services/featureFlagService', async () => {
  const actual = await vi.importActual<typeof import('@/services/featureFlagService')>('@/services/featureFlagService');
  return {
    ...actual,
    featureFlagService: { listFlags: listFlagsMock, setEnabled: setEnabledMock },
  };
});

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

vi.mock('@/lib/audit/recordAuditLog', () => ({ recordAuditLog: vi.fn() }));

import { GET as listRoute, PATCH as patchRoute } from '@/app/api/admin/feature-flags/route';
import { UnknownFeatureFlagError } from '@/services/featureFlagService';

const SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['admin'], businessId: 'biz-1' };

beforeEach(() => {
  vi.clearAllMocks();
});

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

describe('GET /api/admin/feature-flags', () => {
  it('401s an unauthenticated request', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await listRoute(new Request('http://localhost/api/admin/feature-flags'));
    expect(response.status).toBe(401);
  });

  it('200s with the flag list', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(SESSION);
    listFlagsMock.mockResolvedValue([{ key: 'global_search', enabled: true }]);
    const response = await listRoute(new Request('http://localhost/api/admin/feature-flags'));
    expect(response.status).toBe(200);
    expect((await response.json()).flags).toHaveLength(1);
    expect(listFlagsMock).toHaveBeenCalledWith('biz-1');
  });
});

describe('PATCH /api/admin/feature-flags', () => {
  it('400s a missing field', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(SESSION);
    const response = await patchRoute(jsonRequest('http://localhost/api/admin/feature-flags', { key: 'global_search' }));
    expect(response.status).toBe(400);
    expect(setEnabledMock).not.toHaveBeenCalled();
  });

  it('400s an unknown flag key', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(SESSION);
    setEnabledMock.mockRejectedValue(new UnknownFeatureFlagError('bogus'));
    const response = await patchRoute(jsonRequest('http://localhost/api/admin/feature-flags', { key: 'bogus', enabled: true }));
    expect(response.status).toBe(400);
  });

  it('200s and calls setEnabled with the actor uid', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(SESSION);
    setEnabledMock.mockResolvedValue({ key: 'global_search', enabled: false });
    const response = await patchRoute(jsonRequest('http://localhost/api/admin/feature-flags', { key: 'global_search', enabled: false }));
    expect(response.status).toBe(200);
    expect(setEnabledMock).toHaveBeenCalledWith('biz-1', 'global_search', false, 'staff-1');
  });
});
