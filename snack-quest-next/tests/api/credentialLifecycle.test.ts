import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { manufacturerRegistryService } from '@/services/manufacturerRegistryService';
import { integrationCredentialService, CredentialIssuanceError } from '@/services/integrationCredentialService';
import { resetRateLimiterForTesting } from '@/lib/rateLimit/rateLimiter';
import { clearIntegrationCollections } from '../helpers/integrationFixtures';
import { activeMachine, apiKey, onboardManufacturer, v1, webhook, type Key, type V1Machine } from '../helpers/v1TestHarness';

/**
 * The credential lifecycle end to end, as a manufacturer lives it:
 * application → sandbox credentials → sandbox testing → certification →
 * production credentials → production activation — and the ways out:
 * suspension (every key stops at once, everywhere), revocation.
 */

const BUSINESS_ID = 'biz-credential-lifecycle';
const ORIGINAL = { business: process.env.SNACK_QUEST_BUSINESS_ID, key: process.env.SECRET_ENCRYPTION_KEY };
beforeAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = BUSINESS_ID;
  process.env.SECRET_ENCRYPTION_KEY = '7'.repeat(64);
});
afterAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = ORIGINAL.business;
  process.env.SECRET_ENCRYPTION_KEY = ORIGINAL.key;
});

let ids: { manufacturerId: string; modelId: string };
let machine: V1Machine;
let key: Key;
let webhookKey: Key;
const eventId = () => `e-${Date.now()}-${Math.random().toString(36).slice(2)}`;

beforeEach(async () => {
  resetRateLimiterForTesting();
  await clearIntegrationCollections(BUSINESS_ID);
  ids = await onboardManufacturer(BUSINESS_ID, 'lifeco');
  machine = await activeMachine(BUSINESS_ID, ids);
  key = await apiKey(BUSINESS_ID, ids.manufacturerId);
  webhookKey = await apiKey(BUSINESS_ID, ids.manufacturerId, { kind: 'webhook' });
});

describe('onboarding gates on credentials', () => {
  it('production credentials cannot be issued before the production stage; sandbox ones only from the credentials stage', async () => {
    await expect(apiKey(BUSINESS_ID, ids.manufacturerId, { environment: 'production' })).rejects.toBeInstanceOf(CredentialIssuanceError);
    const fresh = await manufacturerRegistryService.createManufacturer(BUSINESS_ID, { name: 'Applicant', slug: 'applicant', integrationType: 'snack_quest_api', defaultAdapterKey: 'snack_quest_gateway' }, 'staff-1');
    await expect(apiKey(BUSINESS_ID, fresh)).rejects.toBeInstanceOf(CredentialIssuanceError);
  });

  it('a sandbox key can never operate a production machine', async () => {
    const gatewayIds = await onboardManufacturer(BUSINESS_ID, 'lifeco-gw', { adapterKey: 'snack_quest_gateway' });
    const production = await activeMachine(BUSINESS_ID, gatewayIds, { environment: 'production', adapterKey: 'snack_quest_gateway' });
    const sandboxKey = await apiKey(BUSINESS_ID, gatewayIds.manufacturerId);
    expect((await v1(sandboxKey, production.machineCode).heartbeat({ eventId: eventId() })).error?.code).toBe('environment_mismatch');
  });
});

describe('a suspended manufacturer cannot authenticate anywhere', () => {
  it('every Machine API endpoint and the webhook endpoint answer 403 manufacturer_suspended, and work again on reinstatement', async () => {
    await manufacturerRegistryService.setManufacturerStatus(BUSINESS_ID, ids.manufacturerId, 'suspended', 'staff-1');
    const client = v1(key, machine.machineCode);
    const results = {
      connect: await client.connect({ manufacturerMachineId: machine.manufacturerMachineId }),
      describe: await client.describe(),
      heartbeat: await client.heartbeat({ eventId: eventId() }),
      status: await client.status({ eventId: eventId(), online: true }),
      inventory: await client.inventory({ eventId: eventId(), slots: [{ slotId: 'spiral_01', quantity: 3 }] }),
      events: await client.events({ events: [{ eventId: eventId(), type: 'door.opened' }] }),
      commands: await client.commands(),
      ack: await client.ack('cmd-anything'),
      report: await client.report('cmd-anything', { eventId: eventId(), status: 'dispensed' }),
      webhook: await webhook(webhookKey, 'lifeco', { eventId: eventId(), type: 'machine.heartbeat', manufacturerMachineId: machine.manufacturerMachineId }),
    };
    for (const [endpoint, result] of Object.entries(results)) {
      expect({ endpoint, status: result.status, code: result.error?.code }).toEqual({ endpoint, status: 403, code: 'manufacturer_suspended' });
    }

    await manufacturerRegistryService.setManufacturerStatus(BUSINESS_ID, ids.manufacturerId, 'active', 'staff-1');
    expect((await client.heartbeat({ eventId: eventId() })).status).toBe(202);
  });

  it('suspension also stops credentials being issued', async () => {
    await manufacturerRegistryService.setManufacturerStatus(BUSINESS_ID, ids.manufacturerId, 'suspended', 'staff-1');
    await expect(apiKey(BUSINESS_ID, ids.manufacturerId)).rejects.toBeInstanceOf(CredentialIssuanceError);
  });
});

describe('revocation and rotation', () => {
  it('a revoked key stops on the next request; its rotated successor keeps working', async () => {
    const successor = await integrationCredentialService.rotate(BUSINESS_ID, key.keyId, {}, 'staff-1');
    expect((await v1(key, machine.machineCode).heartbeat({ eventId: eventId() })).status).toBe(202);
    expect((await v1(successor, machine.machineCode).heartbeat({ eventId: eventId() })).status).toBe(202);
    await integrationCredentialService.revoke(BUSINESS_ID, key.keyId, 'rotation complete', 'staff-1');
    expect((await v1(key, machine.machineCode).heartbeat({ eventId: eventId() })).error?.code).toBe('key_revoked');
    expect((await v1(successor, machine.machineCode).heartbeat({ eventId: eventId() })).status).toBe(202);
  });
});
