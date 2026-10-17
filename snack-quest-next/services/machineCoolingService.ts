import 'server-only';

import { machineRepository, MachineNotFoundError } from '@/repositories/machineRepository';
import { machineIntegrationService } from '@/services/machineIntegrationService';
import { machineCommandService } from '@/services/machineCommandService';
import { hasCapability } from '@/lib/vending/protocol/capabilities';
import { coolingCommandPayload, parseCooling, type MachineCooling } from '@/lib/vending/cooling';

export interface CoolingSaveResult {
  before: MachineCooling | null;
  after: MachineCooling;
  /** The `set_cooling` command queued for the machine, or why none was. */
  sent: { commandRef: string } | { notSent: 'not_supported' };
}

/**
 * A machine's cooling (§ refrigeration). Saving always updates the
 * target the alert sweep judges readings against; it is also sent to
 * the machine as `set_cooling` when the machine can act on it
 * (`remote_cooling`, model ∩ adapter). A machine that can't is still
 * monitored — the admin is told the setting wasn't sent, never left to
 * assume it was.
 */
class MachineCoolingService {
  async save(businessId: string, machineId: string, input: unknown, actor: string): Promise<CoolingSaveResult> {
    const machine = await machineRepository.findById(businessId, machineId);
    if (!machine) throw new MachineNotFoundError(machineId);
    const cooling = parseCooling(input);
    await machineRepository.updateCooling(businessId, machineId, cooling, actor);

    const { capabilities } = await machineIntegrationService.capabilitiesFor(businessId, machine);
    let sent: CoolingSaveResult['sent'];
    if (!hasCapability(capabilities, 'remote_cooling')) {
      sent = { notSent: 'not_supported' };
    } else {
      // An ambient machine is still told: "off" is a real instruction for hardware that was cooling.
      const { commandRef } = await machineCommandService.issueCommand({
        businessId,
        machineId,
        commandType: 'set_cooling',
        payload: coolingCommandPayload(cooling),
        requestedBy: actor,
      });
      sent = { commandRef };
    }
    return { before: machine.cooling ?? null, after: cooling, sent };
  }

  /** Whether the admin page should offer "send to machine" wording or "monitoring only". */
  async canControl(businessId: string, machineId: string): Promise<boolean> {
    const machine = await machineRepository.findById(businessId, machineId);
    if (!machine) return false;
    const { capabilities } = await machineIntegrationService.capabilitiesFor(businessId, machine);
    return hasCapability(capabilities, 'remote_cooling');
  }
}

export const machineCoolingService = new MachineCoolingService();
