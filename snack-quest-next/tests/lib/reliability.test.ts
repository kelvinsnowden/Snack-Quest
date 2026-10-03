import { describe, expect, it } from 'vitest';
import { computeReliability } from '@/lib/vending/reliability';

const now = new Date('2026-09-27T12:00:00Z');
const since = new Date('2026-08-28T12:00:00Z');
const at = (iso: string) => new Date(iso);

const machines = [
  { id: 'm1', machineCode: 'SQ-MCH-000001', manufacturerId: 'mfr-a', modelId: 'model-x' },
  { id: 'm2', machineCode: 'SQ-MCH-000002', manufacturerId: 'mfr-b', modelId: 'model-y' },
];

function event(machineId: string, type: string, data: Record<string, unknown> = {}, slotCode: string | null = null, occurredAt = at('2026-09-20T10:00:00Z')) {
  const machine = machines.find((candidate) => candidate.id === machineId)!;
  return { machineId, machineCode: machine.machineCode, manufacturerId: machine.manufacturerId, modelId: machine.modelId, type: type as never, slotCode, data, occurredAt };
}

function report(events: ReturnType<typeof event>[]) {
  return computeReliability({
    events,
    machines,
    manufacturerNames: new Map([['mfr-a', 'Maker A'], ['mfr-b', 'Maker B']]),
    modelNames: new Map([['model-x', 'X'], ['model-y', 'Y']]),
    since,
    now,
    windowDays: 30,
  });
}

describe('computeReliability', () => {
  it('counts one attempt per transaction, and a late success after a timeout as a success', () => {
    const result = report([
      event('m1', 'DISPENSE_FAILED', { transactionId: 't1', outcome: 'unknown', stage: 'machine' }, 'A01'),
      event('m1', 'DISPENSE_SUCCESS', { transactionId: 't1', status: 'success', stage: 'machine' }, 'A01'),
      event('m1', 'DISPENSE_FAILED', { transactionId: 't2', status: 'jam', stage: 'machine' }, 'A01'),
    ]);
    const makerA = result.byManufacturer.find((row) => row.key === 'mfr-a')!;
    expect(makerA).toMatchObject({ dispenseAttempts: 2, dispenseSuccesses: 1, dispenseFailures: 1, successRate: 0.5, failuresByReason: { jam: 1 } });
    expect(result.failingSlots).toEqual([{ machineCode: 'SQ-MCH-000001', slotCode: 'A01', failures: 1 }]);
  });

  it('leaves refusals by Snack Quest\'s own gate out of hardware reliability', () => {
    const result = report([event('m2', 'DISPENSE_FAILED', { transactionId: 't3', stage: 'gate', reason: 'integration suspended' })]);
    expect(result.byManufacturer.find((row) => row.key === 'mfr-b')).toMatchObject({ dispenseAttempts: 0, successRate: null });
  });

  it('never reports a success rate without attempts', () => {
    expect(report([]).byModel.every((row) => row.successRate === null)).toBe(true);
  });

  it('measures downtime between offline and online, and up to now for a machine still offline', () => {
    const result = report([
      event('m1', 'MACHINE_OFFLINE', {}, null, at('2026-09-20T10:00:00Z')),
      event('m1', 'MACHINE_ONLINE', {}, null, at('2026-09-20T11:30:00Z')),
      event('m2', 'MACHINE_OFFLINE', {}, null, at('2026-09-27T11:00:00Z')),
    ]);
    expect(result.downtimeByMachine).toEqual([
      { machineCode: 'SQ-MCH-000001', downtimeMinutes: 90, offlineEvents: 1 },
      { machineCode: 'SQ-MCH-000002', downtimeMinutes: 60, offlineEvents: 1 },
    ]);
    expect(result.byManufacturer.find((row) => row.key === 'mfr-a')?.downtimeMinutes).toBe(90);
  });

  it('counts machines per manufacturer and model from the fleet, not from who happened to report', () => {
    const result = report([]);
    expect(result.byManufacturer.map((row) => [row.label, row.machines])).toEqual([['Maker A', 1], ['Maker B', 1]]);
  });
});
