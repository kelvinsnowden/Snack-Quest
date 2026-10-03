import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ReferenceHttpAdapter } from '@/lib/vending/adapters/referenceHttpAdapter';
import { HardwareTimeoutError, HardwareUnreachableError } from '@/lib/vending/hardwareAdapter';
import { recoveryFor } from '@/lib/vending/integrationErrors';

/**
 * Outbound HTTP resilience against a real socket server — every failure
 * a manufacturer API can produce, and what the adapter concludes. The
 * one rule: a vend is only "refused" (refund) when the answer proves it,
 * only "accepted" when the answer says so in the contract's shape, and
 * everything in between is "unknown" (look it up; never refund, never
 * re-send blindly). A retry of a vend only ever happens with the same
 * idempotency key, and only when the request provably wasn't processed.
 */

type Handler = (req: IncomingMessage, res: ServerResponse, body: string) => void;
let handler: Handler;
let server: Server;
let base: string;
const requests: { method: string; url: string; idempotencyKey: string | undefined }[] = [];
const sockets = new Set<Socket>();

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      requests.push({ method: req.method ?? '', url: req.url ?? '', idempotencyKey: req.headers['idempotency-key'] as string | undefined });
      handler(req, res, body);
    });
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  for (const socket of sockets) socket.destroy();
  await new Promise((resolve) => server.close(resolve));
});
beforeEach(() => {
  requests.length = 0;
});

const json = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
};
const adapter = (baseUrl = base, timeoutMs = 600) =>
  new ReferenceHttpAdapter({ baseUrl, apiKey: 'k', timeoutMs, retryDelaysMs: [0, 0], resolveManufacturerMachineId: async () => 'M-1' });
const vend = (a = adapter()) => a.authorizeVend('sq-1', 'A01', { commandRef: 'DSP-R1', manufacturerSlotId: 'spiral_01' });
const vendPuts = () => requests.filter((r) => r.method === 'PUT');

async function outcomeOf(promise: Promise<unknown>): Promise<string> {
  try {
    const result = (await promise) as { authorized: boolean };
    return result.authorized ? 'accepted' : 'refused';
  } catch (error) {
    if (error instanceof HardwareUnreachableError) return `undelivered:${error.code}`;
    if (error instanceof HardwareTimeoutError) return `unknown:${error.code}`;
    throw error;
  }
}

describe('vend (PUT, idempotency-keyed)', () => {
  it('2xx {accepted:true} → accepted; 2xx or 422 {accepted:false} → refused with the reason', async () => {
    handler = (_req, res) => json(res, 201, { accepted: true });
    expect(await outcomeOf(vend())).toBe('accepted');
    handler = (_req, res) => json(res, 200, { accepted: false, reason: 'slot empty' });
    await expect(vend()).resolves.toMatchObject({ authorized: false, reason: 'slot empty' });
    handler = (_req, res) => json(res, 422, { accepted: false, reason: 'unknown slot' });
    expect(await outcomeOf(vend())).toBe('refused');
  });

  it('connection refused → provably undelivered, retried with the same key, then refund-safe', async () => {
    const closed = createServer();
    await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve));
    const port = (closed.address() as AddressInfo).port;
    await new Promise((resolve) => closed.close(resolve));
    const outcome = await outcomeOf(vend(adapter(`http://127.0.0.1:${port}`)));
    expect(outcome).toBe('undelivered:transport.connection_refused');
    expect(recoveryFor('transport.connection_refused').refundSafe).toBe(true);
  });

  it('DNS failure → provably undelivered', async () => {
    expect(await outcomeOf(vend(adapter('http://no-such-host.invalid')))).toMatch(/^undelivered:transport\.(dns|network)$/);
  });

  it('TLS failure (https to a non-TLS server) → undelivered: the handshake fails before the request is sent', async () => {
    expect(await outcomeOf(vend(adapter(base.replace('http://', 'https://'))))).toMatch(/^undelivered:transport\.(tls|network)$|^unknown:transport\.connection_reset$/);
  });

  it('slow response (no headers before the deadline) → unknown, and never re-sent', async () => {
    handler = () => undefined; // never answers
    expect(await outcomeOf(vend())).toBe('unknown:transport.timeout');
    expect(vendPuts()).toHaveLength(1);
  });

  it('headers then a stalled body → unknown within the deadline (the deadline covers the body)', async () => {
    handler = (_req, res) => {
      res.writeHead(201, { 'content-type': 'application/json', 'content-length': '100' });
      res.write('{"accepted"');
    };
    const started = Date.now();
    expect(await outcomeOf(vend())).toBe('unknown:transport.timeout');
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it('dropped after send (request received, socket closed with no answer) → unknown, never re-sent', async () => {
    handler = (req) => req.socket.destroy();
    expect(await outcomeOf(vend())).toMatch(/^unknown:transport\.(connection_reset|network)$/);
    expect(vendPuts()).toHaveLength(1);
  });

  it('partial response (connection drops mid-body) → unknown', async () => {
    handler = (_req, res) => {
      res.writeHead(201, { 'content-type': 'application/json', 'content-length': '100' });
      res.write('{"accepted":tr', () => res.socket?.destroy());
    };
    expect(await outcomeOf(vend())).toMatch(/^unknown:/);
  });

  it('5xx → unknown, not retried (the vend may have started)', async () => {
    handler = (_req, res) => json(res, 503, { error: 'busy' });
    expect(await outcomeOf(vend())).toBe('unknown:transport.http_5xx');
    expect(vendPuts()).toHaveLength(1);
  });

  it('408 / 429 → retried with the SAME idempotency key (not processed), honouring Retry-After', async () => {
    let calls = 0;
    handler = (_req, res) => {
      calls += 1;
      if (calls === 1) return json(res, 429, { error: 'slow down' }, { 'retry-after': '1' });
      if (calls === 2) return json(res, 408, { error: 'request timeout' });
      return json(res, 201, { accepted: true });
    };
    const started = Date.now();
    expect(await outcomeOf(vend())).toBe('accepted');
    expect(Date.now() - started).toBeGreaterThanOrEqual(900);
    expect(vendPuts().map((r) => r.idempotencyKey)).toEqual(['DSP-R1', 'DSP-R1', 'DSP-R1']);
  });

  it('429 that never clears → unknown (looked up later), not refunded on the manufacturer\'s word', async () => {
    handler = (_req, res) => json(res, 429, { error: 'slow down' });
    expect(await outcomeOf(vend())).toBe('unknown:transport.rate_limited');
    expect(vendPuts()).toHaveLength(3);
    expect(recoveryFor('transport.rate_limited').refundSafe).toBe(false);
  });

  it('409 on our own key → unknown (a vend under it may exist), never a refusal', async () => {
    handler = (_req, res) => json(res, 409, { accepted: false, reason: 'duplicate' });
    expect(await outcomeOf(vend())).toBe('unknown:protocol.conflict');
  });

  it('other 4xx (400, 404) → refused: rejected as a request, nothing accepted', async () => {
    handler = (_req, res) => json(res, 404, { error: 'unknown machine' });
    expect(await outcomeOf(vend())).toBe('refused');
    handler = (_req, res) => json(res, 400, { error: 'bad slot' });
    expect(await outcomeOf(vend())).toBe('refused');
  });

  it('2xx with invalid JSON, a schema mismatch, or an empty body → unknown', async () => {
    handler = (_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{accepted: yes'); };
    expect(await outcomeOf(vend())).toBe('unknown:protocol.malformed_response');
    handler = (_req, res) => json(res, 200, { ok: true });
    expect(await outcomeOf(vend())).toBe('unknown:protocol.malformed_response');
    handler = (_req, res) => { res.writeHead(204); res.end(); };
    expect(await outcomeOf(vend())).toBe('unknown:protocol.malformed_response');
  });

  it('an oversized response (over 1 MB) is not buffered → unknown', async () => {
    handler = (_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(`{"accepted":true,"pad":"${'x'.repeat(1_100_000)}"}`); };
    expect(await outcomeOf(vend())).toBe('unknown:protocol.malformed_response');
  });

  it('a redirect is not followed (it could point anywhere) → unknown', async () => {
    handler = (req, res) => {
      if (req.url?.startsWith('/elsewhere')) return json(res, 201, { accepted: true });
      res.writeHead(307, { location: `${base}/elsewhere` });
      res.end();
    };
    expect(await outcomeOf(vend())).toBe('unknown:transport.redirect');
    expect(requests.some((r) => r.url.startsWith('/elsewhere'))).toBe(false);
  });
});

describe('vend lookup (GET, safe to retry)', () => {
  const lookup = () => adapter().getDispenseStatus('sq-1', 'DSP-R1');

  it('5xx is retried; a later answer wins', async () => {
    let calls = 0;
    handler = (_req, res) => ((calls += 1) < 3 ? json(res, 502, {}) : json(res, 200, { state: 'dispensed' }));
    await expect(lookup()).resolves.toMatchObject({ state: 'success' });
    expect(calls).toBe(3);
  });

  it('404 → the vend never arrived (failed); malformed → unknown, never guessed', async () => {
    handler = (_req, res) => json(res, 404, {});
    await expect(lookup()).resolves.toMatchObject({ state: 'failed' });
    handler = (_req, res) => { res.writeHead(200); res.end('<html>'); };
    await expect(lookup()).resolves.toMatchObject({ state: 'unknown' });
    handler = (_req, res) => json(res, 200, { state: 'teleported' });
    await expect(lookup()).resolves.toMatchObject({ state: 'unknown' });
  });

  it('persistent 5xx → an error the reconciler backs off on, not a verdict', async () => {
    handler = (_req, res) => json(res, 500, {});
    await expect(lookup()).rejects.toBeInstanceOf(HardwareTimeoutError);
  });
});
