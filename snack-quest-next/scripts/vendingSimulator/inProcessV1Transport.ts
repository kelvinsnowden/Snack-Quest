import 'server-only';

import type { V1Transport } from './v1Machine';

type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>;

/**
 * Delivers the simulator's requests straight to the real v1 Route
 * Handlers in-process — the identical code path an HTTP request takes
 * (signature verification, validation, services, Firestore), minus the
 * network. Same role `InProcessRouteCaller` plays for the legacy
 * gateway simulator.
 */
export class InProcessV1Transport implements V1Transport {
  /** A `fetch` that answers from the route handlers — hand it to the reference SDK. */
  readonly fetch = async (url: string, init: { method: string; headers: Record<string, string>; body?: string }): Promise<Response> => {
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    const { handler, params } = await this.route(init.method, path);
    return handler(new Request(`http://localhost${path}`, { method: init.method, headers: init.headers, body: init.method === 'GET' ? undefined : init.body }), { params: Promise.resolve(params) });
  };

  async send(method: 'GET' | 'POST', path: string, headers: Record<string, string>, body: string) {
    const { handler, params } = await this.route(method, path);
    const response = await handler(
      new Request(`http://localhost${path}`, { method, headers: { ...headers, 'content-type': 'application/json' }, body: method === 'GET' ? undefined : body }),
      { params: Promise.resolve(params) },
    );
    let parsed: unknown = null;
    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }
    return { status: response.status, body: parsed };
  }

  private async route(method: string, path: string): Promise<{ handler: Handler; params: Record<string, string> }> {
    if (path === '/api/v1/machines/connect') {
      return { handler: (await import('@/app/api/v1/machines/connect/route')).POST as Handler, params: {} };
    }
    const webhook = path.match(/^\/api\/v1\/webhooks\/manufacturers\/([^/]+)$/);
    if (webhook) {
      return { handler: (await import('@/app/api/v1/webhooks/manufacturers/[slug]/route')).POST as Handler, params: { slug: decodeURIComponent(webhook[1]) } };
    }
    const match = path.match(/^\/api\/v1\/machines\/([^/]+)(?:\/(.*))?$/);
    if (!match) {
      throw new Error(`simulator: no route for ${path}`);
    }
    const machineCode = decodeURIComponent(match[1]);
    const rest = match[2] ?? '';
    const command = rest.match(/^commands\/([^/]+)\/(ack|status)$/);
    if (command) {
      const params = { machineCode, commandId: decodeURIComponent(command[1]) };
      return command[2] === 'ack'
        ? { handler: (await import('@/app/api/v1/machines/[machineCode]/commands/[commandId]/ack/route')).POST as Handler, params }
        : { handler: (await import('@/app/api/v1/machines/[machineCode]/commands/[commandId]/status/route')).POST as Handler, params };
    }
    const params = { machineCode };
    switch (`${method} ${rest}`) {
      case 'GET ':
        return { handler: (await import('@/app/api/v1/machines/[machineCode]/route')).GET as Handler, params };
      case 'POST heartbeat':
        return { handler: (await import('@/app/api/v1/machines/[machineCode]/heartbeat/route')).POST as Handler, params };
      case 'POST status':
        return { handler: (await import('@/app/api/v1/machines/[machineCode]/status/route')).POST as Handler, params };
      case 'POST inventory':
        return { handler: (await import('@/app/api/v1/machines/[machineCode]/inventory/route')).POST as Handler, params };
      case 'POST events':
        return { handler: (await import('@/app/api/v1/machines/[machineCode]/events/route')).POST as Handler, params };
      case 'GET commands':
        return { handler: (await import('@/app/api/v1/machines/[machineCode]/commands/route')).GET as Handler, params };
      default:
        throw new Error(`simulator: no route for ${method} ${path}`);
    }
  }
}
