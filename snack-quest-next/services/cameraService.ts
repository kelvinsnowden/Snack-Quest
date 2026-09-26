import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { machineRepository, MachineNotFoundError } from '@/repositories/machineRepository';
import { cameraRepository, CameraNotFoundError, IllegalCameraTransitionError } from '@/repositories/cameraRepository';
import { cameraSnapshotRepository } from '@/repositories/cameraSnapshotRepository';
import { encryptSecret, decryptSecret } from '@/lib/secrets/secretCipher';
import {
  defaultCameraAdapterResolver,
  UnsupportedCameraTypeError,
  type CameraAdapterResolver,
} from '@/lib/vending/camera/cameraAdapterRegistry';
import {
  CameraOperationTimeoutError,
  CameraCapabilityNotSupportedError,
  type CameraAdapter,
  type CameraStreamInfo,
  type DecryptedCameraConnection,
} from '@/lib/vending/camera/cameraAdapter';
import { classifyCameraCapabilityStatus, hasCameraCapability, type CameraCapabilities, type CameraCapability, type CameraCapabilityStatus } from '@/lib/vending/camera/capabilities';
import { defaultSnapshotStorageAdapter, SnapshotStorageNotConfiguredError, type SnapshotStorageAdapter } from '@/lib/vending/camera/snapshotStorage';
import type {
  Camera,
  CameraConnectionConfig,
  CameraSnapshot,
  CameraSnapshotReason,
  CameraType,
} from '@/types';
import { EMPTY_CAMERA_CONNECTION } from '@/types';

export { CameraNotFoundError, IllegalCameraTransitionError, UnsupportedCameraTypeError, CameraCapabilityNotSupportedError };

export class CameraNotTestedError extends Error {
  constructor(cameraId: string) {
    super(`Camera ${cameraId} has not passed a connection test yet — activate is only legal after a successful test`);
    this.name = 'CameraNotTestedError';
  }
}

export interface RegisterCameraInput {
  machineId: string;
  type: CameraType;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  label: string;
}

/** Plain-text on the way in — `configureCamera` encrypts `password`/`apiKey` before anything is persisted. */
export interface ConfigureCameraInput {
  host: string | null;
  port: number | null;
  streamPath: string | null;
  username: string | null;
  password: string | null;
  apiKey: string | null;
  onvifProfileToken: string | null;
}

function encryptConnection(input: ConfigureCameraInput): CameraConnectionConfig {
  return {
    host: input.host,
    port: input.port,
    streamPath: input.streamPath,
    username: input.username,
    passwordEncrypted: input.password ? encryptSecret(input.password) : null,
    apiKeyEncrypted: input.apiKey ? encryptSecret(input.apiKey) : null,
    onvifProfileToken: input.onvifProfileToken,
  };
}

function decryptConnection(connection: CameraConnectionConfig): DecryptedCameraConnection {
  return {
    host: connection.host,
    port: connection.port,
    streamPath: connection.streamPath,
    username: connection.username,
    password: connection.passwordEncrypted ? decryptSecret(connection.passwordEncrypted) : null,
    apiKey: connection.apiKeyEncrypted ? decryptSecret(connection.apiKeyEncrypted) : null,
    onvifProfileToken: connection.onvifProfileToken,
  };
}

/**
 * § CAMERA COMPATIBILITY. `CameraService` is the one orchestration
 * layer between routes/admin-UI and `CameraAdapter` — the same role
 * `MachineService`/`MachineTransactionService` already play for
 * vending hardware. Nothing here interprets an image; nothing here
 * ever writes to `MachineTransaction` or any part of the vend state
 * machine (§ DISPENSE EVIDENCE) — `captureSnapshot` below takes an
 * optional `transactionId` purely as a label for later human review,
 * and is never called *from* `machineTransactionService`, only
 * alongside it by a caller (staff action, or future automated one)
 * that already knows a transaction id.
 */
class CameraService {
  constructor(
    private readonly resolveAdapter: CameraAdapterResolver = defaultCameraAdapterResolver,
    private readonly storageAdapter: SnapshotStorageAdapter = defaultSnapshotStorageAdapter,
  ) {}

  async registerCamera(businessId: string, input: RegisterCameraInput, actor: string): Promise<string> {
    const machine = await machineRepository.findById(businessId, input.machineId);
    if (!machine) {
      throw new MachineNotFoundError(input.machineId);
    }
    return cameraRepository.create({
      businessId,
      machineId: input.machineId,
      type: input.type,
      manufacturer: input.manufacturer,
      model: input.model,
      serialNumber: input.serialNumber,
      label: input.label,
      connection: EMPTY_CAMERA_CONNECTION,
      status: 'not_configured',
      connectionState: 'disconnected',
      lastSeenAt: null,
      lastHealthCheckAt: null,
      lastHealthOk: null,
      lastErrorMessage: null,
      lastSnapshotAt: null,
      createdBy: actor,
    });
  }

  async findById(businessId: string, cameraId: string): Promise<Camera | null> {
    return cameraRepository.findById(businessId, cameraId);
  }

  async listByMachine(businessId: string, machineId: string): Promise<{ id: string; data: Camera }[]> {
    return cameraRepository.listByMachine(businessId, machineId);
  }

  async listByBusiness(businessId: string): Promise<{ id: string; data: Camera }[]> {
    return cameraRepository.listByBusiness(businessId);
  }

  /**
   * §2/§10: saves connection details and lands on `configured` —
   * never `active` (§ CAMERA CONFIGURATION's own explicit
   * instruction). Legal from every status except `active` — a live
   * camera must be disabled first, so credentials are never swapped
   * out from under something currently in use.
   */
  async configureCamera(businessId: string, cameraId: string, input: ConfigureCameraInput, actor: string): Promise<void> {
    const camera = await this.requireCamera(businessId, cameraId);
    if (camera.status === 'active') {
      throw new IllegalCameraTransitionError('active', 'configured');
    }
    await cameraRepository.updateConnection(businessId, cameraId, encryptConnection(input), actor);
    if (camera.status !== 'configured') {
      await cameraRepository.moveStatus(businessId, cameraId, 'configured', {}, actor);
    }
  }

  /**
   * §2/§9 "Test connection" — `connect()` then `disconnect()`,
   * proving reachability without capturing anything. Always resolves
   * back to `configured`, recording what happened
   * (`connectionState`/`lastErrorMessage`) rather than advancing to
   * `active` — activation is `activateCamera`'s own, separate,
   * explicit call.
   */
  async testConnection(businessId: string, cameraId: string, actor: string): Promise<{ ok: boolean; error: string | null }> {
    const camera = await this.requireCamera(businessId, cameraId);
    const adapter = this.resolveAdapter(camera.type);
    const connection = decryptConnection(camera.connection);

    await cameraRepository.moveStatus(businessId, cameraId, 'testing', { connectionState: 'connecting' }, actor);
    try {
      await adapter.connect(cameraId, connection);
      await adapter.disconnect(cameraId, connection);
      await cameraRepository.moveStatus(businessId, cameraId, 'configured', { connectionState: 'connected', lastErrorMessage: null, lastSeenAt: FieldValue.serverTimestamp() as unknown as Camera['lastSeenAt'] }, actor);
      return { ok: true, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      await cameraRepository.moveStatus(businessId, cameraId, 'configured', { connectionState: 'error', lastErrorMessage: message }, actor);
      return { ok: false, error: message };
    }
  }

  /**
   * §8/§9 "Run health check" — a richer, separate check from
   * `testConnection`. Requires `camera_health`. If this camera is
   * currently `active` and the check fails, the camera (only the
   * camera) moves to `error` — §8's own instruction: a machine never
   * automatically goes offline and vending never automatically stops
   * because of this.
   */
  async runHealthCheck(businessId: string, cameraId: string, actor: string): Promise<{ ok: boolean; error: string | null }> {
    const camera = await this.requireCamera(businessId, cameraId);
    const adapter = this.resolveAdapter(camera.type);
    this.requireCapability(adapter, camera.type, 'camera_health');
    const connection = decryptConnection(camera.connection);

    const result = await adapter.healthCheck(cameraId, connection);
    await cameraRepository.recordHealthCheck(cameraId, result.ok, result.error);
    if (!result.ok && camera.status === 'active') {
      await cameraRepository.moveStatus(businessId, cameraId, 'error', { connectionState: 'error' }, actor);
    }
    return { ok: result.ok, error: result.error };
  }

  /** §10 step 7 — the one and only path to `active`. Requires `configured` status *and* a passing most-recent test; neither alone is enough. */
  async activateCamera(businessId: string, cameraId: string, actor: string): Promise<void> {
    const camera = await this.requireCamera(businessId, cameraId);
    if (camera.status !== 'configured' || camera.lastHealthOk !== true) {
      throw new CameraNotTestedError(cameraId);
    }
    await cameraRepository.moveStatus(businessId, cameraId, 'active', {}, actor);
  }

  async disableCamera(businessId: string, cameraId: string, actor: string): Promise<void> {
    await cameraRepository.moveStatus(businessId, cameraId, 'disabled', { connectionState: 'disconnected' }, actor);
  }

  /**
   * § SNAPSHOT MODEL / § DISPENSE EVIDENCE. Requires `camera_snapshot`.
   * Always records a `CameraSnapshot` — success or failure — and
   * **never touches a `MachineTransaction`**. A caller that wants
   * dispense evidence passes the vend's own `transactionId`; this
   * method does nothing with it beyond storing it on the snapshot
   * record for later human review.
   */
  async captureSnapshot(
    businessId: string,
    input: { cameraId: string; reason: CameraSnapshotReason; transactionId?: string | null; actor: string },
  ): Promise<{ id: string; data: CameraSnapshot }> {
    const camera = await this.requireCamera(businessId, input.cameraId);
    const adapter = this.resolveAdapter(camera.type);
    this.requireCapability(adapter, camera.type, 'camera_snapshot');
    const connection = decryptConnection(camera.connection);

    let success = false;
    let storageRef: string | null = null;
    let errorMessage: string | null = null;
    const metadata: Record<string, string | number | boolean | null> = { adapterType: adapter.adapterType };

    try {
      const capture = await adapter.captureSnapshot(input.cameraId, connection);
      if (!capture.ok || !capture.data) {
        errorMessage = capture.error ?? 'capture failed';
      } else {
        metadata.contentType = capture.contentType;
        metadata.byteLength = capture.data.byteLength;
        try {
          const stored = await this.storageAdapter.store({
            businessId,
            cameraId: input.cameraId,
            machineId: camera.machineId,
            capturedAt: new Date(),
            data: capture.data,
            contentType: capture.contentType,
          });
          storageRef = stored.storageRef;
          success = true;
        } catch (storageError) {
          // The camera itself captured a real frame — only
          // persisting it failed. Recorded as its own honest reason,
          // never silently treated as "capture never happened".
          errorMessage = storageError instanceof SnapshotStorageNotConfiguredError ? storageError.message : String(storageError);
        }
      }
    } catch (error) {
      errorMessage = error instanceof CameraOperationTimeoutError ? error.message : error instanceof Error ? error.message : 'unknown error';
    }

    await cameraRepository.recordSnapshotAttempt(input.cameraId, success);
    const id = await cameraSnapshotRepository.record({
      businessId,
      cameraId: input.cameraId,
      machineId: camera.machineId,
      transactionId: input.transactionId ?? null,
      reason: input.reason,
      success,
      storageRef,
      errorMessage,
      metadata,
      capturedBy: input.actor,
    });
    const data = await cameraSnapshotRepository.findById(businessId, id);
    return { id, data: data! };
  }

  async listSnapshotsByCamera(businessId: string, cameraId: string, limit?: number): Promise<{ id: string; data: CameraSnapshot }[]> {
    return cameraSnapshotRepository.listByCamera(businessId, cameraId, limit);
  }

  async listSnapshotsByTransaction(businessId: string, transactionId: string): Promise<{ id: string; data: CameraSnapshot }[]> {
    return cameraSnapshotRepository.listByTransaction(businessId, transactionId);
  }

  /** Requires `camera_stream`. A live diagnostic read, never persisted — the same "compute fresh, don't cache a decision" discipline the vending diagnostics panel already uses. */
  async getStreamInfo(businessId: string, cameraId: string): Promise<CameraStreamInfo> {
    const camera = await this.requireCamera(businessId, cameraId);
    const adapter = this.resolveAdapter(camera.type);
    this.requireCapability(adapter, camera.type, 'camera_stream');
    return adapter.getStreamInfo(cameraId, decryptConnection(camera.connection));
  }

  /**
   * The live, four-way capability read (§1) — same shape as the
   * vending diagnostics panel's own `runDiagnostics`. An unregistered
   * `CameraType` (`manufacturer_specific`) or an honest stub with
   * nothing wired both surface as exactly that, never as a crash or
   * a fabricated capability.
   */
  async getDiagnostics(camera: Camera): Promise<{
    registered: boolean;
    capabilities: CameraCapabilities | null;
    statusByCapability: Record<CameraCapability, CameraCapabilityStatus>;
  }> {
    let adapter: CameraAdapter;
    try {
      adapter = this.resolveAdapter(camera.type);
    } catch (error) {
      if (error instanceof UnsupportedCameraTypeError) {
        return { registered: false, capabilities: null, statusByCapability: emptyCapabilityStatus() };
      }
      throw error;
    }
    const capabilities = adapter.capabilities();
    const protocolConfigured = hasCameraCapability(capabilities, 'camera');
    const statusByCapability = {
      camera: classifyCameraCapabilityStatus('camera', { registered: true, protocolConfigured, capabilities }),
      camera_snapshot: classifyCameraCapabilityStatus('camera_snapshot', { registered: true, protocolConfigured, capabilities }),
      camera_stream: classifyCameraCapabilityStatus('camera_stream', { registered: true, protocolConfigured, capabilities }),
      camera_health: classifyCameraCapabilityStatus('camera_health', { registered: true, protocolConfigured, capabilities }),
    };
    return { registered: true, capabilities, statusByCapability };
  }

  private async requireCamera(businessId: string, cameraId: string): Promise<Camera> {
    const camera = await cameraRepository.findById(businessId, cameraId);
    if (!camera) {
      throw new CameraNotFoundError(cameraId);
    }
    return camera;
  }

  private requireCapability(adapter: CameraAdapter, type: CameraType, capability: CameraCapability): void {
    if (!hasCameraCapability(adapter.capabilities(), capability)) {
      throw new CameraCapabilityNotSupportedError(type, capability);
    }
  }
}

function emptyCapabilityStatus(): Record<CameraCapability, CameraCapabilityStatus> {
  return { camera: 'unknown', camera_snapshot: 'unknown', camera_stream: 'unknown', camera_health: 'unknown' };
}

export const cameraService = new CameraService();
export { CameraService };
