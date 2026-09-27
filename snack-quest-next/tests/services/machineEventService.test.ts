import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineEventService } from '@/services/machineEventService';
import { machineInventorySyncService } from '@/services/machineInventorySyncService';
import { MachineSlotService, SlotMappingError } from '@/services/machineSlotService';
import { machineService } from '@/services/machineService';
import { alertService } from '@/services/alertService';
import { MachineTelemetryService } from '@/services/machineTelemetryService';
import { machineEventRepository } from '@/repositories/machineEventRepository';
import { machineIntegrationRepository } from '@/repositories/machineIntegrationRepository';
import { machineSlotRepository } from '@/repositories/machineSlotRepository';
import { alertRepository } from '@/repositories/alertRepository';
import { MockVendingAdapter } from '@/lib/vending/adapters/mockVendingAdapter';
import { activeIntegration, clearIntegrationCollections, createManufacturerWithModel, provisionMachine } from '../helpers/integrationFixtures';

const BUSINESS_ID = 'biz-machine-events-test';

let adapter: MockVendingAdapter;

beforeEach(async () => {
  await clearIntegrationCollections(BUSINESS_ID);
  adapter = new MockVendingAdapter();
});

async function machineWithSlots(slots: { slotCode: string; manufacturerSlotId?: string; quantity: number; capacity?: number }[]) {
  const { machineId } = await provisionMachine(BUSINESS_ID);
  const service = new MachineSlotService(() => adapter);
  for (const [index, slot] of slots.entries()) {
    adapter.seedSlot(machineId, slot.slotCode, { quantity: slot.quantity });
    await service.configureSlot({
      businessId: BUSINESS_ID,
      machineId,
      slotCode: slot.slotCode,
      productId: `pkg-${index}`,
      productCatalogue: 'package',
      priceKes: 200,
      capacity: slot.capacity ?? 10,
      position: index,
    });
    await adminFirestore.collection('machineSlots').doc(`${machineId}__${slot.slotCode}`).update({ currentQuantity: slot.quantity });
  }
  const mappings = slots.filter((slot) => slot.manufacturerSlotId).map((slot) => ({ slotCode: slot.slotCode, manufacturerSlotId: slot.manufacturerSlotId! }));
  if (mappings.length > 0) {
    await service.setSlotMappings(BUSINESS_ID, machineId, mappings);
  }
  return { machineId };
}

async function eventsOf(machineId: string) {
  return (await machineEventRepository.listByMachine(BUSINESS_ID, machineId, 100)).map(({ data }) => data);
}

describe('machineEventService.record', () => {
  it('records a normalized event with the manufacturer and model denormalized', async () => {
    const ids = await createManufacturerWithModel(BUSINESS_ID);
    const { machineId } = await provisionMachine(BUSINESS_ID);
    await activeIntegration(BUSINESS_ID, machineId, ids);
    await machineEventService.record({ businessId: BUSINESS_ID, machineId, type: 'MACHINE_ERROR', source: 'v1_api', dedupeKey: 'e-1', data: { code: 'E42' } });
    const [event] = await eventsOf(machineId);
    expect(event.type).toBe('MACHINE_ERROR');
    expect(event.severity).toBe('critical');
    expect(event.manufacturerId).toBe(ids.manufacturerId);
    expect(event.modelId).toBe(ids.modelId);
    expect(event.data).toEqual({ code: 'E42' });
  });

  it('is idempotent per machine by dedupe key', async () => {
    const { machineId } = await provisionMachine(BUSINESS_ID);
    const first = await machineEventService.record({ businessId: BUSINESS_ID, machineId, type: 'DOOR_OPENED', source: 'v1_api', dedupeKey: 'same' });
    const second = await machineEventService.record({ businessId: BUSINESS_ID, machineId, type: 'DOOR_OPENED', source: 'v1_api', dedupeKey: 'same' });
    expect(first.isNew).toBe(true);
    expect(second.isNew).toBe(false);
    expect(await eventsOf(machineId)).toHaveLength(1);
  });

  it('counts a machine-originated heartbeat as proof of life and as the integration heartbeat signal', async () => {
    const ids = await createManufacturerWithModel(BUSINESS_ID);
    const { machineId } = await provisionMachine(BUSINESS_ID);
    await activeIntegration(BUSINESS_ID, machineId, ids);
    await machineEventService.record({ businessId: BUSINESS_ID, machineId, type: 'HEARTBEAT_RECEIVED', source: 'v1_api', dedupeKey: 'hb-1' });
    expect((await machineService.findById(BUSINESS_ID, machineId))?.lastSeenAt).not.toBeNull();
    expect((await machineIntegrationRepository.findByMachineId(BUSINESS_ID, machineId))?.signals.heartbeat).not.toBeNull();
  });

  it('does not treat a Snack Quest-originated event as the machine being alive', async () => {
    const { machineId } = await provisionMachine(BUSINESS_ID);
    await machineEventService.record({ businessId: BUSINESS_ID, machineId, type: 'DISPENSE_REQUESTED', source: 'dispense_ledger', dedupeKey: 'd-1' });
    expect((await machineService.findById(BUSINESS_ID, machineId))?.lastSeenAt).toBeNull();
  });
});

describe('machineEventService.recordExternal', () => {
  it('translates manufacturer slot names and keeps unknown native events', async () => {
    const { machineId } = await machineWithSlots([{ slotCode: 'A01', manufacturerSlotId: 'spiral_01', quantity: 5 }]);
    const machine = await machineService.findById(BUSINESS_ID, machineId);
    const result = await machineEventService.recordExternal(
      BUSINESS_ID,
      { ...machine!, id: machineId },
      [
        { type: 'SLOT_EMPTY', eventId: 'x-1', occurredAt: null, manufacturerSlotId: 'spiral_01', data: {} },
        { type: 'MOTOR_OVERCURRENT', eventId: 'x-2', occurredAt: null, manufacturerSlotId: null, data: { amps: 4.2 } },
        { type: 'SLOT_LOW', eventId: 'x-3', occurredAt: null, manufacturerSlotId: 'spiral_99', data: {} },
      ],
      'webhook',
      'acme',
    );
    expect(result).toEqual({ recorded: 3, duplicates: 0, unknownTypes: ['MOTOR_OVERCURRENT'], unmappedSlots: ['spiral_99'], conflictingEventIds: [] });
    const events = await eventsOf(machineId);
    expect(events.find((event) => event.type === 'SLOT_EMPTY')?.slotCode).toBe('A01');
    const unknown = events.find((event) => event.type === 'UNKNOWN_EVENT');
    expect(unknown?.nativeType).toBe('MOTOR_OVERCURRENT');
    expect(unknown?.data).toEqual({ amps: 4.2 });
  });

  it('a replayed batch records nothing new', async () => {
    const { machineId } = await provisionMachine(BUSINESS_ID);
    const machine = { ...(await machineService.findById(BUSINESS_ID, machineId))!, id: machineId };
    const batch = [{ type: 'DOOR_OPENED', eventId: 'r-1', occurredAt: null, manufacturerSlotId: null, data: {} }];
    await machineEventService.recordExternal(BUSINESS_ID, machine, batch, 'webhook', 'acme');
    expect(await machineEventService.recordExternal(BUSINESS_ID, machine, batch, 'webhook', 'acme')).toMatchObject({ recorded: 0, duplicates: 1 });
  });
});

describe('legacy telemetry channel', () => {
  it('also emits a normalized event, once', async () => {
    const { machineId } = await provisionMachine(BUSINESS_ID);
    const telemetry = new MachineTelemetryService(() => adapter);
    const payload = { machineId, eventType: 'fault', idempotencyKey: 't-1', payload: { code: 'E7' } };
    await telemetry.ingest({ businessId: BUSINESS_ID, machineId, rawPayload: payload, source: 'test' });
    await telemetry.ingest({ businessId: BUSINESS_ID, machineId, rawPayload: payload, source: 'test' });
    const events = await eventsOf(machineId);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'MACHINE_ERROR', source: 'telemetry', nativeType: 'fault' });
  });
});

describe('inventory synchronization', () => {
  it('records mismatches but never overwrites the ledger-backed quantity', async () => {
    const { machineId } = await machineWithSlots([{ slotCode: 'A01', manufacturerSlotId: 'spiral_01', quantity: 6 }]);
    const result = await machineInventorySyncService.sync({
      businessId: BUSINESS_ID,
      machineId,
      reports: [{ manufacturerSlotId: 'spiral_01', quantity: 4 }],
      reportId: 'inv-1',
      source: 'v1_api',
    });
    expect(result.mismatches).toEqual([{ slotCode: 'A01', expected: 6, reported: 4 }]);
    expect((await machineSlotRepository.findBySlotCode(BUSINESS_ID, machineId, 'A01'))?.currentQuantity).toBe(6);
    const mismatch = (await eventsOf(machineId)).find((event) => event.type === 'INVENTORY_MISMATCH');
    expect(mismatch?.data).toMatchObject({ expected: 6, reported: 4 });
  });

  it('flags empty and low slots from the machine\'s own sensors, and unmapped slot names', async () => {
    const { machineId } = await machineWithSlots([
      { slotCode: 'A01', quantity: 0 },
      { slotCode: 'A02', quantity: 1, capacity: 10 },
    ]);
    const result = await machineInventorySyncService.sync({
      businessId: BUSINESS_ID,
      machineId,
      reports: [
        { manufacturerSlotId: 'A01', quantity: 0 },
        { manufacturerSlotId: 'A02', quantity: 1 },
        { manufacturerSlotId: 'ghost', quantity: 3 },
      ],
      reportId: 'inv-2',
      source: 'v1_api',
    });
    expect(result.emptySlots).toEqual(['A01']);
    expect(result.lowSlots).toEqual(['A02']);
    expect(result.unmappedSlots).toEqual(['ghost']);
    expect(result.mismatches).toEqual([]);
  });

  it('is idempotent per report id', async () => {
    const { machineId } = await machineWithSlots([{ slotCode: 'A01', quantity: 6 }]);
    const input = { businessId: BUSINESS_ID, machineId, reports: [{ manufacturerSlotId: 'A01', quantity: 2 }], reportId: 'inv-3', source: 'v1_api' as const };
    await machineInventorySyncService.sync(input);
    await machineInventorySyncService.sync(input);
    expect((await eventsOf(machineId)).filter((event) => event.type === 'INVENTORY_MISMATCH')).toHaveLength(1);
  });

  it('records the inventory sync signal on the integration', async () => {
    const ids = await createManufacturerWithModel(BUSINESS_ID);
    const { machineId } = await machineWithSlots([{ slotCode: 'A01', quantity: 6 }]);
    await activeIntegration(BUSINESS_ID, machineId, ids);
    await machineInventorySyncService.sync({ businessId: BUSINESS_ID, machineId, reports: [{ manufacturerSlotId: 'A01', quantity: 6 }], reportId: 'inv-4', source: 'v1_api' });
    expect((await machineIntegrationRepository.findByMachineId(BUSINESS_ID, machineId))?.signals.inventory_sync).not.toBeNull();
  });
});

describe('slot mapping management', () => {
  it('refuses a mapping that would make two slots answer to one manufacturer name', async () => {
    const { machineId } = await machineWithSlots([
      { slotCode: 'A01', manufacturerSlotId: 'spiral_01', quantity: 1 },
      { slotCode: 'A02', quantity: 1 },
    ]);
    const service = new MachineSlotService(() => adapter);
    await expect(service.setSlotMappings(BUSINESS_ID, machineId, [{ slotCode: 'A02', manufacturerSlotId: 'spiral_01' }])).rejects.toThrow(SlotMappingError);
    // Nothing was written.
    expect((await machineSlotRepository.findBySlotCode(BUSINESS_ID, machineId, 'A02'))?.manufacturerSlotId ?? null).toBeNull();
  });

  it('refuses a slot that does not exist on the machine', async () => {
    const { machineId } = await machineWithSlots([{ slotCode: 'A01', quantity: 1 }]);
    await expect(
      new MachineSlotService(() => adapter).setSlotMappings(BUSINESS_ID, machineId, [{ slotCode: 'Z99', manufacturerSlotId: 'x' }]),
    ).rejects.toThrow(/not configured/);
  });
});

describe('alert center bridge', () => {
  it('opens one alert per critical integration event, and none for telemetry-sourced duplicates', async () => {
    const { machineId } = await provisionMachine(BUSINESS_ID);
    await machineEventService.record({ businessId: BUSINESS_ID, machineId, type: 'PAYMENT_DEVICE_ERROR', source: 'v1_api', dedupeKey: 'p-1', data: { code: 'CR-9' } });
    await machineEventService.record({ businessId: BUSINESS_ID, machineId, type: 'MACHINE_ERROR', source: 'telemetry', dedupeKey: 't-1' });
    await machineEventService.record({ businessId: BUSINESS_ID, machineId, type: 'HEARTBEAT_RECEIVED', source: 'v1_api', dedupeKey: 'h-1' });
    await alertService.evaluateAndSync(BUSINESS_ID);
    await alertService.evaluateAndSync(BUSINESS_ID);
    const alerts = (await alertRepository.listOpen(BUSINESS_ID, { machineId })).filter(({ data }) => data.dedupeKey.startsWith('integration_event:'));
    expect(alerts).toHaveLength(1);
    expect(alerts[0].data.type).toBe('machine_fault');
    expect(alerts[0].data.detail).toContain('CR-9');
  });
});
