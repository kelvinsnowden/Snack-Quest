import { beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyStaffSessionFromRequestMock, recordAuditLogMock, setAccessMock } = vi.hoisted(() => ({
  verifyStaffSessionFromRequestMock: vi.fn(),
  recordAuditLogMock: vi.fn(),
  setAccessMock: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({ verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock }));
vi.mock('@/lib/audit/recordAuditLog', () => ({ recordAuditLog: recordAuditLogMock }));
vi.mock('@/services/staffManagementService', async () => {
  const actual = await vi.importActual<typeof import('@/services/staffManagementService')>('@/services/staffManagementService');
  return { ...actual, staffManagementService: { setAccess: setAccessMock } };
});

import { PATCH } from '@/app/api/admin/staff/[uid]/access/route';
import { PermissionEscalationError, CannotModifySelfError } from '@/services/staffManagementService';
import { ALL_PERMISSIONS } from '@/lib/auth/permissions';

/** Changing what someone can do: only people who manage staff, only within their own access, always audited. */

const SUPER = { uid: 'boss', email: 'b@example.com', displayName: 'B', roles: ['super_admin'], businessId: 'biz-1', permissions: [], effectivePermissions: [...ALL_PERMISSIONS] };
const ADMIN = { ...SUPER, uid: 'admin-1', roles: ['admin'], effectivePermissions: undefined };
const call = (body: unknown, uid = 'staff-2') =>
  PATCH(new Request(`http://localhost/api/admin/staff/${uid}/access`, { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ uid }) });

beforeEach(() => {
  vi.clearAllMocks();
  setAccessMock.mockResolvedValue({ before: ['restock.view'], after: ['restock.view', 'sales.view'], stored: { template: 'warehouse', granted: ['sales.view'], revoked: [] } });
});

describe('PATCH /api/admin/staff/[uid]/access', () => {
  it('401s signed out and 403s anyone without users.manage', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    expect((await call({ template: null, granted: [], revoked: [] })).status).toBe(401);
    verifyStaffSessionFromRequestMock.mockResolvedValue(ADMIN);
    const response = await call({ template: null, granted: [], revoked: [] });
    expect(response.status).toBe(403);
    expect((await response.json()).permission).toBe('users.manage');
    expect(setAccessMock).not.toHaveBeenCalled();
  });

  it('saves for the session’s business, passes the editor’s own permissions, and audits before and after', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(SUPER);
    const response = await call({ template: 'warehouse', granted: ['sales.view'], revoked: [] });
    expect(response.status).toBe(200);
    expect(setAccessMock).toHaveBeenCalledWith('biz-1', 'staff-2', { template: 'warehouse', granted: ['sales.view'], revoked: [] }, { uid: 'boss', permissions: [...ALL_PERMISSIONS] });
    expect(recordAuditLogMock).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({ action: 'staff.change_access', entityId: 'staff-2', before: { permissions: ['restock.view'] }, after: expect.objectContaining({ permissions: ['restock.view', 'sales.view'] }) }),
    );
  });

  it('400s a malformed body, 403s escalation, 400s editing yourself', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(SUPER);
    expect((await call({ template: 7, granted: [], revoked: [] })).status).toBe(400);
    expect((await call({ template: null, granted: 'sales.view', revoked: [] })).status).toBe(400);
    setAccessMock.mockRejectedValueOnce(new PermissionEscalationError(['users.manage']));
    expect((await call({ template: null, granted: ['users.manage'], revoked: [] })).status).toBe(403);
    setAccessMock.mockRejectedValueOnce(new CannotModifySelfError('change your own access'));
    expect((await call({ template: null, granted: [], revoked: [] }, 'boss')).status).toBe(400);
    expect(recordAuditLogMock).not.toHaveBeenCalled();
  });
});
