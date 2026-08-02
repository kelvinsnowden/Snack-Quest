import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  listSummariesMock,
  getSummaryMock,
  updateSecretMock,
  testConnectionMock,
  verifyStaffSessionFromRequestMock,
} = vi.hoisted(() => ({
  listSummariesMock: vi.fn(),
  getSummaryMock: vi.fn(),
  updateSecretMock: vi.fn(),
  testConnectionMock: vi.fn(),
  verifyStaffSessionFromRequestMock: vi.fn(),
}));

vi.mock('@/services/integrationSettingsService', async () => {
  const actual = await vi.importActual<typeof import('@/services/integrationSettingsService')>(
    '@/services/integrationSettingsService',
  );
  return {
    ...actual,
    integrationSettingsService: {
      listSummaries: listSummariesMock,
      getSummary: getSummaryMock,
      updateSecret: updateSecretMock,
      testConnection: testConnectionMock,
    },
  };
});

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

vi.mock('@/lib/audit/recordAuditLog', () => ({ recordAuditLog: vi.fn() }));

import { GET as listRoute } from '@/app/api/admin/integrations/route';
import { GET as detailRoute, PATCH as updateRoute } from '@/app/api/admin/integrations/[provider]/route';
import { POST as testRoute } from '@/app/api/admin/integrations/[provider]/test/route';
import { UnknownIntegrationProviderError, IntegrationValidationError } from '@/services/integrationSettingsService';

const SUPER_ADMIN_SESSION = {
  uid: 'staff-1',
  email: 'staff@example.com',
  displayName: 'Staff',
  roles: ['super_admin'],
  businessId: 'biz-1',
};
const ADMIN_SESSION = { ...SUPER_ADMIN_SESSION, roles: ['admin'] };

beforeEach(() => {
  vi.clearAllMocks();
});

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/admin/integrations/daraja', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/admin/integrations', () => {
  it('401s without a valid staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await listRoute(new Request('http://localhost/api/admin/integrations'));
    expect(response.status).toBe(401);
  });

  it('403s a plain admin (not super_admin)', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(ADMIN_SESSION);
    const response = await listRoute(new Request('http://localhost/api/admin/integrations'));
    expect(response.status).toBe(403);
    expect(listSummariesMock).not.toHaveBeenCalled();
  });

  it('200s with the summaries for a super_admin', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(SUPER_ADMIN_SESSION);
    listSummariesMock.mockResolvedValue([{ provider: 'daraja', status: 'missing' }]);

    const response = await listRoute(new Request('http://localhost/api/admin/integrations'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.integrations).toHaveLength(1);
    expect(listSummariesMock).toHaveBeenCalledWith('biz-1');
  });
});

describe('GET /api/admin/integrations/[provider]', () => {
  it('404s an unknown provider', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(SUPER_ADMIN_SESSION);
    getSummaryMock.mockRejectedValue(new UnknownIntegrationProviderError('bogus'));

    const response = await detailRoute(new Request('http://localhost/api/admin/integrations/bogus'), {
      params: Promise.resolve({ provider: 'bogus' }),
    });
    expect(response.status).toBe(404);
  });
});

describe('PATCH /api/admin/integrations/[provider]', () => {
  it('400s an invalid patch', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(SUPER_ADMIN_SESSION);
    updateSecretMock.mockRejectedValue(new IntegrationValidationError('"apiKey" is required.'));

    const response = await updateRoute(jsonRequest({ merchantId: 'm-1' }), {
      params: Promise.resolve({ provider: 'jumia' }),
    });
    expect(response.status).toBe(400);
  });

  it('200s and writes an audit log entry on success', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(SUPER_ADMIN_SESSION);
    updateSecretMock.mockResolvedValue({
      before: { provider: 'jumia', status: 'missing' },
      after: { provider: 'jumia', status: 'connected' },
    });

    const response = await updateRoute(jsonRequest({ apiKey: 'k-1', merchantId: 'm-1' }), {
      params: Promise.resolve({ provider: 'jumia' }),
    });
    expect(response.status).toBe(200);
    expect(updateSecretMock).toHaveBeenCalledWith('biz-1', 'jumia', { apiKey: 'k-1', merchantId: 'm-1' }, 'staff-1');
  });
});

describe('POST /api/admin/integrations/[provider]/test', () => {
  it('403s a plain admin (not super_admin)', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(ADMIN_SESSION);
    const response = await testRoute(new Request('http://localhost/api/admin/integrations/jumia/test', { method: 'POST' }), {
      params: Promise.resolve({ provider: 'jumia' }),
    });
    expect(response.status).toBe(403);
    expect(testConnectionMock).not.toHaveBeenCalled();
  });

  it('200s with the test result', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(SUPER_ADMIN_SESSION);
    testConnectionMock.mockResolvedValue({ success: true, error: null });

    const response = await testRoute(new Request('http://localhost/api/admin/integrations/jumia/test', { method: 'POST' }), {
      params: Promise.resolve({ provider: 'jumia' }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ success: true, error: null });
  });
});
