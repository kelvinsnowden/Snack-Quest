import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineService } from '@/services/machineService';
import { MachineTelemetryService } from '@/services/machineTelemetryService';
import { UnrecognisedHardwarePayloadError } from '@/lib/vending/hardwareAdapter';
import { MockVendingAdapter } from '@/lib/vending/adapters/mockVendingAdapter';

const BUSINESS_ID = 'biz-machine-telemetry-test';

async function provisionMachine() {
  const { machineId } = await machineService.provisionDevice({
    businessId: BUSINESS_ID,
    machineCode: `SQ-${Date.now()}-${Math.random()}`,
    serialNumber: 'SN-1',
    manufacturer: 'mock',
    model: 'test',
    actor: 'staff-1',
  });
  return machineId;
}

beforeEach(async () => {
  for (const collection of ['machines', 'machineTelemetryEvents', 'deviceCredentials']) {
    await adminFirestore.recursiveDelete(adminFirestore.collection(collection));
  }
});

describe('MachineTelemetryService.ingest', () => {
  it('records a new event and updates the machine lastSeenAt', async () => {
    const machineId = await provisionMachine();
    const adapter = new MockVendingAdapter();
    const telemetry = new MachineTelemetryService(() => adapter);

    const before = await machineService.findById(BUSINESS_ID, machineId);
    expect(before?.lastSeenAt).toBeNull();

    const result = await telemetry.ingest({
      businessId: BUSINESS_ID,
      machineId,
      rawPayload: { machineId, eventType: 'heartbeat', idempotencyKey: 'evt-1' },
      source: 'test',
    });

    expect(result.isNew).toBe(true);
    expect(result.eventType).toBe('heartbeat');

    const after = await machineService.findById(BUSINESS_ID, machineId);
    expect(after?.lastSeenAt).not.toBeNull();
  });

  it('is idempotent for a duplicate delivery of the same event', async () => {
    const machineId = await provisionMachine();
    const adapter = new MockVendingAdapter();
    const telemetry = new MachineTelemetryService(() => adapter);

    const first = await telemetry.ingest({
      businessId: BUSINESS_ID,
      machineId,
      rawPayload: { machineId, eventType: 'fault', idempotencyKey: 'evt-dup' },
      source: 'test',
    });
    const second = await telemetry.ingest({
      businessId: BUSINESS_ID,
      machineId,
      rawPayload: { machineId, eventType: 'fault', idempotencyKey: 'evt-dup' },
      source: 'test',
    });

    expect(first.isNew).toBe(true);
    expect(second.isNew).toBe(false);
    expect(second.eventId).toBe(first.eventId);

    const events = await telemetry.listByMachine(BUSINESS_ID, machineId);
    expect(events).toHaveLength(1);
  });

  it('treats two concurrent deliveries of the same event as exactly one new event', async () => {
    const machineId = await provisionMachine();
    const adapter = new MockVendingAdapter();
    const telemetry = new MachineTelemetryService(() => adapter);

    const payload = { machineId, eventType: 'door_open', idempotencyKey: 'evt-concurrent' };
    const [a, b] = await Promise.all([
      telemetry.ingest({ businessId: BUSINESS_ID, machineId, rawPayload: payload, source: 'test' }),
      telemetry.ingest({ businessId: BUSINESS_ID, machineId, rawPayload: payload, source: 'test' }),
    ]);

    const newCount = [a, b].filter((r) => r.isNew).length;
    expect(newCount).toBe(1);

    const events = await telemetry.listByMachine(BUSINESS_ID, machineId);
    expect(events).toHaveLength(1);
  });

  it('rejects a malformed payload without recording an event or touching lastSeenAt', async () => {
    const machineId = await provisionMachine();
    const adapter = new MockVendingAdapter();
    const telemetry = new MachineTelemetryService(() => adapter);

    await expect(
      telemetry.ingest({ businessId: BUSINESS_ID, machineId, rawPayload: { machineId }, source: 'test' }),
    ).rejects.toThrow(UnrecognisedHardwarePayloadError);

    const events = await telemetry.listByMachine(BUSINESS_ID, machineId);
    expect(events).toHaveLength(0);
    const machine = await machineService.findById(BUSINESS_ID, machineId);
    expect(machine?.lastSeenAt).toBeNull();
  });

  it('rejects telemetry for a machine that does not exist', async () => {
    const adapter = new MockVendingAdapter();
    const telemetry = new MachineTelemetryService(() => adapter);

    await expect(
      telemetry.ingest({
        businessId: BUSINESS_ID,
        machineId: 'ghost-machine',
        rawPayload: { machineId: 'ghost-machine', eventType: 'heartbeat', idempotencyKey: 'evt-x' },
        source: 'test',
      }),
    ).rejects.toThrow();
  });

  it('records distinct events separately when idempotency keys differ', async () => {
    const machineId = await provisionMachine();
    const adapter = new MockVendingAdapter();
    const telemetry = new MachineTelemetryService(() => adapter);

    await telemetry.ingest({ businessId: BUSINESS_ID, machineId, rawPayload: { machineId, eventType: 'heartbeat', idempotencyKey: 'evt-a' }, source: 'test' });
    await telemetry.ingest({ businessId: BUSINESS_ID, machineId, rawPayload: { machineId, eventType: 'heartbeat', idempotencyKey: 'evt-b' }, source: 'test' });

    const events = await telemetry.listByMachine(BUSINESS_ID, machineId);
    expect(events).toHaveLength(2);
  });

  it('scopes duplicate detection per machine, not fleet-wide', async () => {
    const machineIdA = await provisionMachine();
    const machineIdB = await provisionMachine();
    const adapter = new MockVendingAdapter();
    const telemetry = new MachineTelemetryService(() => adapter);

    const resultA = await telemetry.ingest({ businessId: BUSINESS_ID, machineId: machineIdA, rawPayload: { machineId: machineIdA, eventType: 'heartbeat', idempotencyKey: 'evt-shared' }, source: 'test' });
    const resultB = await telemetry.ingest({ businessId: BUSINESS_ID, machineId: machineIdB, rawPayload: { machineId: machineIdB, eventType: 'heartbeat', idempotencyKey: 'evt-shared' }, source: 'test' });

    expect(resultA.isNew).toBe(true);
    expect(resultB.isNew).toBe(true);
  });

  it('filters listByMachine by eventType', async () => {
    const machineId = await provisionMachine();
    const adapter = new MockVendingAdapter();
    const telemetry = new MachineTelemetryService(() => adapter);

    await telemetry.ingest({ businessId: BUSINESS_ID, machineId, rawPayload: { machineId, eventType: 'heartbeat', idempotencyKey: 'evt-1' }, source: 'test' });
    await telemetry.ingest({ businessId: BUSINESS_ID, machineId, rawPayload: { machineId, eventType: 'fault', idempotencyKey: 'evt-2' }, source: 'test' });

    const faultsOnly = await telemetry.listByMachine(BUSINESS_ID, machineId, { eventType: 'fault' });
    expect(faultsOnly).toHaveLength(1);
    expect(faultsOnly[0].data.eventType).toBe('fault');
  });
});
