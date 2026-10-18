import 'server-only';

import { machineIntegrationRepository } from '@/repositories/machineIntegrationRepository';
import { machineSlotRepository } from '@/repositories/machineSlotRepository';
import { integrationCredentialService } from '@/services/integrationCredentialService';
import { getSiteUrl } from '@/lib/seo/siteUrl';

export class MachineNotIntegratedError extends Error {
  constructor() {
    super('Set up this machine’s integration (manufacturer, model and its id) before issuing it a key.');
    this.name = 'MachineNotIntegratedError';
  }
}

/** An M109E lane id as the agent's slot map names it (`b1-m07`). */
const AGENT_LANE = /^b[1-8]-m\d{2}$/;

/**
 * The agent's `config.json` for this machine, ready to paste — every
 * value Snack Quest already knows (site, key, the machine's id, its
 * mapped lanes). Motor type and curtain mode are per-lane facts the
 * bench tests confirm; they start at the most common values.
 */
export function agentConfigFor(input: { siteUrl: string; keyId: string; manufacturerMachineId: string; lanes: string[] }): string {
  const lanes = [...new Set(input.lanes.filter((lane) => AGENT_LANE.test(lane)))].sort();
  return JSON.stringify(
    {
      snackQuest: { baseUrl: input.siteUrl, keyId: input.keyId, secretFile: 'secret' },
      manufacturerMachineId: input.manufacturerMachineId,
      transport: { kind: 'serial', device: '/dev/ttyUSB0', baud: 9600 },
      slots: (lanes.length > 0 ? lanes : ['b1-m00']).map((slotId) => ({ slotId, motorType: 3, curtainMode: 2 })),
      acceptanceRecordFile: null,
      dataDir: '/var/lib/snack-quest-agent',
    },
    null,
    2,
  );
}

/**
 * Keys that speak for one machine only — what the Machine Agent on that
 * machine signs with. A stolen machine key can't act for any other
 * machine, and revoking it stops only that machine.
 */
class MachineAgentKeyService {
  async list(businessId: string, machineId: string) {
    const integration = await machineIntegrationRepository.findByMachineId(businessId, machineId);
    if (!integration) return [];
    const all = await integrationCredentialService.listForManufacturer(businessId, integration.manufacturerId);
    return all.filter((credential) => credential.kind === 'api' && credential.scope.type === 'machine' && credential.scope.machineId === machineId);
  }

  async issue(businessId: string, machineId: string, actor: string): Promise<{ keyId: string; secret: string; environment: string; config: string; secretFingerprint: string | null }> {
    const integration = await machineIntegrationRepository.findByMachineId(businessId, machineId);
    if (!integration?.manufacturerId || !integration.manufacturerMachineId) throw new MachineNotIntegratedError();
    const issued = await integrationCredentialService.issue(
      businessId,
      integration.manufacturerId,
      { kind: 'api', environment: integration.environment, label: 'Machine Agent', machineId },
      actor,
    );
    const slots = await machineSlotRepository.listByMachine(businessId, machineId);
    return {
      keyId: issued.keyId,
      secret: issued.secret,
      environment: issued.environment,
      secretFingerprint: issued.secretFingerprint ?? null,
      config: agentConfigFor({
        siteUrl: getSiteUrl(),
        keyId: issued.keyId,
        manufacturerMachineId: integration.manufacturerMachineId,
        lanes: slots.map((slot) => slot.manufacturerSlotId ?? ''),
      }),
    };
  }
}

export const machineAgentKeyService = new MachineAgentKeyService();
