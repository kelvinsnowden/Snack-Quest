import { MockVendingAdapter } from './adapters/mockVendingAdapter';
import { ShengmaAdapter } from './adapters/shengmaAdapter';
import { SnackQuestGatewayAdapter } from './adapters/snackQuestGatewayAdapter';
import { ReferenceHttpAdapter } from './adapters/referenceHttpAdapter';
import type { VendingHardwareAdapter } from './hardwareAdapter';
import type { IntegrationType } from '@/types/manufacturer';

/**
 * The adapter registry — the one and only place in this codebase that
 * knows which manufacturer-specific adapters exist. Every Service
 * depends on `VendingHardwareAdapter`, resolved through
 * `defaultVendingAdapterResolver` by a machine's adapter key; nothing
 * outside `lib/vending/` imports a concrete adapter
 * (`tests/lib/integrationBoundary.test.ts` enforces that).
 *
 * Adding a manufacturer = one new adapter file under
 * `lib/vending/adapters/` + one entry below. No Service, route, UI or
 * data migration changes.
 */

/**
 * - `outbound` — Snack Quest calls the manufacturer (their API/SDK/protocol).
 * - `inbound` — the manufacturer calls Snack Quest (the v1 Machine API);
 *   Snack Quest never reaches the machine directly, it queues work the
 *   machine collects.
 */
export type AdapterDirection = 'outbound' | 'inbound';

/**
 * `sandbox_only` adapters can never be activated in a production
 * deployment (`machineIntegrationService.activate`). `reference`
 * maturity marks a template built against a documented example
 * contract, not a real manufacturer — it proves the mechanics, it is
 * not an integration anyone has tested against real hardware.
 */
export interface AdapterRegistration {
  key: string;
  label: string;
  direction: AdapterDirection;
  integrationTypes: readonly IntegrationType[];
  environment: 'sandbox_only' | 'production_capable';
  maturity: 'implemented' | 'reference' | 'stub';
  notes: string;
  resolve(): VendingHardwareAdapter;
}

/**
 * The shared mock instance real (non-test) code resolves to. Tests
 * never use this — they construct their own `MockVendingAdapter` and
 * inject a resolver that returns it, so one test's seeded slots can
 * never leak into another's.
 */
const sharedMockAdapter = new MockVendingAdapter();
/** Stateless — every method throws or refuses — so one shared instance is safe. */
const sharedShengmaAdapter = new ShengmaAdapter();
/** Stateless — it reads what machines reported from Firestore on every call. */
const sharedGatewayAdapter = new SnackQuestGatewayAdapter();
/** Configured from the environment; without both values it reports no capabilities and refuses every call. */
let referenceHttpAdapter: ReferenceHttpAdapter | null = null;
function resolveReferenceHttpAdapter(): ReferenceHttpAdapter {
  referenceHttpAdapter ??= new ReferenceHttpAdapter(
    process.env.REFERENCE_MANUFACTURER_API_URL && process.env.REFERENCE_MANUFACTURER_API_KEY
      ? { baseUrl: process.env.REFERENCE_MANUFACTURER_API_URL, apiKey: process.env.REFERENCE_MANUFACTURER_API_KEY }
      : null,
  );
  return referenceHttpAdapter;
}

const registrations: AdapterRegistration[] = [
  {
    key: 'mock',
    label: 'Mock machine (simulator)',
    direction: 'outbound',
    integrationTypes: ['manufacturer_api', 'webhook', 'hybrid'],
    environment: 'sandbox_only',
    maturity: 'implemented',
    notes: 'In-memory simulated hardware for development, tests and the simulator. Never activatable in production.',
    resolve: () => sharedMockAdapter,
  },
  {
    key: 'shengma',
    label: 'Shengma (not yet wired)',
    direction: 'outbound',
    integrationTypes: ['manufacturer_api', 'sdk'],
    environment: 'production_capable',
    maturity: 'stub',
    notes: 'Interface-conformant stub: every capability false, every live call refuses. Unblocked when a deployment confirms MDB/DEX or Shengma documents an API.',
    resolve: () => sharedShengmaAdapter,
  },
  {
    key: 'snack_quest_gateway',
    label: 'Snack Quest Machine API (manufacturer integrates with us)',
    direction: 'inbound',
    integrationTypes: ['snack_quest_api', 'hybrid'],
    environment: 'production_capable',
    maturity: 'implemented',
    notes: 'For manufacturers who build against docs/SNACK_QUEST_MACHINE_API_V1.md. Snack Quest never calls the machine: dispenses are queued for it to poll, and its status comes from what it last reported.',
    resolve: () => sharedGatewayAdapter,
  },
  {
    key: 'reference_http',
    label: 'Reference HTTP manufacturer API (template)',
    direction: 'outbound',
    integrationTypes: ['manufacturer_api', 'webhook', 'hybrid'],
    environment: 'sandbox_only',
    maturity: 'reference',
    notes: 'A template built against the example contract in docs/MACHINE_INTEGRATION_LAYER.md §6, tested only against a fake server. Not an integration with any real manufacturer — copy it as the starting point for one.',
    resolve: resolveReferenceHttpAdapter,
  },
];

export const ADAPTER_REGISTRY: ReadonlyMap<string, AdapterRegistration> = new Map(registrations.map((entry) => [entry.key, entry]));

export function findAdapterRegistration(key: string): AdapterRegistration | undefined {
  return ADAPTER_REGISTRY.get(key);
}

export function listAdapterRegistrations(): AdapterRegistration[] {
  return Array.from(ADAPTER_REGISTRY.values());
}

export function isRegisteredAdapterKey(key: unknown): key is string {
  return typeof key === 'string' && ADAPTER_REGISTRY.has(key);
}

/** Resolves an adapter key (`Machine.manufacturer`) to the adapter that speaks for it. */
export type VendingAdapterResolver = (adapterKey: string) => VendingHardwareAdapter;

export class UnsupportedManufacturerError extends Error {
  constructor(adapterKey: string) {
    super(
      `No VendingHardwareAdapter is registered for "${adapterKey}". ` +
        `Registered: ${Array.from(ADAPTER_REGISTRY.keys()).join(', ')}. See docs/MACHINE_INTEGRATION_LAYER.md for how to add one.`,
    );
    this.name = 'UnsupportedManufacturerError';
  }
}

export const defaultVendingAdapterResolver: VendingAdapterResolver = (adapterKey) => {
  const registration = ADAPTER_REGISTRY.get(adapterKey);
  if (!registration) {
    throw new UnsupportedManufacturerError(adapterKey);
  }
  return registration.resolve();
};
