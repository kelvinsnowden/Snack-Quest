import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  listStaffMock,
  inviteStaffMock,
  changeRoleMock,
  setDisabledMock,
  removeStaffMock,
  resetPasswordMock,
  verifyStaffSessionFromRequestMock,
} = vi.hoisted(() => ({
  listStaffMock: vi.fn(),
  inviteStaffMock: vi.fn(),
  changeRoleMock: vi.fn(),
  setDisabledMock: vi.fn(),
  removeStaffMock: vi.fn(),
  resetPasswordMock: vi.fn(),
  verifyStaffSessionFromRequestMock: vi.fn(),
}));

vi.mock('@/services/staffManagementService', async () => {
  const actual = await vi.importActual<typeof import('@/services/staffManagementService')>('@/services/staffManagementService');
  return {
    ...actual,
    staffManagementService: {
      listStaff: listStaffMock,
      inviteStaff: inviteStaffMock,
      changeRole: changeRoleMock,
      setDisabled: setDisabledMock,
      removeStaff: removeStaffMock,
      resetPassword: resetPasswordMock,
    },
  };
});

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

vi.mock('@/lib/audit/recordAuditLog', () => ({ recordAuditLog: vi.fn() }));

import { GET as listRoute, POST as inviteRoute } from '@/app/api/admin/staff/route';
import { PATCH as patchRoute, DELETE as deleteRoute } from '@/app/api/admin/staff/[uid]/route';
import { POST as resetRoute } from '@/app/api/admin/staff/[uid]/reset-password/route';
import { StaffAlreadyExistsError, LastSuperAdminError } from '@/services/staffManagementService';

const SUPER_ADMIN_SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['super_admin'], businessId: 'biz-1' };
const ADMIN_SESSION = { ...SUPER_ADMIN_SESSION, roles: ['admin'] };

beforeEach(() => {
  vi.clearAllMocks();
});

function jsonRequest(url: string, body: unknown, method = 'POST'): Request {
  return new Request(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

describe('GET /api/admin/staff', () => {
  it('403s a plain admin', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(ADMIN_SESSION);
    const response = await listRoute(new Request('http://localhost/api/admin/staff'));
    expect(response.status).toBe(403);
  });

  it('200s with the staff list for a super_admin', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(SUPER_ADMIN_SESSION);
    listStaffMock.mockResolvedValue([{ uid: 'u1', role: 'agent' }]);
    const response = await listRoute(new Request('http://localhost/api/admin/staff'));
    expect(response.status).toBe(200);
    expect((await response.json()).staff).toHaveLength(1);
  });
});

describe('POST /api/admin/staff', () => {
  it('400s a missing field', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(SUPER_ADMIN_SESSION);
    const response = await inviteRoute(jsonRequest('http://localhost/api/admin/staff', { email: 'a@b.com' }));
    expect(response.status).toBe(400);
    expect(inviteStaffMock).not.toHaveBeenCalled();
  });

  it('400s when the service reports the staff member already exists', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(SUPER_ADMIN_SESSION);
    inviteStaffMock.mockRejectedValue(new StaffAlreadyExistsError('a@b.com'));
    const response = await inviteRoute(
      jsonRequest('http://localhost/api/admin/staff', { email: 'a@b.com', displayName: 'A', role: 'agent', department: 'Ops' }),
    );
    expect(response.status).toBe(400);
  });

  it('201s and writes an audit log without the reset link inside it', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(SUPER_ADMIN_SESSION);
    inviteStaffMock.mockResolvedValue({ uid: 'new-uid', resetLink: 'https://example.com/reset', emailAttempted: true });

    const response = await inviteRoute(
      jsonRequest('http://localhost/api/admin/staff', { email: 'a@b.com', displayName: 'A', role: 'agent', department: 'Ops' }),
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.resetLink).toBe('https://example.com/reset');
  });
});

describe('PATCH /api/admin/staff/[uid]', () => {
  it('403s a plain admin', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(ADMIN_SESSION);
    const response = await patchRoute(jsonRequest('http://localhost/api/admin/staff/u1', { role: 'admin' }, 'PATCH'), {
      params: Promise.resolve({ uid: 'u1' }),
    });
    expect(response.status).toBe(403);
    expect(changeRoleMock).not.toHaveBeenCalled();
  });

  it('400s when neither role nor disabled is provided', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(SUPER_ADMIN_SESSION);
    const response = await patchRoute(jsonRequest('http://localhost/api/admin/staff/u1', {}, 'PATCH'), {
      params: Promise.resolve({ uid: 'u1' }),
    });
    expect(response.status).toBe(400);
  });

  it('400s when the service refuses to demote the last super admin', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(SUPER_ADMIN_SESSION);
    changeRoleMock.mockRejectedValue(new LastSuperAdminError());
    const response = await patchRoute(jsonRequest('http://localhost/api/admin/staff/u1', { role: 'admin' }, 'PATCH'), {
      params: Promise.resolve({ uid: 'u1' }),
    });
    expect(response.status).toBe(400);
  });

  it('200s and calls setDisabled for a disabled patch', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(SUPER_ADMIN_SESSION);
    const response = await patchRoute(jsonRequest('http://localhost/api/admin/staff/u1', { disabled: true }, 'PATCH'), {
      params: Promise.resolve({ uid: 'u1' }),
    });
    expect(response.status).toBe(200);
    expect(setDisabledMock).toHaveBeenCalledWith('biz-1', 'u1', true, 'staff-1');
  });
});

describe('DELETE /api/admin/staff/[uid]', () => {
  it('200s and calls removeStaff', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(SUPER_ADMIN_SESSION);
    const response = await deleteRoute(new Request('http://localhost/api/admin/staff/u1', { method: 'DELETE' }), {
      params: Promise.resolve({ uid: 'u1' }),
    });
    expect(response.status).toBe(200);
    expect(removeStaffMock).toHaveBeenCalledWith('biz-1', 'u1', 'staff-1');
  });
});

describe('POST /api/admin/staff/[uid]/reset-password', () => {
  it('200s with a reset link', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(SUPER_ADMIN_SESSION);
    resetPasswordMock.mockResolvedValue({ resetLink: 'https://example.com/reset-2' });
    const response = await resetRoute(new Request('http://localhost/api/admin/staff/u1/reset-password', { method: 'POST' }), {
      params: Promise.resolve({ uid: 'u1' }),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).resetLink).toBe('https://example.com/reset-2');
  });
});
