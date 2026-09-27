import type { Timestamp } from 'firebase/firestore';

/**
 * Snack Quest's own machine event vocabulary (§ MACHINE EVENT SYSTEM).
 * Every manufacturer's native events are translated into these at the
 * integration boundary — by an adapter's parser, or by a manufacturer
 * sending these names directly through the v1 Machine API — so
 * analytics, alerts and the admin console only ever see one language.
 *
 * `UNKNOWN_EVENT` is where a native event with no translation lands:
 * recorded with its native name preserved, never dropped and never
 * guessed into a type it might not be.
 */
export const MACHINE_EVENT_TYPES = [
  'MACHINE_ONLINE',
  'MACHINE_OFFLINE',
  'HEARTBEAT_RECEIVED',
  'STATUS_REPORTED',
  'DISPENSE_REQUESTED',
  'DISPENSE_STARTED',
  'DISPENSE_SUCCESS',
  'DISPENSE_FAILED',
  'SLOT_EMPTY',
  'SLOT_LOW',
  'INVENTORY_REPORTED',
  'INVENTORY_MISMATCH',
  'MACHINE_ERROR',
  'TEMPERATURE_REPORTED',
  'TEMPERATURE_ALERT',
  'DOOR_OPENED',
  'DOOR_CLOSED',
  'CAMERA_OFFLINE',
  'PAYMENT_DEVICE_ERROR',
  'UNKNOWN_EVENT',
] as const;

export type MachineEventType = (typeof MACHINE_EVENT_TYPES)[number];

export type MachineEventSeverity = 'info' | 'warning' | 'critical';

/** Where an event entered Snack Quest — lets analytics separate what a machine claimed from what Snack Quest itself did. */
export type MachineEventSource = 'v1_api' | 'webhook' | 'telemetry' | 'dispense_ledger' | 'inventory_sync' | 'system';

/**
 * `machineEvents/{id}` — the normalized, append-only event stream every
 * machine feeds, whatever its manufacturer. Denormalizes the
 * manufacturer and model at write time so reliability questions
 * ("which models jam most?") are answerable from this collection alone.
 *
 * Distinct from `machineTelemetryEvents`, which stays the verbatim raw
 * landing zone for the legacy gateway channel. This is the translated
 * stream; the raw payload that produced an event is never needed to
 * read it.
 */
export interface MachineEvent {
  businessId: string;
  machineId: string;
  machineCode: string;
  manufacturerId: string | null;
  modelId: string | null;
  type: MachineEventType;
  severity: MachineEventSeverity;
  /** When it happened by the machine's clock, if the machine gave a plausible one; otherwise when Snack Quest received it. */
  occurredAt: Timestamp;
  receivedAt: Timestamp;
  source: MachineEventSource;
  /** Snack Quest slot code, already translated from the manufacturer's slot name. */
  slotCode: string | null;
  /** The manufacturer's own name for this event, kept for audit and for translating `UNKNOWN_EVENT`s later. */
  nativeType: string | null;
  /** Small, normalized detail — codes, quantities, temperatures. Never a credential, never a full raw payload. */
  data: Record<string, unknown>;
  /** Per-machine uniqueness key — a redelivered event lands on the same document and is ignored. */
  dedupeKey: string;
}
