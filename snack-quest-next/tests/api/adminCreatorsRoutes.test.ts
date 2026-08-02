import { describe, expect, it, vi } from 'vitest';

const { updateStatusMock, verifyStaffSessionFromRequestMock } = vi.hoisted(() => ({
  updateStatusMock: vi.fn(),
  verifyStaffSessionFromRequestMock: vi.fn(),
}));

vi.mock('@/services/creatorAdminService', () => ({
  creatorAdminService: { updateStatus: updateStatusMock },
  CreatorNotFoundError: class CreatorNotFoundError extends Error {},
  InvalidCreatorTransitionError: class InvalidCreatorTransitionError extends Error {},
}));

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

import { POST as statusRoute } from '@/app/api/admin/creators/[uid]/status/route';
import { CreatorNotFoundError, InvalidCreatorTransitionError } from '@/services/creatorAdminService';

/**
 * Route-handler-level tests for the Admin Creators status endpoint (§
 * Admin: Creators) — `CreatorAdminService.updateStatus()` itself
 * (transition table, tenant scoping) is already covered by
 * tests/services/creatorAdminService.test.ts; these prove the wire.
 */

const STAFF_SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['admin'], businessId: 'biz-1' };

function call(body: unknown) {
  return statusRoute(
    new Request('http://localhost/api/admin/creators/creator-1/status', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ uid: 'creator-1' }) },
  );
}

describe('POST /api/admin/creators/[uid]/status', () => {
  it('401s without a valid staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await call({ status: 'active' });
    expect(response.status).toBe(401);
    expect(updateStatusMock).not.toHaveBeenCalled();
  });

  it('400s an unrecognized status value', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await call({ status: 'not-a-real-status' });
    expect(response.status).toBe(400);
  });

  it('200s and calls the service scoped to the session businessId', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    updateStatusMock.mockResolvedValue(undefined);

    const response = await call({ status: 'active' });

    expect(response.status).toBe(200);
    expect(updateStatusMock).toHaveBeenCalledWith('biz-1', 'creator-1', 'active', 'staff-1');
  });

  it('404s a creator the service reports as not found', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    updateStatusMock.mockRejectedValue(new CreatorNotFoundError('creator-1'));

    const response = await call({ status: 'active' });
    expect(response.status).toBe(404);
  });

  it('409s an illegal transition', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    updateStatusMock.mockRejectedValue(new InvalidCreatorTransitionError('active', 'pending'));

    const response = await call({ status: 'pending' });
    expect(response.status).toBe(409);
  });
});
