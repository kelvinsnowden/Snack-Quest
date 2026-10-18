import 'server-only';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { maintenanceRepository } from '@/repositories/maintenanceRepository';
import { restockTaskRepository } from '@/repositories/restockTaskRepository';
import { staffManagementService } from '@/services/staffManagementService';
import { maintenanceService } from '@/services/maintenanceService';
import { restockTaskService } from '@/services/restockTaskService';
import { defaultChecklist } from '@/lib/vending/technicianChecklist';
import type { TechnicianJob, TechnicianJobKind } from '@/types';

const COLLECTION = 'technicianJobs';

export class TechnicianJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TechnicianJobError';
  }
}

export interface Technician {
  uid: string;
  name: string;
  /** What they can be given. */
  kinds: TechnicianJobKind[];
}

const jobId = (kind: TechnicianJobKind, refId: string) => `${kind}_${refId}`;
const OPEN_RESTOCK = new Set(['draft', 'approved', 'picking', 'dispatched', 'in_transit']);
const OPEN_MAINTENANCE = new Set(['open', 'acknowledged', 'scheduled']);

/**
 * Who goes to which machine (§ F4). A technician is anyone who can work
 * maintenance (`maintenance.manage`) or restocks (`restock.execute`); no
 * separate account type.
 */
class TechnicianJobService {
  async listTechnicians(businessId: string): Promise<Technician[]> {
    const staff = await staffManagementService.listStaff(businessId);
    return staff
      .filter((member) => !member.disabled)
      .map((member) => ({
        uid: member.uid,
        name: member.displayName !== 'Unknown' ? member.displayName : member.email,
        kinds: [
          ...(member.effectivePermissions.includes('maintenance.manage') ? (['maintenance'] as const) : []),
          ...(member.effectivePermissions.includes('restock.execute') ? (['restock'] as const) : []),
        ],
      }))
      .filter((member) => member.kinds.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Gives a task to a person (or takes it away with `assigneeUid: null`). The checklist is made on first assignment and kept after. */
  async assign(businessId: string, input: { kind: TechnicianJobKind; refId: string; assigneeUid: string | null }, actor: string): Promise<void> {
    const { machineId, category, open } = await this.task(businessId, input.kind, input.refId);
    if (!open) throw new TechnicianJobError('That task is already finished.');
    let assigneeName: string | null = null;
    if (input.assigneeUid) {
      const technician = (await this.listTechnicians(businessId)).find((candidate) => candidate.uid === input.assigneeUid);
      if (!technician || !technician.kinds.includes(input.kind)) throw new TechnicianJobError(`That person can’t take ${input.kind === 'restock' ? 'restocks' : 'maintenance visits'}.`);
      assigneeName = technician.name;
    }
    const ref = adminFirestore.collection(COLLECTION).doc(jobId(input.kind, input.refId));
    await adminFirestore.runTransaction(async (tx) => {
      const existing = (await tx.get(ref)).data() as TechnicianJob | undefined;
      tx.set(ref, {
        businessId,
        kind: input.kind,
        refId: input.refId,
        machineId,
        assigneeUid: input.assigneeUid,
        assigneeName,
        status: input.assigneeUid ? 'assigned' : 'unassigned',
        checklist: existing?.checklist ?? defaultChecklist(input.kind, category).map((label) => ({ label, done: false, doneAt: null, doneBy: null })),
        note: existing?.note ?? null,
        assignedBy: actor,
        assignedAt: FieldValue.serverTimestamp(),
        completedAt: null,
        completedBy: null,
      });
    });
  }

  async find(businessId: string, id: string): Promise<(TechnicianJob & { id: string }) | null> {
    const data = (await adminFirestore.collection(COLLECTION).doc(id).get()).data() as TechnicianJob | undefined;
    return data && data.businessId === businessId ? { id, ...data } : null;
  }

  /** Every job given to this person that is still to do, oldest first. Jobs whose task finished some other way drop off. */
  async listMine(businessId: string, uid: string): Promise<(TechnicianJob & { id: string })[]> {
    const snapshot = await adminFirestore.collection(COLLECTION).where('assigneeUid', '==', uid).get();
    const jobs = snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as TechnicianJob) })).filter((job) => job.businessId === businessId && job.status === 'assigned');
    const stillOpen = await Promise.all(jobs.map(async (job) => (await this.task(businessId, job.kind, job.refId).catch(() => null))?.open ?? false));
    return jobs.filter((_, index) => stillOpen[index]).sort((a, b) => (a.assignedAt?.toMillis() ?? 0) - (b.assignedAt?.toMillis() ?? 0));
  }

  /** Jobs for many tasks at once, for the assignment page. */
  async listForBusiness(businessId: string): Promise<(TechnicianJob & { id: string })[]> {
    const snapshot = await adminFirestore.collection(COLLECTION).where('businessId', '==', businessId).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as TechnicianJob) }));
  }

  /** Ticks or unticks one checklist item. Only the person it's assigned to, unless `canManage`. */
  async tick(businessId: string, id: string, index: number, done: boolean, uid: string, canManage: boolean): Promise<void> {
    const ref = adminFirestore.collection(COLLECTION).doc(id);
    await adminFirestore.runTransaction(async (tx) => {
      const job = (await tx.get(ref)).data() as TechnicianJob | undefined;
      if (!job || job.businessId !== businessId) throw new TechnicianJobError('That job no longer exists.');
      if (job.assigneeUid !== uid && !canManage) throw new TechnicianJobError('This job is someone else’s.');
      if (job.status !== 'assigned') throw new TechnicianJobError('This job is closed.');
      if (!Number.isInteger(index) || !job.checklist[index]) throw new TechnicianJobError('No such checklist item.');
      const checklist = job.checklist.map((item, at) => (at === index ? { ...item, done, doneAt: done ? Timestamp.now() : null, doneBy: done ? uid : null } : item));
      tx.update(ref, { checklist });
    });
  }

  /**
   * Finishes the visit. Anything left unticked needs a note saying why.
   * For a maintenance job, `fixed: true` also resolves the request with
   * the note — the same as resolving it from the maintenance page.
   * For a restock job, `loaded` is what went into each slot: it is
   * recorded as the restock's receipt (which adds the stock, and marks
   * any shortfall), so loading the machine and finishing the job are one
   * step for the technician.
   */
  async complete(
    businessId: string,
    id: string,
    input: { note: string; fixed?: boolean; loaded?: { slotId: string; quantity: number }[] },
    uid: string,
    canManage: boolean,
  ): Promise<void> {
    const job = await this.find(businessId, id);
    if (!job) throw new TechnicianJobError('That job no longer exists.');
    if (job.assigneeUid !== uid && !canManage) throw new TechnicianJobError('This job is someone else’s.');
    if (job.status !== 'assigned') throw new TechnicianJobError('This job is already closed.');
    const note = input.note.trim();
    const missing = job.checklist.filter((item) => !item.done);
    if (missing.length > 0 && note.length < 3) throw new TechnicianJobError(`Say why ${missing.length} item(s) weren’t done.`);
    if (job.kind === 'restock') {
      const task = await restockTaskRepository.findById(businessId, job.refId);
      if (!task) throw new TechnicianJobError('That restock doesn’t exist.');
      if (task.status !== 'in_transit') throw new TechnicianJobError('Tap “On my way” first, then load the machine and finish.');
      if (!input.loaded || input.loaded.length === 0) throw new TechnicianJobError('Say how many went into each slot.');
      await restockTaskService.receive(
        businessId,
        job.refId,
        uid,
        input.loaded.map((line) => ({ slotId: line.slotId, quantityReceived: line.quantity })),
        note || null,
      );
    }
    if (job.kind === 'maintenance' && input.fixed) {
      await maintenanceService.updateByStaff(businessId, job.refId, uid, { status: 'resolved', resolution: note || 'Fixed on a technician visit; every checklist item done.' });
    }
    await adminFirestore.collection(COLLECTION).doc(id).update({ status: 'done', note: note || null, completedAt: FieldValue.serverTimestamp(), completedBy: uid });
  }

  private async task(businessId: string, kind: TechnicianJobKind, refId: string) {
    if (kind === 'maintenance') {
      const request = await maintenanceRepository.findRequest(businessId, refId);
      if (!request) throw new TechnicianJobError('That maintenance request doesn’t exist.');
      return { machineId: request.machineId, category: request.category, open: OPEN_MAINTENANCE.has(request.status) };
    }
    const task = await restockTaskRepository.findById(businessId, refId);
    if (!task) throw new TechnicianJobError('That restock doesn’t exist.');
    return { machineId: task.machineId, category: null, open: OPEN_RESTOCK.has(task.status) };
  }
}

export const technicianJobService = new TechnicianJobService();
