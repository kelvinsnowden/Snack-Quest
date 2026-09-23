import type { Timestamp } from 'firebase/firestore';
import type { AuditFields } from './common';

/**
 * `restockTasks/{taskId}` — the low-stock/restock workflow
 * (§ CORE ENTITIES 7). Created automatically when a slot's
 * `currentQuantity` crosses below a threshold of its `capacity`
 * (`machineSlotService.checkLowStock`), or manually by staff.
 *
 * Deliberately no route-planning fields yet
 * (docs/FLEET_ARCHITECTURE_AUDIT.md §23 sketches that as a Phase 2
 * concern, once there is more than one machine's worth of tasks to
 * plan a route across) — this is the task record a route planner
 * would consume, not the planner itself.
 */
export type RestockTaskStatus = 'pending' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';

export interface RestockTaskItem {
  slotId: string;
  productId: string | null;
  /** How many units to bring — `capacity - currentQuantity` at the moment the task was created; not re-derived later, so completing the task records what was actually planned for. */
  quantityNeeded: number;
}

export interface RestockTask extends AuditFields {
  businessId: string;
  machineId: string;
  items: RestockTaskItem[];
  status: RestockTaskStatus;
  priority: 'low' | 'normal' | 'high';
  assignedTo: string | null;
  completedAt: Timestamp | null;
  /** Free text — who created it and why, e.g. `"auto: slot A03 below 20%"` or a staff member's own note. */
  note: string | null;
}
