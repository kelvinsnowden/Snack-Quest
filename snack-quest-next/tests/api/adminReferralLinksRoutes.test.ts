import { describe, expect, it, vi } from 'vitest';

const { createLinkMock, updateLinkMock, verifyStaffSessionFromRequestMock } = vi.hoisted(() => ({
  createLinkMock: vi.fn(),
  updateLinkMock: vi.fn(),
  verifyStaffSessionFromRequestMock: vi.fn(),
}));

vi.mock('@/services/referralService', () => ({
  referralService: { createLink: createLinkMock, updateLink: updateLinkMock },
  DuplicateReferralCodeError: class DuplicateReferralCodeError extends Error {},
  CreatorNotEligibleError: class CreatorNotEligibleError extends Error {},
  ReferralLinkNotFoundError: class ReferralLinkNotFoundError extends Error {},
}));

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

import { POST as createRoute } from '@/app/api/admin/referral-links/route';
import { PATCH as updateRoute } from '@/app/api/admin/referral-links/[linkId]/route';
import {
  DuplicateReferralCodeError,
  CreatorNotEligibleError,
  ReferralLinkNotFoundError,
} from '@/services/referralService';

/**
 * Route-handler-level tests for Admin Referral Links create/update (§
 * Admin: Referrals) — `ReferralService` itself is already covered by
 * tests/services/referralService.test.ts; these prove the wire.
 */

const STAFF_SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['admin'], businessId: 'biz-1' };

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/referral-links', () => {
  it('401s without a valid staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await createRoute(
      jsonRequest('http://localhost/api/admin/referral-links', { ownerId: 'c1', code: 'X', discountKes: 0, commissionKes: 0 }),
    );
    expect(response.status).toBe(401);
    expect(createLinkMock).not.toHaveBeenCalled();
  });

  it('400s a missing code', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await createRoute(
      jsonRequest('http://localhost/api/admin/referral-links', { ownerId: 'c1', discountKes: 0, commissionKes: 0 }),
    );
    expect(response.status).toBe(400);
  });

  it('creates a link scoped to the session businessId', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    createLinkMock.mockResolvedValue('link-1');

    const response = await createRoute(
      jsonRequest('http://localhost/api/admin/referral-links', {
        ownerId: 'creator-1',
        code: 'SAVE10',
        discountKes: 100,
        commissionKes: 50,
      }),
    );

    expect(response.status).toBe(201);
    expect(createLinkMock).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: 'biz-1', ownerId: 'creator-1', code: 'SAVE10' }),
      'staff-1',
    );
  });

  it('400s a creator the service reports as ineligible', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    createLinkMock.mockRejectedValue(new CreatorNotEligibleError('creator-1'));

    const response = await createRoute(
      jsonRequest('http://localhost/api/admin/referral-links', { ownerId: 'creator-1', code: 'X', discountKes: 0, commissionKes: 0 }),
    );
    expect(response.status).toBe(400);
  });

  it('409s a duplicate code', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    createLinkMock.mockRejectedValue(new DuplicateReferralCodeError('X'));

    const response = await createRoute(
      jsonRequest('http://localhost/api/admin/referral-links', { ownerId: 'creator-1', code: 'X', discountKes: 0, commissionKes: 0 }),
    );
    expect(response.status).toBe(409);
  });
});

describe('PATCH /api/admin/referral-links/[linkId]', () => {
  function call(body: unknown) {
    return updateRoute(jsonRequest('http://localhost/api/admin/referral-links/link-1', body), {
      params: Promise.resolve({ linkId: 'link-1' }),
    });
  }

  it('401s without a valid staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await call({ isActive: false });
    expect(response.status).toBe(401);
    expect(updateLinkMock).not.toHaveBeenCalled();
  });

  it('200s and calls the service scoped to the session businessId', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    updateLinkMock.mockResolvedValue(undefined);

    const response = await call({ isActive: false });

    expect(response.status).toBe(200);
    expect(updateLinkMock).toHaveBeenCalledWith('biz-1', 'link-1', { isActive: false }, 'staff-1');
  });

  it('404s a link the service reports as not found', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    updateLinkMock.mockRejectedValue(new ReferralLinkNotFoundError('link-1'));

    const response = await call({ isActive: false });
    expect(response.status).toBe(404);
  });

  it('409s a duplicate code on rename', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    updateLinkMock.mockRejectedValue(new DuplicateReferralCodeError('X'));

    const response = await call({ code: 'X' });
    expect(response.status).toBe(409);
  });
});
