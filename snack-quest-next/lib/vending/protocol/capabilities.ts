/**
 * The hardware capability model (§ D of
 * docs/HARDWARE_COMPATIBILITY_ARCHITECTURE.md — "capabilities must be
 * discoverable").
 *
 * Deliberately limited to capabilities something in this codebase can
 * already act on. `ota`/`display_control`/`refrigeration_control`/
 * `remote_restart` are named as future capabilities in that doc, not
 * included here — adding a capability nothing reads yet is the same
 * overbuilding the brief warns against, one layer up.
 */
export type HardwareCapability =
  | 'vend'
  | 'slot_read'
  | 'inventory_read'
  | 'inventory_write'
  | 'dispense_confirmation'
  | 'heartbeat'
  | 'telemetry'
  | 'faults'
  | 'temperature'
  | 'door_status'
  | 'remote_price_update'
  | 'remote_enable_disable'
  | 'audit_export';

export const ALL_HARDWARE_CAPABILITIES: readonly HardwareCapability[] = [
  'vend',
  'slot_read',
  'inventory_read',
  'inventory_write',
  'dispense_confirmation',
  'heartbeat',
  'telemetry',
  'faults',
  'temperature',
  'door_status',
  'remote_price_update',
  'remote_enable_disable',
  'audit_export',
];

/**
 * An absent key means "not declared", read as `false` by
 * `hasCapability` — the UI never has to distinguish "declared false"
 * from "not mentioned", which is a distinction with no useful meaning
 * to a person deciding whether to show a control.
 */
export type HardwareCapabilities = Partial<Record<HardwareCapability, boolean>>;

export function hasCapability(capabilities: HardwareCapabilities, capability: HardwareCapability): boolean {
  return capabilities[capability] === true;
}

/** Every declared method on `VendingHardwareAdapter` works — the reference full-capability set `MockVendingAdapter` reports. */
export const FULL_CAPABILITIES: HardwareCapabilities = Object.fromEntries(
  ALL_HARDWARE_CAPABILITIES.map((capability) => [capability, true]),
);

/** Nothing is wired yet — what an interface-conformant stub with no protocol behind it reports. */
export const NO_CAPABILITIES: HardwareCapabilities = Object.fromEntries(
  ALL_HARDWARE_CAPABILITIES.map((capability) => [capability, false]),
);
