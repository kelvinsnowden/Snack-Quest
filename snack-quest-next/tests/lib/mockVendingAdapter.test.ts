import { describe, expect, it } from 'vitest';
import { MockVendingAdapter } from '@/lib/vending/adapters/mockVendingAdapter';
import { UnrecognisedHardwarePayloadError } from '@/lib/vending/hardwareAdapter';
import { defaultVendingAdapterResolver, UnsupportedManufacturerError } from '@/lib/vending/adapterRegistry';

/**
 * `MockVendingAdapter` (§ HARDWARE ABSTRACTION) — proven against the
 * same behaviour a real machine has to have an opinion about: an
 * empty slot refuses to vend, a disabled slot refuses to vend, an
 * offline machine refuses to vend, and a malformed payload is
 * rejected rather than silently accepted.
 */

describe('slot lifecycle', () => {
  it('reports seeded slots through getSlots/getInventory', async () => {
    const adapter = new MockVendingAdapter();
    adapter.seedSlot('m1', 'A01', { quantity: 5 });

    expect(await adapter.getSlots('m1')).toEqual([{ slotCode: 'A01', quantity: 5, enabled: true }]);
    expect(await adapter.getInventory('m1', 'A01')).toEqual({ quantity: 5 });
  });

  it('enableSlot/disableSlot toggle what getSlots reports', async () => {
    const adapter = new MockVendingAdapter();
    adapter.seedSlot('m1', 'A01', { quantity: 5 });

    await adapter.disableSlot('m1', 'A01');
    expect((await adapter.getSlots('m1'))[0].enabled).toBe(false);

    await adapter.enableSlot('m1', 'A01');
    expect((await adapter.getSlots('m1'))[0].enabled).toBe(true);
  });

  it('setPrice does not affect quantity or enabled state', async () => {
    const adapter = new MockVendingAdapter();
    adapter.seedSlot('m1', 'A01', { quantity: 5, priceKes: 100 });
    await adapter.setPrice('m1', 'A01', 250);
    expect(await adapter.getInventory('m1', 'A01')).toEqual({ quantity: 5 });
  });
});

describe('authorizeVend', () => {
  it('authorizes and decrements quantity when the slot has stock', async () => {
    const adapter = new MockVendingAdapter();
    adapter.seedSlot('m1', 'A01', { quantity: 3 });

    const result = await adapter.authorizeVend('m1', 'A01');

    expect(result.authorized).toBe(true);
    expect(result.vendRef).toBeTruthy();
    expect(await adapter.getInventory('m1', 'A01')).toEqual({ quantity: 2 });
  });

  it('refuses an empty slot without decrementing below zero', async () => {
    const adapter = new MockVendingAdapter();
    adapter.seedSlot('m1', 'A01', { quantity: 0 });

    const result = await adapter.authorizeVend('m1', 'A01');

    expect(result).toEqual({ vendRef: expect.any(String), authorized: false, reason: 'slot empty' });
    expect(await adapter.getInventory('m1', 'A01')).toEqual({ quantity: 0 });
  });

  it('refuses a disabled slot', async () => {
    const adapter = new MockVendingAdapter();
    adapter.seedSlot('m1', 'A01', { quantity: 5, enabled: false });

    const result = await adapter.authorizeVend('m1', 'A01');
    expect(result).toEqual({ vendRef: expect.any(String), authorized: false, reason: 'slot disabled' });
  });

  it('refuses a slot that was never seeded, on an otherwise known machine', async () => {
    const adapter = new MockVendingAdapter();
    adapter.seedSlot('m1', 'A01', { quantity: 5 }); // brings the machine online
    const result = await adapter.authorizeVend('m1', 'ghost-slot');
    expect(result).toEqual({ vendRef: expect.any(String), authorized: false, reason: 'slot not found' });
  });

  it('refuses an entirely unknown machine as offline, not as a missing slot', async () => {
    const adapter = new MockVendingAdapter();
    const result = await adapter.authorizeVend('never-seeded-machine', 'A01');
    expect(result).toEqual({ vendRef: expect.any(String), authorized: false, reason: 'machine offline' });
  });

  it('refuses to vend on an offline machine even with stock present', async () => {
    const adapter = new MockVendingAdapter();
    adapter.seedSlot('m1', 'A01', { quantity: 5 });
    adapter.setOffline('m1');

    const result = await adapter.authorizeVend('m1', 'A01');
    expect(result).toEqual({ vendRef: expect.any(String), authorized: false, reason: 'machine offline' });
  });

  it('gives each authorization a distinct vendRef', async () => {
    const adapter = new MockVendingAdapter();
    adapter.seedSlot('m1', 'A01', { quantity: 5 });

    const first = await adapter.authorizeVend('m1', 'A01');
    const second = await adapter.authorizeVend('m1', 'A01');
    expect(first.vendRef).not.toBe(second.vendRef);
  });
});

describe('receiveVendResult', () => {
  it('parses a well-formed payload', () => {
    const adapter = new MockVendingAdapter();
    const parsed = adapter.receiveVendResult({
      vendRef: 'mock-vend-1',
      dispensed: true,
      idempotencyKey: 'idem-1',
    });
    expect(parsed).toEqual({
      vendRef: 'mock-vend-1',
      dispensed: true,
      status: 'success',
      failureReason: null,
      deviceTimestamp: null,
      idempotencyKey: 'idem-1',
    });
  });

  it('derives a stable idempotency key when the device supplies none', () => {
    const adapter = new MockVendingAdapter();
    const first = adapter.receiveVendResult({ vendRef: 'mock-vend-2', dispensed: false });
    const second = adapter.receiveVendResult({ vendRef: 'mock-vend-2', dispensed: false });
    expect(first.idempotencyKey).toBe(second.idempotencyKey);
  });

  it.each([
    {},
    { vendRef: 'x' },
    { vendRef: 123, dispensed: true },
    { vendRef: 'x', dispensed: 'yes' },
    null,
    'a string, not an object',
  ])('rejects a malformed payload rather than guessing: %j', (payload) => {
    const adapter = new MockVendingAdapter();
    expect(() => adapter.receiveVendResult(payload)).toThrow(UnrecognisedHardwarePayloadError);
  });
});

describe('receiveTelemetry', () => {
  it('parses a well-formed payload', () => {
    const adapter = new MockVendingAdapter();
    const parsed = adapter.receiveTelemetry({
      machineId: 'm1',
      eventType: 'heartbeat',
      idempotencyKey: 'idem-1',
      payload: { battery: 90 },
    });
    expect(parsed).toEqual({
      machineId: 'm1',
      eventType: 'heartbeat',
      payload: { battery: 90 },
      deviceTimestamp: null,
      idempotencyKey: 'idem-1',
    });
  });

  it.each([{}, { machineId: 'm1' }, { machineId: 'm1', eventType: 'heartbeat' }, null])(
    'rejects a malformed payload: %j',
    (payload) => {
      const adapter = new MockVendingAdapter();
      expect(() => adapter.receiveTelemetry(payload)).toThrow(UnrecognisedHardwarePayloadError);
    },
  );
});

describe('adapter registry', () => {
  it('resolves "mock" to a working, fully-capable adapter', async () => {
    const adapter = defaultVendingAdapterResolver('mock');
    expect(adapter.manufacturer).toBe('mock');
    expect(await adapter.getFaults('any-machine')).toEqual([]);
    expect(adapter.capabilities().vend).toBe(true);
  });

  it('resolves "shengma" to an honest stub, not a guessed-at API', async () => {
    const adapter = defaultVendingAdapterResolver('shengma');
    expect(adapter.manufacturer).toBe('shengma');
    // Every capability is false — nothing is wired behind this stub yet.
    expect(adapter.capabilities().vend).toBe(false);
    expect(adapter.capabilities().inventory_read).toBe(false);
    // authorizeVend refuses cleanly rather than throwing, so the
    // payment pipeline's existing refund path handles it unchanged.
    const result = await adapter.authorizeVend('m1', 'A1');
    expect(result.authorized).toBe(false);
    // Every other action names exactly what's missing.
    await expect(adapter.getMachineStatus('m1')).rejects.toThrow('protocol configured');
  });

  it('refuses an unimplemented manufacturer rather than guessing at an API', () => {
    expect(() => defaultVendingAdapterResolver('other')).toThrow(UnsupportedManufacturerError);
  });
});
