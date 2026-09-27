import 'server-only';

import { machineEventRepository } from '@/repositories/machineEventRepository';
import { machineRepository } from '@/repositories/machineRepository';
import { manufacturerRepository } from '@/repositories/manufacturerRepository';
import { machineModelRepository } from '@/repositories/machineModelRepository';
import { computeReliability, type ReliabilityReport } from '@/lib/vending/reliability';
import type { MachineEventType } from '@/types';

const RELEVANT_TYPES: MachineEventType[] = ['DISPENSE_SUCCESS', 'DISPENSE_FAILED', 'MACHINE_ERROR', 'MACHINE_OFFLINE', 'MACHINE_ONLINE'];

/**
 * Hardware reliability by manufacturer, model, machine and slot, over a
 * trailing window — the integration layer's contribution to Snack
 * Quest's analytics (§ ANALYTICS). Reads the normalized event stream
 * every integration writes, so a Manufacturer A machine and a
 * Manufacturer C machine are measured by exactly the same rules.
 *
 * Sales/location/product performance is deliberately not repeated here:
 * those already come from the transaction rollups and intelligence
 * services, which are equally manufacturer-agnostic.
 */
class MachineReliabilityService {
  async summarize(businessId: string, windowDays = 30): Promise<ReliabilityReport> {
    const now = new Date();
    const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
    const [machines, manufacturers, models] = await Promise.all([
      machineRepository.listAllForBusiness(businessId),
      manufacturerRepository.listByBusiness(businessId),
      machineModelRepository.listByBusiness(businessId),
    ]);
    const events = [];
    for await (const { data } of machineEventRepository.streamReceived(businessId, { since, types: RELEVANT_TYPES })) {
      events.push({ ...data, occurredAt: data.occurredAt.toDate() });
    }
    return computeReliability({
      events,
      machines: machines.map(({ id, data }) => ({ id, machineCode: data.machineCode, manufacturerId: data.manufacturerId ?? null, modelId: data.modelId ?? null })),
      manufacturerNames: new Map(manufacturers.map(({ id, data }) => [id, data.name])),
      modelNames: new Map(models.map(({ id, data }) => [id, data.name])),
      since,
      now,
      windowDays,
    });
  }
}

export const machineReliabilityService = new MachineReliabilityService();
export { MachineReliabilityService };
