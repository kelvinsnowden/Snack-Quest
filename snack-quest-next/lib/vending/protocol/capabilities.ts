/**
 * The hardware capability model (§ D of
 * docs/HARDWARE_COMPATIBILITY_ARCHITECTURE.md — "capabilities must be
 * discoverable").
 *
 * Deliberately limited to capabilities something in this codebase can
 * already act on. `ota`/`display_control`/`refrigeration_control` are
 * named as future capabilities in that doc, not included here —
 * adding a capability nothing reads yet is the same overbuilding the
 * brief warns against, one layer up. `remote_restart` graduated out of
 * that deferred list once the remote command center gave it a real
 * reader (`machineCommandService.issueCommand`'s own capability gate).
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
  | 'remote_restart'
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
  'remote_restart',
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

/**
 * The UI's own four-way read of one capability (§ hardware abstraction:
 * "UI must distinguish SUPPORTED / NOT_SUPPORTED / UNKNOWN /
 * NOT_CONFIGURED"). Deliberately built from signals this codebase
 * already has rather than a new per-capability field nothing else
 * would ever set:
 *
 * - `UNKNOWN` — the manufacturer has no adapter registered at all
 *   (`defaultVendingAdapterResolver` threw `UnsupportedManufacturerError`).
 *   Nothing is known about this hardware, not even by declaration.
 * - `NOT_CONFIGURED` — an adapter exists for the manufacturer, but no
 *   protocol is actually wired behind it yet (`ShengmaAdapter`'s own
 *   stub pattern: every live call throws `ProtocolNotConfiguredError`).
 *   `capabilities()` on a stub like that returns `NO_CAPABILITIES` —
 *   every key `false` — but that `false` is not a real decision about
 *   the hardware, so it must not read as `NOT_SUPPORTED`.
 * - `SUPPORTED` / `NOT_SUPPORTED` — a real adapter with a real protocol
 *   configured (`live.ok`) whose `capabilities()` declares `true`/`false`
 *   for this specific capability — a decision actually made, not
 *   inferred.
 */
export type CapabilityStatus = 'supported' | 'not_supported' | 'unknown' | 'not_configured';

export function classifyCapabilityStatus(
  capability: HardwareCapability,
  context: { registered: boolean; protocolConfigured: boolean; capabilities: HardwareCapabilities | null },
): CapabilityStatus {
  if (!context.registered) {
    return 'unknown';
  }
  if (!context.protocolConfigured) {
    return 'not_configured';
  }
  return hasCapability(context.capabilities ?? {}, capability) ? 'supported' : 'not_supported';
}

/** Every declared method on `VendingHardwareAdapter` works — the reference full-capability set `MockVendingAdapter` reports. */
export const FULL_CAPABILITIES: HardwareCapabilities = Object.fromEntries(
  ALL_HARDWARE_CAPABILITIES.map((capability) => [capability, true]),
);

/** Nothing is wired yet — what an interface-conformant stub with no protocol behind it reports. */
export const NO_CAPABILITIES: HardwareCapabilities = Object.fromEntries(
  ALL_HARDWARE_CAPABILITIES.map((capability) => [capability, false]),
);
