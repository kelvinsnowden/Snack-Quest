import type { CertificationSubject } from '@/services/integrationCertificationService';
import { validateManufacturerBaseUrl } from '@/lib/vending/outboundUrl';

/**
 * A manufacturer's sandbox machine, driven through the certification
 * harness by its own **sandbox control endpoints** — the one piece a
 * manufacturer must build for automated certification
 * (docs/MANUFACTURER_CERTIFICATION.md §"Sandbox control endpoints"):
 *
 *   GET  {controlUrl}/capabilities        → { "supports": ["hold", "retransmit", "request-log"] }
 *   POST {controlUrl}/cycle               → run one normal cycle (connect if needed, heartbeat, status, inventory, poll → ack → dispense → report)
 *   POST {controlUrl}/door-events         → open and close the door
 *   POST {controlUrl}/empty-slot          { "slotId": "…" } → make that slot physically empty
 *   POST {controlUrl}/hold-next-commands  → next cycle fetches commands but does not execute them   (optional: "hold")
 *   POST {controlUrl}/retransmit-last-report → re-send the last outcome report unchanged → { status, result } (optional: "retransmit")
 *   GET  {controlUrl}/request-log         → [{ nonce, timestamp }] of every signed request   (optional: "request-log")
 *
 * All with `Authorization: Bearer {controlToken}`. Optional steps the
 * machine can't be driven through are left out, and the harness marks
 * them "verify by hand" rather than passing them.
 */
export async function connectHttpControlledSubject(
  controlUrl: string,
  controlToken: string,
  options: { fetchImpl?: typeof fetch; allowLocalHttp?: boolean; timeoutMs?: number } = {},
): Promise<CertificationSubject> {
  const base = validateManufacturerBaseUrl(controlUrl, { allowLocalHttp: options.allowLocalHttp ?? false }).toString().replace(/\/$/, '');
  const doFetch = options.fetchImpl ?? fetch;
  const call = async (method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> => {
    const response = await doFetch(`${base}${path}`, {
      method,
      redirect: 'manual',
      signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
      headers: { authorization: `Bearer ${controlToken}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`control endpoint ${method} ${path} answered HTTP ${response.status}`);
    return text ? JSON.parse(text) : null;
  };
  const supports = new Set(((await call('GET', '/capabilities')) as { supports?: string[] } | null)?.supports ?? []);
  const subject: CertificationSubject = {
    kind: 'manufacturer_machine',
    cycle: async () => void (await call('POST', '/cycle')),
    emitDoorEvents: async () => void (await call('POST', '/door-events')),
    emptySlot: async (slotId) => void (await call('POST', '/empty-slot', { slotId })),
  };
  if (supports.has('hold')) subject.pollWithoutExecuting = async () => void (await call('POST', '/hold-next-commands'));
  if (supports.has('retransmit')) subject.retransmitLastReport = async () => (await call('POST', '/retransmit-last-report')) as { status: number; result: string | null };
  let log: { nonce: string; timestamp: number }[] = [];
  if (supports.has('request-log')) {
    // The harness reads the log synchronously at the end; refresh it after every cycle.
    const cycle = subject.cycle;
    subject.cycle = async () => {
      await cycle();
      log = ((await call('GET', '/request-log')) as { nonce: string; timestamp: number }[] | null) ?? [];
    };
    subject.requestLog = () => log;
  }
  return subject;
}
