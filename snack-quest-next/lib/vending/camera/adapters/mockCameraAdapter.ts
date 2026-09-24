import {
  CameraOperationTimeoutError,
  type CameraAdapter,
  type CameraHealthCheckResult,
  type CameraSnapshotCaptureResult,
  type CameraStatusReport,
  type CameraStreamInfo,
  type DecryptedCameraConnection,
} from '../cameraAdapter';
import { FULL_CAMERA_CAPABILITIES, type CameraCapabilities } from '../capabilities';

type SnapshotBehavior = 'success' | 'failure' | 'timeout';

/**
 * `MockCameraAdapter` — the only fully-capable `CameraAdapter` until
 * a real camera exists to build one against (§ MOCK CAMERA), the
 * exact same role `MockVendingAdapter` already plays for vending
 * hardware. `Camera.type: 'mock'` selects it.
 *
 * Per-instance state, never persisted, never shared across tests —
 * the same isolation `MockVendingAdapter`'s own doc comment already
 * explains: a fresh instance per test proves this adapter's honesty
 * about what it reports, not a global fixture leaking between cases.
 * Every seed method below is a **test/dev helper**, not part of the
 * `CameraAdapter` interface — real hardware's health is discovered
 * by calling it, never seeded.
 */
export class MockCameraAdapter implements CameraAdapter {
  readonly adapterType = 'mock';

  private readonly reachable = new Map<string, boolean>();
  private readonly healthy = new Map<string, boolean>();
  private readonly snapshotBehavior = new Map<string, SnapshotBehavior>();
  private readonly streamAvailable = new Map<string, boolean>();

  capabilities(): CameraCapabilities {
    return FULL_CAMERA_CAPABILITIES;
  }

  /** Test helper. Defaults every seeded camera to reachable, healthy, snapshot-succeeding, stream-available — override with the other seed methods for a specific scenario. */
  seedCamera(cameraId: string): void {
    this.reachable.set(cameraId, true);
    this.healthy.set(cameraId, true);
    this.snapshotBehavior.set(cameraId, 'success');
    this.streamAvailable.set(cameraId, true);
  }

  /** Test helper — simulates the camera being unreachable (network down, powered off). */
  setUnreachable(cameraId: string): void {
    this.reachable.set(cameraId, false);
  }

  setReachable(cameraId: string): void {
    this.reachable.set(cameraId, true);
  }

  /** Test helper — a reachable camera whose own health check nonetheless reports unhealthy (e.g. a real adapter's "frames not flowing" case). */
  setHealthy(cameraId: string, ok: boolean): void {
    this.healthy.set(cameraId, ok);
  }

  setSnapshotBehavior(cameraId: string, behavior: SnapshotBehavior): void {
    this.snapshotBehavior.set(cameraId, behavior);
  }

  setStreamAvailable(cameraId: string, available: boolean): void {
    this.streamAvailable.set(cameraId, available);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- must match CameraAdapter's own signature; the mock never needs the decrypted connection.
  async connect(cameraId: string, _connection: DecryptedCameraConnection): Promise<void> {
    if (this.reachable.get(cameraId) === false) {
      throw new Error(`mock camera ${cameraId} is unreachable`);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- must match CameraAdapter's own signature; a mock disconnect has nothing to release.
  async disconnect(_cameraId: string, _connection: DecryptedCameraConnection): Promise<void> {
    // Deliberately nothing to release for an in-memory mock.
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- must match CameraAdapter's own signature; the mock never needs the decrypted connection.
  async getStatus(cameraId: string, _connection: DecryptedCameraConnection): Promise<CameraStatusReport> {
    return {
      connectionState: this.reachable.get(cameraId) === false ? 'error' : 'connected',
      reportedAt: new Date().toISOString(),
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- must match CameraAdapter's own signature; the mock never needs the decrypted connection.
  async captureSnapshot(cameraId: string, _connection: DecryptedCameraConnection): Promise<CameraSnapshotCaptureResult> {
    if (this.reachable.get(cameraId) === false) {
      return { ok: false, data: null, contentType: null, error: 'camera unreachable' };
    }
    const behavior = this.snapshotBehavior.get(cameraId) ?? 'success';
    if (behavior === 'timeout') {
      throw new CameraOperationTimeoutError(this.adapterType, 'captureSnapshot');
    }
    if (behavior === 'failure') {
      return { ok: false, data: null, contentType: null, error: 'mock camera reported a capture failure' };
    }
    // A tiny, real byte payload — proves the plumbing actually moves
    // bytes through `SnapshotStorageAdapter.store`, not a hard-coded
    // zero-length placeholder.
    return { ok: true, data: new TextEncoder().encode(`mock-snapshot:${cameraId}:${Date.now()}`), contentType: 'application/octet-stream', error: null };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- must match CameraAdapter's own signature; the mock never needs the decrypted connection.
  async getStreamInfo(cameraId: string, _connection: DecryptedCameraConnection): Promise<CameraStreamInfo> {
    if (this.reachable.get(cameraId) === false || this.streamAvailable.get(cameraId) === false) {
      return { available: false, protocol: null, host: null, port: null, streamPath: null };
    }
    return { available: true, protocol: 'rtsp', host: 'mock-camera.local', port: 554, streamPath: '/mock-stream' };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- must match CameraAdapter's own signature; the mock never needs the decrypted connection.
  async healthCheck(cameraId: string, _connection: DecryptedCameraConnection): Promise<CameraHealthCheckResult> {
    if (this.reachable.get(cameraId) === false) {
      return { ok: false, checkedAt: new Date().toISOString(), error: 'camera unreachable' };
    }
    const ok = this.healthy.get(cameraId) ?? true;
    return { ok, checkedAt: new Date().toISOString(), error: ok ? null : 'mock camera reported unhealthy' };
  }
}
