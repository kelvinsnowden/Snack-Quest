import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listZonesMock, setZoneFeeMock, verifyStaffSessionFromRequestMock } = vi.hoisted(() => ({
  listZonesMock: vi.fn(),
  setZoneFeeMock: vi.fn(),
  verifyStaffSessionFromRequestMock: vi.fn(),
}));

vi.mock('@/services/deliveryZoneService', async () => {
  const actual = await vi.importActual<typeof import('@/services/deliveryZoneService')>('@/services/deliveryZoneService');
  return {
    ...actual,
    deliveryZoneService: { listZones: listZonesMock, setZoneFee: setZoneFeeMock },
  };
});

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

vi.mock('@/lib/audit/recordAuditLog', () => ({ recordAuditLog: vi.fn() }));

import { GET as listRoute, PATCH as patchRoute } from '@/app/api/admin/delivery-zones/route';
import { DeliveryZoneValidationError } from '@/services/deliveryZoneService';

const SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['admin'], businessId: 'biz-1' };

beforeEach(() => {
  vi.clearAllMocks();
});

function jsonRequest(url: string, body: unknown, method = 'PATCH'): Request {
  return new Request(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

describe('GET /api/admin/delivery-zones', () => {
  it('401s an unauthenticated request', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await listRoute(new Request('http://localhost/api/admin/delivery-zones'));
    expect(response.status).toBe(401);
  });

  it('200s with zones for any staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(SESSION);
    listZonesMock.mockResolvedValue({ zones: [{ zone: 'Nairobi', feeKes: 200, stationCount: 3 }], unzonedStationCount: 1 });
    const response = await listRoute(new Request('http://localhost/api/admin/delivery-zones'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.zones).toHaveLength(1);
    expect(body.unzonedStationCount).toBe(1);
  });
});

describe('PATCH /api/admin/delivery-zones', () => {
  it('401s an unauthenticated request', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await patchRoute(jsonRequest('http://localhost/api/admin/delivery-zones', { zone: 'Nairobi' }));
    expect(response.status).toBe(401);
  });

  it('400s a missing field', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(SESSION);
    const response = await patchRoute(jsonRequest('http://localhost/api/admin/delivery-zones', { zone: 'Nairobi' }));
    expect(response.status).toBe(400);
    expect(setZoneFeeMock).not.toHaveBeenCalled();
  });

  it('400s when the service rejects the input', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(SESSION);
    setZoneFeeMock.mockRejectedValue(new DeliveryZoneValidationError('"feeKes" must be a non-negative number.'));
    const response = await patchRoute(
      jsonRequest('http://localhost/api/admin/delivery-zones', {
        zone: 'Nairobi',
        shippingOrigin: 'Nairobi',
        packageCategory: 'small',
        courier: 'jumia',
        feeKes: -1,
      }),
    );
    expect(response.status).toBe(400);
  });

  it('200s and calls setZoneFee with a 0 fee (intentionally free pickup)', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(SESSION);
    setZoneFeeMock.mockResolvedValue({ stationsUpdated: 4 });
    const response = await patchRoute(
      jsonRequest('http://localhost/api/admin/delivery-zones', {
        zone: 'Nairobi',
        shippingOrigin: 'Nairobi',
        packageCategory: 'small',
        courier: 'jumia',
        feeKes: 0,
      }),
    );
    expect(response.status).toBe(200);
    expect(setZoneFeeMock).toHaveBeenCalledWith(
      'biz-1',
      { zone: 'Nairobi', shippingOrigin: 'Nairobi', packageCategory: 'small', courier: 'jumia' },
      0,
      'staff-1',
    );
    const body = await response.json();
    expect(body.stationsUpdated).toBe(4);
  });
});
