import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MachineIntegrationService,
  IntegrationActivationError,
  IntegrationConfigurationError,
  IllegalIntegrationStateTransitionError,
} from '@/services/machineIntegrationService';
import { machineService } from '@/services/machineService';
import { manufacturerRegistryService } from '@/services/manufacturerRegistryService';
import { machineIntegrationRepository, ManufacturerMachineIdInUseError } from '@/repositories/machineIntegrationRepository';
import { MockVendingAdapter } from '@/lib/vending/adapters/mockVendingAdapter';
import { defaultVendingAdapterResolver } from '@/lib/vending/adapterRegistry';
import { certifyModel, clearIntegrationCollections, createManufacturerWithModel, provisionMachine } from '../helpers/integrationFixtures';

const BUSINESS_ID = 'biz-integration-test';
const ORIGINAL_VERCEL_ENV = process.env.VERCEL_ENV;

let adapter: MockVendingAdapter;
let service: MachineIntegrationService;

beforeEach(async () => {
  await clearIntegrationCollections(BUSINESS_ID);
  adapter = new MockVendingAdapter();
  service = new MachineIntegrationService((key) => (key === 'mock' ? adapter : defaultVendingAdapterResolver(key)));
});

afterEach(() => {
  if (ORIGINAL_VERCEL_ENV === undefined) {
    delete process.env.VERCEL_ENV;
  } else {
    process.env.VERCEL_ENV = ORIGINAL_VERCEL_ENV;
  }
});

async function configuredMachine(options: { environment?: 'sandbox' | 'production' } = {}) {
  const ids = await createManufacturerWithModel(BUSINESS_ID);
  const { machineId, machineCode } = await provisionMachine(BUSINESS_ID);
  await service.configure(
    BUSINESS_ID,
    { machineId, ...ids, manufacturerMachineId: 'ACME-0001', environment: options.environment ?? 'sandbox' },
    'staff-1',
  );
  return { machineId, machineCode, ...ids };
}

describe('machine identity', () => {
  it('generates sequential SQ-MCH codes when none is supplied', async () => {
    const first = await provisionMachine(BUSINESS_ID);
    const second = await provisionMachine(BUSINESS_ID);
    expect(first.machineCode).toBe('SQ-MCH-000001');
    expect(second.machineCode).toBe('SQ-MCH-000002');
  });

  it('never mints the same code twice under concurrent registration', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => provisionMachine(BUSINESS_ID)));
    expect(new Set(results.map((result) => result.machineCode)).size).toBe(5);
  }, 60_000);

  it('refuses an unregistered adapter key at registration', async () => {
    await expect(
      machineService.provisionDevice({ businessId: BUSINESS_ID, serialNumber: 'SN', manufacturer: 'other', model: 'x', actor: 'staff-1' }),
    ).rejects.toThrow(/No VendingHardwareAdapter is registered/);
  });
});

describe('configure', () => {
  it('writes the integration in "configured" and mirrors registry ids onto the machine', async () => {
    const { machineId, manufacturerId, modelId } = await configuredMachine();
    const integration = await machineIntegrationRepository.findByMachineId(BUSINESS_ID, machineId);
    expect(integration?.state).toBe('configured');
    expect(integration?.manufacturerMachineId).toBe('ACME-0001');
    const machine = await machineService.findById(BUSINESS_ID, machineId);
    expect(machine?.manufacturerId).toBe(manufacturerId);
    expect(machine?.modelId).toBe(modelId);
    expect(machine?.manufacturer).toBe('mock');
  });

  it('refuses a model from a different manufacturer', async () => {
    const a = await createManufacturerWithModel(BUSINESS_ID, { slug: 'maker-a' });
    const b = await createManufacturerWithModel(BUSINESS_ID, { slug: 'maker-b' });
    const { machineId } = await provisionMachine(BUSINESS_ID);
    await expect(
      service.configure(BUSINESS_ID, { machineId, manufacturerId: a.manufacturerId, modelId: b.modelId, manufacturerMachineId: 'X', environment: 'sandbox' }, 'staff-1'),
    ).rejects.toThrow(IntegrationConfigurationError);
  });

  it('refuses a sandbox-only adapter for a production integration', async () => {
    const ids = await createManufacturerWithModel(BUSINESS_ID);
    const { machineId } = await provisionMachine(BUSINESS_ID);
    await expect(
      service.configure(BUSINESS_ID, { machineId, ...ids, manufacturerMachineId: 'X', environment: 'production' }, 'staff-1'),
    ).rejects.toThrow(/sandbox-only/);
  });

  it('keeps a manufacturer machine id bound to exactly one machine', async () => {
    const ids = await createManufacturerWithModel(BUSINESS_ID);
    const first = await provisionMachine(BUSINESS_ID);
    const second = await provisionMachine(BUSINESS_ID);
    await service.configure(BUSINESS_ID, { machineId: first.machineId, ...ids, manufacturerMachineId: 'SAME', environment: 'sandbox' }, 'staff-1');
    await expect(
      service.configure(BUSINESS_ID, { machineId: second.machineId, ...ids, manufacturerMachineId: 'SAME', environment: 'sandbox' }, 'staff-1'),
    ).rejects.toThrow(ManufacturerMachineIdInUseError);
    // Rebinding the first machine to a new id frees the old one.
    await service.configure(BUSINESS_ID, { machineId: first.machineId, ...ids, manufacturerMachineId: 'NEW', environment: 'sandbox' }, 'staff-1');
    await service.configure(BUSINESS_ID, { machineId: second.machineId, ...ids, manufacturerMachineId: 'SAME', environment: 'sandbox' }, 'staff-1');
    expect((await machineIntegrationRepository.findByManufacturerMachineId(BUSINESS_ID, ids.manufacturerId, 'SAME'))?.machineId).toBe(second.machineId);
  });
});

describe('CONFIGURE → TEST → ACTIVATE', () => {
  it('cannot activate without a passing connection test', async () => {
    const { machineId } = await configuredMachine();
    await expect(service.activate(BUSINESS_ID, machineId, 'staff-1')).rejects.toThrow(IllegalIntegrationStateTransitionError);
  });

  it('a failing test records an error and does not advance', async () => {
    const { machineId } = await configuredMachine();
    const result = await service.testConnection(BUSINESS_ID, machineId, 'staff-1');
    expect(result.ok).toBe(false);
    const integration = await machineIntegrationRepository.findByMachineId(BUSINESS_ID, machineId);
    expect(integration?.state).toBe('configured');
    expect(integration?.errorCounts.connection).toBe(1);
    expect(integration?.lastError?.kind).toBe('connection');
  });

  it('a passing test moves to "tested", and a sandbox integration can then activate', async () => {
    const { machineId } = await configuredMachine();
    adapter.setOnline(machineId);
    expect((await service.testConnection(BUSINESS_ID, machineId, 'staff-1')).ok).toBe(true);
    expect((await machineIntegrationRepository.findByMachineId(BUSINESS_ID, machineId))?.state).toBe('tested');
    await service.activate(BUSINESS_ID, machineId, 'staff-1');
    const integration = await machineIntegrationRepository.findByMachineId(BUSINESS_ID, machineId);
    expect(integration?.state).toBe('active');
    expect(integration?.activatedBy).toBe('staff-1');
  });

  it('refuses to activate a sandbox integration on the production deployment', async () => {
    const { machineId } = await configuredMachine();
    adapter.setOnline(machineId);
    await service.testConnection(BUSINESS_ID, machineId, 'staff-1');
    process.env.VERCEL_ENV = 'production';
    await expect(service.activate(BUSINESS_ID, machineId, 'staff-1')).rejects.toThrow(IntegrationActivationError);
  });

  it('reconfiguring an active integration drops it back to "configured"', async () => {
    const { machineId, manufacturerId, modelId } = await configuredMachine();
    adapter.setOnline(machineId);
    await service.testConnection(BUSINESS_ID, machineId, 'staff-1');
    await service.activate(BUSINESS_ID, machineId, 'staff-1');
    await service.configure(BUSINESS_ID, { machineId, manufacturerId, modelId, manufacturerMachineId: 'ACME-0001', controllerVersion: '2.0', environment: 'sandbox' }, 'staff-1');
    expect((await machineIntegrationRepository.findByMachineId(BUSINESS_ID, machineId))?.state).toBe('configured');
  });

  it('suspension requires a reason and closes the dispense gate', async () => {
    const { machineId } = await configuredMachine();
    adapter.setOnline(machineId);
    await service.testConnection(BUSINESS_ID, machineId, 'staff-1');
    await service.activate(BUSINESS_ID, machineId, 'staff-1');
    expect(await service.dispenseGate(BUSINESS_ID, machineId)).toEqual({ allowed: true, integrated: true });
    await expect(service.suspend(BUSINESS_ID, machineId, ' ', 'staff-1')).rejects.toThrow(/reason/);
    await service.suspend(BUSINESS_ID, machineId, 'door sensor faulty', 'staff-1');
    expect(await service.dispenseGate(BUSINESS_ID, machineId)).toMatchObject({ allowed: false });
  });
});

describe('dispenseGate', () => {
  it('lets a pre-registry machine (no integration record) dispense as before', async () => {
    const { machineId } = await provisionMachine(BUSINESS_ID);
    expect(await service.dispenseGate(BUSINESS_ID, machineId)).toEqual({ allowed: true, integrated: false });
  });

  it('refuses a machine with no integration record on the production deployment — it would sell through an unchecked adapter (e.g. the simulator)', async () => {
    const { machineId } = await provisionMachine(BUSINESS_ID); // manufacturer "mock": the simulator
    const previous = process.env.VERCEL_ENV;
    process.env.VERCEL_ENV = 'production';
    try {
      for (const purpose of ['pre_payment', 'dispatch'] as const) {
        expect(await service.dispenseGate(BUSINESS_ID, machineId, purpose)).toMatchObject({ allowed: false, reason: expect.stringMatching(/no integration record/) });
      }
    } finally {
      if (previous === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = previous;
    }
  });

  it('blocks a configured-but-not-active integration', async () => {
    const { machineId } = await configuredMachine();
    expect(await service.dispenseGate(BUSINESS_ID, machineId)).toEqual({ allowed: false, reason: 'machine integration is configured, not active' });
  });

  it('blocks every machine of a suspended manufacturer', async () => {
    const { machineId, manufacturerId } = await configuredMachine();
    adapter.setOnline(machineId);
    await service.testConnection(BUSINESS_ID, machineId, 'staff-1');
    await service.activate(BUSINESS_ID, machineId, 'staff-1');
    await manufacturerRegistryService.setManufacturerStatus(BUSINESS_ID, manufacturerId, 'suspended', 'staff-1');
    expect(await service.dispenseGate(BUSINESS_ID, machineId)).toEqual({ allowed: false, reason: 'manufacturer is suspended' });
  });
});

describe('production activation gates', () => {
  it('lists every blocker for a production integration on an uncertified model', async () => {
    const ids = await createManufacturerWithModel(BUSINESS_ID, { adapterKey: 'shengma', integrationType: 'manufacturer_api' });
    const { machineId } = await provisionMachine(BUSINESS_ID, 'shengma');
    await service.configure(BUSINESS_ID, { machineId, ...ids, manufacturerMachineId: 'SM-1', environment: 'production' }, 'staff-1');
    const integration = await machineIntegrationRepository.findByMachineId(BUSINESS_ID, machineId);
    const blockers = await service.activationBlockers(BUSINESS_ID, integration!);
    expect(blockers.join(' | ')).toMatch(/No passing connection test/);
    expect(blockers.join(' | ')).toMatch(/not certified/);
    expect(blockers.join(' | ')).toMatch(/production onboarding stage/);
    expect(blockers.join(' | ')).toMatch(/stub/);
  });

  it('a certified model clears the certification blocker', async () => {
    const ids = await createManufacturerWithModel(BUSINESS_ID, { adapterKey: 'shengma' });
    await certifyModel(BUSINESS_ID, ids.modelId);
    const { machineId } = await provisionMachine(BUSINESS_ID, 'shengma');
    await service.configure(BUSINESS_ID, { machineId, ...ids, manufacturerMachineId: 'SM-2', environment: 'production' }, 'staff-1');
    const integration = await machineIntegrationRepository.findByMachineId(BUSINESS_ID, machineId);
    expect((await service.activationBlockers(BUSINESS_ID, integration!)).join(' | ')).not.toMatch(/not certified/);
  });
});

describe('capabilitiesFor', () => {
  it('reports the model ∩ adapter intersection four ways', async () => {
    const { machineId } = await configuredMachine();
    const machine = await machineService.findById(BUSINESS_ID, machineId);
    const { statuses } = await service.capabilitiesFor(BUSINESS_ID, machine!);
    const byKey = Object.fromEntries(statuses.map((entry) => [entry.capability, entry.status]));
    expect(byKey.vend).toBe('supported');
    // The mock adapter could relay a camera, but Model X declares none.
    expect(byKey.camera).toBe('not_supported');
  });

  it('reports not_configured for every capability on a stub adapter', async () => {
    const { machineId } = await provisionMachine(BUSINESS_ID, 'shengma');
    const machine = await machineService.findById(BUSINESS_ID, machineId);
    const { statuses } = await service.capabilitiesFor(BUSINESS_ID, machine!);
    expect(new Set(statuses.map((entry) => entry.status))).toEqual(new Set(['not_configured']));
  });
});
