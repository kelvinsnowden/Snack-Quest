import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminAuth, adminFirestore } from '@/lib/firebase/admin';
import { userRepository } from '@/repositories/userRepository';
import { staffRepository } from '@/repositories/staffRepository';
import { machineService } from '@/services/machineService';
import { maintenanceService } from '@/services/maintenanceService';
import { maintenanceRepository } from '@/repositories/maintenanceRepository';
import { technicianJobService, TechnicianJobError } from '@/services/technicianJobService';
import { restockTaskService } from '@/services/restockTaskService';
import { restockTaskRepository } from '@/repositories/restockTaskRepository';
import { MachineSlotService } from '@/services/machineSlotService';
import { MockVendingAdapter } from '@/lib/vending/adapters/mockVendingAdapter';
import { currentVisit } from '@/lib/vending/restockVisit';

const BUSINESS_ID = 'biz-technicians';
const createdUids: string[] = [];

async function clean() {
  for (const name of ['users', 'staffProfiles', 'machines', 'machineSlots', 'machineInventoryMovements', 'restockTasks', 'maintenanceRequests', 'technicianJobs', 'deviceCredentials', 'stockTransfers']) {
    await adminFirestore.recursiveDelete(adminFirestore.collection(name));
  }
}
beforeEach(clean);
afterEach(async () => {
  await clean();
  await Promise.all(createdUids.splice(0).map((uid) => adminAuth.deleteUser(uid).catch(() => undefined)));
});

async function staff(email: string, role: 'warehouse' | 'finance', displayName: string) {
  const record = await adminAuth.createUser({ email, password: 'test-password-123' });
  createdUids.push(record.uid);
  await userRepository.create(record.uid, { email, roles: [role], displayName, photoURL: null }, 'system');
  await staffRepository.create(record.uid, { businessId: BUSINESS_ID, role, permissions: [], department: 'Ops' }, 'system');
  return record.uid;
}

async function coolingRequest() {
  const { machineId } = await machineService.provisionDevice({ businessId: BUSINESS_ID, machineCode: 'SQ-T1', serialNumber: 'SN-T1', manufacturer: 'mock', model: 'test', actor: 'staff-1' });
  const requestId = await maintenanceService.raiseByStaff(BUSINESS_ID, machineId, 'staff-1', { category: 'cooling', description: 'Drinks are warm' });
  return { machineId, requestId };
}

describe('technician jobs', () => {
  it('lists people who can take jobs, gives one a visit with a cooling checklist, and lets them tick and finish it', async () => {
    const tech = await staff(`tech-${Date.now()}@example.com`, 'warehouse', 'Wanjiru Tech');
    await staff(`money-${Date.now()}@example.com`, 'finance', 'Finance Person');
    const technicians = await technicianJobService.listTechnicians(BUSINESS_ID);
    expect(technicians.map((t) => t.name)).toEqual(['Wanjiru Tech']);
    expect(technicians[0].kinds.sort()).toEqual(['maintenance', 'restock']);

    const { requestId } = await coolingRequest();
    await technicianJobService.assign(BUSINESS_ID, { kind: 'maintenance', refId: requestId, assigneeUid: tech }, 'manager');
    const [job] = await technicianJobService.listMine(BUSINESS_ID, tech);
    expect(job.checklist.map((item) => item.label)).toContain('Read the cabinet temperature');

    // Someone else can't tick it; the technician can.
    await expect(technicianJobService.tick(BUSINESS_ID, job.id, 0, true, 'someone-else', false)).rejects.toBeInstanceOf(TechnicianJobError);
    await technicianJobService.tick(BUSINESS_ID, job.id, 0, true, tech, false);
    // Unticked items need a reason.
    await expect(technicianJobService.complete(BUSINESS_ID, job.id, { note: '' }, tech, false)).rejects.toThrow(/weren’t done/);
    await technicianJobService.complete(BUSINESS_ID, job.id, { note: 'Fan replaced; vents cleared. No photo: camera broke.', fixed: true }, tech, false);

    expect(await technicianJobService.listMine(BUSINESS_ID, tech)).toEqual([]);
    expect((await maintenanceRepository.findRequest(BUSINESS_ID, requestId))?.status).toBe('resolved');
  });

  it('refuses giving a job to someone who can’t do it, or a finished task', async () => {
    const finance = await staff(`fin-${Date.now()}@example.com`, 'finance', 'Finance Person');
    const { requestId } = await coolingRequest();
    await expect(technicianJobService.assign(BUSINESS_ID, { kind: 'maintenance', refId: requestId, assigneeUid: finance }, 'manager')).rejects.toBeInstanceOf(TechnicianJobError);
    await maintenanceService.updateByStaff(BUSINESS_ID, requestId, 'staff-1', { status: 'cancelled', resolution: 'Duplicate report' });
    await expect(technicianJobService.assign(BUSINESS_ID, { kind: 'maintenance', refId: requestId, assigneeUid: null }, 'manager')).rejects.toThrow(/finished/);
  });

  it('finishing a restock job records what went into each slot as the restock’s receipt', async () => {
    const tech = await staff(`loader-${Date.now()}@example.com`, 'warehouse', 'Otieno Loader');
    const adapter = new MockVendingAdapter();
    const { machineId } = await machineService.provisionDevice({ businessId: BUSINESS_ID, machineCode: 'SQ-R1', serialNumber: 'SN-R1', manufacturer: 'mock', model: 'test', actor: 'staff-1' });
    adapter.seedSlot(machineId, 'A01', { quantity: 1 });
    await new MachineSlotService(() => adapter).configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A01', productId: 'pkg-1', productCatalogue: 'package', priceKes: 300, capacity: 10, position: 1 });
    const taskId = await restockTaskService.createDraft({ businessId: BUSINESS_ID, machineId, items: [{ slotId: 'A01', productId: 'pkg-1', quantityNeeded: 6 }], actor: 'manager' });
    await restockTaskService.approve(BUSINESS_ID, taskId, 'manager');
    await technicianJobService.assign(BUSINESS_ID, { kind: 'restock', refId: taskId, assigneeUid: tech }, 'manager');
    const [job] = await technicianJobService.listMine(BUSINESS_ID, tech);

    // Not on the way yet: can't finish.
    await expect(technicianJobService.complete(BUSINESS_ID, job.id, { note: 'skip checks', loaded: [{ slotId: 'A01', quantity: 6 }] }, tech, false)).rejects.toThrow(/Start the round/);

    await restockTaskService.startPicking(BUSINESS_ID, taskId, tech);
    await restockTaskService.dispatch(BUSINESS_ID, taskId, tech, [{ slotId: 'A01', quantityDispatched: 6 }]);
    await restockTaskService.markInTransit(BUSINESS_ID, taskId, tech);
    await technicianJobService.complete(BUSINESS_ID, job.id, { note: 'Two packets crushed in transit; checks skipped', loaded: [{ slotId: 'A01', quantity: 4 }] }, tech, false);

    const task = await restockTaskRepository.findById(BUSINESS_ID, taskId);
    expect(task?.status).toBe('partially_received');
    expect(task?.items[0]).toMatchObject({ quantityReceived: 4, discrepancyQuantity: 2 });
    expect(await technicianJobService.listMine(BUSINESS_ID, tech)).toEqual([]);
  });
  it('packs and sets off a whole round together, leaving unapproved restocks behind', async () => {
    const tech = await staff(`rider-${Date.now()}@example.com`, 'warehouse', 'Wanjiru Rider');
    const adapter = new MockVendingAdapter();
    const slots = new MachineSlotService(() => adapter);
    const tasks: string[] = [];
    for (const code of ['SQ-T2', 'SQ-T3', 'SQ-T4']) {
      const { machineId } = await machineService.provisionDevice({ businessId: BUSINESS_ID, machineCode: code, serialNumber: `SN-${code}`, manufacturer: 'mock', model: 'test', actor: 'staff-1' });
      adapter.seedSlot(machineId, 'A01', { quantity: 0 });
      await slots.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A01', productId: 'pkg-1', productCatalogue: 'package', priceKes: 300, capacity: 10, position: 1 });
      const taskId = await restockTaskService.createDraft({ businessId: BUSINESS_ID, machineId, items: [{ slotId: 'A01', productId: 'pkg-1', quantityNeeded: 5 }], actor: 'manager' });
      if (code !== 'SQ-T4') await restockTaskService.approve(BUSINESS_ID, taskId, 'manager');
      await technicianJobService.assign(BUSINESS_ID, { kind: 'restock', refId: taskId, assigneeUid: tech }, 'manager');
      tasks.push(taskId);
    }
    const statuses = async () => Promise.all(tasks.map(async (id) => (await restockTaskRepository.findById(BUSINESS_ID, id))?.status));

    expect(await technicianJobService.advanceTrip(BUSINESS_ID, tech, 'pack')).toEqual({ moved: 2 });
    expect(await statuses()).toEqual(['picking', 'picking', 'draft']);

    expect(await technicianJobService.advanceTrip(BUSINESS_ID, tech, 'leave')).toEqual({ moved: 2 });
    expect(await statuses()).toEqual(['in_transit', 'in_transit', 'draft']);
    const onTheWay = await restockTaskRepository.findById(BUSINESS_ID, tasks[0]);
    expect(onTheWay?.items[0].quantityDispatched).toBe(5);
    expect(onTheWay?.inTransitAt).toBeTruthy();

    // What the machine's owner sees: the rider by first name, and when they left.
    const visit = currentVisit([{ task: onTheWay!, riderName: 'Wanjiru Rider' }], new Date());
    expect(visit).toMatchObject({ stage: 'on_the_way', items: 5, riderFirstName: 'Wanjiru' });
    expect(visit?.at).toBe(onTheWay!.inTransitAt!.toDate().toISOString());

    await expect(technicianJobService.advanceTrip(BUSINESS_ID, tech, 'leave')).rejects.toThrow(TechnicianJobError);
  });
});
