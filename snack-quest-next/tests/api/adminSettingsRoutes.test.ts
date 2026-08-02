import { describe, expect, it, vi } from 'vitest';

const { getSettingsMock, updateSettingsMock, verifyStaffSessionFromRequestMock } = vi.hoisted(() => ({
  getSettingsMock: vi.fn(),
  updateSettingsMock: vi.fn(),
  verifyStaffSessionFromRequestMock: vi.fn(),
}));

vi.mock('@/services/businessSettingsService', async () => {
  const actual = await vi.importActual<typeof import('@/services/businessSettingsService')>(
    '@/services/businessSettingsService',
  );
  return {
    ...actual,
    businessSettingsService: { getSettings: getSettingsMock, updateSettings: updateSettingsMock },
  };
});

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

vi.mock('@/lib/audit/recordAuditLog', () => ({
  recordAuditLog: vi.fn().mockResolvedValue(undefined),
}));

import { GET as settingsGetRoute, PATCH as settingsPatchRoute } from '@/app/api/admin/settings/route';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { BusinessNotFoundError, BusinessSettingsValidationError } from '@/services/businessSettingsService';

const STAFF_SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['admin'], businessId: 'biz-1' };

const BUSINESS = {
  name: 'Snack Quest',
  currency: 'KES',
  whatsappPhoneNumberId: 'wa-1',
  countyCoverage: ['Nairobi'],
  adminWhatsappPhone: '254712345678',
  status: 'active',
};

function getRequest() {
  return new Request('http://localhost/api/admin/settings', { method: 'GET' });
}

function patchRequest(body: unknown) {
  return new Request('http://localhost/api/admin/settings', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/admin/settings', () => {
  it('401s without a valid staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await settingsGetRoute(getRequest());
    expect(response.status).toBe(401);
  });

  it('200s with the business scoped to the session businessId', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    getSettingsMock.mockResolvedValue(BUSINESS);

    const response = await settingsGetRoute(getRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.business).toEqual(BUSINESS);
    expect(getSettingsMock).toHaveBeenCalledWith('biz-1');
  });

  it('404s when the business does not exist', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    getSettingsMock.mockRejectedValue(new BusinessNotFoundError('biz-1'));

    const response = await settingsGetRoute(getRequest());
    expect(response.status).toBe(404);
  });
});

describe('PATCH /api/admin/settings', () => {
  it('401s without a valid staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await settingsPatchRoute(patchRequest({ name: 'X' }));
    expect(response.status).toBe(401);
    expect(updateSettingsMock).not.toHaveBeenCalled();
  });

  it('400s when no editable field is provided', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await settingsPatchRoute(patchRequest({ unknownField: 'x' }));
    expect(response.status).toBe(400);
    expect(updateSettingsMock).not.toHaveBeenCalled();
  });

  it('200s, calls the service scoped to the session businessId, and records an audit log entry', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    updateSettingsMock.mockResolvedValue({ before: BUSINESS, after: { ...BUSINESS, name: 'Snack Quest KE' } });

    const response = await settingsPatchRoute(patchRequest({ name: 'Snack Quest KE' }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.business.name).toBe('Snack Quest KE');
    expect(updateSettingsMock).toHaveBeenCalledWith('biz-1', { name: 'Snack Quest KE' }, 'staff-1');
    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({ businessId: 'biz-1', actorId: 'staff-1', action: 'business_settings.update' }),
    );
  });

  it('400s a validation error from the service', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    updateSettingsMock.mockRejectedValue(new BusinessSettingsValidationError('"name" cannot be empty.'));

    const response = await settingsPatchRoute(patchRequest({ name: '  ' }));
    expect(response.status).toBe(400);
  });

  it('ignores fields that are not in the editable allowlist', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    updateSettingsMock.mockResolvedValue({ before: BUSINESS, after: BUSINESS });

    await settingsPatchRoute(patchRequest({ name: 'Snack Quest KE', createdBy: 'hacker' }));

    expect(updateSettingsMock).toHaveBeenCalledWith('biz-1', { name: 'Snack Quest KE' }, 'staff-1');
  });
});
