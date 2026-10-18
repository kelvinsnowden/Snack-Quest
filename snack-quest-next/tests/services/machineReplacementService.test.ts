import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearIntegrationCollections } from '../helpers/integrationFixtures';
import { activeMachine, onboardManufacturer, type V1Machine } from '../helpers/v1TestHarness';
import { machineService } from '@/services/machineService';
import { machineRepository } from '@/repositories/machineRepository';
import { machineIntegrationRepository } from '@/repositories/machineIntegrationRepository';
import { machineSlotRepository } from '@/repositories/machineSlotRepository';
import { machineAgentKeyService } from '@/services/machineAgentKeyService';
import { MachineReplacementError, machineReplacementService } from '@/services/machineReplacementService';

const BUSINESS_ID = 'biz-replace';
const ORIGINAL = { key: process.env.SECRET_ENCRYPTION_KEY, business: process.env.SNACK_QUEST_BUSINESS_ID };
beforeAll(() => {
  process.env.SECRET_ENCRYPTION_KEY = '9'.repeat(64);
  process.env.SNACK_QUEST_BUSINESS_ID = BUSINESS_ID;
});
afterAll(() => {
  process.env.SECRET_ENCRYPTION_KEY = ORIGINAL.key;
  process.env.SNACK_QUEST_BUSINESS_ID = ORIGINAL.business;
});

let machine: V1Machine;
beforeEach(async () => {
  await clearIntegrationCollections(BUSINESS_ID);
  const ids = await onboardManufacturer(BUSINESS_ID, 'replace', { adapterKey: 'snack_quest_gateway' });
  machine = await activeMachine(BUSINESS_ID, ids, { adapterKey: 'snack_quest_gateway' });
});

describe('replacing a machine’s hardware', () => {
  it('keeps the machine and its slots, re-points the integration for re-testing, and revokes the old unit’s keys', async () => {
    const key = await machineAgentKeyService.issue(BUSINESS_ID, machine.machineId, 'staff-1');
    await expect(machineReplacementService.replace(BUSINESS_ID, machine.machineId, { serialNumber: 'SN-NEW', manufacturerMachineId: 'MFR-NEW', reason: 'board died' }, 'staff-1')).rejects.toThrow(/Maintenance/);

    await machineService.updateStatus(BUSINESS_ID, machine.machineId, 'maintenance', 'staff-1');
    const result = await machineReplacementService.replace(BUSINESS_ID, machine.machineId, { serialNumber: 'SN-NEW', manufacturerMachineId: 'MFR-NEW', reason: 'board died' }, 'staff-1');
    expect(result).toEqual({ revokedKeys: [key.keyId], integrationReset: true });

    const after = await machineRepository.findById(BUSINESS_ID, machine.machineId);
    expect(after).toMatchObject({ serialNumber: 'SN-NEW', machineCode: machine.machineCode });
    expect(await machineSlotRepository.listByMachine(BUSINESS_ID, machine.machineId)).toHaveLength(1);
    const integration = await machineIntegrationRepository.findByMachineId(BUSINESS_ID, machine.machineId);
    expect(integration).toMatchObject({ manufacturerMachineId: 'MFR-NEW', state: 'configured' });
    expect((await machineAgentKeyService.list(BUSINESS_ID, machine.machineId)).map((k) => k.status)).toEqual(['revoked']);

    const history = await machineReplacementService.history(BUSINESS_ID, machine.machineId);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ reason: 'board died', before: { manufacturerMachineId: machine.manufacturerMachineId }, after: { serialNumber: 'SN-NEW', manufacturerMachineId: 'MFR-NEW' } });
  });

  it('needs a serial, a reason and, for an integrated machine, the new unit id', async () => {
    await machineService.updateStatus(BUSINESS_ID, machine.machineId, 'maintenance', 'staff-1');
    await expect(machineReplacementService.replace(BUSINESS_ID, machine.machineId, { serialNumber: '', reason: 'x' }, 'staff-1')).rejects.toBeInstanceOf(MachineReplacementError);
    await expect(machineReplacementService.replace(BUSINESS_ID, machine.machineId, { serialNumber: 'SN-2', reason: '' }, 'staff-1')).rejects.toBeInstanceOf(MachineReplacementError);
    await expect(machineReplacementService.replace(BUSINESS_ID, machine.machineId, { serialNumber: 'SN-2', reason: 'x' }, 'staff-1')).rejects.toThrow(/unit’s id/);
  });
});
