import { MockVendingAdapter } from './adapters/mockVendingAdapter';
import { ShengmaAdapter } from './adapters/shengmaAdapter';
import type { VendingHardwareAdapter } from './hardwareAdapter';
import type { Machine } from '@/types';

/**
 * Resolves a machine's `manufacturer` to the `VendingHardwareAdapter`
 * that talks to it (§ HARDWARE ABSTRACTION). The one and only place
 * in this codebase that switches on manufacturer — every Service
 * depends on the interface, resolved through this, never on a
 * concrete adapter class imported directly.
 */
export type VendingAdapterResolver = (manufacturer: Machine['manufacturer']) => VendingHardwareAdapter;

/**
 * The shared mock instance real (non-test) code resolves to. Tests
 * never use this — they construct their own `MockVendingAdapter` and
 * inject a resolver that returns it, the same
 * default-parameter-with-test-override pattern
 * `ConversationService`'s constructor already uses for
 * `WhatsAppGateway` — so one test's seeded slots can never leak into
 * another's.
 */
const sharedMockAdapter = new MockVendingAdapter();

/**
 * Stateless — `ShengmaAdapter` holds no per-machine state (every
 * method either throws or returns a fixed refusal), so one shared
 * instance is safe the same way a stateless service singleton would
 * be. Unlike `sharedMockAdapter`, there is nothing here a test could
 * accidentally leak between cases.
 */
const sharedShengmaAdapter = new ShengmaAdapter();

export class UnsupportedManufacturerError extends Error {
  constructor(manufacturer: string) {
    super(
      `No VendingHardwareAdapter is registered for manufacturer "${manufacturer}". ` +
        `Only "mock" and "shengma" are — see docs/HARDWARE_COMPATIBILITY_ARCHITECTURE.md for what is blocked on manufacturer documentation.`,
    );
    this.name = 'UnsupportedManufacturerError';
  }
}

export const defaultVendingAdapterResolver: VendingAdapterResolver = (manufacturer) => {
  if (manufacturer === 'mock') {
    return sharedMockAdapter;
  }
  if (manufacturer === 'shengma') {
    // An honest, capability-transparent stub, not a real integration
    // (§ E of docs/HARDWARE_COMPATIBILITY_ARCHITECTURE.md) — Shengma
    // will not provide their proprietary API, so nothing here is
    // guessed at. `capabilities()` reports everything false and every
    // action beyond a normal vend refusal throws
    // `ProtocolNotConfiguredError`, both surfaced directly in the
    // admin diagnostics panel.
    return sharedShengmaAdapter;
  }
  // 'other' is reserved in the Machine type (§ hardware abstraction)
  // but deliberately has no implementation at all, not even a stub:
  // there is no manufacturer to name one after.
  throw new UnsupportedManufacturerError(manufacturer);
};
