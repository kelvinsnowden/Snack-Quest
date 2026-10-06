import type { Timestamp } from 'firebase/firestore';

/**
 * Machine maintenance (§ MAINTENANCE): problems reported on a machine
 * (`maintenanceRequests`) and what fixing machines cost (`maintenanceCosts`).
 *
 * A request can come from the machine's owner (Owner Portal) or from staff.
 * A cost is recorded by staff, optionally against a request, and says who
 * bore it. Costs are never edited or deleted: a wrong one is voided with a
 * reason, so every figure a P&L ever showed can be traced back.
 */

export const MAINTENANCE_REQUEST_CATEGORIES = ['not_dispensing', 'payment', 'screen', 'cooling', 'power', 'damage', 'cleaning', 'other'] as const;
export type MaintenanceRequestCategory = (typeof MAINTENANCE_REQUEST_CATEGORIES)[number];

export const MAINTENANCE_REQUEST_CATEGORY_LABEL: Record<MaintenanceRequestCategory, string> = {
  not_dispensing: 'Not dispensing',
  payment: 'Payment problem',
  screen: 'Screen problem',
  cooling: 'Cooling',
  power: 'Power',
  damage: 'Damage',
  cleaning: 'Needs cleaning',
  other: 'Something else',
};

export const MAINTENANCE_URGENCIES = ['normal', 'urgent'] as const;
export type MaintenanceUrgency = (typeof MAINTENANCE_URGENCIES)[number];

export const MAINTENANCE_REQUEST_STATUSES = ['open', 'acknowledged', 'scheduled', 'resolved', 'cancelled'] as const;
export type MaintenanceRequestStatus = (typeof MAINTENANCE_REQUEST_STATUSES)[number];

export const MAINTENANCE_REQUEST_STATUS_LABEL: Record<MaintenanceRequestStatus, string> = {
  open: 'Reported',
  acknowledged: 'Seen by Snack Quest',
  scheduled: 'Visit scheduled',
  resolved: 'Fixed',
  cancelled: 'Cancelled',
};

/** Where a request may go next. `resolved` and `cancelled` are final. */
export const MAINTENANCE_REQUEST_TRANSITIONS: Record<MaintenanceRequestStatus, readonly MaintenanceRequestStatus[]> = {
  open: ['acknowledged', 'scheduled', 'resolved', 'cancelled'],
  acknowledged: ['scheduled', 'resolved', 'cancelled'],
  scheduled: ['acknowledged', 'resolved', 'cancelled'],
  resolved: [],
  cancelled: [],
};

export interface MaintenanceRequestUpdate {
  at: Timestamp;
  by: string;
  byKind: 'owner' | 'staff';
  status: MaintenanceRequestStatus;
  note: string | null;
}

/** `maintenanceRequests/{id}` */
export interface MaintenanceRequest {
  businessId: string;
  machineId: string;
  /** The machine's owner when the request was raised; null for a Snack Quest machine. An owner sees only requests carrying their own id. */
  partnerId: string | null;
  raisedBy: { kind: 'owner' | 'staff'; uid: string };
  category: MaintenanceRequestCategory;
  urgency: MaintenanceUrgency;
  description: string;
  status: MaintenanceRequestStatus;
  /** Nairobi date of a planned visit, `YYYY-MM-DD`. */
  scheduledFor: string | null;
  /** What was done, written when the request is resolved or cancelled. */
  resolution: string | null;
  /** Every status change, oldest first. */
  updates: MaintenanceRequestUpdate[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  closedAt: Timestamp | null;
}

export const MAINTENANCE_COST_CATEGORIES = ['repair', 'parts', 'service_visit', 'cleaning', 'transport', 'other'] as const;
export type MaintenanceCostCategory = (typeof MAINTENANCE_COST_CATEGORIES)[number];

export const MAINTENANCE_COST_CATEGORY_LABEL: Record<MaintenanceCostCategory, string> = {
  repair: 'Repair',
  parts: 'Parts',
  service_visit: 'Service visit',
  cleaning: 'Cleaning',
  transport: 'Transport',
  other: 'Other',
};

/** Who bore a maintenance cost. */
export const MAINTENANCE_PAYERS = ['snack_quest', 'owner'] as const;
export type MaintenancePayer = (typeof MAINTENANCE_PAYERS)[number];

/** `maintenanceCosts/{id}` */
export interface MaintenanceCost {
  businessId: string;
  machineId: string;
  /** The machine's owner on the day of the cost; null for a Snack Quest machine. */
  partnerId: string | null;
  requestId: string | null;
  /** Nairobi date the cost was incurred, `YYYY-MM-DD`. The P&L counts it in the period containing this date. */
  occurredOn: string;
  category: MaintenanceCostCategory;
  description: string;
  /** Whole shillings, more than zero. */
  amountKes: number;
  paidBy: MaintenancePayer;
  vendor: string | null;
  createdBy: string;
  createdAt: Timestamp;
  /** Set when the cost was recorded in error. A voided cost counts nowhere. */
  voided: { at: Timestamp; by: string; reason: string } | null;
}

/** The largest single cost accepted, so a typo of extra zeros is refused rather than booked. */
export const MAX_MAINTENANCE_COST_KES = 1_000_000;
