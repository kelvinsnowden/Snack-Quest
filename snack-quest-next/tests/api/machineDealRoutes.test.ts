import { beforeEach, describe, expect, it, vi } from 'vitest';

const { staffSessionMock } = vi.hoisted(() => ({ staffSessionMock: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ verifyStaffSessionFromRequest: staffSessionMock }));
vi.mock('@/lib/audit/recordAuditLog', () => ({ recordAuditLog: vi.fn() }));

import { adminFirestore } from '@/lib/firebase/admin';
import { machineService } from '@/services/machineService';
import { GET as getDeal } from '@/app/api/vending/machines/[id]/deal/route';
import { POST as addCost } from '@/app/api/vending/machines/[id]/deal/costs/route';
import { POST as voidCost } from '@/app/api/vending/machines/[id]/deal/costs/[costId]/void/route';
import { POST as recordSale } from '@/app/api/vending/machines/[id]/deal/sale/route';
import { POST as cancelSale } from '@/app/api/vending/machines/[id]/deal/sale/cancel/route';
import { PUT as setInstallation } from '@/app/api/vending/machines/[id]/deal/installation/route';

/** Machine deal routes: seeing needs `machines.deals.view`, every change needs `machines.deals.manage`. */

const BUSINESS_ID = 'biz-machine-deal-routes';
const staff = (effectivePermissions: string[]) => ({ uid: 'staff-1', email: 'x@example.com', displayName: 'X', businessId: BUSINESS_ID, roles: ['admin'], permissions: [], effectivePermissions });
const json = (method: string, body?: unknown) => new Request('http://localhost/x', { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

let machineId: string;
let otherMachineId: string;

beforeEach(async () => {
  staffSessionMock.mockReset();
  for (const collection of ['machines', 'machineCostLines', 'machineDeals', 'machineOwnershipHistory', 'deviceCredentials']) {
    const snapshot = await adminFirestore.collection(collection).where('businessId', '==', BUSINESS_ID).get();
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  }
  ({ machineId } = await machineService.provisionDevice({ businessId: BUSINESS_ID, machineCode: `SQ-MR-${Math.random().toString(36).slice(2, 8)}`, serialNumber: 'SN', manufacturer: 'mock', model: 'm', ownerPartnerId: null, actor: 'staff-1' }));
  ({ machineId: otherMachineId } = await machineService.provisionDevice({ businessId: BUSINESS_ID, machineCode: `SQ-MR-${Math.random().toString(36).slice(2, 8)}`, serialNumber: 'SN', manufacturer: 'mock', model: 'm', ownerPartnerId: null, actor: 'staff-1' }));
});

const p = (id: string) => ({ params: Promise.resolve({ id }) });
const pc = (id: string, costId: string) => ({ params: Promise.resolve({ id, costId }) });

describe('machine deal routes', () => {
  it('no session → 401; view-only can read but not change anything', async () => {
    staffSessionMock.mockResolvedValue(null);
    expect((await getDeal(json('GET'), p(machineId))).status).toBe(401);

    staffSessionMock.mockResolvedValue(staff(['machines.deals.view']));
    expect((await getDeal(json('GET'), p(machineId))).status).toBe(200);
    expect((await addCost(json('POST', { category: 'purchase', description: 'x', amountKes: 1000, occurredOn: '2026-09-01' }), p(machineId))).status).toBe(403);
    expect((await recordSale(json('POST', { soldOn: '2026-09-01', machinePriceKes: 1000 }), p(machineId))).status).toBe(403);
    expect((await cancelSale(json('POST', { reason: 'x' }), p(machineId))).status).toBe(403);
    expect((await setInstallation(json('PUT', { noInstallationCost: true }), p(machineId))).status).toBe(403);
    expect((await voidCost(json('POST', { reason: 'x' }), pc(machineId, 'x'))).status).toBe(403);

    staffSessionMock.mockResolvedValue(staff(['finance.machine_pnl.view']));
    expect((await getDeal(json('GET'), p(machineId))).status).toBe(403);
  });

  it('records a cost and a sale, and reports the profit', async () => {
    staffSessionMock.mockResolvedValue(staff(['machines.deals.view', 'machines.deals.manage']));
    expect((await addCost(json('POST', { category: 'purchase', description: 'Invoice 1', amountKes: 300_000, occurredOn: '2026-09-01' }), p(machineId))).status).toBe(201);
    expect((await setInstallation(json('PUT', { noInstallationCost: true }), p(machineId))).status).toBe(200);
    expect((await recordSale(json('POST', { soldOn: '2026-09-02', machinePriceKes: 420_000 }), p(machineId))).status).toBe(201);
    expect((await recordSale(json('POST', { soldOn: '2026-09-02', machinePriceKes: 420_000 }), p(machineId))).status).toBe(409);
    const body = (await (await getDeal(json('GET'), p(machineId))).json()) as { summary: { profitKes: number } };
    expect(body.summary.profitKes).toBe(120_000);
  });

  it('a cost can’t be voided through a different machine’s address', async () => {
    staffSessionMock.mockResolvedValue(staff(['machines.deals.view', 'machines.deals.manage']));
    const { id } = (await (await addCost(json('POST', { category: 'purchase', description: 'Invoice 1', amountKes: 300_000, occurredOn: '2026-09-01' }), p(machineId))).json()) as { id: string };
    expect((await voidCost(json('POST', { reason: 'wrong machine' }), pc(otherMachineId, id))).status).toBe(404);
  });

  it('bad input is a 400 that says what to fix; an unknown machine is a 404', async () => {
    staffSessionMock.mockResolvedValue(staff(['machines.deals.view', 'machines.deals.manage']));
    const bad = await addCost(json('POST', { category: 'purchase', description: 'x', amountKes: -5, occurredOn: '2026-09-01' }), p(machineId));
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toMatch(/whole number/);
    expect((await getDeal(json('GET'), p('no-such-machine'))).status).toBe(404);
  });
});
