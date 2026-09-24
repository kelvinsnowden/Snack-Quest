/**
 * The camera hardware abstraction (§ CAMERA COMPATIBILITY). Same
 * shape and same reasoning as `lib/vending/hardwareAdapter.ts`'s
 * `VendingHardwareAdapter`: the business layer (`cameraService`) and
 * every route/admin-UI reader depend only on `CameraAdapter`, never
 * on a concrete USB/RTSP/ONVIF/manufacturer class directly — a real
 * manufacturer-specific camera adapter drops in later beside
 * `MockCameraAdapter` without touching anything above this file.
 *
 * Every method is stateless per call — there is no persistent
 * connection held between requests, because there is no long-running
 * process in this codebase to hold one (§ GATEWAY PREPARATION: the
 * same reason `VendingHardwareAdapter`'s own methods are each an
 * independent round trip rather than a session). `connect`/
 * `disconnect` exist as their own pair specifically for the admin
 * "Test connection" action (§ CAMERA CONFIGURATION) — proving
 * reachability without requiring a snapshot or a health check to do
 * it — not because a real adapter is expected to hold a socket open
 * across calls.
 *
 * **This interface is the transport boundary the brief asks for**
 * (§ GATEWAY PREPARATION: "the cloud should not directly depend on a
 * physical USB device"). Nothing in `cameraService` or any route
 * imports a USB/RTSP/ONVIF library — every real I/O concern is
 * behind whichever adapter a `CameraType` resolves to, exactly the
 * same boundary `VendingHardwareAdapter` already draws for vending
 * hardware. A future gateway process changes what runs *behind* an
 * adapter (a real device on a LAN instead of nothing), never the
 * interface itself.
 */

import type { CameraCapabilities } from './capabilities';

/** Decrypted, in-memory-only connection details — never persisted this way. `cameraService` decrypts `Camera.connection` immediately before calling an adapter and lets this value go out of scope right after. */
export interface DecryptedCameraConnection {
  host: string | null;
  port: number | null;
  streamPath: string | null;
  username: string | null;
  password: string | null;
  apiKey: string | null;
  onvifProfileToken: string | null;
}

export interface CameraStatusReport {
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'error';
  reportedAt: string;
}

export interface CameraSnapshotCaptureResult {
  ok: boolean;
  /** Raw captured bytes, only when `ok` — `cameraService` hands these to a `SnapshotStorageAdapter`; this method never writes storage itself. */
  data: Uint8Array | null;
  /** A real content type when known (e.g. `image/jpeg`) — never guessed. */
  contentType: string | null;
  error: string | null;
}

/**
 * Connection information for a client that would view the live feed
 * — deliberately **never an authenticated URI** (§ SECURITY: "Do not
 * expose... private URLs"). A real gateway process, once one exists,
 * is the thing that would actually hold credentials and open a
 * stream; nothing in this codebase today plays that role, so this
 * type carries only what's safe to return from a staff-facing API:
 * enough to know a stream exists and roughly how to reach it, never
 * enough to connect without also holding the camera's own secret.
 */
export interface CameraStreamInfo {
  available: boolean;
  protocol: 'rtsp' | 'http' | 'onvif' | null;
  host: string | null;
  port: number | null;
  streamPath: string | null;
}

export interface CameraHealthCheckResult {
  ok: boolean;
  checkedAt: string;
  error: string | null;
}

export class CameraProtocolNotConfiguredError extends Error {
  constructor(adapterType: string, action: string) {
    super(
      `${adapterType} camera adapter has no protocol configured for "${action}" — see lib/vending/camera/cameraProtocolRegistry.ts for what is implemented, planned, or blocked on manufacturer documentation.`,
    );
    this.name = 'CameraProtocolNotConfiguredError';
  }
}

/** A real adapter's own timeout, thrown rather than left to hang — `cameraService` catches this the same way it catches any other adapter failure: the operation is recorded as failed, never silently retried into a false success. */
export class CameraOperationTimeoutError extends Error {
  constructor(adapterType: string, action: string) {
    super(`${adapterType} camera adapter timed out attempting "${action}".`);
    this.name = 'CameraOperationTimeoutError';
  }
}

export class CameraCapabilityNotSupportedError extends Error {
  constructor(adapterType: string, capability: string) {
    super(`${adapterType} camera adapter does not declare support for "${capability}" — this action was never attempted.`);
    this.name = 'CameraCapabilityNotSupportedError';
  }
}

export interface CameraAdapter {
  readonly adapterType: string;

  /** Never throws — discoverability is unconditional, even for an unwired stub. Mirrors `VendingHardwareAdapter.capabilities()` exactly. */
  capabilities(): CameraCapabilities;

  /** Proves reachability for the admin "Test connection" action — opens and immediately releases whatever a real adapter would need to open. */
  connect(cameraId: string, connection: DecryptedCameraConnection): Promise<void>;
  disconnect(cameraId: string, connection: DecryptedCameraConnection): Promise<void>;
  getStatus(cameraId: string, connection: DecryptedCameraConnection): Promise<CameraStatusReport>;

  /**
   * Requires `camera_snapshot`. Returns raw bytes for the caller to
   * persist — this method never touches storage, and never touches
   * a `MachineTransaction` (§ DISPENSE EVIDENCE: a camera never
   * decides a vend's outcome).
   */
  captureSnapshot(cameraId: string, connection: DecryptedCameraConnection): Promise<CameraSnapshotCaptureResult>;

  /** Requires `camera_stream`. */
  getStreamInfo(cameraId: string, connection: DecryptedCameraConnection): Promise<CameraStreamInfo>;

  /** Requires `camera_health`. A richer check than `getStatus` — real adapters may verify more than raw reachability (e.g. that frames are actually flowing). */
  healthCheck(cameraId: string, connection: DecryptedCameraConnection): Promise<CameraHealthCheckResult>;
}
