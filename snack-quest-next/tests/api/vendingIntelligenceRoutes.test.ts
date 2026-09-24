import { beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyStaffSessionFromRequestMock, getNetworkOverviewMock, getLocationDnaMock, listByBusinessMock, approveMock, generateRestockRecommendationsMock } = vi.hoisted(() => ({
  verifyStaffSessionFromRequestMock: vi.fn(),
  getNetworkOverviewMock: vi.fn(),
  getLocationDnaMock: vi.fn(),
  listByBusinessMock: vi.fn(),
  approveMock: vi.fn(),
  generateRestockRecommendationsMock: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

vi.mock('@/services/networkIntelligenceService', async () => {
  const actual = await vi.importActual<typeof import('@/services/networkIntelligenceService')>('@/services/networkIntelligenceService');
  return { ...actual, networkIntelligenceService: { getNetworkOverview: getNetworkOverviewMock, getLocationTypePerformance: vi.fn(), compareLocations: vi.fn() } };
});

vi.mock('@/services/locationIntelligenceService', async () => {
  const actual = await vi.importActual<typeof import('@/services/locationIntelligenceService')>('@/services/locationIntelligenceService');
  return { ...actual, locationIntelligenceService: { getLocationDna: getLocationDnaMock } };
});

vi.mock('@/services/recommendationEngineService', async () => {
  const actual = await vi.importActual<typeof import('@/services/recommendationEngineService')>('@/services/recommendationEngineService');
  return {
    ...actual,
    recommendationEngineService: {
      listByBusiness: listByBusinessMock,
      approve: approveMock,
      generateRestockRecommendations: generateRestockRecommendationsMock,
    },
  };
});

import { GET as networkGet } from '@/app/api/vending/intelligence/network/route';
import { GET as locationGet } from '@/app/api/vending/intelligence/locations/[id]/route';
import { GET as recommendationsGet } from '@/app/api/vending/recommendations/route';
import { POST as approvePost } from '@/app/api/vending/recommendations/[id]/approve/route';
import { POST as generatePost } from '@/app/api/vending/recommendations/generate/route';
import { LocationNotFoundError } from '@/services/locationIntelligenceService';
import { RecommendationNotFoundError, IllegalRecommendationTransitionError } from '@/services/recommendationEngineService';

const ADMIN_SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['admin'], businessId: 'biz-1' };
const AGENT_SESSION = { ...ADMIN_SESSION, roles: ['agent'] };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/vending/intelligence/network', () => {
  it('401s without a staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await networkGet(new Request('http://localhost/api/vending/intelligence/network'));
    expect(response.status).toBe(401);
  });

  it('403s a role outside admin/finance/warehouse', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(AGENT_SESSION);
    const response = await networkGet(new Request('http://localhost/api/vending/intelligence/network'));
    expect(response.status).toBe(403);
  });

  it('400s an out-of-range windowDays', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(ADMIN_SESSION);
    const response = await networkGet(new Request('http://localhost/api/vending/intelligence/network?windowDays=9999'));
    expect(response.status).toBe(400);
    expect(getNetworkOverviewMock).not.toHaveBeenCalled();
  });

  it('200s and passes windowDays through', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(ADMIN_SESSION);
    getNetworkOverviewMock.mockResolvedValue({ revenueKes: 1000 });
    const response = await networkGet(new Request('http://localhost/api/vending/intelligence/network?windowDays=14'));
    expect(response.status).toBe(200);
    expect(getNetworkOverviewMock).toHaveBeenCalledWith('biz-1', 14);
    const body = await response.json();
    expect(body.overview.revenueKes).toBe(1000);
  });
});

describe('GET /api/vending/intelligence/locations/[id]', () => {
  it('404s a location that does not exist', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(ADMIN_SESSION);
    getLocationDnaMock.mockRejectedValue(new LocationNotFoundError('loc-1'));
    const response = await locationGet(new Request('http://localhost/api/vending/intelligence/locations/loc-1'), { params: Promise.resolve({ id: 'loc-1' }) });
    expect(response.status).toBe(404);
  });

  it('200s the location DNA', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(ADMIN_SESSION);
    getLocationDnaMock.mockResolvedValue({ locationId: 'loc-1', revenueKes: 500 });
    const response = await locationGet(new Request('http://localhost/api/vending/intelligence/locations/loc-1'), { params: Promise.resolve({ id: 'loc-1' }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.dna.revenueKes).toBe(500);
  });
});

describe('GET /api/vending/recommendations', () => {
  it('400s an invalid status filter', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(ADMIN_SESSION);
    const response = await recommendationsGet(new Request('http://localhost/api/vending/recommendations?status=nonsense'));
    expect(response.status).toBe(400);
  });

  it('200s a serialized list', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(ADMIN_SESSION);
    listByBusinessMock.mockResolvedValue([
      {
        id: 'rec-1',
        data: {
          type: 'RESTOCK',
          target: { kind: 'machine', id: 'm-1' },
          reason: 'test',
          supportingMetrics: {},
          confidence: 'high',
          status: 'pending',
          actionTaken: null,
          actionedAt: null,
          actionedBy: null,
          outcome: null,
          outcomeMetrics: null,
          outcomeRecordedAt: null,
          createdAt: { toDate: () => new Date('2026-01-01T00:00:00.000Z') },
        },
      },
    ]);
    const response = await recommendationsGet(new Request('http://localhost/api/vending/recommendations?status=pending'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.recommendations[0]).toMatchObject({ id: 'rec-1', type: 'RESTOCK', status: 'pending' });
  });
});

describe('POST /api/vending/recommendations/[id]/approve', () => {
  it('409s an illegal transition', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(ADMIN_SESSION);
    approveMock.mockRejectedValue(new IllegalRecommendationTransitionError('approved', 'approved'));
    const response = await approvePost(new Request('http://localhost/x', { method: 'POST', body: JSON.stringify({ actionTaken: 'did it' }) }), { params: Promise.resolve({ id: 'rec-1' }) });
    expect(response.status).toBe(409);
  });

  it('404s a recommendation that does not exist', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(ADMIN_SESSION);
    approveMock.mockRejectedValue(new RecommendationNotFoundError('rec-1'));
    const response = await approvePost(new Request('http://localhost/x', { method: 'POST', body: JSON.stringify({ actionTaken: 'did it' }) }), { params: Promise.resolve({ id: 'rec-1' }) });
    expect(response.status).toBe(404);
  });

  it('200s and calls approve with the staff uid', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(ADMIN_SESSION);
    approveMock.mockResolvedValue(undefined);
    const response = await approvePost(new Request('http://localhost/x', { method: 'POST', body: JSON.stringify({ actionTaken: 'Restocked slot A01' }) }), { params: Promise.resolve({ id: 'rec-1' }) });
    expect(response.status).toBe(200);
    expect(approveMock).toHaveBeenCalledWith('biz-1', 'rec-1', 'Restocked slot A01', 'staff-1');
  });
});

describe('POST /api/vending/recommendations/generate', () => {
  it('400s a scope requiring machineId with none given', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(ADMIN_SESSION);
    const response = await generatePost(new Request('http://localhost/x', { method: 'POST', body: JSON.stringify({ scope: 'restock' }) }));
    expect(response.status).toBe(400);
    expect(generateRestockRecommendationsMock).not.toHaveBeenCalled();
  });

  it('201s and calls the right generator for the given scope', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(ADMIN_SESSION);
    generateRestockRecommendationsMock.mockResolvedValue(['rec-1']);
    const response = await generatePost(new Request('http://localhost/x', { method: 'POST', body: JSON.stringify({ scope: 'restock', machineId: 'm-1' }) }));
    expect(response.status).toBe(201);
    expect(generateRestockRecommendationsMock).toHaveBeenCalledWith('biz-1', 'm-1', 'staff-1');
  });
});
