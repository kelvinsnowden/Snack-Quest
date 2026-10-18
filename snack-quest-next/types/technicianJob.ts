import type { Timestamp } from 'firebase/firestore';

/**
 * `technicianJobs/{kind}_{refId}` — a restock or a maintenance visit
 * given to one person (§ F4 technicians), with the on-site checklist
 * they tick on their phone. One job per task: reassigning changes the
 * person, keeps the ticks. The task itself (restock stages, maintenance
 * status) stays where it always was; this only says who goes and what
 * they checked.
 */
export type TechnicianJobKind = 'maintenance' | 'restock';
export type TechnicianJobStatus = 'assigned' | 'done' | 'unassigned';

export interface TechnicianChecklistItem {
  label: string;
  done: boolean;
  doneAt: Timestamp | null;
  doneBy: string | null;
}

export interface TechnicianJob {
  businessId: string;
  kind: TechnicianJobKind;
  refId: string;
  machineId: string;
  assigneeUid: string | null;
  assigneeName: string | null;
  status: TechnicianJobStatus;
  checklist: TechnicianChecklistItem[];
  /** What the technician wrote when finishing. */
  note: string | null;
  assignedBy: string;
  assignedAt: Timestamp;
  completedAt: Timestamp | null;
  completedBy: string | null;
}
