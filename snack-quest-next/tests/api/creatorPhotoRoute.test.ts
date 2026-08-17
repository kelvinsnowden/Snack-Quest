import { beforeEach, describe, expect, it, vi } from 'vitest';

const { updatePhotoMock, verifyCreatorSessionFromRequestMock } = vi.hoisted(() => ({
  updatePhotoMock: vi.fn(),
  verifyCreatorSessionFromRequestMock: vi.fn(),
}));

vi.mock('@/services/creatorProfileService', async () => {
  const actual = await vi.importActual<typeof import('@/services/creatorProfileService')>(
    '@/services/creatorProfileService',
  );
  return {
    ...actual,
    creatorProfileService: { updatePhoto: updatePhotoMock },
  };
});

vi.mock('@/lib/auth/creatorSession', () => ({
  verifyCreatorSessionFromRequest: verifyCreatorSessionFromRequestMock,
}));

import { PATCH as photoRoute } from '@/app/api/creator/photo/route';
import { InvalidProfileUpdateError } from '@/services/creatorProfileService';
import { CreatorNotFoundError } from '@/services/creatorDashboardService';

const CREATOR_SESSION = {
  uid: 'creator-1',
  email: 'creator@example.com',
  displayName: 'Creator One',
  photoURL: null,
  businessId: 'biz-1',
  status: 'active' as const,
  onboardingCompleted: true,
};

function request(body: unknown) {
  return new Request('http://localhost/api/creator/photo', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PATCH /api/creator/photo', () => {
  it('401s without a valid creator session', async () => {
    verifyCreatorSessionFromRequestMock.mockResolvedValue(null);
    const response = await photoRoute(request({ photoURL: 'https://example.com/a.png' }));
    expect(response.status).toBe(401);
    expect(updatePhotoMock).not.toHaveBeenCalled();
  });

  it('400s a non-string, non-null photoURL', async () => {
    verifyCreatorSessionFromRequestMock.mockResolvedValue(CREATOR_SESSION);
    const response = await photoRoute(request({ photoURL: 42 }));
    expect(response.status).toBe(400);
    expect(updatePhotoMock).not.toHaveBeenCalled();
  });

  it('updates the photo scoped to the session creator', async () => {
    verifyCreatorSessionFromRequestMock.mockResolvedValue(CREATOR_SESSION);
    updatePhotoMock.mockResolvedValue(undefined);

    const response = await photoRoute(request({ photoURL: 'https://example.com/a.png' }));

    expect(response.status).toBe(200);
    expect(updatePhotoMock).toHaveBeenCalledWith('biz-1', 'creator-1', 'https://example.com/a.png');
  });

  it('allows clearing the photo with null', async () => {
    verifyCreatorSessionFromRequestMock.mockResolvedValue(CREATOR_SESSION);
    updatePhotoMock.mockResolvedValue(undefined);

    const response = await photoRoute(request({ photoURL: null }));

    expect(response.status).toBe(200);
    expect(updatePhotoMock).toHaveBeenCalledWith('biz-1', 'creator-1', null);
  });

  it('400s InvalidProfileUpdateError from the service', async () => {
    verifyCreatorSessionFromRequestMock.mockResolvedValue(CREATOR_SESSION);
    updatePhotoMock.mockRejectedValue(new InvalidProfileUpdateError('photoURL must be a non-empty string or null'));

    const response = await photoRoute(request({ photoURL: 'https://example.com/a.png' }));
    expect(response.status).toBe(400);
  });

  it('404s CreatorNotFoundError from the service', async () => {
    verifyCreatorSessionFromRequestMock.mockResolvedValue(CREATOR_SESSION);
    updatePhotoMock.mockRejectedValue(new CreatorNotFoundError('creator-1'));

    const response = await photoRoute(request({ photoURL: 'https://example.com/a.png' }));
    expect(response.status).toBe(404);
  });
});
