import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  machineCommandService,
  MachineCommandService,
  CommandNotSupportedError,
  CommandExpiredError,
} from '@/services/machineCommandService';
import {
  machineCommandRepository,
  IllegalCommandTransitionError,
  MachineCommandNotFoundError,
} from '@/repositories/machineCommandRepository';
import { machineService } from '@/services/machineService';
import { MockCloudTransport } from '@/lib/vending/protocol/cloudTransport';
import { defaultVendingAdapterResolver } from '@/lib/vending/adapterRegistry';
import { adminFirestore } from '@/lib/firebase/admin';

const BUSINESS_ID = 'biz-cmd-test';

async function cleanCollections() {
  for (const collection of ['machines', 'machineCommands', 'deviceCredentials']) {
    const snapshot = await adminFirestore.collection(collection).where('businessId', '==', BUSINESS_ID).get();
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  }
}

beforeEach(cleanCollections);
afterEach(cleanCollections);

async function provisionMockMachine(machineCode: string) {
  const { machineId } = await machineService.provisionDevice({
    businessId: BUSINESS_ID,
    machineCode,
    serialNumber: `SN-${machineCode}`,
    manufacturer: 'mock',
    model: 'test',
    actor: 'staff-1',
  });
  return machineId;
}

async function provisionShengmaMachine(machineCode: string) {
  const { machineId } = await machineService.provisionDevice({
    businessId: BUSINESS_ID,
    machineCode,
    serialNumber: `SN-${machineCode}`,
    manufacturer: 'shengma',
    model: 'test',
    actor: 'staff-1',
  });
  return machineId;
}

describe('MachineCommandService.issueCommand', () => {
  it('issues a restart command to a mock machine and notifies the transport', async () => {
    const machineId = await provisionMockMachine('SQ-CMD-1');
    const transport = new MockCloudTransport();
    const service = new MachineCommandService(defaultVendingAdapterResolver, transport);

    const { commandId, commandRef } = await service.issueCommand({
      businessId: BUSINESS_ID,
      machineId,
      commandType: 'restart',
      requestedBy: 'staff-1',
    });

    expect(commandRef).toMatch(/^CMD-/);
    expect(transport.notified).toEqual([{ machineId, commandId }]);

    const command = await machineCommandRepository.findById(BUSINESS_ID, commandId);
    expect(command?.status).toBe('pending');
    expect(command?.requestedBy).toBe('staff-1');
  });

  it('refuses to issue a command a machine\'s adapter does not declare support for', async () => {
    const machineId = await provisionShengmaMachine('SQ-CMD-2');
    await expect(
      machineCommandService.issueCommand({ businessId: BUSINESS_ID, machineId, commandType: 'restart', requestedBy: 'staff-1' }),
    ).rejects.toThrow(CommandNotSupportedError);
  });
});

describe('MachineCommandService acknowledge/complete lifecycle', () => {
  it('walks pending -> acknowledged -> completed', async () => {
    const machineId = await provisionMockMachine('SQ-CMD-3');
    const { commandId } = await machineCommandService.issueCommand({
      businessId: BUSINESS_ID,
      machineId,
      commandType: 'restart',
      requestedBy: 'staff-1',
    });

    const acknowledged = await machineCommandService.acknowledge(BUSINESS_ID, commandId, machineId);
    expect(acknowledged.status).toBe('acknowledged');
    expect(acknowledged.acknowledgedAt).not.toBeNull();

    await machineCommandService.complete(BUSINESS_ID, commandId, machineId, { success: true });
    const completed = await machineCommandRepository.findById(BUSINESS_ID, commandId);
    expect(completed?.status).toBe('completed');
    expect(completed?.error).toBeNull();
  });

  it('records a failure reason verbatim, never fabricating one', async () => {
    const machineId = await provisionMockMachine('SQ-CMD-4');
    const { commandId } = await machineCommandService.issueCommand({
      businessId: BUSINESS_ID,
      machineId,
      commandType: 'restart',
      requestedBy: 'staff-1',
    });
    await machineCommandService.acknowledge(BUSINESS_ID, commandId, machineId);
    await machineCommandService.complete(BUSINESS_ID, commandId, machineId, { success: false, error: 'watchdog reset failed' });

    const failed = await machineCommandRepository.findById(BUSINESS_ID, commandId);
    expect(failed?.status).toBe('failed');
    expect(failed?.error).toBe('watchdog reset failed');
  });

  it('expires, and refuses, a command acknowledged after its own TTL', async () => {
    const machineId = await provisionMockMachine('SQ-CMD-5');
    const { commandId } = await machineCommandService.issueCommand({
      businessId: BUSINESS_ID,
      machineId,
      commandType: 'restart',
      requestedBy: 'staff-1',
      ttlMs: -1000, // already expired the instant it was issued
    });

    await expect(machineCommandService.acknowledge(BUSINESS_ID, commandId, machineId)).rejects.toThrow(CommandExpiredError);
    const command = await machineCommandRepository.findById(BUSINESS_ID, commandId);
    expect(command?.status).toBe('expired');
  });

  it('never lets a pending command jump straight to completed', async () => {
    const machineId = await provisionMockMachine('SQ-CMD-6');
    const { commandId } = await machineCommandService.issueCommand({
      businessId: BUSINESS_ID,
      machineId,
      commandType: 'restart',
      requestedBy: 'staff-1',
    });
    await expect(machineCommandService.complete(BUSINESS_ID, commandId, machineId, { success: true })).rejects.toThrow(IllegalCommandTransitionError);
  });
});

describe('MachineCommandService.listPendingForMachine / listHistoryForMachine', () => {
  it('lists only pending commands for the poll route, oldest first', async () => {
    const machineId = await provisionMockMachine('SQ-CMD-7');
    const first = await machineCommandService.issueCommand({ businessId: BUSINESS_ID, machineId, commandType: 'restart', requestedBy: 'staff-1' });
    const second = await machineCommandService.issueCommand({ businessId: BUSINESS_ID, machineId, commandType: 'restart', requestedBy: 'staff-1' });
    await machineCommandService.acknowledge(BUSINESS_ID, first.commandId, machineId);
    await machineCommandService.complete(BUSINESS_ID, first.commandId, machineId, { success: true });

    const pending = await machineCommandService.listPendingForMachine(BUSINESS_ID, machineId);
    expect(pending.map((c) => c.id)).toEqual([second.commandId]);
  });

  it('lists full history newest first', async () => {
    const machineId = await provisionMockMachine('SQ-CMD-8');
    await machineCommandService.issueCommand({ businessId: BUSINESS_ID, machineId, commandType: 'restart', requestedBy: 'staff-1' });
    await machineCommandService.issueCommand({ businessId: BUSINESS_ID, machineId, commandType: 'restart', requestedBy: 'staff-1' });

    const { commands } = await machineCommandService.listHistoryForMachine(BUSINESS_ID, machineId);
    expect(commands).toHaveLength(2);
  });
});

describe('MachineCommandService ownership check', () => {
  it('treats another machine\'s command as not found, never as forbidden', async () => {
    const machineId = await provisionMockMachine('SQ-CMD-OWN-1');
    const otherMachineId = await provisionMockMachine('SQ-CMD-OWN-2');
    const { commandId } = await machineCommandService.issueCommand({
      businessId: BUSINESS_ID,
      machineId,
      commandType: 'restart',
      requestedBy: 'staff-1',
    });

    await expect(machineCommandService.acknowledge(BUSINESS_ID, commandId, otherMachineId)).rejects.toThrow(MachineCommandNotFoundError);
    await expect(machineCommandService.complete(BUSINESS_ID, commandId, otherMachineId, { success: true })).rejects.toThrow(MachineCommandNotFoundError);

    // Untouched by the other machine's rejected attempts.
    const command = await machineCommandRepository.findById(BUSINESS_ID, commandId);
    expect(command?.status).toBe('pending');
  });
});

describe('MachineCommandService.reconcileStuckCommands', () => {
  it('expires a pending command stuck past the threshold, leaves a fresh one alone', async () => {
    const machineId = await provisionMockMachine('SQ-CMD-9');
    const stuck = await machineCommandService.issueCommand({ businessId: BUSINESS_ID, machineId, commandType: 'restart', requestedBy: 'staff-1' });
    const fresh = await machineCommandService.issueCommand({ businessId: BUSINESS_ID, machineId, commandType: 'restart', requestedBy: 'staff-1' });

    // Force the "stuck" one's updatedAt into the past directly — the
    // service has no legitimate way to backdate a command, so the test
    // does it at the Firestore layer, the same technique
    // machineTransactionPaymentFlow.test.ts already uses for its own
    // stuck-transaction case.
    await adminFirestore.collection('machineCommands').doc(stuck.commandId).update({ updatedAt: new Date(Date.now() - 20 * 60 * 1000) });

    const result = await machineCommandService.reconcileStuckCommands(BUSINESS_ID, 15 * 60 * 1000);
    expect(result.expired).toBe(1);

    const stuckAfter = await machineCommandRepository.findById(BUSINESS_ID, stuck.commandId);
    expect(stuckAfter?.status).toBe('expired');
    const freshAfter = await machineCommandRepository.findById(BUSINESS_ID, fresh.commandId);
    expect(freshAfter?.status).toBe('pending');
  });
});
