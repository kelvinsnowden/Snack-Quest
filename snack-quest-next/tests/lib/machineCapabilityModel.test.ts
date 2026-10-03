import { describe, expect, it } from 'vitest';
import {
  ALL_HARDWARE_CAPABILITIES,
  FULL_CAPABILITIES,
  HARDWARE_CAPABILITY_LABELS,
  effectiveCapabilities,
  hasCapability,
  isHardwareCapability,
} from '@/lib/vending/protocol/capabilities';

describe('effectiveCapabilities', () => {
  it('is the intersection of what the model has and what the adapter can reach', () => {
    const result = effectiveCapabilities({ vend: true, camera: true, temperature: false }, ['vend', 'temperature']);
    expect(hasCapability(result, 'vend')).toBe(true);
    // Adapter can relay a camera, but the model has none.
    expect(hasCapability(result, 'camera')).toBe(false);
    // Model has a temperature sensor, but the adapter can't read it.
    expect(hasCapability(result, 'temperature')).toBe(false);
  });

  it('falls back to the adapter alone for a machine with no registered model', () => {
    const result = effectiveCapabilities(FULL_CAPABILITIES, null);
    for (const capability of ALL_HARDWARE_CAPABILITIES) {
      expect(hasCapability(result, capability)).toBe(true);
    }
  });

  it('declares every capability explicitly, so an unsupported one reads false rather than missing', () => {
    const result = effectiveCapabilities({ vend: true }, ['vend']);
    expect(Object.keys(result).sort()).toEqual([...ALL_HARDWARE_CAPABILITIES].sort());
    expect(result.camera).toBe(false);
  });
});

describe('capability vocabulary', () => {
  it('labels every capability', () => {
    for (const capability of ALL_HARDWARE_CAPABILITIES) {
      expect(HARDWARE_CAPABILITY_LABELS[capability]).toBeTruthy();
    }
  });

  it('recognises only known capability keys', () => {
    expect(isHardwareCapability('camera')).toBe(true);
    expect(isHardwareCapability('CAMERA')).toBe(false);
    expect(isHardwareCapability('teleport')).toBe(false);
  });
});
