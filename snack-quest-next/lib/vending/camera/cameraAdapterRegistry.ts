import { MockCameraAdapter } from './adapters/mockCameraAdapter';
import { UsbCameraAdapter } from './adapters/usbCameraAdapter';
import { IpCameraAdapter } from './adapters/ipCameraAdapter';
import { RtspCameraAdapter } from './adapters/rtspCameraAdapter';
import { OnvifCameraAdapter } from './adapters/onvifCameraAdapter';
import type { CameraAdapter } from './cameraAdapter';
import type { CameraType } from '@/types';

/**
 * Resolves a camera's `type` to the `CameraAdapter` that talks to it
 * (§ CAMERA ADAPTER REGISTRY) — the same "one and only switch point"
 * discipline `defaultVendingAdapterResolver` already holds for
 * `Machine.manufacturer`. `cameraService` and every route depend on
 * this, never on a concrete adapter class imported directly.
 */
export type CameraAdapterResolver = (type: CameraType) => CameraAdapter;

/** Shared instance real (non-test) code resolves to — tests construct their own `MockCameraAdapter` and inject a resolver, the same pattern `sharedMockAdapter` already uses for vending. */
const sharedMockCameraAdapter = new MockCameraAdapter();

/** Stateless stubs — every method either throws or returns a fixed value, so one shared instance per type is safe. */
const sharedUsbCameraAdapter = new UsbCameraAdapter();
const sharedIpCameraAdapter = new IpCameraAdapter();
const sharedRtspCameraAdapter = new RtspCameraAdapter();
const sharedOnvifCameraAdapter = new OnvifCameraAdapter();

export class UnsupportedCameraTypeError extends Error {
  constructor(type: string) {
    super(
      `No CameraAdapter is registered for camera type "${type}". "mock", "usb", "ip", "rtsp", and "onvif" are — see lib/vending/camera/cameraProtocolRegistry.ts for what is implemented, planned, or blocked on manufacturer documentation.`,
    );
    this.name = 'UnsupportedCameraTypeError';
  }
}

export const defaultCameraAdapterResolver: CameraAdapterResolver = (type) => {
  switch (type) {
    case 'mock':
      return sharedMockCameraAdapter;
    case 'usb':
      return sharedUsbCameraAdapter;
    case 'ip':
      return sharedIpCameraAdapter;
    case 'rtsp':
      return sharedRtspCameraAdapter;
    case 'onvif':
      return sharedOnvifCameraAdapter;
    case 'manufacturer_specific':
      // Reserved in the `CameraType` union (§ CAMERA TYPES) but
      // deliberately has no implementation at all, not even a stub —
      // there is no manufacturer to name one after, the same
      // reasoning `defaultVendingAdapterResolver` already applies to
      // `Machine.manufacturer: 'other'`.
      throw new UnsupportedCameraTypeError(type);
    default:
      throw new UnsupportedCameraTypeError(type);
  }
};
