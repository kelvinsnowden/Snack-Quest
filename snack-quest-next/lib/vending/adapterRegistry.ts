import { MockVendingAdapter } from './adapters/mockVendingAdapter';
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

export class UnsupportedManufacturerError extends Error {
  constructor(manufacturer: string) {
    super(
      `No VendingHardwareAdapter is registered for manufacturer "${manufacturer}". ` +
        `Only "mock" is implemented — see docs/VENDING_FOUNDATION.md for what is blocked on manufacturer documentation.`,
    );
    this.name = 'UnsupportedManufacturerError';
  }
}

export const defaultVendingAdapterResolver: VendingAdapterResolver = (manufacturer) => {
  if (manufacturer === 'mock') {
    return sharedMockAdapter;
  }
  // 'shengma' and 'other' are reserved in the Machine type
  // (§ hardware abstraction) but deliberately have no implementation:
  // building one without Shengma's actual API documentation would
  // mean guessing at endpoints nobody has confirmed exist.
  throw new UnsupportedManufacturerError(manufacturer);
};
