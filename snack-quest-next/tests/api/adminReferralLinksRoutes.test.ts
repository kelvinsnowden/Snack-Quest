import { describe, expect, it, vi } from 'vitest';

const { setActiveMock, verifyStaffSessionFromRequestMock } = vi.hoisted(() => ({
  setActiveMock: vi.fn(),
  verifyStaffSessionFromRequestMock: vi.fn(),
}));

vi.mock('@/services/referralService', () => ({
  referralService: { setActive: setActiveMock },
  ReferralLinkNotFoundError: class ReferralLinkNotFoundError extends Error {},
}));

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

import { PATCH as patchRoute } from '@/app/api/admin/referral-links/[linkId]/route';
import { ReferralLinkNotFoundError } from '@/services/referralService';

/**
 * Route-handler-level tests for the admin referral-link pause/resume
 * endpoint (§ referral system overhaul) — the only mutation left once
 * every creator's one permanent link is auto-generated at
 * registration with a fixed discount and a tiered commission. Proves
 * the route only ever accepts `isActive`, never `code`/`discountKes`/
 * `commissionKes` — those fields simply have no effect if sent.
 */

const STAFF_SESSION = {
  uid: 'staff-1',
  email: 'staff@example.com',
  displayName: 'Staff',
  roles: ['admin'],
  businessId: 'biz-1',
};

function call(body: unknown) {
  const request = new Request(
    'http://localhost/api/admin/referral-links/link-1',
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  return patchRoute(request, { params: Promise.resolve({ linkId: 'link-1' }) });
}

describe('PATCH /api/admin/referral-links/[linkId]', () => {
  it('401s without a valid staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await call({ isActive: false });
    expect(response.status).toBe(401);
    expect(setActiveMock).not.toHaveBeenCalled();
  });

  it('400s a non-boolean isActive', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await call({ isActive: 'nope' });
    expect(response.status).toBe(400);
    expect(setActiveMock).not.toHaveBeenCalled();
  });

  it('400s a body with no isActive at all, even if it carries other fields', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await call({
      code: 'NEWCODE',
      discountKes: 500,
      commissionKes: 1000,
    });
    expect(response.status).toBe(400);
    expect(setActiveMock).not.toHaveBeenCalled();
  });

  it('200s and calls the service scoped to the session businessId, ignoring any other fields in the body', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    setActiveMock.mockResolvedValue(undefined);

    const response = await call({
      isActive: false,
      code: 'IGNORED',
      discountKes: 999,
      commissionKes: 999,
    });

    expect(response.status).toBe(200);
    expect(setActiveMock).toHaveBeenCalledWith(
      'biz-1',
      'link-1',
      false,
      'staff-1',
    );
  });

  it('404s a link the service reports as not found', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    setActiveMock.mockRejectedValue(new ReferralLinkNotFoundError('link-1'));

    const response = await call({ isActive: false });
    expect(response.status).toBe(404);
  });
});
