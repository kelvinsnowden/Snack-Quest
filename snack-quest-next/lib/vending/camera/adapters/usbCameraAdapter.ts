import { CameraProtocolNotConfiguredError, type CameraAdapter, type CameraHealthCheckResult, type CameraSnapshotCaptureResult, type CameraStatusReport, type CameraStreamInfo, type DecryptedCameraConnection } from '../cameraAdapter';
import { NO_CAMERA_CAPABILITIES, type CameraCapabilities } from '../capabilities';

/**
 * `UsbCameraAdapter` — an interface-conformant stub for `Camera.type:
 * 'usb'` (§ CAMERA TYPES, § REAL HARDWARE HONESTY). USB Video Class
 * (UVC) is a real, public standard — unlike Shengma's proprietary
 * vending protocol, there is no manufacturer withholding
 * documentation here. What's missing is a real USB device to build
 * and test a UVC capture path against, not a spec to read.
 * Implementing frame-grab code against the spec alone, with nothing
 * physical to validate it, would be exactly the kind of untested
 * "looks right" implementation this codebase avoids everywhere else
 * (the same reasoning `lib/vending/protocol/mdb/frame.ts` already
 * applies to MDB's peripheral command table).
 *
 * `capabilities()` reports `NO_CAMERA_CAPABILITIES` — every key
 * `false`, a real declaration that nothing is wired, never a partial
 * guess — and every other method throws
 * `CameraProtocolNotConfiguredError`. See `cameraProtocolRegistry.ts`
 * for this adapter's own registry entry (`status: 'planned'`).
 */
/* eslint-disable @typescript-eslint/no-unused-vars -- every parameter below exists only to satisfy CameraAdapter's own signature; each method throws before ever reading it. */
export class UsbCameraAdapter implements CameraAdapter {
  readonly adapterType = 'usb';

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
