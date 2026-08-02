import { beforeEach, describe, expect, it, vi } from 'vitest';

const { updateProfileMock, verifyCreatorSessionFromRequestMock } = vi.hoisted(() => ({
  updateProfileMock: vi.fn(),
  verifyCreatorSessionFromRequestMock: vi.fn(),
}));

vi.mock('@/services/creatorProfileService', async () => {
  const actual = await vi.importActual<typeof import('@/services/creatorProfileService')>(
    '@/services/creatorProfileService',
  );
  return {
    ...actual,
    creatorProfileService: { updateProfile: updateProfileMock },
  };
});

vi.mock('@/lib/auth/creatorSession', () => ({
  verifyCreatorSessionFromRequest: verifyCreatorSessionFromRequestMock,
}));

import { PATCH as profileRoute } from '@/app/api/creator/profile/route';
import { InvalidProfileUpdateError } from '@/services/creatorProfileService';
import { CreatorNotFoundError } from '@/services/creatorDashboardService';

const CREATOR_SESSION = {
  uid: 'creator-1',
  email: 'creator@example.com',
  displayName: 'Creator One',
  businessId: 'biz-1',
  status: 'active' as const,
  onboardingCompleted: true,
};

function request(body: unknown) {
  return new Request('http://localhost/api/creator/profile', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  bio: 'Updated bio',
  niche: 'Food',
  followersRange: '1,000–5,000',
  paymentPreference: 'mpesa',
  payoutPhoneNumber: '254712345678',
  socialHandles: { instagram: '@amina' },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PATCH /api/creator/profile', () => {
  it('401s without a valid creator session', async () => {
    verifyCreatorSessionFromRequestMock.mockResolvedValue(null);
    const response = await profileRoute(request(VALID_BODY));
    expect(response.status).toBe(401);
    expect(updateProfileMock).not.toHaveBeenCalled();
  });

  it('400s an invalid paymentPreference', async () => {
    verifyCreatorSessionFromRequestMock.mockResolvedValue(CREATOR_SESSION);
    const response = await profileRoute(request({ ...VALID_BODY, paymentPreference: 'crypto' }));
    expect(response.status).toBe(400);
    expect(updateProfileMock).not.toHaveBeenCalled();
  });

  it('updates scoped to the session creator, treating a blank payoutPhoneNumber as null', async () => {
    verifyCreatorSessionFromRequestMock.mockResolvedValue(CREATOR_SESSION);
    updateProfileMock.mockResolvedValue(undefined);

    await profileRoute(request({ ...VALID_BODY, payoutPhoneNumber: '  ' }));

    expect(updateProfileMock).toHaveBeenCalledWith('creator-1', {
      bio: 'Updated bio',
      niche: 'Food',
      followersRange: '1,000–5,000',
      paymentPreference: 'mpesa',
      payoutPhoneNumber: null,
      socialHandles: { instagram: '@amina' },
    });
  });

  it('200s on success', async () => {
    verifyCreatorSessionFromRequestMock.mockResolvedValue(CREATOR_SESSION);
    updateProfileMock.mockResolvedValue(undefined);

    const response = await profileRoute(request(VALID_BODY));
    expect(response.status).toBe(200);
  });

  it('400s InvalidProfileUpdateError from the service', async () => {
    verifyCreatorSessionFromRequestMock.mockResolvedValue(CREATOR_SESSION);
    updateProfileMock.mockRejectedValue(new InvalidProfileUpdateError('Bio is required'));

    const response = await profileRoute(request(VALID_BODY));
    expect(response.status).toBe(400);
  });

  it('404s CreatorNotFoundError from the service', async () => {
    verifyCreatorSessionFromRequestMock.mockResolvedValue(CREATOR_SESSION);
    updateProfileMock.mockRejectedValue(new CreatorNotFoundError('creator-1'));

    const response = await profileRoute(request(VALID_BODY));
    expect(response.status).toBe(404);
  });
});
