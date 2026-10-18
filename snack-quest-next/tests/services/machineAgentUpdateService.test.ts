import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { clearIntegrationCollections } from '../helpers/integrationFixtures';
import { activeMachine, onboardManufacturer, type V1Machine } from '../helpers/v1TestHarness';
import { machineCommandService } from '@/services/machineCommandService';
import { NotAnAgentMachineError, AgentReleaseUnavailableError, agentReleaseOf, machineAgentUpdateService } from '@/services/machineAgentUpdateService';

const BUSINESS_ID = 'biz-agent-update';
const ORIGINAL = { site: process.env.NEXT_PUBLIC_SITE_URL, business: process.env.SNACK_QUEST_BUSINESS_ID };
const MANIFEST = { release: '0.3.0', file: 'm109e-agent-0.3.0.mjs', sha256: 'b'.repeat(64), bytes: 1234 };
const serving = (manifest: unknown, status = 200) => (async () => new Response(JSON.stringify(manifest), { status })) as unknown as typeof fetch;

beforeAll(() => {
  process.env.NEXT_PUBLIC_SITE_URL = 'https://www.snackquests.shop';
  process.env.SNACK_QUEST_BUSINESS_ID = BUSINESS_ID;
});
afterAll(() => {
  process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL.site;
  process.env.SNACK_QUEST_BUSINESS_ID = ORIGINAL.business;
});

let machine: V1Machine;
beforeEach(async () => {
  await clearIntegrationCollections(BUSINESS_ID);
  const ids = await onboardManufacturer(BUSINESS_ID, 'agentupdate', { adapterKey: 'snack_quest_gateway' });
  machine = await activeMachine(BUSINESS_ID, ids, { adapterKey: 'snack_quest_gateway' });
});

describe('machineAgentUpdateService', () => {
  it('reads the release a machine runs from its connect version', () => {
    expect(agentReleaseOf('m109e-agent/0.2.0')).toBe('0.2.0');
    expect(agentReleaseOf('acme-firmware/9')).toBeNull();
    expect(agentReleaseOf(null)).toBeNull();
  });

  it('sends an agent machine this deployment’s release, with its checksum, as an update_agent command', async () => {
    await adminFirestore.collection('machineIntegrations').doc(machine.machineId).update({ integrationVersion: 'm109e-agent/0.2.0' });
    const result = await machineAgentUpdateService.update(BUSINESS_ID, machine.machineId, 'staff-1', serving(MANIFEST));
    expect(result).toMatchObject({ from: '0.2.0', to: '0.3.0' });
    const pending = await machineCommandService.listPendingForMachine(BUSINESS_ID, machine.machineId);
    expect(pending).toHaveLength(1);
    expect(pending[0].data).toMatchObject({
      commandType: 'update_agent',
      payload: { version: '0.3.0', url: 'https://www.snackquests.shop/machine-agent/m109e-agent-0.3.0.mjs', sha256: MANIFEST.sha256 },
    });
  });

  it('refuses a machine that is not running the agent, and a missing or incomplete release', async () => {
    await expect(machineAgentUpdateService.update(BUSINESS_ID, machine.machineId, 'staff-1', serving(MANIFEST))).rejects.toBeInstanceOf(NotAnAgentMachineError);
    await adminFirestore.collection('machineIntegrations').doc(machine.machineId).update({ integrationVersion: 'm109e-agent/0.2.0' });
    await expect(machineAgentUpdateService.update(BUSINESS_ID, machine.machineId, 'staff-1', serving({}, 404))).rejects.toBeInstanceOf(AgentReleaseUnavailableError);
    await expect(machineAgentUpdateService.update(BUSINESS_ID, machine.machineId, 'staff-1', serving({ release: '0.3.0' }))).rejects.toBeInstanceOf(AgentReleaseUnavailableError);
  });
});
