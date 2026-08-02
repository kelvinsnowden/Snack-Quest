import { beforeEach, describe, expect, it, vi } from 'vitest';

const { completeOnboardingMock, verifyCreatorSessionFromRequestMock } = vi.hoisted(() => ({
  completeOnboardingMock: vi.fn(),
  verifyCreatorSessionFromRequestMock: vi.fn(),
}));

vi.mock('@/services/creatorProfileService', async () => {
  const actual = await vi.importActual<typeof import('@/services/creatorProfileService')>(
    '@/services/creatorProfileService',
  );
  return {
    ...actual,
    creatorProfileService: { completeOnboarding: completeOnboardingMock },
  };
});

vi.mock('@/lib/auth/creatorSession', () => ({
  verifyCreatorSessionFromRequest: verifyCreatorSessionFromRequestMock,
}));

import { POST as onboardingRoute } from '@/app/api/creator/onboarding/route';
import { InvalidOnboardingInputError, OnboardingAlreadyCompletedError } from '@/services/creatorProfileService';

const CREATOR_SESSION = {
  uid: 'creator-1',
  email: 'creator@example.com',
  displayName: 'Creator One',
  businessId: 'biz-1',
  status: 'pending' as const,
  onboardingCompleted: false,
};

function request(body: unknown) {
  return new Request('http://localhost/api/creator/onboarding', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  bio: 'Food creator',
  niche: 'Food',
  followersRange: '1,000–5,000',
  paymentPreference: 'mpesa',
  socialHandles: { instagram: '@amina' },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/creator/onboarding', () => {
  it('401s without a valid creator session, without calling the service', async () => {
    verifyCreatorSessionFromRequestMock.mockResolvedValue(null);

    const response = await onboardingRoute(request(VALID_BODY));

    expect(response.status).toBe(401);
    expect(completeOnboardingMock).not.toHaveBeenCalled();
  });

  it('400s an invalid paymentPreference before calling the service', async () => {
    verifyCreatorSessionFromRequestMock.mockResolvedValue(CREATOR_SESSION);

    const response = await onboardingRoute(request({ ...VALID_BODY, paymentPreference: 'crypto' }));

    expect(response.status).toBe(400);
    expect(completeOnboardingMock).not.toHaveBeenCalled();
  });

  it('drops non-string values from socialHandles before forwarding to the service', async () => {
    verifyCreatorSessionFromRequestMock.mockResolvedValue(CREATOR_SESSION);
    completeOnboardingMock.mockResolvedValue(undefined);

    await onboardingRoute(
      request({ ...VALID_BODY, socialHandles: { instagram: '@amina', junk: 123, tiktok: '@amina.tt' } }),
    );

    expect(completeOnboardingMock).toHaveBeenCalledWith('creator-1', {
      bio: 'Food creator',
      niche: 'Food',
      followersRange: '1,000–5,000',
      paymentPreference: 'mpesa',
      socialHandles: { instagram: '@amina', tiktok: '@amina.tt' },
    });
  });

  it('200s on success', async () => {
    verifyCreatorSessionFromRequestMock.mockResolvedValue(CREATOR_SESSION);
    completeOnboardingMock.mockResolvedValue(undefined);

    const response = await onboardingRoute(request(VALID_BODY));

    expect(response.status).toBe(200);
  });

  it('400s InvalidOnboardingInputError from the service', async () => {
    verifyCreatorSessionFromRequestMock.mockResolvedValue(CREATOR_SESSION);
    completeOnboardingMock.mockRejectedValue(new InvalidOnboardingInputError('Bio is required'));

    const response = await onboardingRoute(request(VALID_BODY));
    expect(response.status).toBe(400);
  });

  it('409s OnboardingAlreadyCompletedError from the service', async () => {
    verifyCreatorSessionFromRequestMock.mockResolvedValue(CREATOR_SESSION);
    completeOnboardingMock.mockRejectedValue(new OnboardingAlreadyCompletedError('creator-1'));

    const response = await onboardingRoute(request(VALID_BODY));
    expect(response.status).toBe(409);
  });
});
