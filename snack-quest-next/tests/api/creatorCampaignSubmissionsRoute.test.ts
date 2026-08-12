import { beforeEach, describe, expect, it, vi } from 'vitest';

const { submitDeliverableMock, verifyCreatorSessionFromRequestMock } = vi.hoisted(() => ({
  submitDeliverableMock: vi.fn(),
  verifyCreatorSessionFromRequestMock: vi.fn(),
}));

vi.mock('@/services/campaignService', async () => {
  const actual = await vi.importActual<typeof import('@/services/campaignService')>('@/services/campaignService');
  return {
    ...actual,
    campaignService: { submitDeliverable: submitDeliverableMock },
  };
});

vi.mock('@/lib/auth/creatorSession', () => ({
  verifyCreatorSessionFromRequest: verifyCreatorSessionFromRequestMock,
}));

import { POST as submitRoute } from '@/app/api/creator/campaign-submissions/route';
import { CampaignNotFoundError, CampaignNotJoinableError, InvalidSubmissionError } from '@/services/campaignService';

const CREATOR_SESSION = {
  uid: 'creator-1',
  email: 'creator@example.com',
  displayName: 'Creator One',
  businessId: 'biz-1',
  status: 'active' as const,
  onboardingCompleted: true,
};

function request(body: unknown) {
  return new Request('http://localhost/api/creator/campaign-submissions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = { campaignId: 'campaign-1', submissionType: 'social_post', socialLink: 'https://instagram.com/p/1' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/creator/campaign-submissions', () => {
  it('401s without a valid creator session', async () => {
    verifyCreatorSessionFromRequestMock.mockResolvedValue(null);
    const response = await submitRoute(request(VALID_BODY));
    expect(response.status).toBe(401);
    expect(submitDeliverableMock).not.toHaveBeenCalled();
  });

  it('400s a missing campaignId', async () => {
    verifyCreatorSessionFromRequestMock.mockResolvedValue(CREATOR_SESSION);
    const response = await submitRoute(request({ submissionType: 'social_post' }));
    expect(response.status).toBe(400);
    expect(submitDeliverableMock).not.toHaveBeenCalled();
  });

  it('submits scoped to the session creator, never a client-supplied one', async () => {
    verifyCreatorSessionFromRequestMock.mockResolvedValue(CREATOR_SESSION);
    submitDeliverableMock.mockResolvedValue('submission-1');

    const response = await submitRoute(request(VALID_BODY));

    expect(response.status).toBe(201);
    expect(submitDeliverableMock).toHaveBeenCalledWith('biz-1', {
      campaignId: 'campaign-1',
      creatorId: 'creator-1',
      submissionType: 'social_post',
      imageUrls: undefined,
      documentUrl: undefined,
      socialLink: 'https://instagram.com/p/1',
      notes: undefined,
    });
  });

  it('404s an unknown campaign', async () => {
    verifyCreatorSessionFromRequestMock.mockResolvedValue(CREATOR_SESSION);
    submitDeliverableMock.mockRejectedValue(new CampaignNotFoundError('campaign-1'));

    const response = await submitRoute(request(VALID_BODY));
    expect(response.status).toBe(404);
  });

  it('400s a non-joinable campaign', async () => {
    verifyCreatorSessionFromRequestMock.mockResolvedValue(CREATOR_SESSION);
    submitDeliverableMock.mockRejectedValue(new CampaignNotJoinableError('campaign-1', 'deadline has passed'));

    const response = await submitRoute(request(VALID_BODY));
    expect(response.status).toBe(400);
  });

  it('400s invalid submission input', async () => {
    verifyCreatorSessionFromRequestMock.mockResolvedValue(CREATOR_SESSION);
    submitDeliverableMock.mockRejectedValue(new InvalidSubmissionError('Provide at least a social link, a file, or a note as proof.'));

    const response = await submitRoute(request(VALID_BODY));
    expect(response.status).toBe(400);
  });
});
