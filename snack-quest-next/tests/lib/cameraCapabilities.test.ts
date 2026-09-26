import { describe, expect, it } from 'vitest';
import {
  ALL_CAMERA_CAPABILITIES,
  FULL_CAMERA_CAPABILITIES,
  NO_CAMERA_CAPABILITIES,
  classifyCameraCapabilityStatus,
  hasCameraCapability,
} from '@/lib/vending/camera/capabilities';

describe('camera capability model', () => {
  it('hasCameraCapability reads an absent key as false, never a crash', () => {
    expect(hasCameraCapability({}, 'camera_snapshot')).toBe(false);
    expect(hasCameraCapability({ camera_snapshot: true }, 'camera_snapshot')).toBe(true);
    expect(hasCameraCapability({ camera_snapshot: false }, 'camera_snapshot')).toBe(false);
  });

  it('FULL_CAMERA_CAPABILITIES declares every capability true; NO_CAMERA_CAPABILITIES declares every one false', () => {
    for (const capability of ALL_CAMERA_CAPABILITIES) {
      expect(FULL_CAMERA_CAPABILITIES[capability]).toBe(true);
      expect(NO_CAMERA_CAPABILITIES[capability]).toBe(false);
    }
  });

  it('classifyCameraCapabilityStatus: unknown when no adapter is registered at all', () => {
    expect(classifyCameraCapabilityStatus('camera_snapshot', { registered: false, protocolConfigured: false, capabilities: null })).toBe('unknown');
  });

  it('classifyCameraCapabilityStatus: not_configured for a registered adapter with no protocol wired — even though capabilities() reports false for everything', () => {
    expect(
      classifyCameraCapabilityStatus('camera_snapshot', { registered: true, protocolConfigured: false, capabilities: NO_CAMERA_CAPABILITIES }),
    ).toBe('not_configured');
  });

  it('classifyCameraCapabilityStatus: supported / not_supported once a real protocol is configured', () => {
    expect(
      classifyCameraCapabilityStatus('camera_snapshot', { registered: true, protocolConfigured: true, capabilities: { camera_snapshot: true } }),
    ).toBe('supported');
    expect(
      classifyCameraCapabilityStatus('camera_stream', { registered: true, protocolConfigured: true, capabilities: { camera_snapshot: true } }),
    ).toBe('not_supported');
  });
});
