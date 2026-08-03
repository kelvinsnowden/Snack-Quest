import { describe, expect, it, vi } from 'vitest';

const { createCampaignMock, updateCampaignMock, findByIdMock, verifyStaffSessionFromRequestMock } = vi.hoisted(() => ({
  createCampaignMock: vi.fn(),
  updateCampaignMock: vi.fn(),
  findByIdMock: vi.fn(),
  verifyStaffSessionFromRequestMock: vi.fn(),
}));

vi.mock('@/services/campaignService', async () => {
  const actual = await vi.importActual<typeof import('@/services/campaignService')>('@/services/campaignService');
  return {
    ...actual,
    campaignService: { createCampaign: createCampaignMock, updateCampaign: updateCampaignMock },
  };
});

vi.mock('@/repositories/campaignRepository', () => ({
  campaignRepository: { findById: findByIdMock },
}));

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

import { POST as createRoute } from '@/app/api/admin/campaigns/route';
import { PATCH as updateRoute } from '@/app/api/admin/campaigns/[campaignId]/route';

/**
 * Route-handler-level tests for Admin Campaigns create/update (§
 * Admin: Campaigns) — `campaignService` validation itself is already
 * covered by tests/services/campaignService.test.ts; these prove the
 * wire: auth gate, request-body validation, and status mapping.
 */

const STAFF_SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['admin'], businessId: 'biz-1' };

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  title: 'Diwali Push',
  commissionRateKes: 150,
  rules: 'Post a reel unboxing the Deluxe box.',
  targetNiche: 'food',
  deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
};

describe('POST /api/admin/campaigns', () => {
  it('401s without a valid staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await createRoute(jsonRequest('http://localhost/api/admin/campaigns', VALID_BODY));
    expect(response.status).toBe(401);
    expect(createCampaignMock).not.toHaveBeenCalled();
  });

  it('400s a missing title', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await createRoute(
      jsonRequest('http://localhost/api/admin/campaigns', { ...VALID_BODY, title: undefined }),
    );
    expect(response.status).toBe(400);
  });

  it('400s a non-positive commission rate', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await createRoute(
      jsonRequest('http://localhost/api/admin/campaigns', { ...VALID_BODY, commissionRateKes: 0 }),
    );
    expect(response.status).toBe(400);
  });

  it('400s an invalid deadline', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await createRoute(
      jsonRequest('http://localhost/api/admin/campaigns', { ...VALID_BODY, deadline: 'not-a-date' }),
    );
    expect(response.status).toBe(400);
  });

  it('creates a campaign scoped to the session businessId, defaulting status to draft', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    createCampaignMock.mockResolvedValue('campaign-1');

    const response = await createRoute(jsonRequest('http://localhost/api/admin/campaigns', VALID_BODY));

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.campaignId).toBe('campaign-1');
    expect(createCampaignMock).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: 'biz-1', title: 'Diwali Push', status: 'draft', assetsUrl: null }),
      'staff-1',
    );
  });
});

describe('PATCH /api/admin/campaigns/[campaignId]', () => {
  it('401s without a valid staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await updateRoute(
      jsonRequest('http://localhost/api/admin/campaigns/campaign-1', { status: 'active' }),
      { params: Promise.resolve({ campaignId: 'campaign-1' }) },
    );
    expect(response.status).toBe(401);
    expect(updateCampaignMock).not.toHaveBeenCalled();
  });

  it('404s a campaign that does not belong to the session business', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    findByIdMock.mockResolvedValue(null);
    const response = await updateRoute(
      jsonRequest('http://localhost/api/admin/campaigns/campaign-1', { status: 'active' }),
      { params: Promise.resolve({ campaignId: 'campaign-1' }) },
    );
    expect(response.status).toBe(404);
    expect(updateCampaignMock).not.toHaveBeenCalled();
  });

  it('400s an invalid status value', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    findByIdMock.mockResolvedValue({ businessId: 'biz-1', title: 'Diwali Push' });
    const response = await updateRoute(
      jsonRequest('http://localhost/api/admin/campaigns/campaign-1', { status: 'archived' }),
      { params: Promise.resolve({ campaignId: 'campaign-1' }) },
    );
    expect(response.status).toBe(400);
    expect(updateCampaignMock).not.toHaveBeenCalled();
  });

  it('applies a valid partial patch, e.g. activating with a new image', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    findByIdMock
      .mockResolvedValueOnce({ businessId: 'biz-1', title: 'Diwali Push', status: 'draft' })
      .mockResolvedValueOnce({ businessId: 'biz-1', title: 'Diwali Push', status: 'active' });
    updateCampaignMock.mockResolvedValue(undefined);

    const response = await updateRoute(
      jsonRequest('http://localhost/api/admin/campaigns/campaign-1', {
        status: 'active',
        assetsUrl: 'https://blob.example/campaign.png',
      }),
      { params: Promise.resolve({ campaignId: 'campaign-1' }) },
    );

    expect(response.status).toBe(200);
    expect(updateCampaignMock).toHaveBeenCalledWith(
      'biz-1',
      'campaign-1',
      { status: 'active', assetsUrl: 'https://blob.example/campaign.png' },
      'staff-1',
    );
  });
});
