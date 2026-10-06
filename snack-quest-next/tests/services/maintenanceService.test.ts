import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineService, PartnerDoesNotOwnMachineError } from '@/services/machineService';
import { partnerService } from '@/services/partnerService';
import { machinePnlService } from '@/services/machinePnlService';
import { maintenanceService, MaintenanceNotFoundError, MaintenanceStateError, MaintenanceValidationError } from '@/services/maintenanceService';
import { resolvePeriod } from '@/lib/finance/periods';
import { nairobiClock } from '@/lib/ads/playlist';

/**
 * Machine maintenance (§ MAINTENANCE): owners and staff raise requests,
 * staff work them through to fixed, costs are recorded (and voided, never
 * edited), and the machine P&L counts what was recorded, split by who paid.
 */

const BUSINESS_ID = 'biz-maintenance';
const COLLECTIONS = ['machines', 'partners', 'partnerMachineAgreements', 'machineOwnershipHistory', 'maintenanceRequests', 'maintenanceCosts', 'deviceCredentials', 'machineTransactions', 'machineSettlements'];
const TODAY = nairobiClock(new Date()).date;

beforeEach(async () => {
  for (const collection of COLLECTIONS) {
    const snapshot = await adminFirestore.collection(collection).where('businessId', '==', BUSINESS_ID).get();
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  }
});

async function machine(options: { owner?: boolean; ownerMaintains?: boolean } = {}) {
  const partnerId = options.owner ? await partnerService.create({ businessId: BUSINESS_ID, name: 'Owner', actor: 'staff-1' }) : null;
  const { machineId } = await machineService.provisionDevice({ businessId: BUSINESS_ID, machineCode: `SQ-MAINT-${Math.random().toString(36).slice(2, 8)}`, serialNumber: 'SN', manufacturer: 'mock', model: 'm', ownerPartnerId: partnerId, actor: 'staff-1' });
  if (partnerId) {
    await partnerService.createAgreement({ businessId: BUSINESS_ID, partnerId, machineId, status: 'active', revenueSharePartnerPct: null, operatingCostNote: null, effectiveFrom: null, documentRef: null, note: null, terms: { maintenanceResponsibility: options.ownerMaintains ? 'owner' : 'snack_quest' }, actor: 'staff-1' });
  }
  return { machineId, partnerId };
}

const cost = (machineId: string, overrides: Record<string, unknown> = {}) =>
  maintenanceService.recordCost(BUSINESS_ID, 'staff-1', { machineId, amountKes: 1500, occurredOn: TODAY, paidBy: 'snack_quest', category: 'repair', description: 'Replaced the coin mech', ...overrides });

describe('maintenance requests', () => {
  it('an owner reports a problem on their own machine; another owner cannot, and cannot see or cancel it', async () => {
    const { machineId, partnerId } = await machine({ owner: true });
    const otherOwner = await partnerService.create({ businessId: BUSINESS_ID, name: 'Someone else', actor: 'staff-1' });

    const id = await maintenanceService.raiseByOwner(BUSINESS_ID, partnerId!, machineId, 'owner-uid', { category: 'not_dispensing', description: 'Slot A01 takes the money and drops nothing', urgency: 'urgent' });
    const request = await maintenanceService.findRequest(BUSINESS_ID, id);
    expect(request).toMatchObject({ machineId, partnerId, status: 'open', urgency: 'urgent', raisedBy: { kind: 'owner', uid: 'owner-uid' } });
    expect(request.updates).toHaveLength(1);

    await expect(maintenanceService.raiseByOwner(BUSINESS_ID, otherOwner, machineId, 'x', { category: 'other', description: 'not my machine' })).rejects.toBeInstanceOf(PartnerDoesNotOwnMachineError);
    await expect(maintenanceService.forOwnerMachine(BUSINESS_ID, otherOwner, machineId)).rejects.toBeInstanceOf(PartnerDoesNotOwnMachineError);
    await expect(maintenanceService.cancelByOwner(BUSINESS_ID, otherOwner, id, 'x', { reason: 'trying it on' })).rejects.toBeInstanceOf(MaintenanceNotFoundError);
    expect((await maintenanceService.findRequest(BUSINESS_ID, id)).status).toBe('open');

    const mine = await maintenanceService.forOwnerMachine(BUSINESS_ID, partnerId!, machineId);
    expect(mine.requests.map((row) => row.id)).toEqual([id]);
  });

  it('refuses a bad category, a too-short description and an unknown urgency', async () => {
    const { machineId } = await machine();
    for (const body of [{ category: 'explosion', description: 'long enough text' }, { category: 'other', description: 'abc' }, { category: 'other', description: 'long enough text', urgency: 'whenever' }]) {
      await expect(maintenanceService.raiseByStaff(BUSINESS_ID, machineId, 'staff-1', body)).rejects.toBeInstanceOf(MaintenanceValidationError);
    }
  });

  it('staff work a request through to fixed; scheduling needs a date, fixing needs a note, and a fixed request is final', async () => {
    const { machineId } = await machine();
    const id = await maintenanceService.raiseByStaff(BUSINESS_ID, machineId, 'staff-1', { category: 'cooling', description: 'Running warm all afternoon' });

    await maintenanceService.updateByStaff(BUSINESS_ID, id, 'staff-2', { status: 'acknowledged', note: 'Technician informed' });
    await expect(maintenanceService.updateByStaff(BUSINESS_ID, id, 'staff-2', { status: 'scheduled' })).rejects.toBeInstanceOf(MaintenanceValidationError);
    const scheduled = await maintenanceService.updateByStaff(BUSINESS_ID, id, 'staff-2', { status: 'scheduled', scheduledFor: '2026-10-10' });
    expect(scheduled).toMatchObject({ status: 'scheduled', scheduledFor: '2026-10-10' });

    await expect(maintenanceService.updateByStaff(BUSINESS_ID, id, 'staff-2', { status: 'resolved' })).rejects.toBeInstanceOf(MaintenanceValidationError);
    const resolved = await maintenanceService.updateByStaff(BUSINESS_ID, id, 'staff-2', { status: 'resolved', resolution: 'Cleaned the condenser' });
    expect(resolved).toMatchObject({ status: 'resolved', resolution: 'Cleaned the condenser' });
    expect(resolved.closedAt).not.toBeNull();
    expect(resolved.updates.map((update) => update.status)).toEqual(['open', 'acknowledged', 'scheduled', 'resolved']);

    await expect(maintenanceService.updateByStaff(BUSINESS_ID, id, 'staff-2', { status: 'acknowledged' })).rejects.toBeInstanceOf(MaintenanceStateError);
    await expect(maintenanceService.updateByStaff(BUSINESS_ID, id, 'staff-2', { status: 'open' })).rejects.toBeInstanceOf(MaintenanceValidationError);
  });

  it('an owner can withdraw their own open request', async () => {
    const { machineId, partnerId } = await machine({ owner: true });
    const id = await maintenanceService.raiseByOwner(BUSINESS_ID, partnerId!, machineId, 'owner-uid', { category: 'screen', description: 'Screen flickers now and then' });
    const cancelled = await maintenanceService.cancelByOwner(BUSINESS_ID, partnerId!, id, 'owner-uid', { reason: 'It stopped after a restart' });
    expect(cancelled).toMatchObject({ status: 'cancelled', resolution: 'Withdrawn by the owner: It stopped after a restart' });
    await expect(maintenanceService.cancelByOwner(BUSINESS_ID, partnerId!, id, 'owner-uid', { reason: 'again' })).rejects.toBeInstanceOf(MaintenanceStateError);
  });

  it('a request from another business reads as not found', async () => {
    const { machineId } = await machine();
    const id = await maintenanceService.raiseByStaff(BUSINESS_ID, machineId, 'staff-1', { category: 'other', description: 'Something rattles' });
    await expect(maintenanceService.findRequest('another-business', id)).rejects.toBeInstanceOf(MaintenanceNotFoundError);
    await expect(maintenanceService.updateByStaff('another-business', id, 'x', { status: 'acknowledged' })).rejects.toBeInstanceOf(MaintenanceNotFoundError);
  });
});

describe('maintenance costs', () => {
  it('records a cost with the owner of the day stamped on it, and refuses bad amounts, future dates and impossible payers', async () => {
    const { machineId, partnerId } = await machine({ owner: true });
    const id = await cost(machineId, { paidBy: 'owner', vendor: 'Coolfix Ltd' });
    expect(await maintenanceService.findCost(BUSINESS_ID, id)).toMatchObject({ partnerId, paidBy: 'owner', amountKes: 1500, vendor: 'Coolfix Ltd', voided: null });

    const tomorrow = new Date(Date.parse(`${TODAY}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    for (const overrides of [{ amountKes: 0 }, { amountKes: 12.5 }, { amountKes: 1_000_001 }, { amountKes: '1500' }, { occurredOn: tomorrow }, { occurredOn: '2026-02-30' }, { paidBy: 'tenant' }]) {
      await expect(cost(machineId, overrides)).rejects.toBeInstanceOf(MaintenanceValidationError);
    }

    const { machineId: ownMachine } = await machine();
    await expect(cost(ownMachine, { paidBy: 'owner' })).rejects.toThrow(/no owner/);
  });

  it('links a cost to a request only on the same machine', async () => {
    const first = await machine();
    const second = await machine();
    const requestId = await maintenanceService.raiseByStaff(BUSINESS_ID, first.machineId, 'staff-1', { category: 'power', description: 'Trips the breaker' });
    await expect(cost(second.machineId, { requestId })).rejects.toThrow(/different machine/);
    await expect(cost(first.machineId, { requestId })).resolves.toBeTruthy();
  });

  it('voids a cost once, with a reason, and keeps it on record', async () => {
    const { machineId } = await machine();
    const id = await cost(machineId);
    await expect(maintenanceService.voidCost(BUSINESS_ID, id, 'staff-2', { reason: 'x' })).rejects.toBeInstanceOf(MaintenanceValidationError);
    await maintenanceService.voidCost(BUSINESS_ID, id, 'staff-2', { reason: 'Entered on the wrong machine' });
    expect((await maintenanceService.findCost(BUSINESS_ID, id)).voided).toMatchObject({ by: 'staff-2', reason: 'Entered on the wrong machine' });
    await expect(maintenanceService.voidCost(BUSINESS_ID, id, 'staff-2', { reason: 'again please' })).rejects.toBeInstanceOf(MaintenanceStateError);
  });

  it('an owner sees only the costs they bore, never Snack Quest’s own spend', async () => {
    const { machineId, partnerId } = await machine({ owner: true });
    await cost(machineId, { paidBy: 'snack_quest', amountKes: 900 });
    const theirs = await cost(machineId, { paidBy: 'owner', amountKes: 400 });
    const voided = await cost(machineId, { paidBy: 'owner', amountKes: 999 });
    await maintenanceService.voidCost(BUSINESS_ID, voided, 'staff-1', { reason: 'duplicate entry' });
    const view = await maintenanceService.forOwnerMachine(BUSINESS_ID, partnerId!, machineId);
    expect(view.costs.map((row) => row.id)).toEqual([theirs]);
  });
});

describe('maintenance in the machine P&L', () => {
  const period = () => resolvePeriod({ preset: 'this_month' }, new Date());

  it('Snack Quest machine: recorded spend is the maintenance line; voided and out-of-period costs are left out', async () => {
    const { machineId } = await machine();
    await cost(machineId, { amountKes: 1200 });
    await cost(machineId, { amountKes: 300, category: 'parts' });
    const voided = await cost(machineId, { amountKes: 5000 });
    await maintenanceService.voidCost(BUSINESS_ID, voided, 'staff-1', { reason: 'typo' });
    await cost(machineId, { amountKes: 7000, occurredOn: '2020-01-15' });

    const { start, end } = period();
    const pnl = await machinePnlService.forMachine({ businessId: BUSINESS_ID, machineId, periodStart: start, periodEnd: end, perspective: 'snack_quest' });
    expect(pnl.contribution.lines.find((line) => line.key === 'maintenance')?.amountKes).toBe(-1500);
    expect(pnl.contribution.missing).not.toContain('maintenance');
  });

  it('owner who maintains the machine: missing until a cost they bore is recorded, then counted; Snack Quest’s spend comes off Snack Quest’s income', async () => {
    const { machineId } = await machine({ owner: true, ownerMaintains: true });
    const { start, end } = period();
    const before = await machinePnlService.forMachine({ businessId: BUSINESS_ID, machineId, periodStart: start, periodEnd: end, perspective: 'owner' });
    expect(before.contribution.missing).toContain('maintenance');

    await cost(machineId, { paidBy: 'owner', amountKes: 650 });
    await cost(machineId, { paidBy: 'snack_quest', amountKes: 200 });
    const owner = await machinePnlService.forMachine({ businessId: BUSINESS_ID, machineId, periodStart: start, periodEnd: end, perspective: 'owner' });
    expect(owner.contribution.lines.find((line) => line.key === 'maintenance')?.amountKes).toBe(-650);
    expect(owner.contribution.missing).not.toContain('maintenance');

    const company = await machinePnlService.forMachine({ businessId: BUSINESS_ID, machineId, periodStart: start, periodEnd: end, perspective: 'snack_quest' });
    expect(company.snackQuestIncome).toMatchObject({ maintenanceKes: 200 });
    expect(company.snackQuestIncome!.afterMaintenanceKes).toBe(company.snackQuestIncome!.totalKes - 200);
  });

  it('Snack Quest maintains the owner’s machine: the owner’s maintenance line is zero, never missing', async () => {
    const { machineId } = await machine({ owner: true });
    const { start, end } = period();
    const owner = await machinePnlService.forMachine({ businessId: BUSINESS_ID, machineId, periodStart: start, periodEnd: end, perspective: 'owner' });
    expect(owner.contribution.lines.find((line) => line.key === 'maintenance')?.amountKes).toBe(-0);
    expect(owner.contribution.missing).not.toContain('maintenance');
  });
});
