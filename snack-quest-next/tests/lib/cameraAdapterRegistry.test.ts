import { describe, expect, it } from 'vitest';
import { defaultCameraAdapterResolver, UnsupportedCameraTypeError } from '@/lib/vending/camera/cameraAdapterRegistry';
import { MockCameraAdapter } from '@/lib/vending/camera/adapters/mockCameraAdapter';
import { UsbCameraAdapter } from '@/lib/vending/camera/adapters/usbCameraAdapter';
import { IpCameraAdapter } from '@/lib/vending/camera/adapters/ipCameraAdapter';
import { RtspCameraAdapter } from '@/lib/vending/camera/adapters/rtspCameraAdapter';
import { OnvifCameraAdapter } from '@/lib/vending/camera/adapters/onvifCameraAdapter';
import { CameraProtocolNotConfiguredError } from '@/lib/vending/camera/cameraAdapter';
import { NO_CAMERA_CAPABILITIES } from '@/lib/vending/camera/capabilities';

describe('defaultCameraAdapterResolver', () => {
  it('resolves every registered camera type to the right adapter class', () => {
    expect(defaultCameraAdapterResolver('mock')).toBeInstanceOf(MockCameraAdapter);
    expect(defaultCameraAdapterResolver('usb')).toBeInstanceOf(UsbCameraAdapter);
    expect(defaultCameraAdapterResolver('ip')).toBeInstanceOf(IpCameraAdapter);
    expect(defaultCameraAdapterResolver('rtsp')).toBeInstanceOf(RtspCameraAdapter);
    expect(defaultCameraAdapterResolver('onvif')).toBeInstanceOf(OnvifCameraAdapter);
  });

  it('throws UnsupportedCameraTypeError for manufacturer_specific — reserved in the type union, deliberately unimplemented', () => {
    expect(() => defaultCameraAdapterResolver('manufacturer_specific')).toThrow(UnsupportedCameraTypeError);
  });

  it('is the single switch point — the same shared instance comes back for repeated calls with a stateless stub type', () => {
    expect(defaultCameraAdapterResolver('usb')).toBe(defaultCameraAdapterResolver('usb'));
  });
});

describe('honest stub adapters (usb/ip/rtsp/onvif) — § REAL HARDWARE HONESTY', () => {
  const stubs = [new UsbCameraAdapter(), new IpCameraAdapter(), new RtspCameraAdapter(), new OnvifCameraAdapter()];

  it('every stub declares NO_CAMERA_CAPABILITIES — never a partial guess', () => {
    for (const adapter of stubs) {
      expect(adapter.capabilities()).toEqual(NO_CAMERA_CAPABILITIES);
    }
  });

  it('every live method throws CameraProtocolNotConfiguredError — never a fabricated success', async () => {
    for (const adapter of stubs) {
      await expect(adapter.connect('cam-1', emptyConnection())).rejects.toThrow(CameraProtocolNotConfiguredError);
      await expect(adapter.disconnect('cam-1', emptyConnection())).rejects.toThrow(CameraProtocolNotConfiguredError);
      await expect(adapter.getStatus('cam-1', emptyConnection())).rejects.toThrow(CameraProtocolNotConfiguredError);
      await expect(adapter.captureSnapshot('cam-1', emptyConnection())).rejects.toThrow(CameraProtocolNotConfiguredError);
      await expect(adapter.getStreamInfo('cam-1', emptyConnection())).rejects.toThrow(CameraProtocolNotConfiguredError);
      await expect(adapter.healthCheck('cam-1', emptyConnection())).rejects.toThrow(CameraProtocolNotConfiguredError);
    }
  });
});

function emptyConnection() {
  return { host: null, port: null, streamPath: null, username: null, password: null, apiKey: null, onvifProfileToken: null };
}
