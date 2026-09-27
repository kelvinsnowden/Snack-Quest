import { describe, expect, it } from 'vitest';
import {
  eventTypeForDispenseResult,
  eventTypeForTelemetry,
  normalizeEventType,
  resolveOccurredAt,
  sanitizeEventData,
  severityFor,
} from '@/lib/vending/machineEvents';
import { MACHINE_EVENT_TYPES } from '@/types';

describe('event normalization', () => {
  it('accepts Snack Quest event names regardless of case and surrounding space', () => {
    expect(normalizeEventType('DISPENSE_SUCCESS')).toBe('DISPENSE_SUCCESS');
    expect(normalizeEventType(' slot_low ')).toBe('SLOT_LOW');
  });

  it('maps anything unrecognised to UNKNOWN_EVENT rather than guessing', () => {
    expect(normalizeEventType('MOTOR_OVERCURRENT')).toBe('UNKNOWN_EVENT');
    expect(normalizeEventType('')).toBe('UNKNOWN_EVENT');
  });

  it('translates the legacy gateway telemetry vocabulary', () => {
    expect(eventTypeForTelemetry('heartbeat')).toBe('HEARTBEAT_RECEIVED');
    expect(eventTypeForTelemetry('fault')).toBe('MACHINE_ERROR');
    expect(eventTypeForTelemetry('door_open')).toBe('DOOR_OPENED');
    expect(eventTypeForTelemetry('connectivity_offline')).toBe('MACHINE_OFFLINE');
    // vend results go through the dispense path, which emits its own event
    expect(eventTypeForTelemetry('vend_result')).toBeNull();
  });

  it('maps every non-success dispense outcome to DISPENSE_FAILED', () => {
    expect(eventTypeForDispenseResult('success')).toBe('DISPENSE_SUCCESS');
    for (const status of ['failed', 'timeout', 'unknown', 'jam', 'no_product', 'sensor_failure', 'machine_offline'] as const) {
      expect(eventTypeForDispenseResult(status)).toBe('DISPENSE_FAILED');
    }
  });

  it('assigns every event type a severity', () => {
    for (const type of MACHINE_EVENT_TYPES) {
      expect(['info', 'warning', 'critical']).toContain(severityFor(type));
    }
    expect(severityFor('MACHINE_ERROR')).toBe('critical');
  });
});

describe('resolveOccurredAt', () => {
  const received = new Date('2026-09-27T12:00:00Z');

  it('trusts a plausible device clock, including a queued-while-offline event', () => {
    expect(resolveOccurredAt('2026-09-27T11:00:00Z', received).toISOString()).toBe('2026-09-27T11:00:00.000Z');
  });

  it('falls back to receipt time for a future, ancient or unparseable device clock', () => {
    expect(resolveOccurredAt('2026-09-27T13:00:00Z', received)).toEqual(received);
    expect(resolveOccurredAt('1970-01-01T00:00:00Z', received)).toEqual(received);
    expect(resolveOccurredAt('not a date', received)).toEqual(received);
    expect(resolveOccurredAt(null, received)).toEqual(received);
  });
});

describe('sanitizeEventData', () => {
  it('keeps primitives and drops nested structures and odd keys', () => {
    expect(
      sanitizeEventData({ code: 'E42', celsius: 9.5, ok: false, nested: { a: 1 }, list: [1], 'bad key': 1, nan: Number.NaN }),
    ).toEqual({ code: 'E42', celsius: 9.5, ok: false });
  });

  it('bounds string length and ignores non-objects', () => {
    expect((sanitizeEventData({ note: 'x'.repeat(2000) }).note as string).length).toBe(500);
    expect(sanitizeEventData('string')).toEqual({});
    expect(sanitizeEventData([1, 2])).toEqual({});
  });
});
