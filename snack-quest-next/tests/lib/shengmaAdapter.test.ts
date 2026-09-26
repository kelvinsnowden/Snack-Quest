import { describe, expect, it } from 'vitest';
import { ShengmaAdapter } from '@/lib/vending/adapters/shengmaAdapter';
import { ProtocolNotConfiguredError } from '@/lib/vending/hardwareAdapter';
import { ALL_HARDWARE_CAPABILITIES } from '@/lib/vending/protocol/capabilities';

/**
 * `ShengmaAdapter` is an honest stub, not a real integration
 * (§ E of docs/HARDWARE_COMPATIBILITY_ARCHITECTURE.md) — every one of
 * these assertions is about what it *refuses* to pretend, not about
 * anything it actually does with hardware.
 */
describe('ShengmaAdapter', () => {
  const adapter = new ShengmaAdapter();

  it('declares itself as the shengma manufacturer', () => {
    expect(adapter.manufacturer).toBe('shengma');
  });

  it('never throws from capabilities(), and declares every capability false', () => {
    const capabilities = adapter.capabilities();
    for (const capability of ALL_HARDWARE_CAPABILITIES) {
      expect(capabilities[capability]).toBe(false);
    }
  });

  it('authorizeVend refuses cleanly instead of throwing', async () => {
    const result = await adapter.authorizeVend('m1', 'A1');
    expect(result.authorized).toBe(false);
    expect(result.reason).toMatch(/protocol not configured/);
    expect(result.vendRef).toBeTruthy();
  });

  it.each([
    ['getMachineStatus', () => adapter.getMachineStatus('m1')],
    ['getSlots', () => adapter.getSlots('m1')],
    ['getInventory', () => adapter.getInventory('m1', 'A1')],
    ['setPrice', () => adapter.setPrice('m1', 'A1', 100)],
    ['enableSlot', () => adapter.enableSlot('m1', 'A1')],
    ['disableSlot', () => adapter.disableSlot('m1', 'A1')],
    ['getTemperature', () => adapter.getTemperature('m1')],
    ['getFaults', () => adapter.getFaults('m1')],
  ])('%s throws ProtocolNotConfiguredError', async (_name, action) => {
    await expect(action()).rejects.toThrow(ProtocolNotConfiguredError);
  });

  it('receiveVendResult and receiveTelemetry throw synchronously', () => {
    expect(() => adapter.receiveVendResult({})).toThrow(ProtocolNotConfiguredError);
    expect(() => adapter.receiveTelemetry({})).toThrow(ProtocolNotConfiguredError);
  });
});
