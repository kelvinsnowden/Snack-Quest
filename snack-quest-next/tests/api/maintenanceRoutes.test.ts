import { beforeEach, describe, expect, it, vi } from 'vitest';

const { staffSessionMock, partnerSessionMock } = vi.hoisted(() => ({ staffSessionMock: vi.fn(), partnerSessionMock: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ verifyStaffSessionFromRequest: staffSessionMock }));
vi.mock('@/lib/auth/partnerSession', () => ({ verifyPartnerSessionFromRequest: partnerSessionMock }));
vi.mock('@/lib/audit/recordAuditLog', () => ({ recordAuditLog: vi.fn() }));

import { adminFirestore } from '@/lib/firebase/admin';
import { machineService } from '@/services/machineService';
import { partnerService } from '@/services/partnerService';
import { GET as listRequests, POST as createRequest } from '@/app/api/vending/maintenance/requests/route';
import { PATCH as updateRequest } from '@/app/api/vending/maintenance/requests/[requestId]/route';
import { GET as listCosts, POST as recordCost } from '@/app/api/vending/maintenance/costs/route';
import { POST as voidCost } from '@/app/api/vending/maintenance/costs/[costId]/void/route';
import { GET as ownerView, POST as ownerReport } from '@/app/api/vending/partners/me/machines/[machineId]/maintenance/route';
import { nairobiClock } from '@/lib/ads/playlist';

/**
 * The maintenance routes: each staff action needs its own permission, and
 * an owner's view never carries staff ids or Snack Quest's own spend.
 */

const BUSINESS_ID = 'biz-maintenance-routes';
const staff = (effectivePermissions: string[]) => ({ uid: 'staff-1', email: 'x@example.com', displayName: 'X', businessId: BUSINESS_ID, roles: ['admin'], permissions: [], effectivePermissions });
const json = (url: string, method: string, body?: unknown) => new Request(`http://localhost${url}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

let machineId: string;
let partnerId: string;

beforeEach(async () => {
  staffSessionMock.mockReset();
  partnerSessionMock.mockReset();
  for (const collection of ['machines', 'partners', 'partnerMachineAgreements', 'machineOwnershipHistory', 'maintenanceRequests', 'maintenanceCosts', 'deviceCredentials']) {
    const snapshot = await adminFirestore.collection(collection).where('businessId', '==', BUSINESS_ID).get();
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  }
  partnerId = await partnerService.create({ businessId: BUSINESS_ID, name: 'Owner', actor: 'staff-1' });
  ({ machineId } = await machineService.provisionDevice({ businessId: BUSINESS_ID, machineCode: `SQ-MR-${Math.random().toString(36).slice(2, 8)}`, serialNumber: 'SN', manufacturer: 'mock', model: 'm', ownerPartnerId: partnerId, actor: 'staff-1' }));
});

describe('staff maintenance routes', () => {
  it('each action needs its own permission', async () => {
    staffSessionMock.mockResolvedValue(staff(['maintenance.view']));
    expect((await listRequests(json('/api/vending/maintenance/requests', 'GET'))).status).toBe(200);
    expect((await createRequest(json('/api/vending/maintenance/requests', 'POST', { machineId, category: 'other', description: 'something rattles' }))).status).toBe(403);
    expect((await recordCost(json('/api/vending/maintenance/costs', 'POST', { machineId }))).status).toBe(403);

    staffSessionMock.mockResolvedValue(staff(['maintenance.manage']));
    expect((await listCosts(json('/api/vending/maintenance/costs', 'GET'))).status).toBe(403);

    staffSessionMock.mockResolvedValue(null);
    expect((await listRequests(json('/api/vending/maintenance/requests', 'GET'))).status).toBe(401);
  });

  it('logs, moves on, costs and voids through the routes', async () => {
    staffSessionMock.mockResolvedValue(staff(['maintenance.view', 'maintenance.manage', 'maintenance.costs.record']));
    const created = await createRequest(json('/api/vending/maintenance/requests', 'POST', { machineId, category: 'cooling', description: 'Running warm' }));
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };

    const bad = await updateRequest(json(`/api/vending/maintenance/requests/${id}`, 'PATCH', { status: 'resolved' }), { params: Promise.resolve({ requestId: id }) });
    expect(bad.status).toBe(400);
    const fixed = await updateRequest(json(`/api/vending/maintenance/requests/${id}`, 'PATCH', { status: 'resolved', resolution: 'New fan' }), { params: Promise.resolve({ requestId: id }) });
    expect(fixed.status).toBe(200);
    const again = await updateRequest(json(`/api/vending/maintenance/requests/${id}`, 'PATCH', { status: 'acknowledged' }), { params: Promise.resolve({ requestId: id }) });
    expect(again.status).toBe(409);

    const today = nairobiClock(new Date()).date;
    const costResponse = await recordCost(json('/api/vending/maintenance/costs', 'POST', { machineId, requestId: id, amountKes: 2500, occurredOn: today, paidBy: 'snack_quest', category: 'parts', description: 'Fan' }));
    expect(costResponse.status).toBe(201);
    const { id: costId } = (await costResponse.json()) as { id: string };
    expect((await voidCost(json(`/api/vending/maintenance/costs/${costId}/void`, 'POST', { reason: 'Wrong machine' }), { params: Promise.resolve({ costId }) })).status).toBe(200);
    expect((await voidCost(json(`/api/vending/maintenance/costs/${costId}/void`, 'POST', { reason: 'Wrong machine' }), { params: Promise.resolve({ costId }) })).status).toBe(409);
  });
});

describe('owner maintenance route', () => {
  it('an owner reports a problem and sees it, with only their own costs and no staff ids', async () => {
    partnerSessionMock.mockResolvedValue({ uid: 'owner-uid', partnerId, businessId: BUSINESS_ID, name: 'Owner', contactEmail: null, status: 'active' });
    const params = { params: Promise.resolve({ machineId }) };
    expect((await ownerReport(json('/x', 'POST', { category: 'not_dispensing', description: 'Slot A01 is stuck' }), params)).status).toBe(201);

    staffSessionMock.mockResolvedValue(staff(['maintenance.costs.record']));
    const today = nairobiClock(new Date()).date;
    await recordCost(json('/api/vending/maintenance/costs', 'POST', { machineId, amountKes: 900, occurredOn: today, paidBy: 'snack_quest', category: 'repair', description: 'Our technician' }));
    await recordCost(json('/api/vending/maintenance/costs', 'POST', { machineId, amountKes: 400, occurredOn: today, paidBy: 'owner', category: 'cleaning', description: 'Owner-paid clean' }));

    const response = await ownerView(json('/x', 'GET'), { params: Promise.resolve({ machineId }) });
    expect(response.status).toBe(200);
    const text = await response.text();
    const body = JSON.parse(text) as { requests: { raisedBy: Record<string, unknown>; updates: Record<string, unknown>[] }[]; costs: { amountKes: number }[] };
    expect(body.requests).toHaveLength(1);
    expect(body.requests[0].raisedBy).toEqual({ kind: 'owner' });
    expect(body.costs.map((cost) => cost.amountKes)).toEqual([400]);
    expect(text).not.toContain('staff-1');
    expect(text).not.toContain('owner-uid');
  });
});
