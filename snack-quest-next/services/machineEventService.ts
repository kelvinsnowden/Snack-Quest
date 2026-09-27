import 'server-only';

import { machineRepository, MachineNotFoundError } from '@/repositories/machineRepository';
import { machineEventRepository } from '@/repositories/machineEventRepository';
import { machineIntegrationRepository } from '@/repositories/machineIntegrationRepository';
import { machineSlotRepository } from '@/repositories/machineSlotRepository';
import { normalizeEventType, resolveOccurredAt, sanitizeEventData, severityFor } from '@/lib/vending/machineEvents';
import { resolveSlotCode } from '@/lib/vending/slotMapping';
import type { Machine, MachineEvent, MachineEventSource, MachineEventType } from '@/types';

export interface RecordMachineEventInput {
  businessId: string;
  machineId: string;
  type: MachineEventType;
  source: MachineEventSource;
  /** Unique per machine for this one occurrence — a redelivery reuses it and is ignored. */
  dedupeKey: string;
  deviceTimestamp?: string | null;
  slotCode?: string | null;
  nativeType?: string | null;
  data?: unknown;
}

/** One event as an external party (v1 API caller or webhook) describes it — manufacturer slot names, their event names. */
export interface ExternalMachineEventInput {
  type: string;
  eventId: string;
  occurredAt: string | null;
  manufacturerSlotId: string | null;
  data: Record<string, unknown>;
}

/** Sources where the machine itself is speaking — each one is proof of life. */
const MACHINE_ORIGINATED: readonly MachineEventSource[] = ['v1_api', 'webhook'];

/**
 * The normalized machine event stream (§ MACHINE EVENT SYSTEM). Every
 * event, from every manufacturer and every channel, is recorded here in
 * Snack Quest's own vocabulary — this is what analytics, the Alert
 * Center and the admin console read, never a manufacturer's payload.
 *
 * Recording is idempotent per machine by `dedupeKey`; side effects
 * (last-seen, integration health signals) happen only for the first
 * delivery.
 */
class MachineEventService {
  async record(input: RecordMachineEventInput, preloaded?: Machine): Promise<{ isNew: boolean; id: string }> {
    const machine = preloaded ?? (await machineRepository.findById(input.businessId, input.machineId));
    if (!machine) {
      throw new MachineNotFoundError(input.machineId);
    }
    const receivedAt = new Date();
    const result = await machineEventRepository.recordIfNew({
      businessId: input.businessId,
      machineId: input.machineId,
      machineCode: machine.machineCode,
      manufacturerId: machine.manufacturerId ?? null,
      modelId: machine.modelId ?? null,
      type: input.type,
      severity: severityFor(input.type),
      occurredAt: resolveOccurredAt(input.deviceTimestamp, receivedAt),
      receivedAt,
      source: input.source,
      slotCode: input.slotCode ?? null,
      nativeType: input.nativeType ?? null,
      data: sanitizeEventData(input.data),
      dedupeKey: input.dedupeKey,
    });

    if (result.isNew && MACHINE_ORIGINATED.includes(input.source)) {
      await machineRepository.updateLastSeen(input.machineId, null);
      if (input.type === 'HEARTBEAT_RECEIVED' || input.type === 'STATUS_REPORTED') {
        await machineIntegrationRepository.recordSignal(input.machineId, 'heartbeat');
      }
    }
    return result;
  }

  /**
   * Translates and records a batch an external party sent — their slot
   * names mapped to ours, their event names normalized (unknown ones
   * kept as `UNKNOWN_EVENT` with the native name). Dedupe is scoped by
   * `namespace` so two channels can never collide on an event id.
   */
  async recordExternal(
    businessId: string,
    machine: Machine & { id: string },
    events: ExternalMachineEventInput[],
    source: MachineEventSource,
    namespace: string,
  ): Promise<{ recorded: number; duplicates: number; unknownTypes: string[]; unmappedSlots: string[] }> {
    const slots = events.some((event) => event.manufacturerSlotId)
      ? await machineSlotRepository.listByMachine(businessId, machine.id)
      : [];
    let recorded = 0;
    let duplicates = 0;
    const unknownTypes: string[] = [];
    const unmappedSlots: string[] = [];

    for (const event of events) {
      const type = normalizeEventType(event.type);
      if (type === 'UNKNOWN_EVENT') {
        unknownTypes.push(event.type);
      }
      let slotCode: string | null = null;
      if (event.manufacturerSlotId) {
        slotCode = resolveSlotCode(slots, event.manufacturerSlotId);
        if (!slotCode) {
          unmappedSlots.push(event.manufacturerSlotId);
        }
      }
      const { isNew } = await this.record(
        {
          businessId,
          machineId: machine.id,
          type,
          source,
          dedupeKey: `${namespace}:${event.eventId}`,
          deviceTimestamp: event.occurredAt,
          slotCode,
          nativeType: event.type,
          data: { ...event.data, ...(event.manufacturerSlotId && !slotCode ? { unmappedManufacturerSlotId: event.manufacturerSlotId } : {}) },
        },
        machine,
      );
      if (isNew) {
        recorded += 1;
      } else {
        duplicates += 1;
      }
    }
    return { recorded, duplicates, unknownTypes, unmappedSlots };
  }

  async listForMachine(businessId: string, machineId: string, limit?: number): Promise<{ id: string; data: MachineEvent }[]> {
    return machineEventRepository.listByMachine(businessId, machineId, limit);
  }
}

export const machineEventService = new MachineEventService();
export { MachineEventService };
