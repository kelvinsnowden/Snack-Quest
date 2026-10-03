import type { Timestamp } from 'firebase/firestore';

/**
 * `machineFleetSummary/{machineId}` — the per-machine figures the fleet
 * table shows, stored so the table doesn't run four queries per machine
 * on every view (docs/ADMIN_AND_HARDWARE_CONTROL_AUDIT.md G-C9).
 * Refreshed nightly for every machine, and on view when older than
 * `FLEET_SUMMARY_MAX_AGE_MS` for the machines on the page shown.
 * Connectivity is never stored here: it comes from the machine's own
 * `lastSeenAt`, which changes with every heartbeat.
 */
export interface MachineFleetSummary {
  businessId: string;
  machineId: string;
  revenueKes7d: number;
  /** Switched-on slots with a product. */
  slotCount: number;
  /** Of those, how many have stock. */
  sellableCount: number;
  /** Slots paused after a jam or unknown vend. */
  pausedSlotCount: number;
  lastSaleAt: Timestamp | null;
  lastRestockAt: Timestamp | null;
  refreshedAt: Timestamp;
}
