import { beforeEach, describe, expect, it, vi } from 'vitest';

const { searchMock, verifyStaffSessionFromRequestMock } = vi.hoisted(() => ({
  searchMock: vi.fn(),
  verifyStaffSessionFromRequestMock: vi.fn(),
}));

vi.mock('@/services/globalSearchService', () => ({
  globalSearchService: { search: searchMock },
}));

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

import { GET as searchRoute } from '@/app/api/admin/search/route';

const SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['admin'], businessId: 'biz-1' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/admin/search', () => {
  it('401s an unauthenticated request', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await searchRoute(new Request('http://localhost/api/admin/search?q=starter'));
    expect(response.status).toBe(401);
    expect(searchMock).not.toHaveBeenCalled();
  });

  it('200s and passes the query through, scoped to the caller\'s own business', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(SESSION);
    searchMock.mockResolvedValue({ enabled: true, results: [{ type: 'product', id: 'p1', title: 'Starter Box', subtitle: '', href: '/x' }] });

    const response = await searchRoute(new Request('http://localhost/api/admin/search?q=starter'));
    expect(response.status).toBe(200);
    expect(searchMock).toHaveBeenCalledWith('biz-1', 'starter');
    const body = await response.json();
    expect(body.results).toHaveLength(1);
  });

  it('passes an empty string when no q param is given', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(SESSION);
    searchMock.mockResolvedValue({ enabled: true, results: [] });
    await searchRoute(new Request('http://localhost/api/admin/search'));
    expect(searchMock).toHaveBeenCalledWith('biz-1', '');
  });
});
