import type { MachineEvent } from '@/types';

export interface ReliabilityRow {
  key: string;
  label: string;
  machines: number;
  dispenseAttempts: number;
  dispenseSuccesses: number;
  dispenseFailures: number;
  /** Null when there were no attempts — "no data" is never shown as 0% or 100%. */
  successRate: number | null;
  failuresByReason: Record<string, number>;
  machineErrors: number;
  offlineEvents: number;
  downtimeMinutes: number;
}

export interface ReliabilityReport {
  windowDays: number;
  since: string;
  byManufacturer: ReliabilityRow[];
  byModel: ReliabilityRow[];
  failingSlots: { machineCode: string; slotCode: string; failures: number }[];
  downtimeByMachine: { machineCode: string; downtimeMinutes: number; offlineEvents: number }[];
}

type EventLike = Pick<MachineEvent, 'machineId' | 'machineCode' | 'manufacturerId' | 'modelId' | 'type' | 'slotCode' | 'data'> & { occurredAt: Date };

interface MachineLike {
  id: string;
  machineCode: string;
  manufacturerId: string | null;
  modelId: string | null;
}

const UNREGISTERED = '(not in registry)';

function emptyRow(key: string, label: string): ReliabilityRow {
  return { key, label, machines: 0, dispenseAttempts: 0, dispenseSuccesses: 0, dispenseFailures: 0, successRate: null, failuresByReason: {}, machineErrors: 0, offlineEvents: 0, downtimeMinutes: 0 };
}

/**
 * Hardware reliability from real events only (§ ANALYTICS: "which
 * manufacturers/models have reliability issues", "which slots frequently
 * fail", "which machines experience downtime").
 *
 * - A dispense *attempt* is one transaction, however many events it
 *   produced: a dispatch that timed out (`DISPENSE_FAILED`) and later
 *   resolved (`DISPENSE_SUCCESS`) is one attempt that succeeded.
 * - Refusals by Snack Quest's own gate (`stage: 'gate'` — integration
 *   suspended, adapter can't vend) are configuration, not hardware, and
 *   are left out.
 * - Downtime is the time between a `MACHINE_OFFLINE` and the next
 *   `MACHINE_ONLINE`, clipped to the window; a machine still offline is
 *   counted up to `now`. A machine that never reported going offline
 *   has no measured downtime — silence is the connectivity alerts' job,
 *   not something this report invents minutes for.
 */
export function computeReliability(input: {
  events: EventLike[];
  machines: MachineLike[];
  manufacturerNames: Map<string, string>;
  modelNames: Map<string, string>;
  since: Date;
  now: Date;
  windowDays: number;
}): ReliabilityReport {
  const manufacturers = new Map<string, ReliabilityRow>();
  const models = new Map<string, ReliabilityRow>();
  const rowFor = (map: Map<string, ReliabilityRow>, id: string | null, names: Map<string, string>) => {
    const key = id ?? UNREGISTERED;
    let row = map.get(key);
    if (!row) {
      row = emptyRow(key, id ? names.get(id) ?? id : UNREGISTERED);
      map.set(key, row);
    }
    return row;
  };
  const machineById = new Map(input.machines.map((machine) => [machine.id, machine]));
  for (const machine of input.machines) {
    rowFor(manufacturers, machine.manufacturerId, input.manufacturerNames).machines += 1;
    rowFor(models, machine.modelId, input.modelNames).machines += 1;
  }

  const attempts = new Map<string, { machineId: string; success: boolean; failureReason: string | null; slotCode: string | null }>();
  const offlineWindows = new Map<string, { type: 'MACHINE_OFFLINE' | 'MACHINE_ONLINE'; at: Date }[]>();

  for (const event of input.events) {
    const both = [rowFor(manufacturers, event.manufacturerId, input.manufacturerNames), rowFor(models, event.modelId, input.modelNames)];
    if (event.type === 'MACHINE_ERROR') {
      both.forEach((row) => (row.machineErrors += 1));
    }
    if (event.type === 'MACHINE_OFFLINE' || event.type === 'MACHINE_ONLINE') {
      if (event.type === 'MACHINE_OFFLINE') {
        both.forEach((row) => (row.offlineEvents += 1));
      }
      const list = offlineWindows.get(event.machineId) ?? [];
      list.push({ type: event.type, at: event.occurredAt });
      offlineWindows.set(event.machineId, list);
    }
    if ((event.type === 'DISPENSE_SUCCESS' || event.type === 'DISPENSE_FAILED') && typeof event.data.transactionId === 'string') {
      if (event.data.stage === 'gate') {
        continue;
      }
      const existing = attempts.get(event.data.transactionId);
      const success = event.type === 'DISPENSE_SUCCESS' || existing?.success === true;
      const reason = typeof event.data.status === 'string' && event.data.status !== 'success' ? event.data.status : typeof event.data.outcome === 'string' ? event.data.outcome : 'failed';
      attempts.set(event.data.transactionId, {
        machineId: event.machineId,
        success,
        failureReason: success ? null : reason,
        slotCode: event.slotCode ?? existing?.slotCode ?? null,
      });
    }
  }

  const slotFailures = new Map<string, { machineCode: string; slotCode: string; failures: number }>();
  for (const attempt of attempts.values()) {
    const machine = machineById.get(attempt.machineId);
    const rows = [rowFor(manufacturers, machine?.manufacturerId ?? null, input.manufacturerNames), rowFor(models, machine?.modelId ?? null, input.modelNames)];
    for (const row of rows) {
      row.dispenseAttempts += 1;
      if (attempt.success) {
        row.dispenseSuccesses += 1;
      } else {
        row.dispenseFailures += 1;
        row.failuresByReason[attempt.failureReason ?? 'failed'] = (row.failuresByReason[attempt.failureReason ?? 'failed'] ?? 0) + 1;
      }
    }
    if (!attempt.success && attempt.slotCode) {
      const key = `${attempt.machineId}::${attempt.slotCode}`;
      const entry = slotFailures.get(key) ?? { machineCode: machine?.machineCode ?? attempt.machineId, slotCode: attempt.slotCode, failures: 0 };
      entry.failures += 1;
      slotFailures.set(key, entry);
    }
  }

  const downtimeByMachine: ReliabilityReport['downtimeByMachine'] = [];
  for (const [machineId, transitions] of offlineWindows) {
    transitions.sort((a, b) => a.at.getTime() - b.at.getTime());
    let minutes = 0;
    let offlineSince: Date | null = null;
    let offlineEvents = 0;
    for (const transition of transitions) {
      if (transition.type === 'MACHINE_OFFLINE') {
        offlineEvents += 1;
        offlineSince ??= transition.at < input.since ? input.since : transition.at;
      } else if (offlineSince) {
        minutes += (transition.at.getTime() - offlineSince.getTime()) / 60000;
        offlineSince = null;
      }
    }
    if (offlineSince) {
      minutes += (input.now.getTime() - offlineSince.getTime()) / 60000;
    }
    const machine = machineById.get(machineId);
    const rounded = Math.round(minutes);
    downtimeByMachine.push({ machineCode: machine?.machineCode ?? machineId, downtimeMinutes: rounded, offlineEvents });
    rowFor(manufacturers, machine?.manufacturerId ?? null, input.manufacturerNames).downtimeMinutes += rounded;
    rowFor(models, machine?.modelId ?? null, input.modelNames).downtimeMinutes += rounded;
  }

  const finish = (rows: Iterable<ReliabilityRow>) =>
    Array.from(rows)
      .map((row) => ({ ...row, successRate: row.dispenseAttempts > 0 ? row.dispenseSuccesses / row.dispenseAttempts : null }))
      .sort((a, b) => b.dispenseAttempts - a.dispenseAttempts || a.label.localeCompare(b.label));

  return {
    windowDays: input.windowDays,
    since: input.since.toISOString(),
    byManufacturer: finish(manufacturers.values()),
    byModel: finish(models.values()),
    failingSlots: Array.from(slotFailures.values()).sort((a, b) => b.failures - a.failures).slice(0, 10),
    downtimeByMachine: downtimeByMachine.sort((a, b) => b.downtimeMinutes - a.downtimeMinutes),
  };
}
