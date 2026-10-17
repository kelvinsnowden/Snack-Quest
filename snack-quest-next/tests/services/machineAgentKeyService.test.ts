import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearIntegrationCollections } from '../helpers/integrationFixtures';
import { activeMachine, onboardManufacturer, type V1Machine } from '../helpers/v1TestHarness';
import { MachineSlotService } from '@/services/machineSlotService';
import { agentConfigFor, machineAgentKeyService, MachineNotIntegratedError } from '@/services/machineAgentKeyService';
import { validateConfig } from '@/machine-agent/config/agentConfig';

const BUSINESS_ID = 'biz-agent-key';
const ORIGINAL = { site: process.env.NEXT_PUBLIC_SITE_URL, key: process.env.SECRET_ENCRYPTION_KEY, business: process.env.SNACK_QUEST_BUSINESS_ID };
beforeAll(() => {
  process.env.NEXT_PUBLIC_SITE_URL = 'https://www.snackquests.shop';
  process.env.SECRET_ENCRYPTION_KEY = '9'.repeat(64);
  process.env.SNACK_QUEST_BUSINESS_ID = BUSINESS_ID;
});
afterAll(() => {
  process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL.site;
  process.env.SECRET_ENCRYPTION_KEY = ORIGINAL.key;
  process.env.SNACK_QUEST_BUSINESS_ID = ORIGINAL.business;
});

let machine: V1Machine;
beforeEach(async () => {
  await clearIntegrationCollections(BUSINESS_ID);
  const ids = await onboardManufacturer(BUSINESS_ID, 'agentkey', { adapterKey: 'snack_quest_gateway' });
  machine = await activeMachine(BUSINESS_ID, ids, { adapterKey: 'snack_quest_gateway' });
  await new MachineSlotService().setSlotMappings(BUSINESS_ID, machine.machineId, [{ slotCode: 'A01', manufacturerSlotId: 'b1-m07' }]);
});

describe('machine software keys', () => {
  it('issues a key for this machine only, with an agent config the agent accepts', async () => {
    const issued = await machineAgentKeyService.issue(BUSINESS_ID, machine.machineId, 'staff-1');
    expect(issued.secret.length).toBeGreaterThan(16);
    const config = validateConfig(JSON.parse(issued.config));
    expect(config).toMatchObject({
      snackQuest: { baseUrl: 'https://www.snackquests.shop', keyId: issued.keyId },
      manufacturerMachineId: machine.manufacturerMachineId,
      slots: [{ slotId: 'b1-m07' }],
    });
    expect(issued.config).not.toContain(issued.secret);
    const keys = await machineAgentKeyService.list(BUSINESS_ID, machine.machineId);
    expect(keys.map((key) => key.keyId)).toEqual([issued.keyId]);
    expect(keys[0].scope).toMatchObject({ type: 'machine', machineId: machine.machineId });
  });

  it('refuses a machine with no integration set up', async () => {
    await expect(machineAgentKeyService.issue(BUSINESS_ID, 'no-such-machine', 'staff-1')).rejects.toBeInstanceOf(MachineNotIntegratedError);
  });

  it('only lists M109E-style lanes in the config, with a placeholder when none are mapped', () => {
    const config = JSON.parse(agentConfigFor({ siteUrl: 'https://x.test', keyId: 'sqk_test_1', manufacturerMachineId: 'M', lanes: ['spiral_01', ''] }));
    expect(config.slots).toEqual([{ slotId: 'b1-m00', motorType: 3, curtainMode: 2 }]);
  });
});
