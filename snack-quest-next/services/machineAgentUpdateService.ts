import 'server-only';

import { machineIntegrationRepository } from '@/repositories/machineIntegrationRepository';
import { machineCommandService } from '@/services/machineCommandService';
import { getSiteUrl } from '@/lib/seo/siteUrl';

/** What `scripts/buildMachineAgent.mjs` publishes at `/machine-agent/manifest.json` with every deploy. */
export interface AgentReleaseManifest {
  release: string;
  file: string;
  sha256: string;
  bytes: number;
}

export class NotAnAgentMachineError extends Error {
  constructor() {
    super('This machine is not running the Snack Quest Machine Agent, so it cannot be updated from here.');
    this.name = 'NotAnAgentMachineError';
  }
}

export class AgentReleaseUnavailableError extends Error {
  constructor(detail: string) {
    super(`The current agent release couldn't be read (${detail}).`);
    this.name = 'AgentReleaseUnavailableError';
  }
}

const AGENT_PREFIX = 'm109e-agent/';
/** Long enough for a machine that is between polls or briefly offline; an update that waits longer is simply re-issued. */
const UPDATE_TTL_MS = 60 * 60 * 1000;

/** The release a machine runs, from the version it gave on connect (`m109e-agent/0.2.0` → `0.2.0`); null if it isn't the agent. */
export function agentReleaseOf(integrationVersion: string | null | undefined): string | null {
  return integrationVersion?.startsWith(AGENT_PREFIX) ? integrationVersion.slice(AGENT_PREFIX.length) : null;
}

/**
 * Remote updates for machines running Snack Quest's Machine Agent.
 * The release is the one this deployment publishes; the command carries
 * its SHA-256 over the signed machine API, and the machine refuses a
 * download that doesn't match it or comes from another site.
 */
class MachineAgentUpdateService {
  async latestRelease(fetchImpl: typeof fetch = fetch): Promise<AgentReleaseManifest> {
    const site = getSiteUrl();
    let response: Response;
    try {
      response = await fetchImpl(`${site}/machine-agent/manifest.json`, { cache: 'no-store' });
    } catch (error) {
      throw new AgentReleaseUnavailableError(error instanceof Error ? error.message : String(error));
    }
    if (!response.ok) throw new AgentReleaseUnavailableError(`HTTP ${response.status}`);
    const manifest = (await response.json().catch(() => null)) as Partial<AgentReleaseManifest> | null;
    if (!manifest?.release || !manifest.file || !/^[0-9a-f]{64}$/.test(manifest.sha256 ?? '')) throw new AgentReleaseUnavailableError('manifest is incomplete');
    return manifest as AgentReleaseManifest;
  }

  async update(businessId: string, machineId: string, actor: string, fetchImpl: typeof fetch = fetch): Promise<{ commandRef: string; from: string; to: string }> {
    const integration = await machineIntegrationRepository.findByMachineId(businessId, machineId);
    const running = agentReleaseOf(integration?.integrationVersion);
    if (!integration || !running) throw new NotAnAgentMachineError();
    const latest = await this.latestRelease(fetchImpl);
    const { commandRef } = await machineCommandService.issueCommand({
      businessId,
      machineId,
      commandType: 'update_agent',
      payload: { version: latest.release, url: `${getSiteUrl()}/machine-agent/${latest.file}`, sha256: latest.sha256 },
      requestedBy: actor,
      ttlMs: UPDATE_TTL_MS,
    });
    return { commandRef, from: running, to: latest.release };
  }
}

export const machineAgentUpdateService = new MachineAgentUpdateService();
