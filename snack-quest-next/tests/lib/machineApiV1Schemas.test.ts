import { describe, expect, it } from 'vitest';
import { commandStatusSchema, eventsSchema, heartbeatSchema, inventorySchema, statusSchema } from '@/lib/vending/v1/schemas';

describe('Machine API v1 request schemas', () => {
  it('accepts a minimal heartbeat and ignores unknown fields (additive changes are non-breaking)', () => {
    const parsed = heartbeatSchema.parse({ eventId: 'hb-1', futureField: true });
    expect(parsed).toEqual({ eventId: 'hb-1' });
  });

  it('rejects event ids that could not be safe keys', () => {
    expect(heartbeatSchema.safeParse({ eventId: 'has space' }).success).toBe(false);
    expect(heartbeatSchema.safeParse({ eventId: 'x'.repeat(129) }).success).toBe(false);
  });

  it('bounds status values to physically plausible ranges', () => {
    expect(statusSchema.safeParse({ eventId: 's-1', online: true, temperatureCelsius: 500 }).success).toBe(false);
    expect(statusSchema.safeParse({ eventId: 's-1', online: true, temperatureCelsius: 4 }).success).toBe(true);
  });

  it('requires non-negative integer quantities and at least one slot', () => {
    expect(inventorySchema.safeParse({ reportId: 'r', slots: [] }).success).toBe(false);
    expect(inventorySchema.safeParse({ reportId: 'r', slots: [{ slotId: 'A1', quantity: -1 }] }).success).toBe(false);
    expect(inventorySchema.safeParse({ reportId: 'r', slots: [{ slotId: 'A1', quantity: 1.5 }] }).success).toBe(false);
    expect(inventorySchema.safeParse({ reportId: 'r', slots: [{ slotId: 'spiral_01', quantity: 3 }] }).success).toBe(true);
  });

  it('caps event batches at 100', () => {
    const events = Array.from({ length: 101 }, (_, index) => ({ eventId: `e-${index}`, type: 'DOOR_OPENED' }));
    expect(eventsSchema.safeParse({ events }).success).toBe(false);
  });

  it('command status: failed defaults its code, unknown has no code, dispensed needs only an event id', () => {
    expect(commandStatusSchema.parse({ status: 'failed', eventId: 'f-1' })).toMatchObject({ failureCode: 'failed' });
    expect(commandStatusSchema.safeParse({ status: 'failed', eventId: 'f-1', failureCode: 'unknown' }).success).toBe(false);
    expect(commandStatusSchema.safeParse({ status: 'dispensed', eventId: 'd-1' }).success).toBe(true);
    expect(commandStatusSchema.safeParse({ status: 'teleported', eventId: 'd-1' }).success).toBe(false);
  });
});
