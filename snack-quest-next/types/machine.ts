import type { Timestamp } from 'firebase/firestore';
import type { AuditFields } from './common';
import type { DispenseConfirmationStrategy } from '@/lib/vending/hardwareAdapter';

/**
 * `machines/{machineId}` — a physical Discovery Machine
 * (§ Discovery Machines, docs/FLEET_ARCHITECTURE_AUDIT.md §6).
 *
 * The machine is a distribution node, not the business — see the
 * investor deck's own framing. This is deliberately additive to the
 * existing e-commerce schema: `machineSlots` reference the *existing*
 * `packages`/`snackItems` catalogue (§ CORE ENTITIES 2 of the vending
 * brief), there is no second product catalogue, and nothing about
 * `orders`, `packages` or `paymentIntents` changes.
 *
 * A machine never writes here directly. Every field below is written
 * by a Service running under the Admin SDK, never by the device
 * itself — the device authenticates with a `deviceCredentials` secret
 * (`types/deviceCredential.ts`) scoped to exactly this one machine,
 * and everything it reports arrives as a request to a Route Handler,
 * gets validated, and is written server-side. See
 * `docs/ANALYTICS_ROLLUPS.md` for why this matters for the numbers
 * downstream: a machine's own claim is data to be checked, never a
 * fact to be trusted.
 */
export type MachineStatus =
  | 'provisioning'
  | 'installing'
  | 'testing'
  | 'active'
  | 'maintenance'
  | 'offline'
  | 'decommissioned';

/**
 * Reported connectivity, derived from `lastSeenAt` against a
 * configurable threshold rather than stored as its own independent
 * fact — see `lib/vending/connectivity.ts`. Kept on the type only as
 * the shape a read returns, never as a field a write sets directly.
 */
export type MachineConnectivityStatus = 'online' | 'stale' | 'offline' | 'unknown';

/**
 * The manufacturer's own machine identity — kept distinct from
 * Snack Quest's `machineCode` (§ hardware abstraction) because the
 * two outlive each other independently: a machine can be
 * decommissioned and its serial retired while `machineCode` stays
 * reserved in reporting history, and a manufacturer's serial format
 * is theirs to define, not ours to encode assumptions into.
 */
export interface Machine extends AuditFields {
  businessId: string;
  /** Snack Quest's own human-readable identifier — "SQ-M001" — stable for the machine's whole life, unlike a serial a manufacturer might reuse. */
  machineCode: string;
  serialNumber: string;
  /**
   * Which `VendingHardwareAdapter` this machine talks through
   * (§ hardware abstraction) — `'mock'` until a real manufacturer
   * integration exists. Never read to special-case behaviour outside
   * the adapter layer; the whole point of the abstraction is that
   * nothing above it needs to know.
   */
  manufacturer: 'mock' | 'shengma' | 'other';
  model: string;
  hardwareVersion: string | null;
  firmwareVersion: string | null;
  status: MachineStatus;
  /** Null until the machine is assigned to a partner-owned deployment (§ CORE ENTITIES 8) — Snack Quest's own machines have no partner. */
  ownerPartnerId: string | null;
  /** The current location — see `machineLocationHistory` for the record of every location this machine has held and when. */
  locationId: string | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  venueName: string | null;
  /** Null until the machine has actually been installed at a real site — set once, not touched by ordinary status changes. */
  installedAt: Timestamp | null;
  /** Last telemetry heartbeat received, written only by `machineTelemetryService` — never inferred from a transaction or any other event. */
  lastSeenAt: Timestamp | null;
  /**
   * The minimum inventory value (at cost) this machine should carry
   * (§ KSh 100,000 MACHINE STOCK BASELINE, docs/INVENTORY_ARCHITECTURE.md
   * §4). Null means "use the platform default" —
   * `machineInventoryReserveService.DEFAULT_RESERVE_TARGET_KES`
   * (100,000) — rather than every machine needing this field set
   * explicitly; a partner agreement that actually negotiates a
   * different baseline sets it here.
   */
  inventoryReserveTargetKes: number | null;
  /**
   * Which physical method this machine's hardware uses to confirm a
   * dispense (§ DISPENSE CONFIRMATION STRATEGIES,
   * `lib/vending/hardwareAdapter.ts`'s own doc comment on
   * `DispenseConfirmationStrategy` for why this is descriptive, not
   * yet behavior-changing). Null until staff record what the
   * physical machine actually uses — never guessed from the
   * manufacturer alone, since two machines from the same
   * manufacturer's line can ship with different sensors.
   */
  dispenseConfirmationStrategy: DispenseConfirmationStrategy | null;
}

/** Every status transition this machine may make, keyed by its current status — enforced by `machineService.updateStatus`, not left to the caller. */
export const MACHINE_STATUS_TRANSITIONS: Record<MachineStatus, MachineStatus[]> = {
  provisioning: ['installing', 'decommissioned'],
  installing: ['testing', 'provisioning', 'decommissioned'],
  testing: ['active', 'installing', 'decommissioned'],
  active: ['maintenance', 'offline', 'decommissioned'],
  maintenance: ['active', 'offline', 'decommissioned'],
  offline: ['active', 'maintenance', 'decommissioned'],
  decommissioned: [],
};
