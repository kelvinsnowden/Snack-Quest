import type { DispenseResultStatus } from './hardwareAdapter';
import { MACHINE_EVENT_TYPES, type MachineEventSeverity, type MachineEventType, type MachineTelemetryEventType } from '@/types';

/**
 * Pure event normalization (§ MACHINE EVENT SYSTEM) — every translation
 * from something a machine or integration said into Snack Quest's own
 * event vocabulary goes through here.
 */

export function isMachineEventType(value: unknown): value is MachineEventType {
  return typeof value === 'string' && (MACHINE_EVENT_TYPES as readonly string[]).includes(value);
}

/** A name from the external contract or an adapter's translation → our type. Anything unrecognised is `UNKNOWN_EVENT`, with the native name kept by the caller. */
export function normalizeEventType(raw: string): MachineEventType {
  const candidate = raw.trim().toUpperCase();
  return isMachineEventType(candidate) ? candidate : 'UNKNOWN_EVENT';
}

/** For names arriving from outside: platform-only types are never accepted from a machine — they're kept as UNKNOWN_EVENT with the native name. */
export function normalizeExternalEventType(raw: string): MachineEventType {
  const type = normalizeEventType(raw);
  return (PLATFORM_ONLY_EVENT_TYPES as readonly string[]).includes(type) ? 'UNKNOWN_EVENT' : type;
}

const TELEMETRY_TO_EVENT: Partial<Record<MachineTelemetryEventType, MachineEventType>> = {
  heartbeat: 'HEARTBEAT_RECEIVED',
  status: 'STATUS_REPORTED',
  fault: 'MACHINE_ERROR',
  temperature: 'TEMPERATURE_REPORTED',
  door_open: 'DOOR_OPENED',
  door_close: 'DOOR_CLOSED',
  connectivity_online: 'MACHINE_ONLINE',
  connectivity_offline: 'MACHINE_OFFLINE',
  stock_update: 'INVENTORY_REPORTED',
};

/** The legacy gateway channel's telemetry types → normalized events. `vend_result` has no entry: it flows through the dispense path, which emits its own event. */
export function eventTypeForTelemetry(type: MachineTelemetryEventType): MachineEventType | null {
  return TELEMETRY_TO_EVENT[type] ?? null;
}

export function eventTypeForDispenseResult(status: DispenseResultStatus): MachineEventType {
  return status === 'success' ? 'DISPENSE_SUCCESS' : 'DISPENSE_FAILED';
}

const SEVERITY: Record<MachineEventType, MachineEventSeverity> = {
  MACHINE_ONLINE: 'info',
  MACHINE_OFFLINE: 'warning',
  HEARTBEAT_RECEIVED: 'info',
  STATUS_REPORTED: 'info',
  DISPENSE_REQUESTED: 'info',
  DISPENSE_STARTED: 'info',
  DISPENSE_SUCCESS: 'info',
  DISPENSE_FAILED: 'warning',
  SLOT_EMPTY: 'warning',
  SLOT_LOW: 'info',
  INVENTORY_REPORTED: 'info',
  INVENTORY_MISMATCH: 'warning',
  MACHINE_ERROR: 'critical',
  TEMPERATURE_REPORTED: 'info',
  TEMPERATURE_ALERT: 'critical',
  DOOR_OPENED: 'info',
  DOOR_CLOSED: 'info',
  CAMERA_OFFLINE: 'warning',
  PAYMENT_DEVICE_ERROR: 'critical',
  DISPENSE_OUTCOME_CONFLICT: 'critical',
  FIRMWARE_CHANGED: 'warning',
  DISPENSE_UNRECOGNISED: 'warning',
  UNKNOWN_EVENT: 'info',
};

export function severityFor(type: MachineEventType): MachineEventSeverity {
  return SEVERITY[type];
}

/** Critical events that open an Alert Center alert when they arrive through the integration layer. */
export const ALERTING_EVENT_TYPES: readonly MachineEventType[] = ['MACHINE_ERROR', 'TEMPERATURE_ALERT', 'PAYMENT_DEVICE_ERROR', 'CAMERA_OFFLINE', 'INVENTORY_MISMATCH', 'DISPENSE_OUTCOME_CONFLICT', 'FIRMWARE_CHANGED', 'DISPENSE_UNRECOGNISED'];

/** Names only Snack Quest may emit — refused (kept as UNKNOWN_EVENT) when a machine or manufacturer sends them. */
export const PLATFORM_ONLY_EVENT_TYPES: readonly MachineEventType[] = ['DISPENSE_OUTCOME_CONFLICT', 'FIRMWARE_CHANGED', 'DISPENSE_UNRECOGNISED', 'INVENTORY_MISMATCH', 'DISPENSE_REQUESTED', 'DISPENSE_STARTED', 'DISPENSE_SUCCESS', 'DISPENSE_FAILED'];

/** A device clock is believed only within this much of server time — anything further out is a broken or unset clock, not a fact. */
const MAX_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;

/**
 * When an event happened: the machine's own timestamp if it parses and
 * is plausible (not in the future, not more than a day stale), else
 * Snack Quest's receipt time. A queued-while-offline event legitimately
 * arrives late with an earlier device time; a machine whose RTC reset
 * to 1970 does not get to rewrite history.
 */
export function resolveOccurredAt(deviceTimestamp: string | null | undefined, receivedAt: Date): Date {
  if (!deviceTimestamp) {
    return receivedAt;
  }
  const parsed = new Date(deviceTimestamp);
  if (Number.isNaN(parsed.getTime())) {
    return receivedAt;
  }
  const skew = receivedAt.getTime() - parsed.getTime();
  return skew < -60_000 || skew > MAX_CLOCK_SKEW_MS ? receivedAt : parsed;
}

/** Keeps event `data` small and safe: primitive values only, bounded strings, never nested structures from an untrusted payload. */
export function sanitizeEventData(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {};
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw).slice(0, 25)) {
    if (!/^[A-Za-z0-9_.-]{1,64}$/.test(key)) {
      continue;
    }
    if (typeof value === 'string') {
      out[key] = value.slice(0, 500);
    } else if ((typeof value === 'number' && Number.isFinite(value)) || typeof value === 'boolean' || value === null) {
      out[key] = value;
    }
  }
  return out;
}
