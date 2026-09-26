import { beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyStaffSessionFromRequestMock, createMock, listByBusinessMock, listByTypeMock, findByIdMock, updateMock, machinesAtLocationMock } = vi.hoisted(() => ({
  verifyStaffSessionFromRequestMock: vi.fn(),
  createMock: vi.fn(),
  listByBusinessMock: vi.fn(),
  listByTypeMock: vi.fn(),
  findByIdMock: vi.fn(),
  updateMock: vi.fn(),
  machinesAtLocationMock: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

vi.mock('@/services/locationService', async () => {
  const actual = await vi.importActual<typeof import('@/services/locationService')>('@/services/locationService');
  return {
    ...actual,
    locationService: {
      create: createMock,
      listByBusiness: listByBusinessMock,
      listByType: listByTypeMock,
      findById: findByIdMock,
      update: updateMock,
      machinesAtLocation: machinesAtLocationMock,
    },
  };
});

import { GET as locationsGet, POST as locationsPost } from '@/app/api/vending/locations/route';
import { GET as locationGet, PATCH as locationPatch } from '@/app/api/vending/locations/[id]/route';
import { LocationNotFoundError } from '@/services/locationService';

const STAFF_SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['admin'], businessId: 'biz-1' };
const AGENT_SESSION = { ...STAFF_SESSION, roles: ['agent'] };

beforeEach(() => {
  vi.clearAllMocks();
  machinesAtLocationMock.mockResolvedValue([]);
});

function postLocations(body: unknown) {
  return locationsPost(new Request('http://localhost/api/vending/locations', { method: 'POST', body: JSON.stringify(body) }));
}

function getLocations(url = 'http://localhost/api/vending/locations') {
  return locationsGet(new Request(url));
}

function getLocation(id = 'loc-1') {
  return locationGet(new Request(`http://localhost/api/vending/locations/${id}`), { params: Promise.resolve({ id }) });
}

function patchLocation(body: unknown, id = 'loc-1') {
  return locationPatch(new Request(`http://localhost/api/vending/locations/${id}`, { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
}

describe('POST /api/vending/locations', () => {
  it('401s without a staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await postLocations({ name: 'Test', locationType: 'university', city: 'Nairobi' });
    expect(response.status).toBe(401);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('403s a role outside admin/finance/warehouse', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(AGENT_SESSION);
    const response = await postLocations({ name: 'Test', locationType: 'university', city: 'Nairobi' });
    expect(response.status).toBe(403);
  });

  it('400s an invalid locationType', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await postLocations({ name: 'Test', locationType: 'spaceship', city: 'Nairobi' });
    expect(response.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('400s a missing name', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await postLocations({ locationType: 'university', city: 'Nairobi' });
    expect(response.status).toBe(400);
  });

  it('201s and creates with the staff uid as actor', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    createMock.mockResolvedValue('loc-123');
    const response = await postLocations({ name: 'Test Uni', locationType: 'university', city: 'Nairobi' });
    expect(response.status).toBe(201);
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ businessId: 'biz-1', name: 'Test Uni', locationType: 'university', city: 'Nairobi', actor: 'staff-1' }));
    const body = await response.json();
    expect(body).toEqual({ locationId: 'loc-123' });
  });
});

describe('GET /api/vending/locations', () => {
  it('lists by business when no locationType filter is given', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    listByBusinessMock.mockResolvedValue([]);
    const response = await getLocations();
    expect(response.status).toBe(200);
    expect(listByBusinessMock).toHaveBeenCalledWith('biz-1');
    expect(listByTypeMock).not.toHaveBeenCalled();
  });

  it('filters by locationType when given', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    listByTypeMock.mockResolvedValue([]);
    const response = await getLocations('http://localhost/api/vending/locations?locationType=university');
    expect(response.status).toBe(200);
    expect(listByTypeMock).toHaveBeenCalledWith('biz-1', 'university');
  });

  it('400s an invalid locationType filter', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await getLocations('http://localhost/api/vending/locations?locationType=nonsense');
    expect(response.status).toBe(400);
  });
});

describe('GET /api/vending/locations/[id]', () => {
  it('404s a location that does not exist', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    findByIdMock.mockResolvedValue(null);
    const response = await getLocation();
    expect(response.status).toBe(404);
  });
});

describe('PATCH /api/vending/locations/[id]', () => {
  it('404s a not-found location', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    updateMock.mockRejectedValue(new LocationNotFoundError('loc-1'));
    const response = await patchLocation({ name: 'New name' });
    expect(response.status).toBe(404);
  });

  it('updates only the given fields', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    updateMock.mockResolvedValue(undefined);
    const response = await patchLocation({ name: 'New name' });
    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith('biz-1', 'loc-1', { name: 'New name' }, 'staff-1');
  });
});
