/**
 * The camera capability model — the same declarative,
 * discovery-first pattern `lib/vending/protocol/capabilities.ts`
 * already uses for vending hardware, applied to a different device
 * class rather than folded into that same union. A camera is not a
 * `VendingHardwareAdapter` (it doesn't vend, has no slots), so a
 * parallel `CameraCapability` type — not a shared one — is the
 * cleaner extension of the existing *pattern*.
 *
 * Deliberately four capabilities, not the six the brief names as
 * candidates:
 *
 *   - `CAMERA_CAPTURE` and `CAMERA_SNAPSHOT` would be the same fact
 *     twice in this implementation (both mean "can this adapter
 *     produce one still image") — kept as `camera_snapshot` only,
 *     naming the one adapter method (`captureSnapshot`) it gates.
 *   - `CAMERA_RECORDING` is dropped entirely: `CameraAdapter` has no
 *     start/stop-recording method, because building one now — with
 *     no real camera, and the brief's own "do not build... complex
 *     video streaming infrastructure" instruction — would be exactly
 *     the capability-nothing-reads-yet overbuilding
 *     `lib/vending/protocol/capabilities.ts` already refuses to do
 *     for `ota`/`display_control`/`refrigeration_control`. Adding it
 *     back is a one-line change once a real recording method exists
 *     to gate.
 *
 * `connect`/`disconnect`/`getStatus` are not separately gated
 * capabilities — every registered `CameraAdapter` implements them
 * (throwing `CameraProtocolNotConfiguredError` if nothing is wired
 * behind an honest stub), the same "required, not optional" tier
 * `getMachineStatus`/`getSlots`/`getFaults` already occupy on
 * `VendingHardwareAdapter`.
 */
export type CameraCapability = 'camera' | 'camera_snapshot' | 'camera_stream' | 'camera_health';

export const ALL_CAMERA_CAPABILITIES: readonly CameraCapability[] = ['camera', 'camera_snapshot', 'camera_stream', 'camera_health'];

/** An absent key means "not declared" — read as `false` by `hasCameraCapability`, same convention as `HardwareCapabilities`. */
export type CameraCapabilities = Partial<Record<CameraCapability, boolean>>;

export function hasCameraCapability(capabilities: CameraCapabilities, capability: CameraCapability): boolean {
  return capabilities[capability] === true;
}

/** Every declared capability true — `MockCameraAdapter`'s own reference set. */
export const FULL_CAMERA_CAPABILITIES: CameraCapabilities = Object.fromEntries(ALL_CAMERA_CAPABILITIES.map((capability) => [capability, true]));

/** Nothing wired yet — what an honest, interface-conformant stub (`UsbCameraAdapter`/`RtspCameraAdapter`/`OnvifCameraAdapter` today) reports. */
export const NO_CAMERA_CAPABILITIES: CameraCapabilities = Object.fromEntries(ALL_CAMERA_CAPABILITIES.map((capability) => [capability, false]));

/**
 * The same four-way read `classifyCapabilityStatus` gives vending
 * hardware, for a camera adapter. `registered` — an adapter is
 * resolved for this `CameraType` at all; `protocolConfigured` — that
 * adapter's live methods actually work rather than throwing
 * `CameraProtocolNotConfiguredError`.
 */
export type CameraCapabilityStatus = 'supported' | 'not_supported' | 'unknown' | 'not_configured';

export function classifyCameraCapabilityStatus(
  capability: CameraCapability,
  context: { registered: boolean; protocolConfigured: boolean; capabilities: CameraCapabilities | null },
): CameraCapabilityStatus {
  if (!context.registered) {
    return 'unknown';
  }
  if (!context.protocolConfigured) {
    return 'not_configured';
  }
  return hasCameraCapability(context.capabilities ?? {}, capability) ? 'supported' : 'not_supported';
}
