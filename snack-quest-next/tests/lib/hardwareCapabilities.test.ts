import { describe, expect, it } from 'vitest';
import {
  ALL_HARDWARE_CAPABILITIES,
  FULL_CAPABILITIES,
  NO_CAPABILITIES,
  hasCapability,
  classifyCapabilityStatus,
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

describe('classifyCapabilityStatus', () => {
  it('reads unknown when the manufacturer has no adapter registered at all', () => {
    expect(
      classifyCapabilityStatus('vend', { registered: false, protocolConfigured: false, capabilities: null }),
    ).toBe('unknown');
  });

  it('reads not_configured when the adapter is registered but no protocol is wired (the ShengmaAdapter stub case), even though NO_CAPABILITIES declares every key false', () => {
    expect(
      classifyCapabilityStatus('vend', { registered: true, protocolConfigured: false, capabilities: NO_CAPABILITIES }),
    ).toBe('not_configured');
  });

  it('reads supported when the protocol is configured and the capability is declared true', () => {
    expect(
      classifyCapabilityStatus('vend', { registered: true, protocolConfigured: true, capabilities: FULL_CAPABILITIES }),
    ).toBe('supported');
  });

  it('reads not_supported when the protocol is configured but the capability is declared false — a real decision, not an unwired stub', () => {
    expect(
      classifyCapabilityStatus('remote_price_update', {
        registered: true,
        protocolConfigured: true,
        capabilities: { vend: true, remote_price_update: false },
      }),
    ).toBe('not_supported');
  });
});
