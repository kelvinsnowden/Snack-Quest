import { adminFirestore } from '@/lib/firebase/admin';
import { machineService } from '@/services/machineService';
import { manufacturerRegistryService } from '@/services/manufacturerRegistryService';
import { machineIntegrationRepository } from '@/repositories/machineIntegrationRepository';
import { CERTIFICATION_CHECKS, type IntegrationType, type MachineIntegrationEnvironment } from '@/types';

/** Every collection the integration layer writes — wiped between tests. */
export const INTEGRATION_COLLECTIONS = [
  'machines',
  'machineSlots',
  'deviceCredentials',
  'manufacturers',
  'machineModels',
  'machineIntegrations',
  'machineIntegrationIdentities',
  'integrationCredentials',
  'integrationRequestNonces',
  'machineDispenseCommands',
  'machineEvents',
  'machineTelemetryEvents',
  'machineTransactions',
  'machineInventoryMovements',
  'machineCommands',
  'webhookEvents',
  'partners',
  'alerts',
  'manufacturerApiCredentials',
  'paymentInitiations',
  'slotMappingHistory',
];

export async function clearIntegrationCollections(businessId: string): Promise<void> {
  for (const collection of INTEGRATION_COLLECTIONS) {
    await adminFirestore.recursiveDelete(adminFirestore.collection(collection));
  }
  await adminFirestore.recursiveDelete(adminFirestore.collection('businesses').doc(businessId).collection('counters'));
}

export async function createManufacturerWithModel(
  businessId: string,
  options: {
    slug?: string;
    integrationType?: IntegrationType;
    adapterKey?: string;
    capabilities?: string[];
  } = {},
): Promise<{ manufacturerId: string; modelId: string }> {
  const slug = options.slug ?? `acme-${Math.random().toString(36).slice(2, 8)}`;
  const manufacturerId = await manufacturerRegistryService.createManufacturer(
    businessId,
    {
      name: `Manufacturer ${slug}`,
      slug,
      integrationType: options.integrationType ?? 'manufacturer_api',
      defaultAdapterKey: options.adapterKey ?? 'mock',
    },
    'staff-1',
  );
  const modelId = await manufacturerRegistryService.createModel(
    businessId,
    {
      manufacturerId,
      name: 'Model X',
      slug: 'model-x',
      declaredCapabilities: options.capabilities ?? ['vend', 'slot_read', 'inventory_read', 'heartbeat', 'telemetry', 'faults', 'dispense_confirmation'],
      slotCount: 40,
    },
    'staff-1',
  );
  return { manufacturerId, modelId };
}

/** Records a passing result for every certification check, then certifies. */
export async function certifyModel(businessId: string, modelId: string): Promise<void> {
  for (const { key } of CERTIFICATION_CHECKS) {
    await manufacturerRegistryService.recordCertificationCheck(businessId, modelId, key, { outcome: 'passed', evidence: `test evidence for ${key}` }, 'staff-1');
  }
  await manufacturerRegistryService.certifyModel(businessId, modelId, 'staff-1');
}

export async function provisionMachine(businessId: string, adapterKey = 'mock'): Promise<{ machineId: string; machineCode: string; secret: string }> {
  const { machineId, machineCode, credential } = await machineService.provisionDevice({
    businessId,
    serialNumber: `SN-${Math.random().toString(36).slice(2, 8)}`,
    manufacturer: adapterKey,
    model: 'Model X',
    actor: 'staff-1',
  });
  return { machineId, machineCode, secret: credential.secret };
}

/** Writes an integration straight into the `active` state — for tests of what happens *after* activation, not of activation itself. */
export async function activeIntegration(
  businessId: string,
  machineId: string,
  ids: { manufacturerId: string; modelId: string },
  options: { manufacturerMachineId?: string; adapterKey?: string; environment?: MachineIntegrationEnvironment } = {},
): Promise<string> {
  const machine = await machineService.findById(businessId, machineId);
  const manufacturerMachineId = options.manufacturerMachineId ?? `mfr-${machineId}`;
  await machineIntegrationRepository.configure(
    {
      businessId,
      machineId,
      machineCode: machine!.machineCode,
      manufacturerId: ids.manufacturerId,
      modelId: ids.modelId,
      manufacturerMachineId,
      controllerType: null,
      controllerVersion: null,
      firmwareVersion: null,
      integrationType: 'manufacturer_api',
      integrationVersion: '1',
      adapterKey: options.adapterKey ?? 'mock',
      environment: options.environment ?? 'sandbox',
    },
    'staff-1',
  );
  await machineIntegrationRepository.setState(businessId, machineId, 'active', 'staff-1');
  return manufacturerMachineId;
}
