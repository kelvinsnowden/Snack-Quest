import type { Timestamp } from 'firebase/firestore';
import type { AuditFields } from './common';

/**
 * `cameras/{cameraId}` — CAMERA COMPATIBILITY (this pass). A camera is
 * its own document, referencing `machineId`, not a field on `Machine`
 * — a machine can carry zero, one, or several cameras (a dispense-area
 * cam and a door cam are two different physical devices with two
 * different connection configs and two different health states), the
 * same "own collection, referenced by machineId" shape `MachineSlot`
 * already uses for exactly the same reason.
 *
 * This is deliberately **operational hardware compatibility, not a
 * vision system**: nothing in this type, the adapter interface built
 * alongside it, or any service reading it interprets image content.
 * A camera exists so a snapshot can later be looked at by a person or
 * — in real future work, not this pass — a computer-vision model; it
 * never decides anything about a vend, a customer, or a product on
 * its own.
 */
export type CameraType = 'usb' | 'ip' | 'rtsp' | 'onvif' | 'manufacturer_specific' | 'mock';

/**
 * The four-way admin-configuration lifecycle (§ CAMERA CONFIGURATION).
 * Enforced by `CAMERA_STATUS_TRANSITIONS` below plus one extra
 * business rule `cameraService.activateCamera` checks beyond the raw
 * enum: a camera may only reach `active` from `configured` **and**
 * only when its most recent test recorded `lastHealthOk: true` —
 * saving a configuration, or even a successful `testConnection` call,
 * never activates a camera by itself. The same two-gate discipline
 * `machineSettlementService.finalize` already uses (a status check
 * *and* a business condition, not the status check alone).
 */
export type CameraStatus = 'not_configured' | 'configured' | 'testing' | 'active' | 'error' | 'disabled';

/** Whether the last attempt to reach the camera actually succeeded — independent of `CameraStatus`, which is the admin *configuration* lifecycle, not a live reachability reading. */
export type CameraConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export const CAMERA_STATUS_TRANSITIONS: Record<CameraStatus, CameraStatus[]> = {
  not_configured: ['configured'],
  // `active` is a legal raw target from `configured` — the table
  // only says which status VALUES are reachable, never the extra
  // business condition. `cameraService.activateCamera` is what
  // actually enforces "only after a passing test"
  // (`lastHealthOk === true`), the same two-gate discipline
  // `machineSettlementService.finalize` already uses (a status check
  // *and* a business condition, neither alone).
  configured: ['testing', 'active', 'disabled'],
  // A test always resolves back to `configured` — never straight to
  // `active` on its own; `activateCamera` is still the only path
  // there, and only once it re-checks `lastHealthOk`.
  testing: ['configured'],
  active: ['disabled', 'error'],
  error: ['configured', 'disabled'],
  disabled: ['configured'],
};

/**
 * Connection details for reaching the physical/network camera.
 * `passwordEncrypted`/`apiKeyEncrypted` are ciphertext at rest via
 * `lib/secrets/secretCipher.ts` — the same envelope-encryption
 * primitive `businessIntegrationSecretRepository` already uses for
 * third-party API credentials, applied here because a camera
 * connection secret has the same requirement (must be *decryptable*
 * to actually connect, so a one-way hash — the device-credential
 * pattern — is the wrong tool). Never returned by an API response;
 * `serializeCamera` (`lib/vending/serialize.ts`) omits this field
 * entirely rather than masking it.
 */
export interface CameraConnectionConfig {
  host: string | null;
  port: number | null;
  /** RTSP/ONVIF stream path, e.g. `/stream1` — never a full URI with embedded credentials. */
  streamPath: string | null;
  username: string | null;
  passwordEncrypted: string | null;
  apiKeyEncrypted: string | null;
  /** ONVIF's own media-profile identifier, when the camera exposes one. */
  onvifProfileToken: string | null;
}

export const EMPTY_CAMERA_CONNECTION: CameraConnectionConfig = {
  host: null,
  port: null,
  streamPath: null,
  username: null,
  passwordEncrypted: null,
  apiKeyEncrypted: null,
  onvifProfileToken: null,
};

export interface Camera extends AuditFields {
  businessId: string;
  machineId: string;
  type: CameraType;
  /** Free text — this codebase does not maintain a closed manufacturer list for cameras the way it does for vending hardware (`Machine.manufacturer`), since no manufacturer-specific camera adapter exists yet (§ CAMERA ADAPTER REGISTRY). */
  manufacturer: string | null;
  model: string | null;
  /** Not every camera exposes one — never assumed present (§ CAMERA TYPES: "Do not assume all cameras provide serial numbers"). */
  serialNumber: string | null;
  /** Staff-assigned, e.g. "Dispense area", "Door" — how one machine's several cameras are told apart in the admin UI. */
  label: string;
  connection: CameraConnectionConfig;
  status: CameraStatus;
  connectionState: CameraConnectionState;
  lastSeenAt: Timestamp | null;
  lastHealthCheckAt: Timestamp | null;
  lastHealthOk: boolean | null;
  lastErrorMessage: string | null;
  lastSnapshotAt: Timestamp | null;
}
