import { beforeEach, describe, expect, it } from 'vitest';
import { integrationCredentialService, CredentialIssuanceError } from '@/services/integrationCredentialService';
import { manufacturerRegistryService } from '@/services/manufacturerRegistryService';
import { integrationCredentialRepository } from '@/repositories/integrationCredentialRepository';
import { certifyModel, clearIntegrationCollections, createManufacturerWithModel } from '../helpers/integrationFixtures';

const BUSINESS_ID = 'biz-credential-test';

beforeEach(async () => {
  await clearIntegrationCollections(BUSINESS_ID);
});

async function advanceTo(manufacturerId: string, stages: ('technical_review' | 'credentials' | 'sandbox' | 'certification' | 'production')[]) {
  for (const stage of stages) {
    await manufacturerRegistryService.moveToStage(BUSINESS_ID, manufacturerId, stage, 'staff-1');
  }
}

describe('issuing credentials', () => {
  it('refuses sandbox keys before the credentials stage', async () => {
    const { manufacturerId } = await createManufacturerWithModel(BUSINESS_ID);
    await expect(integrationCredentialService.issue(BUSINESS_ID, manufacturerId, { kind: 'api', environment: 'sandbox', label: 'x' }, 'staff-1')).rejects.toThrow(CredentialIssuanceError);
    await advanceTo(manufacturerId, ['technical_review', 'credentials']);
    const issued = await integrationCredentialService.issue(BUSINESS_ID, manufacturerId, { kind: 'api', environment: 'sandbox', label: 'x' }, 'staff-1');
    expect(issued.keyId).toMatch(/^sqk_test_/);
    expect(issued.secret).toMatch(/^sqs_/);
  });

  it('refuses production keys until the manufacturer is in production', async () => {
    const { manufacturerId, modelId } = await createManufacturerWithModel(BUSINESS_ID);
    await advanceTo(manufacturerId, ['technical_review', 'credentials', 'sandbox', 'certification']);
    await expect(integrationCredentialService.issue(BUSINESS_ID, manufacturerId, { kind: 'api', environment: 'production', label: 'x' }, 'staff-1')).rejects.toThrow(/production/);
    await certifyModel(BUSINESS_ID, modelId);
    await advanceTo(manufacturerId, ['production']);
    process.env.SECRET_ENCRYPTION_KEY = 'e'.repeat(64);
    try {
      expect((await integrationCredentialService.issue(BUSINESS_ID, manufacturerId, { kind: 'api', environment: 'production', label: 'x' }, 'staff-1')).keyId).toMatch(/^sqk_live_/);
    } finally {
      delete process.env.SECRET_ENCRYPTION_KEY;
    }
  });

  it('never issues a production key whose secret would be stored unencrypted', async () => {
    const { manufacturerId, modelId } = await createManufacturerWithModel(BUSINESS_ID);
    await advanceTo(manufacturerId, ['technical_review', 'credentials', 'sandbox', 'certification']);
    await certifyModel(BUSINESS_ID, modelId);
    await advanceTo(manufacturerId, ['production']);
    delete process.env.SECRET_ENCRYPTION_KEY;
    await expect(integrationCredentialService.issue(BUSINESS_ID, manufacturerId, { kind: 'api', environment: 'production', label: 'x' }, 'staff-1')).rejects.toThrow(/SECRET_ENCRYPTION_KEY/);

    process.env.SECRET_ENCRYPTION_KEY = 'e'.repeat(64);
    try {
      const issued = await integrationCredentialService.issue(BUSINESS_ID, manufacturerId, { kind: 'api', environment: 'production', label: 'x' }, 'staff-1');
      const stored = await integrationCredentialRepository.findByKeyId(issued.keyId);
      expect(stored?.secretEncrypted.startsWith('enc:v1:')).toBe(true);
      expect(stored?.secretEncrypted).not.toContain(issued.secret);
      expect(integrationCredentialRepository.revealSecret(stored!)).toBe(issued.secret);
    } finally {
      delete process.env.SECRET_ENCRYPTION_KEY;
    }
  });

  it('refuses a suspended manufacturer', async () => {
    const { manufacturerId } = await createManufacturerWithModel(BUSINESS_ID);
    await advanceTo(manufacturerId, ['technical_review', 'credentials']);
    await manufacturerRegistryService.setManufacturerStatus(BUSINESS_ID, manufacturerId, 'suspended', 'staff-1');
    await expect(integrationCredentialService.issue(BUSINESS_ID, manufacturerId, { kind: 'api', environment: 'sandbox', label: 'x' }, 'staff-1')).rejects.toThrow(/suspended/);
  });

  it('never lists a secret, encrypted or not', async () => {
    const { manufacturerId } = await createManufacturerWithModel(BUSINESS_ID);
    await advanceTo(manufacturerId, ['technical_review', 'credentials']);
    const issued = await integrationCredentialService.issue(BUSINESS_ID, manufacturerId, { kind: 'webhook', environment: 'sandbox', label: 'hooks' }, 'staff-1');
    const listed = await integrationCredentialService.listForManufacturer(BUSINESS_ID, manufacturerId);
    expect(listed).toHaveLength(1);
    expect(listed[0]).not.toHaveProperty('secretEncrypted');
    expect(JSON.stringify(listed)).not.toContain(issued.secret);
  });

  it('revocation needs a reason and is immediate', async () => {
    const { manufacturerId } = await createManufacturerWithModel(BUSINESS_ID);
    await advanceTo(manufacturerId, ['technical_review', 'credentials']);
    const issued = await integrationCredentialService.issue(BUSINESS_ID, manufacturerId, { kind: 'api', environment: 'sandbox', label: 'x' }, 'staff-1');
    await expect(integrationCredentialService.revoke(BUSINESS_ID, issued.keyId, ' ', 'staff-1')).rejects.toThrow(/reason/);
    await integrationCredentialService.revoke(BUSINESS_ID, issued.keyId, 'leaked', 'staff-1');
    expect((await integrationCredentialRepository.findByKeyId(issued.keyId))?.revokedReason).toBe('leaked');
  });
});
