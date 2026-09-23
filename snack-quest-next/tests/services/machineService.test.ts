import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineService, MachineNotFoundError, IllegalMachineStatusTransitionError, PartnerDoesNotOwnMachineError } from '@/services/machineService';
import { partnerService } from '@/services/partnerService';
import { deviceCredentialRepository } from '@/repositories/deviceCredentialRepository';
import { machineLocationHistoryRepository } from '@/repositories/machineLocationHistoryRepository';

const BUSINESS_ID = 'biz-machine-service-test';

beforeEach(async () => {
  for (const collection of ['machines', 'deviceCredentials', 'partners', 'machineLocationHistory']) {
    await adminFirestore.recursiveDelete(adminFirestore.collection(collection));
  }
});

describe('provisionDevice', () => {
  it('creates a machine in "provisioning" and issues a working credential', async () => {
    const { machineId, credential } = await machineService.provisionDevice({
      businessId: BUSINESS_ID,
      machineCode: 'SQ-M001',
      serialNumber: 'SN-1',
      manufacturer: 'mock',
      model: 'test',
      actor: 'staff-1',
    });

    const machine = await machineService.findById(BUSINESS_ID, machineId);
    expect(machine?.status).toBe('provisioning');
    expect(credential.secret).toHaveLength(64);

    const active = await deviceCredentialRepository.listActiveByMachine(BUSINESS_ID, machineId);
    expect(active).toHaveLength(1);
  });

  it('refuses a duplicate machineCode', async () => {
    await machineService.provisionDevice({ businessId: BUSINESS_ID, machineCode: 'SQ-DUP', serialNumber: 'SN-1', manufacturer: 'mock', model: 'test', actor: 'staff-1' });
    await expect(
      machineService.provisionDevice({ businessId: BUSINESS_ID, machineCode: 'SQ-DUP', serialNumber: 'SN-2', manufacturer: 'mock', model: 'test', actor: 'staff-1' }),
    ).rejects.toThrow('already in use');
  });

  it('refuses an ownerPartnerId that does not exist', async () => {
    await expect(
      machineService.provisionDevice({ businessId: BUSINESS_ID, machineCode: 'SQ-M002', serialNumber: 'SN-1', manufacturer: 'mock', model: 'test', ownerPartnerId: 'ghost-partner', actor: 'staff-1' }),
    ).rejects.toThrow('not found');
  });
});

describe('the machine status state machine', () => {
  async function provision() {
    const { machineId } = await machineService.provisionDevice({ businessId: BUSINESS_ID, machineCode: `SQ-${Date.now()}`, serialNumber: 'SN-1', manufacturer: 'mock', model: 'test', actor: 'staff-1' });
    return machineId;
  }

  it('walks provisioning -> installing -> testing -> active', async () => {
    const machineId = await provision();
    await machineService.updateStatus(BUSINESS_ID, machineId, 'installing', 'staff-1');
    await machineService.updateStatus(BUSINESS_ID, machineId, 'testing', 'staff-1');
    await machineService.updateStatus(BUSINESS_ID, machineId, 'active', 'staff-1');
    expect((await machineService.findById(BUSINESS_ID, machineId))?.status).toBe('active');
  });

  it('refuses to skip from provisioning straight to active', async () => {
    const machineId = await provision();
    await expect(machineService.updateStatus(BUSINESS_ID, machineId, 'active', 'staff-1')).rejects.toThrow(
      IllegalMachineStatusTransitionError,
    );
  });

  it('decommissioned is terminal — nothing can move it anywhere', async () => {
    const machineId = await provision();
    await machineService.updateStatus(BUSINESS_ID, machineId, 'decommissioned', 'staff-1');
    await expect(machineService.updateStatus(BUSINESS_ID, machineId, 'active', 'staff-1')).rejects.toThrow(
      IllegalMachineStatusTransitionError,
    );
  });

  it('throws MachineNotFoundError for a machine in a different business', async () => {
    const machineId = await provision();
    await expect(machineService.updateStatus('some-other-business', machineId, 'installing', 'staff-1')).rejects.toThrow(
      MachineNotFoundError,
    );
  });
});

describe('relocate', () => {
  it('opens a new location-history entry and closes the previous one', async () => {
    const { machineId } = await machineService.provisionDevice({ businessId: BUSINESS_ID, machineCode: 'SQ-RELO', serialNumber: 'SN-1', manufacturer: 'mock', model: 'test', actor: 'staff-1' });

    await machineService.relocate(BUSINESS_ID, machineId, { locationId: 'loc-a', latitude: -1.28, longitude: 36.82, address: 'A', venueName: 'Venue A' }, 'staff-1');
    await machineService.relocate(BUSINESS_ID, machineId, { locationId: 'loc-b', latitude: -1.3, longitude: 36.9, address: 'B', venueName: 'Venue B' }, 'staff-1', 'moved to a better spot');

    const history = await machineLocationHistoryRepository.listByMachine(BUSINESS_ID, machineId);
    expect(history).toHaveLength(2);
    expect(history[0].effectiveTo).not.toBeNull(); // the first entry was closed
    expect(history[1].effectiveTo).toBeNull(); // the second is current
    expect(history[1].reason).toBe('moved to a better spot');

    const machine = await machineService.findById(BUSINESS_ID, machineId);
    expect(machine?.locationId).toBe('loc-b');
    expect(machine?.venueName).toBe('Venue B');
  });

  it('never leaves two open history entries for one machine', async () => {
    const { machineId } = await machineService.provisionDevice({ businessId: BUSINESS_ID, machineCode: 'SQ-RELO2', serialNumber: 'SN-1', manufacturer: 'mock', model: 'test', actor: 'staff-1' });
    await machineService.relocate(BUSINESS_ID, machineId, { locationId: 'loc-a', latitude: null, longitude: null, address: null, venueName: null }, 'staff-1');
    await machineService.relocate(BUSINESS_ID, machineId, { locationId: 'loc-b', latitude: null, longitude: null, address: null, venueName: null }, 'staff-1');
    await machineService.relocate(BUSINESS_ID, machineId, { locationId: 'loc-c', latitude: null, longitude: null, address: null, venueName: null }, 'staff-1');

    const history = await machineLocationHistoryRepository.listByMachine(BUSINESS_ID, machineId);
    const open = history.filter((h) => h.effectiveTo === null);
    expect(open).toHaveLength(1);
    expect(open[0].locationId).toBe('loc-c');
  });
});

describe('device credential rotation and revocation', () => {
  it('rotateDeviceCredential issues a new credential without disturbing the old one', async () => {
    const { machineId, credential: original } = await machineService.provisionDevice({ businessId: BUSINESS_ID, machineCode: 'SQ-ROT', serialNumber: 'SN-1', manufacturer: 'mock', model: 'test', actor: 'staff-1' });
    const rotated = await machineService.rotateDeviceCredential(BUSINESS_ID, machineId, 'staff-1');

    expect(rotated.secret).not.toBe(original.secret);
    const active = await deviceCredentialRepository.listActiveByMachine(BUSINESS_ID, machineId);
    expect(active).toHaveLength(2);
  });

  it('revokeDeviceCredential removes exactly the named credential from the active set', async () => {
    const { machineId, credential } = await machineService.provisionDevice({ businessId: BUSINESS_ID, machineCode: 'SQ-REV', serialNumber: 'SN-1', manufacturer: 'mock', model: 'test', actor: 'staff-1' });
    await machineService.revokeDeviceCredential(BUSINESS_ID, credential.credentialId, 'staff-1', 'compromised');

    const active = await deviceCredentialRepository.listActiveByMachine(BUSINESS_ID, machineId);
    expect(active).toHaveLength(0);
  });
});

describe('partner authorization boundaries', () => {
  it('assertPartnerOwnsMachine succeeds for the owning partner', async () => {
    const partnerId = await partnerService.create({ businessId: BUSINESS_ID, name: 'Partner A', actor: 'staff-1' });
    const { machineId } = await machineService.provisionDevice({ businessId: BUSINESS_ID, machineCode: 'SQ-P1', serialNumber: 'SN-1', manufacturer: 'mock', model: 'test', ownerPartnerId: partnerId, actor: 'staff-1' });

    const machine = await machineService.assertPartnerOwnsMachine(BUSINESS_ID, partnerId, machineId);
    expect(machine.machineCode).toBe('SQ-P1');
  });

  it('assertPartnerOwnsMachine refuses a different partner, even a real one', async () => {
    const partnerA = await partnerService.create({ businessId: BUSINESS_ID, name: 'Partner A', actor: 'staff-1' });
    const partnerB = await partnerService.create({ businessId: BUSINESS_ID, name: 'Partner B', actor: 'staff-1' });
    const { machineId } = await machineService.provisionDevice({ businessId: BUSINESS_ID, machineCode: 'SQ-P2', serialNumber: 'SN-1', manufacturer: 'mock', model: 'test', ownerPartnerId: partnerA, actor: 'staff-1' });

    await expect(machineService.assertPartnerOwnsMachine(BUSINESS_ID, partnerB, machineId)).rejects.toThrow(
      PartnerDoesNotOwnMachineError,
    );
  });

  it('assertPartnerOwnsMachine refuses a machine with no partner at all', async () => {
    const partnerA = await partnerService.create({ businessId: BUSINESS_ID, name: 'Partner A', actor: 'staff-1' });
    const { machineId } = await machineService.provisionDevice({ businessId: BUSINESS_ID, machineCode: 'SQ-P3', serialNumber: 'SN-1', manufacturer: 'mock', model: 'test', actor: 'staff-1' });

    await expect(machineService.assertPartnerOwnsMachine(BUSINESS_ID, partnerA, machineId)).rejects.toThrow(
      PartnerDoesNotOwnMachineError,
    );
  });

  it('listByPartner returns only that partner\'s machines, even when many exist', async () => {
    const partnerA = await partnerService.create({ businessId: BUSINESS_ID, name: 'Partner A', actor: 'staff-1' });
    const partnerB = await partnerService.create({ businessId: BUSINESS_ID, name: 'Partner B', actor: 'staff-1' });
    await machineService.provisionDevice({ businessId: BUSINESS_ID, machineCode: 'SQ-LA1', serialNumber: 'SN-1', manufacturer: 'mock', model: 'test', ownerPartnerId: partnerA, actor: 'staff-1' });
    await machineService.provisionDevice({ businessId: BUSINESS_ID, machineCode: 'SQ-LA2', serialNumber: 'SN-1', manufacturer: 'mock', model: 'test', ownerPartnerId: partnerA, actor: 'staff-1' });
    await machineService.provisionDevice({ businessId: BUSINESS_ID, machineCode: 'SQ-LB1', serialNumber: 'SN-1', manufacturer: 'mock', model: 'test', ownerPartnerId: partnerB, actor: 'staff-1' });

    const machinesA = await machineService.listByPartner(BUSINESS_ID, partnerA);
    expect(machinesA).toHaveLength(2);
    expect(machinesA.every((m) => m.data.ownerPartnerId === partnerA)).toBe(true);
  });

  it('never leaks a machine from a different business, even to the right partner id string', async () => {
    const partnerId = await partnerService.create({ businessId: BUSINESS_ID, name: 'Partner A', actor: 'staff-1' });
    const { machineId } = await machineService.provisionDevice({ businessId: BUSINESS_ID, machineCode: 'SQ-XB', serialNumber: 'SN-1', manufacturer: 'mock', model: 'test', ownerPartnerId: partnerId, actor: 'staff-1' });

    await expect(machineService.assertPartnerOwnsMachine('a-different-business', partnerId, machineId)).rejects.toThrow(
      MachineNotFoundError,
    );
  });
});

describe('fleetStatusSummary', () => {
  it('counts machines by status', async () => {
    const m1 = await machineService.provisionDevice({ businessId: BUSINESS_ID, machineCode: 'SQ-F1', serialNumber: 'SN-1', manufacturer: 'mock', model: 'test', actor: 'staff-1' });
    const m2 = await machineService.provisionDevice({ businessId: BUSINESS_ID, machineCode: 'SQ-F2', serialNumber: 'SN-1', manufacturer: 'mock', model: 'test', actor: 'staff-1' });
    await machineService.updateStatus(BUSINESS_ID, m1.machineId, 'installing', 'staff-1');
    await machineService.updateStatus(BUSINESS_ID, m1.machineId, 'testing', 'staff-1');
    await machineService.updateStatus(BUSINESS_ID, m1.machineId, 'active', 'staff-1');

    const summary = await machineService.fleetStatusSummary(BUSINESS_ID);
    expect(summary.active).toBe(1);
    expect(summary.provisioning).toBe(1);
    expect(summary.total).toBe(2);
    void m2;
  });
});
