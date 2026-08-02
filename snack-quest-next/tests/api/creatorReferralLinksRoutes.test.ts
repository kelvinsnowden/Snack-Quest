import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createLinkMock, setActiveForOwnerMock, verifyCreatorSessionFromRequestMock } = vi.hoisted(() => ({
  createLinkMock: vi.fn(),
  setActiveForOwnerMock: vi.fn(),
  verifyCreatorSessionFromRequestMock: vi.fn(),
}));

vi.mock('@/services/referralService', async () => {
  const actual = await vi.importActual<typeof import('@/services/referralService')>('@/services/referralService');
  return {
    ...actual,
    referralService: { createLink: createLinkMock, setActiveForOwner: setActiveForOwnerMock },
  };
});

vi.mock('@/lib/auth/creatorSession', () => ({
  verifyCreatorSessionFromRequest: verifyCreatorSessionFromRequestMock,
}));

import { POST as createRoute } from '@/app/api/creator/referral-links/route';
import { PATCH as patchRoute } from '@/app/api/creator/referral-links/[linkId]/route';
import { DuplicateReferralCodeError, CreatorNotEligibleError, ReferralLinkNotFoundError } from '@/services/referralService';

const CREATOR_SESSION = {
  uid: 'creator-1',
  email: 'creator@example.com',
  displayName: 'Creator One',
  businessId: 'biz-1',
  status: 'active' as const,
  onboardingCompleted: true,
};

function createRequest(body: unknown) {
  return new Request('http://localhost/api/creator/referral-links', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function patchRequest(body: unknown) {
  return new Request('http://localhost/api/creator/referral-links/link-1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/creator/referral-links', () => {
  it('401s without a valid creator session', async () => {
    verifyCreatorSessionFromRequestMock.mockResolvedValue(null);
    const response = await createRoute(createRequest({ code: 'SAVE10', discountKes: 100, commissionKes: 50 }));
    expect(response.status).toBe(401);
    expect(createLinkMock).not.toHaveBeenCalled();
  });

  it('400s a missing code', async () => {
    verifyCreatorSessionFromRequestMock.mockResolvedValue(CREATOR_SESSION);
    const response = await createRoute(createRequest({ discountKes: 100, commissionKes: 50 }));
    expect(response.status).toBe(400);
    expect(createLinkMock).not.toHaveBeenCalled();
  });

  it('creates a link scoped to the session creator, never a client-supplied owner', async () => {
    verifyCreatorSessionFromRequestMock.mockResolvedValue(CREATOR_SESSION);
    createLinkMock.mockResolvedValue('link-1');

    const response = await createRoute(createRequest({ code: 'SAVE10', discountKes: 100, commissionKes: 50 }));

    expect(response.status).toBe(201);
    expect(createLinkMock).toHaveBeenCalledWith(
      { businessId: 'biz-1', ownerId: 'creator-1', code: 'SAVE10', discountKes: 100, commissionKes: 50, isActive: true },
      'creator-1',
    );
  });

  it('409s a duplicate code', async () => {
    verifyCreatorSessionFromRequestMock.mockResolvedValue(CREATOR_SESSION);
    createLinkMock.mockRejectedValue(new DuplicateReferralCodeError('SAVE10'));

    const response = await createRoute(createRequest({ code: 'SAVE10', discountKes: 100, commissionKes: 50 }));
    expect(response.status).toBe(409);
  });

  it('400s when the service rejects the creator as ineligible', async () => {
    verifyCreatorSessionFromRequestMock.mockResolvedValue(CREATOR_SESSION);
    createLinkMock.mockRejectedValue(new CreatorNotEligibleError('creator-1'));

    const response = await createRoute(createRequest({ code: 'SAVE10', discountKes: 100, commissionKes: 50 }));
    expect(response.status).toBe(400);
  });
});

describe('PATCH /api/creator/referral-links/[linkId]', () => {
  it('401s without a valid creator session', async () => {
    verifyCreatorSessionFromRequestMock.mockResolvedValue(null);
    const response = await patchRoute(patchRequest({ isActive: false }), { params: Promise.resolve({ linkId: 'link-1' }) });
    expect(response.status).toBe(401);
    expect(setActiveForOwnerMock).not.toHaveBeenCalled();
  });

  it('400s a non-boolean isActive', async () => {
    verifyCreatorSessionFromRequestMock.mockResolvedValue(CREATOR_SESSION);
    const response = await patchRoute(patchRequest({ isActive: 'nope' }), { params: Promise.resolve({ linkId: 'link-1' }) });
    expect(response.status).toBe(400);
  });

  it('toggles the link, scoped to the session creator as owner', async () => {
    verifyCreatorSessionFromRequestMock.mockResolvedValue(CREATOR_SESSION);
    setActiveForOwnerMock.mockResolvedValue(undefined);

    const response = await patchRoute(patchRequest({ isActive: false }), { params: Promise.resolve({ linkId: 'link-1' }) });

    expect(response.status).toBe(200);
    expect(setActiveForOwnerMock).toHaveBeenCalledWith('biz-1', 'creator-1', 'link-1', false, 'creator-1');
  });

  it('404s a link that is not found or not owned by this creator', async () => {
    verifyCreatorSessionFromRequestMock.mockResolvedValue(CREATOR_SESSION);
    setActiveForOwnerMock.mockRejectedValue(new ReferralLinkNotFoundError('link-1'));

    const response = await patchRoute(patchRequest({ isActive: false }), { params: Promise.resolve({ linkId: 'link-1' }) });
    expect(response.status).toBe(404);
  });
});
