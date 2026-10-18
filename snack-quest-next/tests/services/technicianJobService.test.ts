import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminAuth, adminFirestore } from '@/lib/firebase/admin';
import { userRepository } from '@/repositories/userRepository';
import { staffRepository } from '@/repositories/staffRepository';
import { machineService } from '@/services/machineService';
import { maintenanceService } from '@/services/maintenanceService';
import { maintenanceRepository } from '@/repositories/maintenanceRepository';
import { technicianJobService, TechnicianJobError } from '@/services/technicianJobService';

const BUSINESS_ID = 'biz-technicians';
const createdUids: string[] = [];

async function clean() {
  for (const name of ['users', 'staffProfiles', 'machines', 'maintenanceRequests', 'technicianJobs', 'deviceCredentials']) {
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
});
