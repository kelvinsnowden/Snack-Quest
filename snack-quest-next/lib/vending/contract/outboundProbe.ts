import { randomUUID } from 'node:crypto';
import { ManufacturerHttpClient, type FetchLike } from '@/lib/vending/adapters/manufacturerHttpClient';
import { HardwareAuthenticationError } from '@/lib/vending/hardwareAdapter';

/**
 * Probes a manufacturer's API (Model A) against the reference contract
 * (docs/MACHINE_INTEGRATION_LAYER.md §6) — what an adapter will rely on.
 * Read-only by default. With `includeVend`, it creates one real sandbox
 * vend and sends it twice under the same idempotency key: only ever
 * against a sandbox machine with stock loaded.
 */
export interface ProbeCheck {
  id: string;
  label: string;
  outcome: 'passed' | 'failed' | 'skipped';
  evidence: string;
}

export interface ProbeReport {
  verdict: 'PASS' | 'FAIL';
  checks: ProbeCheck[];
}

export async function probeManufacturerApi(input: {
  baseUrl: string;
  apiKey: string;
  manufacturerMachineId: string;
  slotId?: string;
  includeVend?: boolean;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}): Promise<ProbeReport> {
  const client = (apiKey: string) => new ManufacturerHttpClient({ adapterKey: 'contract_probe', baseUrl: input.baseUrl, apiKey, fetchImpl: input.fetchImpl, timeoutMs: input.timeoutMs ?? 10_000, retryDelaysMs: [] });
  const machinePath = `/v1/machines/${encodeURIComponent(input.manufacturerMachineId)}`;
  const checks: ProbeCheck[] = [];
  const check = async (id: string, label: string, run: () => Promise<{ ok: boolean; evidence: string }>) => {
    try {
      const { ok, evidence } = await run();
      checks.push({ id, label, outcome: ok ? 'passed' : 'failed', evidence });
    } catch (error) {
      checks.push({ id, label, outcome: 'failed', evidence: error instanceof Error ? error.message : String(error) });
    }
  };

  await check('auth_rejected', 'A wrong API key is refused (401/403)', async () => {
    try {
      const { status } = await client(`wrong-${randomUUID()}`).request('GET', machinePath);
      return { ok: false, evidence: `answered HTTP ${status} to a wrong key` };
    } catch (error) {
      return { ok: error instanceof HardwareAuthenticationError, evidence: error instanceof Error ? error.message : String(error) };
    }
  });
  await check('machine_status', 'Machine status is a JSON object with a boolean "online"', async () => {
    const { status, json, malformed } = await client(input.apiKey).request('GET', machinePath);
    const online = (json as { online?: unknown } | null)?.online;
    return { ok: status === 200 && !malformed && typeof online === 'boolean', evidence: `HTTP ${status}, online=${JSON.stringify(online)}` };
  });
  await check('unknown_vend', 'An unknown vend reference is 404 (so "never arrived" is provable)', async () => {
    const { status } = await client(input.apiKey).request('GET', `${machinePath}/vends/${encodeURIComponent(`probe-${randomUUID()}`)}`);
    return { ok: status === 404, evidence: `HTTP ${status}` };
  });

  if (!input.includeVend) {
    for (const [id, label] of [['vend_accepted', 'Vend accepted as {accepted:true}'], ['vend_idempotent', 'Same idempotency key twice: one vend'], ['vend_lookup', 'The vend can be looked up afterwards']] as const) {
      checks.push({ id, label, outcome: 'skipped', evidence: 'run with includeVend against a sandbox machine to verify' });
    }
  } else {
    const ref = `DSP-PROBE-${randomUUID().slice(0, 8).toUpperCase()}`;
    const vend = () => client(input.apiKey).request('PUT', `${machinePath}/vends/${encodeURIComponent(ref)}`, { body: { slot: input.slotId ?? 'probe' }, idempotencyKey: ref });
    await check('vend_accepted', 'Vend accepted as {accepted:true}', async () => {
      const { status, json } = await vend();
      return { ok: status >= 200 && status < 300 && (json as { accepted?: unknown } | null)?.accepted === true, evidence: `HTTP ${status} ${JSON.stringify(json)}` };
    });
    await check('vend_idempotent', 'Same idempotency key twice: one vend', async () => {
      const { status, json } = await vend();
      return { ok: status >= 200 && status < 300 && (json as { accepted?: unknown } | null)?.accepted === true, evidence: `repeat answered HTTP ${status} ${JSON.stringify(json)} — must return the same vend, not create or refuse one` };
    });
    await check('vend_lookup', 'The vend can be looked up afterwards', async () => {
      const { status, json } = await client(input.apiKey).request('GET', `${machinePath}/vends/${encodeURIComponent(ref)}`);
      const state = (json as { state?: unknown } | null)?.state;
      return { ok: status === 200 && ['pending', 'dispensing', 'dispensed', 'failed'].includes(String(state)), evidence: `HTTP ${status}, state=${JSON.stringify(state)}` };
    });
  }
  return { verdict: checks.some((c) => c.outcome === 'failed') ? 'FAIL' : 'PASS', checks };
}
