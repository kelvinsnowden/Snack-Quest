import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { partnerSessionMock, staffSessionMock } = vi.hoisted(() => ({ partnerSessionMock: vi.fn(), staffSessionMock: vi.fn() }));
vi.mock('@/lib/auth/partnerSession', () => ({ verifyPartnerSessionFromRequest: partnerSessionMock }));
vi.mock('@/lib/auth/session', () => ({ verifyStaffSessionFromRequest: staffSessionMock }));

import { partnerService } from '@/services/partnerService';
import { cameraService } from '@/services/cameraService';
import { locationService } from '@/services/locationService';
import { maintenanceService } from '@/services/maintenanceService';
import { clearIntegrationCollections } from '../helpers/integrationFixtures';
import { activeMachine, apiKey, onboardManufacturer, signed, type V1Machine } from '../helpers/v1TestHarness';

/**
 * Adversarial sweep of every owner-portal route: called as owner A with
 * owner B's ids, with no session at all, and with a manufacturer's
 * signed Machine API credentials instead of a session. Nothing of B's
 * may come back, and nothing of B's may change.
 */

const BUSINESS_ID = 'biz-owner-isolation';
const ORIGINAL = { business: process.env.SNACK_QUEST_BUSINESS_ID, key: process.env.SECRET_ENCRYPTION_KEY };
beforeAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = BUSINESS_ID;
  process.env.SECRET_ENCRYPTION_KEY = '3'.repeat(64);
});
afterAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = ORIGINAL.business;
  process.env.SECRET_ENCRYPTION_KEY = ORIGINAL.key;
});

type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>;
interface RouteCase { name: string; load: () => Promise<Record<string, unknown>>; method: 'GET' | 'POST' | 'PUT'; params: (b: Fixture) => Record<string, string>; body?: unknown }
interface Fixture { ownerA: string; ownerB: string; machineA: V1Machine; machineB: V1Machine; cameraB: string; locationB: string; requestB: string }

let fx: Fixture;

beforeEach(async () => {
  partnerSessionMock.mockReset();
  staffSessionMock.mockReset().mockResolvedValue(null);
  await clearIntegrationCollections(BUSINESS_ID);
  const ownerA = await partnerService.create({ businessId: BUSINESS_ID, name: 'Owner A', actor: 'staff-1' });
  const ownerB = await partnerService.create({ businessId: BUSINESS_ID, name: 'Owner B', actor: 'staff-1' });
  const ids = await onboardManufacturer(BUSINESS_ID, 'isoco');
  const machineA = await activeMachine(BUSINESS_ID, ids);
  const machineB = await activeMachine(BUSINESS_ID, ids);
  const { adminFirestore } = await import('@/lib/firebase/admin');
  await adminFirestore.collection('machines').doc(machineA.machineId).update({ ownerPartnerId: ownerA });
  await adminFirestore.collection('machines').doc(machineB.machineId).update({ ownerPartnerId: ownerB });
  const cameraB = await cameraService.registerCamera(BUSINESS_ID, { machineId: machineB.machineId, type: 'mock', manufacturer: null, model: null, serialNumber: null, label: 'B cam' }, 'staff-1');
  const locationB = await locationService.create({ businessId: BUSINESS_ID, name: 'B site', locationType: 'office', city: 'Nairobi', actor: 'staff-1' });
  await adminFirestore.collection('machines').doc(machineB.machineId).update({ locationId: locationB });
  const requestB = await maintenanceService.raiseByOwner(BUSINESS_ID, ownerB, machineB.machineId, `u-${ownerB}`, { category: 'other', description: 'Owner B’s private problem' });
  fx = { ownerA, ownerB, machineA, machineB, cameraB, locationB, requestB };
});

const me = (path: string) => () => import(`@/app/api/vending/partners/me/${path}/route`);
const MACHINE_B = (b: Fixture) => ({ machineId: b.machineB.machineId });
const CAMERA_B = (b: Fixture) => ({ cameraId: b.cameraB });
const NONE = () => ({});

const TARGETED: RouteCase[] = [
  { name: 'machine', load: me('machines/[machineId]'), method: 'GET', params: MACHINE_B },
  { name: 'machine health', load: me('machines/[machineId]/health'), method: 'GET', params: MACHINE_B },
  { name: 'machine inventory', load: me('machines/[machineId]/inventory'), method: 'GET', params: MACHINE_B },
  { name: 'machine cameras', load: me('machines/[machineId]/cameras'), method: 'GET', params: MACHINE_B },
  { name: 'restock request', load: me('machines/[machineId]/restock-request'), method: 'POST', params: MACHINE_B, body: { note: 'please' } },
  { name: 'camera', load: me('cameras/[cameraId]'), method: 'GET', params: CAMERA_B },
  { name: 'camera snapshot', load: me('cameras/[cameraId]/snapshot'), method: 'POST', params: CAMERA_B, body: {} },
  { name: 'camera snapshots', load: me('cameras/[cameraId]/snapshots'), method: 'GET', params: CAMERA_B },
  { name: 'camera stream info', load: me('cameras/[cameraId]/stream-info'), method: 'GET', params: CAMERA_B },
  { name: 'camera test', load: me('cameras/[cameraId]/test'), method: 'POST', params: CAMERA_B, body: {} },
  { name: 'machine maintenance', load: me('machines/[machineId]/maintenance'), method: 'GET', params: MACHINE_B },
  { name: 'report a maintenance problem', load: me('machines/[machineId]/maintenance'), method: 'POST', params: MACHINE_B, body: { category: 'other', description: 'not my machine at all' } },
  { name: 'withdraw a maintenance request', load: me('maintenance/[requestId]/cancel'), method: 'POST', params: (b) => ({ requestId: b.requestB }), body: { reason: 'not mine to withdraw' } },
  { name: 'location expenses', load: me('locations/[locationId]/expenses'), method: 'PUT', params: (b) => ({ locationId: b.locationB }), body: { rentKes: 1, electricityKes: 1, otherKes: 1 } },
];

const LISTS: RouteCase[] = ['dashboard', 'alerts', 'activity', 'sales-trend', 'top-products', 'settlements', 'subscriptions', 'wallet', 'withdrawals'].map((path) => ({ name: path, load: me(path), method: 'GET' as const, params: NONE }));

const STAFF_ONLY: RouteCase[] = [
  { name: 'staff: partner wallet', load: () => import('@/app/api/vending/partners/[partnerId]/wallet/route'), method: 'GET', params: (b) => ({ partnerId: b.ownerB }) },
  { name: 'staff: partner settlements', load: () => import('@/app/api/vending/partners/[partnerId]/settlements/route'), method: 'GET', params: (b) => ({ partnerId: b.ownerB }) },
  { name: 'staff: partner subscriptions', load: () => import('@/app/api/vending/partners/[partnerId]/subscriptions/route'), method: 'GET', params: (b) => ({ partnerId: b.ownerB }) },
  { name: 'staff: partner withdrawals', load: () => import('@/app/api/vending/partners/[partnerId]/withdrawals/route'), method: 'GET', params: (b) => ({ partnerId: b.ownerB }) },
  { name: 'staff: machine intelligence', load: () => import('@/app/api/vending/partners/[partnerId]/machines/[machineId]/intelligence/route'), method: 'GET', params: (b) => ({ partnerId: b.ownerB, machineId: b.machineB.machineId }) },
];

async function call(route: RouteCase, request?: Request) {
  const handler = (await route.load())[route.method] as Handler;
  const req = request ?? new Request('http://localhost/x', { method: route.method, headers: { 'content-type': 'application/json' }, body: route.method === 'GET' ? undefined : JSON.stringify(route.body ?? {}) });
  const response = await handler(req, { params: Promise.resolve(route.params(fx)) });
  return { status: response.status, text: await response.text() };
}

const sessionFor = (partnerId: string) => ({ uid: `u-${partnerId}`, partnerId, businessId: BUSINESS_ID, name: 'Owner', contactEmail: null, status: 'active' });
const leaksB = (text: string) => [fx.machineB.machineId, fx.machineB.machineCode, fx.cameraB, fx.locationB, fx.ownerB, fx.requestB].filter((id) => text.includes(id));

describe('owner portal isolation', () => {
  it.each(TARGETED.map((route) => [route.name, route] as const))('%s: owner A cannot reach owner B\'s resource', async (_name, route) => {
    partnerSessionMock.mockResolvedValue(sessionFor(fx.ownerA));
    const { status, text } = await call(route);
    // "Not yours" is indistinguishable from "doesn't exist": no existence oracle.
    expect(status).toBe(404);
    expect(leaksB(text)).toEqual([]);
  });

  it.each(LISTS.map((route) => [route.name, route] as const))('%s: owner A\'s list contains nothing of owner B\'s', async (_name, route) => {
    partnerSessionMock.mockResolvedValue(sessionFor(fx.ownerA));
    const { status, text } = await call(route);
    expect(status).toBeLessThan(500);
    expect(leaksB(text)).toEqual([]);
  });

  it.each([...TARGETED, ...LISTS].map((route) => [route.name, route] as const))('%s: no session → 401', async (_name, route) => {
    partnerSessionMock.mockResolvedValue(null);
    expect((await call(route)).status).toBe(401);
  });

  it.each(STAFF_ONLY.map((route) => [route.name, route] as const))('%s: an owner session is not a staff session → 401', async (_name, route) => {
    partnerSessionMock.mockResolvedValue(sessionFor(fx.ownerA));
    expect((await call(route)).status).toBe(401);
  });

  it('a manufacturer\'s signed Machine API credentials open no owner route', async () => {
    partnerSessionMock.mockImplementation(async (request: Request) => (request.headers.get('cookie') ? sessionFor(fx.ownerA) : null));
    const key = await apiKey(BUSINESS_ID, (await import('@/lib/firebase/admin')).adminFirestore ? (await (await import('@/repositories/manufacturerRepository')).manufacturerRepository.findBySlug(BUSINESS_ID, 'isoco'))!.id : '');
    for (const route of [...TARGETED, ...LISTS]) {
      const request = signed(key, '/api/vending/partners/me/x', route.method === 'GET' ? undefined : route.body ?? {}, { method: route.method === 'GET' ? 'GET' : 'POST' });
      const withMethod = new Request(request.url, { method: route.method, headers: request.headers, body: route.method === 'GET' ? undefined : JSON.stringify(route.body ?? {}) });
      expect({ route: route.name, status: (await call(route, withMethod)).status }).toEqual({ route: route.name, status: 401 });
    }
  });

  it('owner B’s maintenance request is untouched by owner A’s attempts', async () => {
    partnerSessionMock.mockResolvedValue(sessionFor(fx.ownerA));
    await call(TARGETED.find((route) => route.name === 'withdraw a maintenance request')!);
    expect((await maintenanceService.findRequest(BUSINESS_ID, fx.requestB)).status).toBe('open');
  });

  it('owner A still sees its own machine (the sweep is not passing because everything is refused)', async () => {
    partnerSessionMock.mockResolvedValue(sessionFor(fx.ownerA));
    const own = await call({ ...TARGETED[1], params: () => ({ machineId: fx.machineA.machineId }) });
    expect(own.status).toBe(200);
  });
});
