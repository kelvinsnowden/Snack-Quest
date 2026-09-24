import { CameraProtocolNotConfiguredError, type CameraAdapter, type CameraHealthCheckResult, type CameraSnapshotCaptureResult, type CameraStatusReport, type CameraStreamInfo, type DecryptedCameraConnection } from '../cameraAdapter';
import { NO_CAMERA_CAPABILITIES, type CameraCapabilities } from '../capabilities';

/**
 * `IpCameraAdapter` — an interface-conformant stub for `Camera.type:
 * 'ip'`: a generic network camera exposing a plain HTTP snapshot
 * endpoint, distinct from `RtspCameraAdapter` (a continuous stream
 * session) and `OnvifCameraAdapter` (a standardized discovery/media
 * profile). Same honesty as the other three stubs — a real HTTP
 * snapshot camera's exact endpoint shape varies enough by
 * manufacturer that nothing here is guessed at without one to test
 * against. See `cameraProtocolRegistry.ts` (`status: 'planned'`).
 */
/* eslint-disable @typescript-eslint/no-unused-vars -- every parameter below exists only to satisfy CameraAdapter's own signature; each method throws before ever reading it. */
export class IpCameraAdapter implements CameraAdapter {
  readonly adapterType = 'ip';

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
