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
  | 'audit_export'
  /** The machine has an integrated camera whose status the integration can relay. Streams/snapshots themselves stay in the separate camera subsystem (`lib/vending/camera`). */
  | 'camera'
  /** The machine has its own payment peripheral (card reader, cash/coin mech) whose health the integration reports. Customer payment itself is always Snack Quest's own flow. */
  | 'payment_device'
  /** Remote configuration beyond price/enable — e.g. slot capacity, display settings — pushed through the integration. */
  | 'remote_configuration';

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
  'camera',
  'payment_device',
  'remote_configuration',
];

/** Human labels for the admin UI and the external spec — the brief's DISPENSE/INVENTORY/HEALTH/… names map onto this one vocabulary rather than a second parallel set. */
export const HARDWARE_CAPABILITY_LABELS: Record<HardwareCapability, string> = {
  vend: 'Dispense',
  slot_read: 'Slot status',
  inventory_read: 'Inventory (read)',
  inventory_write: 'Inventory (write)',
  dispense_confirmation: 'Dispense confirmation',
  heartbeat: 'Heartbeat',
  telemetry: 'Telemetry',
  faults: 'Health / errors',
  temperature: 'Temperature',
  door_status: 'Door status',
  remote_price_update: 'Remote price update',
  remote_enable_disable: 'Remote slot enable/disable',
  remote_restart: 'Remote restart',
  audit_export: 'Audit export (DEX)',
  camera: 'Camera',
  payment_device: 'Payment device',
  remote_configuration: 'Remote configuration',
};

export function isHardwareCapability(value: unknown): value is HardwareCapability {
  return typeof value === 'string' && (ALL_HARDWARE_CAPABILITIES as readonly string[]).includes(value);
}

/**
 * What a specific machine can actually do: the model's physical
 * declaration intersected with what its integration adapter can
 * reach. Both must be true — a camera the hardware has but the
 * adapter can't talk to is not a usable capability, and an adapter
 * that could relay a temperature sensor the model doesn't have
 * reports nothing real. `modelDeclared === null` means no model is
 * registered for this machine yet (a pre-registry machine), so the
 * adapter's own declaration is the only signal available.
 */
export function effectiveCapabilities(
  adapterCapabilities: HardwareCapabilities,
  modelDeclared: readonly HardwareCapability[] | null,
): HardwareCapabilities {
  return Object.fromEntries(
    ALL_HARDWARE_CAPABILITIES.map((capability) => [
      capability,
      hasCapability(adapterCapabilities, capability) && (modelDeclared === null || modelDeclared.includes(capability)),
    ]),
  );
}

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
