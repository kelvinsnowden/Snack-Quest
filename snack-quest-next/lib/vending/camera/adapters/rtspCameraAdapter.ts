import { CameraProtocolNotConfiguredError, type CameraAdapter, type CameraHealthCheckResult, type CameraSnapshotCaptureResult, type CameraStatusReport, type CameraStreamInfo, type DecryptedCameraConnection } from '../cameraAdapter';
import { NO_CAMERA_CAPABILITIES, type CameraCapabilities } from '../capabilities';

/**
 * `RtspCameraAdapter` — an interface-conformant stub for `Camera.type:
 * 'rtsp'` (§ CAMERA TYPES, § REAL HARDWARE HONESTY). RTSP is a public
 * IETF standard; the gap here is the same one named on
 * `UsbCameraAdapter` — no real IP camera to open a real RTSP session
 * against and prove a capture/health-check path actually works, not
 * a missing specification. See `cameraProtocolRegistry.ts`
 * (`status: 'planned'`).
 */
/* eslint-disable @typescript-eslint/no-unused-vars -- every parameter below exists only to satisfy CameraAdapter's own signature; each method throws before ever reading it. */
export class RtspCameraAdapter implements CameraAdapter {
  readonly adapterType = 'rtsp';

  capabilities(): CameraCapabilities {
    return NO_CAMERA_CAPABILITIES;
  }

  async connect(_cameraId: string, _connection: DecryptedCameraConnection): Promise<void> {
    throw new CameraProtocolNotConfiguredError(this.adapterType, 'connect');
  }

  async disconnect(_cameraId: string, _connection: DecryptedCameraConnection): Promise<void> {
    throw new CameraProtocolNotConfiguredError(this.adapterType, 'disconnect');
  }

  async getStatus(_cameraId: string, _connection: DecryptedCameraConnection): Promise<CameraStatusReport> {
    throw new CameraProtocolNotConfiguredError(this.adapterType, 'getStatus');
  }

  async captureSnapshot(_cameraId: string, _connection: DecryptedCameraConnection): Promise<CameraSnapshotCaptureResult> {
    throw new CameraProtocolNotConfiguredError(this.adapterType, 'captureSnapshot');
  }

  async getStreamInfo(_cameraId: string, _connection: DecryptedCameraConnection): Promise<CameraStreamInfo> {
    throw new CameraProtocolNotConfiguredError(this.adapterType, 'getStreamInfo');
  }

  async healthCheck(_cameraId: string, _connection: DecryptedCameraConnection): Promise<CameraHealthCheckResult> {
    throw new CameraProtocolNotConfiguredError(this.adapterType, 'healthCheck');
  }
}
/* eslint-enable @typescript-eslint/no-unused-vars */
