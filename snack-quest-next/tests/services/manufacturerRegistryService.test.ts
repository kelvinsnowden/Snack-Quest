import { beforeEach, describe, expect, it } from 'vitest';
import {
  manufacturerRegistryService,
  CertificationIncompleteError,
  IllegalOnboardingTransitionError,
  RegistryValidationError,
  outstandingCertificationChecks,
} from '@/services/manufacturerRegistryService';
import { UnsupportedManufacturerError } from '@/lib/vending/adapterRegistry';
import { CERTIFICATION_CHECKS } from '@/types';
import { certifyModel, clearIntegrationCollections, createManufacturerWithModel } from '../helpers/integrationFixtures';

const BUSINESS_ID = 'biz-registry-test';

beforeEach(async () => {
  await clearIntegrationCollections(BUSINESS_ID);
});

describe('manufacturers', () => {
  it('creates a manufacturer at the application stage with an audit trail', async () => {
    const id = await manufacturerRegistryService.createManufacturer(
      BUSINESS_ID,
      { name: 'Acme Vending', slug: 'acme', integrationType: 'manufacturer_api', defaultAdapterKey: 'mock' },
      'staff-1',
    );
    const manufacturer = await manufacturerRegistryService.requireManufacturer(BUSINESS_ID, id);
    expect(manufacturer.onboardingStage).toBe('application');
    expect(manufacturer.status).toBe('active');
    expect(manufacturer.stageHistory).toHaveLength(1);
  });

  it('rejects a duplicate slug and a malformed slug', async () => {
    await manufacturerRegistryService.createManufacturer(BUSINESS_ID, { name: 'A', slug: 'acme', integrationType: 'manufacturer_api', defaultAdapterKey: 'mock' }, 'staff-1');
    await expect(
      manufacturerRegistryService.createManufacturer(BUSINESS_ID, { name: 'B', slug: 'acme', integrationType: 'manufacturer_api', defaultAdapterKey: 'mock' }, 'staff-1'),
    ).rejects.toThrow(RegistryValidationError);
    await expect(
      manufacturerRegistryService.createManufacturer(BUSINESS_ID, { name: 'C', slug: 'Not A Slug', integrationType: 'manufacturer_api', defaultAdapterKey: 'mock' }, 'staff-1'),
    ).rejects.toThrow(RegistryValidationError);
  });

  it('rejects an unregistered adapter, and an adapter that cannot speak the integration type', async () => {
    await expect(
      manufacturerRegistryService.createManufacturer(BUSINESS_ID, { name: 'A', slug: 'a', integrationType: 'manufacturer_api', defaultAdapterKey: 'acme-sdk' }, 'staff-1'),
    ).rejects.toThrow(UnsupportedManufacturerError);
    // The mock is an outbound adapter — it cannot back a manufacturer who integrates against *our* API.
    await expect(
      manufacturerRegistryService.createManufacturer(BUSINESS_ID, { name: 'B', slug: 'b', integrationType: 'snack_quest_api', defaultAdapterKey: 'mock' }, 'staff-1'),
    ).rejects.toThrow(RegistryValidationError);
  });
});

describe('onboarding stages', () => {
  it('advances one stage at a time and never skips', async () => {
    const { manufacturerId } = await createManufacturerWithModel(BUSINESS_ID);
    await expect(manufacturerRegistryService.moveToStage(BUSINESS_ID, manufacturerId, 'sandbox', 'staff-1')).rejects.toThrow(IllegalOnboardingTransitionError);
    await manufacturerRegistryService.moveToStage(BUSINESS_ID, manufacturerId, 'technical_review', 'staff-1');
    await manufacturerRegistryService.moveToStage(BUSINESS_ID, manufacturerId, 'credentials', 'staff-1');
    const manufacturer = await manufacturerRegistryService.requireManufacturer(BUSINESS_ID, manufacturerId);
    expect(manufacturer.onboardingStage).toBe('credentials');
    expect(manufacturer.stageHistory.map((entry) => entry.stage)).toEqual(['application', 'technical_review', 'credentials']);
  });

  it('may move back to an earlier stage', async () => {
    const { manufacturerId } = await createManufacturerWithModel(BUSINESS_ID);
    await manufacturerRegistryService.moveToStage(BUSINESS_ID, manufacturerId, 'technical_review', 'staff-1');
    await manufacturerRegistryService.moveToStage(BUSINESS_ID, manufacturerId, 'application', 'staff-1');
    expect((await manufacturerRegistryService.requireManufacturer(BUSINESS_ID, manufacturerId)).onboardingStage).toBe('application');
  });

  it('refuses production until a model is certified', async () => {
    const { manufacturerId, modelId } = await createManufacturerWithModel(BUSINESS_ID);
    for (const stage of ['technical_review', 'credentials', 'sandbox', 'certification'] as const) {
      await manufacturerRegistryService.moveToStage(BUSINESS_ID, manufacturerId, stage, 'staff-1');
    }
    await expect(manufacturerRegistryService.moveToStage(BUSINESS_ID, manufacturerId, 'production', 'staff-1')).rejects.toThrow(/certified/);
    await certifyModel(BUSINESS_ID, modelId);
    await manufacturerRegistryService.moveToStage(BUSINESS_ID, manufacturerId, 'production', 'staff-1');
    expect((await manufacturerRegistryService.requireManufacturer(BUSINESS_ID, manufacturerId)).onboardingStage).toBe('production');
  });

  it('a suspended manufacturer cannot advance', async () => {
    const { manufacturerId } = await createManufacturerWithModel(BUSINESS_ID);
    await manufacturerRegistryService.setManufacturerStatus(BUSINESS_ID, manufacturerId, 'suspended', 'staff-1');
    await expect(manufacturerRegistryService.moveToStage(BUSINESS_ID, manufacturerId, 'technical_review', 'staff-1')).rejects.toThrow(/suspended/);
  });
});

describe('models and certification', () => {
  it('stores declared capabilities and rejects unknown ones', async () => {
    const { manufacturerId, modelId } = await createManufacturerWithModel(BUSINESS_ID, { capabilities: ['vend', 'camera'] });
    expect((await manufacturerRegistryService.requireModel(BUSINESS_ID, modelId)).declaredCapabilities).toEqual(['vend', 'camera']);
    await expect(
      manufacturerRegistryService.createModel(BUSINESS_ID, { manufacturerId, name: 'Y', slug: 'y', declaredCapabilities: ['vend', 'teleport'] }, 'staff-1'),
    ).rejects.toThrow(RegistryValidationError);
  });

  it('refuses to certify with any check outstanding, and names what is missing', async () => {
    const { modelId } = await createManufacturerWithModel(BUSINESS_ID);
    await manufacturerRegistryService.recordCertificationCheck(BUSINESS_ID, modelId, 'authentication', { outcome: 'passed', evidence: 'run #1' }, 'staff-1');
    try {
      await manufacturerRegistryService.certifyModel(BUSINESS_ID, modelId, 'staff-1');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(CertificationIncompleteError);
      expect((error as CertificationIncompleteError).outstanding).not.toContain('authentication');
      expect((error as CertificationIncompleteError).outstanding).toContain('dispense_command');
    }
    expect((await manufacturerRegistryService.requireModel(BUSINESS_ID, modelId)).certificationStatus).toBe('in_progress');
  });

  it('requires evidence, and only allows not-applicable where the check permits it', async () => {
    const { modelId } = await createManufacturerWithModel(BUSINESS_ID);
    await expect(
      manufacturerRegistryService.recordCertificationCheck(BUSINESS_ID, modelId, 'heartbeat', { outcome: 'passed', evidence: '  ' }, 'staff-1'),
    ).rejects.toThrow(/evidence/);
    await expect(
      manufacturerRegistryService.recordCertificationCheck(BUSINESS_ID, modelId, 'idempotency', { outcome: 'not_applicable', evidence: 'n/a' }, 'staff-1'),
    ).rejects.toThrow(/cannot be marked not applicable/);
    await manufacturerRegistryService.recordCertificationCheck(BUSINESS_ID, modelId, 'webhooks', { outcome: 'not_applicable', evidence: 'no webhooks' }, 'staff-1');
  });

  it('the automated contract suite cannot be ticked by hand — certification needs a harness run', async () => {
    const { modelId } = await createManufacturerWithModel(BUSINESS_ID);
    for (const { key, harnessOnly } of CERTIFICATION_CHECKS) {
      if (harnessOnly) {
        await expect(manufacturerRegistryService.recordCertificationCheck(BUSINESS_ID, modelId, key, { outcome: 'passed', evidence: 'trust me' }, 'staff-1')).rejects.toBeInstanceOf(RegistryValidationError);
        continue;
      }
      await manufacturerRegistryService.recordCertificationCheck(BUSINESS_ID, modelId, key, { outcome: 'passed', evidence: 'ok' }, 'staff-1');
    }
    await expect(manufacturerRegistryService.certifyModel(BUSINESS_ID, modelId, 'staff-1')).rejects.toMatchObject({ outstanding: ['contract_suite'] });
  });

  it('certifies with webhooks not applicable, since that check permits it', async () => {
    const { modelId } = await createManufacturerWithModel(BUSINESS_ID);
    for (const { key, harnessOnly } of CERTIFICATION_CHECKS) {
      await manufacturerRegistryService.recordCertificationCheck(
        BUSINESS_ID,
        modelId,
        key,
        key === 'webhooks' ? { outcome: 'not_applicable', evidence: 'polls only' } : { outcome: 'passed', evidence: 'ok' },
        'staff-1',
        { source: harnessOnly ? 'harness' : 'manual' },
      );
    }
    await manufacturerRegistryService.certifyModel(BUSINESS_ID, modelId, 'staff-1');
    expect((await manufacturerRegistryService.requireModel(BUSINESS_ID, modelId)).certificationStatus).toBe('certified');
  });

  it('revokes certification when the model contract changes afterwards', async () => {
    const { modelId } = await createManufacturerWithModel(BUSINESS_ID);
    await certifyModel(BUSINESS_ID, modelId);
    const renamed = await manufacturerRegistryService.updateModel(BUSINESS_ID, modelId, { name: 'Model X2' }, 'staff-1');
    expect(renamed.certificationRevoked).toBe(false);
    const changed = await manufacturerRegistryService.updateModel(BUSINESS_ID, modelId, { declaredCapabilities: ['vend', 'camera'] }, 'staff-1');
    expect(changed.certificationRevoked).toBe(true);
    expect((await manufacturerRegistryService.requireModel(BUSINESS_ID, modelId)).certificationStatus).toBe('revoked');
  });

  it('inventory cannot be "not applicable" for a model that declares inventory reporting, nor webhooks for a webhook manufacturer', async () => {
    const withInventory = await createManufacturerWithModel(BUSINESS_ID, { capabilities: ['vend', 'inventory_read', 'heartbeat'] });
    await expect(
      manufacturerRegistryService.recordCertificationCheck(BUSINESS_ID, withInventory.modelId, 'inventory', { outcome: 'not_applicable', evidence: 'skip it' }, 'staff-1'),
    ).rejects.toThrow(/declares inventory reporting/);
    const webhookMaker = await createManufacturerWithModel(BUSINESS_ID, { integrationType: 'webhook', capabilities: ['vend', 'heartbeat'] });
    await expect(
      manufacturerRegistryService.recordCertificationCheck(BUSINESS_ID, webhookMaker.modelId, 'webhooks', { outcome: 'not_applicable', evidence: 'skip it' }, 'staff-1'),
    ).rejects.toThrow(/delivers by webhook/);
    // Recorded before the model declared inventory (or written directly): still outstanding at certification time.
    expect(outstandingCertificationChecks({ inventory: { outcome: 'not_applicable', evidence: 'x', verifiedBy: 's', verifiedAt: null as never } }, { inventoryRequired: true })).toContain('inventory');
  });

  it('after a revocation, the old harness run no longer certifies — a new one is needed', async () => {
    const { modelId } = await createManufacturerWithModel(BUSINESS_ID);
    await certifyModel(BUSINESS_ID, modelId);
    await manufacturerRegistryService.revokeCertification(BUSINESS_ID, modelId, 'field defect: double dispense on firmware 4.3', 'staff-1');
    await expect(manufacturerRegistryService.certifyModel(BUSINESS_ID, modelId, 'staff-1')).rejects.toMatchObject({ outstanding: ['contract_suite'] });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await manufacturerRegistryService.recordCertificationCheck(BUSINESS_ID, modelId, 'contract_suite', { outcome: 'passed', evidence: 'harness run cert_new' }, 'system:certification', { source: 'harness' });
    await manufacturerRegistryService.certifyModel(BUSINESS_ID, modelId, 'staff-1');
    expect((await manufacturerRegistryService.requireModel(BUSINESS_ID, modelId)).certificationStatus).toBe('certified');
  });

  it('a failed check after certification revokes it', async () => {
    const { modelId } = await createManufacturerWithModel(BUSINESS_ID);
    await certifyModel(BUSINESS_ID, modelId);
    await manufacturerRegistryService.recordCertificationCheck(BUSINESS_ID, modelId, 'failed_dispense', { outcome: 'failed', evidence: 'jam not reported' }, 'staff-1');
    expect((await manufacturerRegistryService.requireModel(BUSINESS_ID, modelId)).certificationStatus).toBe('in_progress');
  });
});

describe('outstandingCertificationChecks', () => {
  it('lists every check for an empty checklist', () => {
    expect(outstandingCertificationChecks({})).toHaveLength(CERTIFICATION_CHECKS.length);
  });
});
