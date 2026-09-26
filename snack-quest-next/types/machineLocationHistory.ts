import type { Timestamp } from 'firebase/firestore';

/**
 * `machineLocationHistory/{entryId}` — every location a machine has
 * held and when (§ CORE ENTITIES 6, docs/FLEET_ARCHITECTURE_AUDIT.md
 * §6's location-history rationale).
 *
 * `Machine.locationId`/`latitude`/`longitude` hold the *current*
 * location for a cheap read; this collection is what makes a past
 * transaction attributable to where it actually happened when a
 * machine has since moved. `effectiveTo: null` marks the current,
 * still-open entry — `machineService.relocate()` closes it (sets
 * `effectiveTo`) and opens a new one in the same call, never leaving
 * two open entries for one machine.
 */
export interface MachineLocationHistoryEntry {
  businessId: string;
  machineId: string;
  locationId: string | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  venueName: string | null;
  effectiveFrom: Timestamp;
  /** Null while this is the machine's current location. */
  effectiveTo: Timestamp | null;
  movedBy: string;
  reason: string | null;
}
