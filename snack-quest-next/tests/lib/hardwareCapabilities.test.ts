import { describe, expect, it } from 'vitest';
import {
  ALL_HARDWARE_CAPABILITIES,
  FULL_CAPABILITIES,
  NO_CAPABILITIES,
  hasCapability,
} from '@/lib/vending/protocol/capabilities';

describe('hardware capability model', () => {
  it('reads an absent key as false, not undefined', () => {
    expect(hasCapability({}, 'vend')).toBe(false);
  });

  it('reads a declared-true key as true', () => {
    expect(hasCapability({ vend: true }, 'vend')).toBe(true);
  });

  it('reads a declared-false key as false, same as absent', () => {
    expect(hasCapability({ vend: false }, 'vend')).toBe(false);
  });

  it('FULL_CAPABILITIES declares every capability true', () => {
    for (const capability of ALL_HARDWARE_CAPABILITIES) {
      expect(hasCapability(FULL_CAPABILITIES, capability)).toBe(true);
    }
  });

  it('NO_CAPABILITIES declares every capability false', () => {
    for (const capability of ALL_HARDWARE_CAPABILITIES) {
      expect(hasCapability(NO_CAPABILITIES, capability)).toBe(false);
    }
  });
});
