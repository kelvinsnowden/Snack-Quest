import type { Timestamp } from 'firebase/firestore';
import type { AuditFields } from './common';

/**
 * `restockTasks/{taskId}` — the restock workflow
 * (§ CORE ENTITIES 7, § RESTOCKING, docs/INVENTORY_ARCHITECTURE.md §5).
 *
 * Rebuilt from a flat 5-state model (`pending → assigned → in_progress
 * → completed`, or `cancelled`) into the fuller pick/dispatch/receive
 * chain a real warehouse-to-machine restock actually goes through.
 * Each stage records the one real-world fact that stage adds — who
 * picked it, who dispatched it, what actually arrived — rather than
 * one `assignedTo` field standing in for three different people.
 *
 * `IN_TRANSIT` splits into two outcomes on receipt: `RECEIVED` (every
 * item's `quantityReceived` matches what was dispatched) or
 * `PARTIALLY_RECEIVED` (at least one item came up short —
 * `RestockTaskItem.discrepancyQuantity` records exactly how much,
 * never silently absorbed into "close enough"). Both are terminal: a
 * genuine shortfall becomes a new task once someone acts on it, not a
 * reopened old one — the same "no half-finished-period bookkeeping"
 * discipline `docs/MACHINE_COMMERCE.md`'s subscription model already
 * commits to.
 *
 * Deliberately no route-planning fields yet
 * (docs/FLEET_ARCHITECTURE_AUDIT.md §23 sketches that as a Phase 2
 * concern, once there is more than one machine's worth of tasks to
 * plan a route across) — this is the task record a route planner
 * would consume, not the planner itself. `warehouseId` is a plain
 * reference, not a live draw against a real warehouse-inventory
 * ledger — no `InventoryLocation`/generalized inventory model exists
 * in code yet (docs/INVENTORY_ARCHITECTURE.md §3 designs it, doesn't
 * build it); building that integration is its own pass, not a rider
 * on this one.
 */
export type RestockTaskStatus =
  | 'draft'
  | 'approved'
  | 'picking'
  | 'dispatched'
  | 'in_transit'
  | 'received'
  | 'partially_received'
  | 'cancelled';

/** No transition out of a terminal state (`received`/`partially_received`/`cancelled`) — a real discrepancy or a lost shipment becomes a new task, never a reopened one. Cancellation is only offered while nothing has physically left a warehouse yet (`draft`/`approved`/`picking`/`dispatched`); once `in_transit`, the only honest outcomes are what actually arrived. */
export const RESTOCK_TASK_STATUS_TRANSITIONS: Record<RestockTaskStatus, RestockTaskStatus[]> = {
  draft: ['approved', 'cancelled'],
  approved: ['picking', 'cancelled'],
  picking: ['dispatched', 'cancelled'],
  dispatched: ['in_transit', 'cancelled'],
  in_transit: ['received', 'partially_received'],
  received: [],
  partially_received: [],
  cancelled: [],
};

export interface RestockTaskItem {
  slotId: string;
  productId: string | null;
  /** `capacity - currentQuantity` at the moment the task was created (or the staff-specified amount for a manual task); not re-derived later, so the task records what was actually planned for. */
  quantityNeeded: number;
  /** Set by `dispatch()` — what the dispatcher actually sent, which may differ from `quantityNeeded` (partial stock on hand, a deliberate top-up decision). Null before dispatch. */
  quantityDispatched: number | null;
  /** Set by `receive()` — what actually arrived at the machine. Null before receipt. */
  quantityReceived: number | null;
  /** `quantityDispatched - quantityReceived` once both are known; `0` when everything arrived, never left null once received to paper over a real shortfall. Null before receipt. */
  discrepancyQuantity: number | null;
  /** Lot/batch reference for this line, recorded at dispatch — descriptive, not a live draw against a batch-inventory ledger (see this type's own doc comment). Null until dispatched. */
  batchId: string | null;
  expiresAt: Timestamp | null;
}

export interface RestockTask extends AuditFields {
  businessId: string;
  machineId: string;
  /** Which warehouse this restock is sourced from — a plain reference, not a live inventory draw (see this type's own doc comment). Null for a task nobody has assigned a source to yet. */
  warehouseId: string | null;
  items: RestockTaskItem[];
  status: RestockTaskStatus;
  priority: 'low' | 'normal' | 'high';
  /** Who picked this task's items — set by `startPicking()`. Null before picking starts. */
  pickedBy: string | null;
  pickedAt: Timestamp | null;
  /** Who dispatched it — set by `dispatch()`. Null before dispatch. */
  dispatchedBy: string | null;
  dispatchedAt: Timestamp | null;
  /** Who confirmed receipt at the machine — set by `receive()`. Null before receipt. */
  receivedBy: string | null;
  /** Set once the task reaches any terminal state (`received`/`partially_received`/`cancelled`) — when, not which. */
  completedAt: Timestamp | null;
  /** Free text a receiver can attach when recording a discrepancy — why it happened, if known. Null unless a partial receipt actually needed one. */
  discrepancyNote: string | null;
  /** Free text — who created it and why, e.g. `"auto: slot A03 below 20%"` or a staff member's own note. */
  note: string | null;
}
