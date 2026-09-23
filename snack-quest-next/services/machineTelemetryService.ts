import 'server-only';

import { machineRepository, MachineNotFoundError } from '@/repositories/machineRepository';
import { machineTelemetryEventRepository } from '@/repositories/machineTelemetryEventRepository';
import { defaultVendingAdapterResolver, type VendingAdapterResolver } from '@/lib/vending/adapterRegistry';
import { Timestamp } from 'firebase-admin/firestore';
import type { MachineTelemetryEvent, MachineTelemetryEventType } from '@/types';

/**
 * Non-financial telemetry ingest (§ CORE ENTITIES 5, § offline
 * behaviour). `machineTransactionService.applyVendResult` handles
 * `vend_result` specifically, because that one event type has
 * financial consequences; everything else — heartbeat, status, fault,
 * temperature, door, connectivity, stock — comes through here,
 * updates `Machine.lastSeenAt`, and is otherwise recorded verbatim
 * without ever writing to a transaction or an inventory movement.
 *
 * Idempotent by the same construction as vend results: a duplicate
 * delivery of the same event (a gateway retrying after a dropped
 * acknowledgement) is recognised by
 * `machineTelemetryEventRepository.recordIfNew` and produces no
 * second effect.
 */
class MachineTelemetryService {
  constructor(private readonly resolveAdapter: VendingAdapterResolver = defaultVendingAdapterResolver) {}

  async ingest(input: {
    businessId: string;
    machineId: string;
    rawPayload: unknown;
    source: string;
  }): Promise<{ isNew: boolean; eventId: string; eventType: MachineTelemetryEventType }> {
    const machine = await machineRepository.findById(input.businessId, input.machineId);
    if (!machine) {
      throw new MachineNotFoundError(input.machineId);
    }

    const adapter = this.resolveAdapter(machine.manufacturer);
    const report = adapter.receiveTelemetry(input.rawPayload); // throws UnrecognisedHardwarePayloadError, deliberately uncaught here

    const { isNew, id } = await machineTelemetryEventRepository.recordIfNew({
      businessId: input.businessId,
      machineId: input.machineId,
      eventType: report.eventType as MachineTelemetryEventType,
      idempotencyKey: report.idempotencyKey,
      deviceTimestamp: parseDeviceTimestamp(report.deviceTimestamp),
      payload: report.payload,
      source: input.source,
    });

    if (isNew) {
      // Every recognised event is proof the machine is alive right
      // now, regardless of what it reports — even a fault event means
      // the machine successfully phoned home to report it.
      await machineRepository.updateLastSeen(input.machineId, null);
      await machineTelemetryEventRepository.markProcessed(id);
    }

    return { isNew, eventId: id, eventType: report.eventType as MachineTelemetryEventType };
  }

  async listByMachine(businessId: string, machineId: string, options: { eventType?: MachineTelemetryEventType; limit?: number } = {}) {
    return machineTelemetryEventRepository.listByMachine(businessId, machineId, options);
  }
}

export const machineTelemetryService = new MachineTelemetryService();
export { MachineTelemetryService };

function parseDeviceTimestamp(iso: string | null): MachineTelemetryEvent['deviceTimestamp'] {
  if (!iso) {
    return null;
  }
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime())
    ? null
    : (Timestamp.fromDate(parsed) as unknown as MachineTelemetryEvent['deviceTimestamp']);
}
