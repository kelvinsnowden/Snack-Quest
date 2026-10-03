import type { Timestamp } from 'firebase/firestore';

/**
 * `machineOwnershipHistory/{entryId}` — who owned a machine, and when.
 *
 * `Machine.ownerPartnerId` is the current owner for a cheap read; this
 * collection is what lets a settlement check that one owner held the
 * machine for the whole period it covers, and what the owner portal
 * uses to hide a previous owner's sales from the new one.
 * `partnerId: null` means Snack Quest itself owned it. `effectiveTo:
 * null` marks the current entry; `machineService.reassignOwner` closes
 * it and opens the next in the same transaction as the machine update.
 */
export interface MachineOwnershipHistoryEntry {
  businessId: string;
  machineId: string;
  partnerId: string | null;
  effectiveFrom: Timestamp;
  /** Null while this is the machine's current owner. */
  effectiveTo: Timestamp | null;
  changedBy: string;
  reason: string | null;
}
