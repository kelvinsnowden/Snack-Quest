import { CameraProtocolNotConfiguredError, type CameraAdapter, type CameraHealthCheckResult, type CameraSnapshotCaptureResult, type CameraStatusReport, type CameraStreamInfo, type DecryptedCameraConnection } from '../cameraAdapter';
import { NO_CAMERA_CAPABILITIES, type CameraCapabilities } from '../capabilities';

/**
 * `OnvifCameraAdapter` — an interface-conformant stub for
 * `Camera.type: 'onvif'` (§ CAMERA TYPES, § REAL HARDWARE HONESTY).
 * ONVIF is a public, well-documented profile suite; the gap is the
 * same as `UsbCameraAdapter`/`RtspCameraAdapter` — no real
 * ONVIF-compliant device to negotiate a media profile against and
 * confirm this codebase's understanding of the spec actually matches
 * what a real device does. See `cameraProtocolRegistry.ts`
 * (`status: 'planned'`).
 */
/* eslint-disable @typescript-eslint/no-unused-vars -- every parameter below exists only to satisfy CameraAdapter's own signature; each method throws before ever reading it. */
export class OnvifCameraAdapter implements CameraAdapter {
  readonly adapterType = 'onvif';

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
