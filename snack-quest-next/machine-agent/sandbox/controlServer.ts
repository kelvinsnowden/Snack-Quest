import { createServer, type IncomingMessage, type Server } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import type { HarnessSubject } from './sandboxSubject';

export class SandboxOnlyError extends Error {
  constructor() {
    super('the sandbox control server only runs with a sandbox key (sqk_test_…); it never runs against production');
    this.name = 'SandboxOnlyError';
  }
}

/**
 * The sandbox control endpoints the certification harness drives
 * (docs/MANUFACTURER_CERTIFICATION.md §"Sandbox control endpoints"):
 *
 *   GET  /capabilities  POST /cycle  POST /door-events  POST /empty-slot
 *   POST /hold-next-commands  POST /retransmit-last-report
 *   GET  /request-log  POST /defer-next-report
 *
 * Every request needs `Authorization: Bearer <token>`. Refuses to start
 * unless the agent's machine-API key is a sandbox key, and listens on
 * 127.0.0.1 unless told otherwise.
 */
export async function startSandboxControlServer(options: { subject: HarnessSubject; apiKeyId: string; token: string; host?: string; port?: number }): Promise<{ url: string; server: Server; close(): Promise<void> }> {
  if (!options.apiKeyId.startsWith('sqk_test_')) throw new SandboxOnlyError();
  if (options.token.length < 24) throw new Error('control token must be at least 24 characters');
  const expected = Buffer.from(`Bearer ${options.token}`);
  const { subject } = options;
  const supports = ['hold', 'retransmit', 'request-log', 'defer-report'].filter((name) =>
    name === 'hold' ? subject.pollWithoutExecuting : name === 'retransmit' ? subject.retransmitLastReport : name === 'request-log' ? subject.requestLog : subject.deferNextReport,
  );

  // One control action at a time: the machine does one thing at a time.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work);
    queue = next.catch(() => undefined);
    return next;
  };

  const server = createServer((request, response) => {
    const send = (status: number, body: unknown) => {
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(body === undefined ? '' : JSON.stringify(body));
    };
    const given = Buffer.from(request.headers.authorization ?? '');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return send(401, { error: 'unauthorized' });
    const route = `${request.method} ${new URL(request.url ?? '/', 'http://localhost').pathname}`;
    void (async () => {
      try {
        switch (route) {
          case 'GET /capabilities':
            return send(200, { supports });
          case 'GET /request-log':
            return send(200, subject.requestLog?.() ?? []);
          case 'POST /cycle':
            await serial(() => subject.cycle());
            return send(200, { ok: true });
          case 'POST /door-events':
            await serial(() => subject.emitDoorEvents());
            return send(200, { ok: true });
          case 'POST /empty-slot': {
            const body = (await readJson(request)) as { slotId?: unknown };
            if (typeof body?.slotId !== 'string') return send(400, { error: 'slotId required' });
            await serial(() => subject.emptySlot(body.slotId as string));
            return send(200, { ok: true });
          }
          case 'POST /hold-next-commands':
            if (!subject.pollWithoutExecuting) return send(404, { error: 'not supported' });
            await serial(() => subject.pollWithoutExecuting!());
            return send(200, { ok: true });
          case 'POST /defer-next-report':
            if (!subject.deferNextReport) return send(404, { error: 'not supported' });
            await serial(() => subject.deferNextReport!());
            return send(200, { ok: true });
          case 'POST /retransmit-last-report':
            if (!subject.retransmitLastReport) return send(404, { error: 'not supported' });
            return send(200, await serial(() => subject.retransmitLastReport!()));
          default:
            return send(404, { error: 'no such control endpoint' });
        }
      } catch (error) {
        send(500, { error: error instanceof Error ? error.message : String(error) });
      }
    })();
  });

  await new Promise<void>((resolve) => server.listen(options.port ?? 0, options.host ?? '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : options.port;
  return {
    url: `http://${options.host ?? '127.0.0.1'}:${port}`,
    server,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > 16_384) throw new Error('body too large');
    chunks.push(chunk as Buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : null;
}
