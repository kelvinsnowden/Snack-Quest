import 'server-only';

/**
 * The transport the simulator drives its scenario through
 * (§ CORE ENTITIES, docs/VENDING_OS_BENCHMARK.md §C/§24) — deliberately
 * an interface, not a hard-coded `fetch`, for the same reason
 * `VendingHardwareAdapter` exists: `SimulatedMachine` should not care
 * whether its calls land on an in-process route handler or a real
 * HTTP server.
 *
 * `InProcessRouteCaller` (below) is what actually runs today — it
 * imports the real Route Handler functions and invokes them exactly
 * the way `tests/api/vending*.test.ts` already do, which means the
 * simulator exercises the *identical* code path a real HTTP request
 * would (auth, validation, service calls, Firestore), not a mock of
 * it. Pointing this interface at real `fetch()` against a deployed
 * URL for genuine load testing at 100s/1,000s of simulated machines
 * (§24's own stated use) is a second, small implementation of the
 * same four methods — deliberately not built in Phase 1, since it
 * needs a TypeScript-execution story for a standalone CLI this
 * codebase doesn't have yet (no `tsx`/`ts-node` dependency), and
 * adding one is its own decision, not a side effect of this file.
 */
export interface RouteCaller {
  postTelemetry(authHeader: string, payload: unknown): Promise<{ status: number; body: unknown }>;
  postPayment(authHeader: string, body: unknown): Promise<{ status: number; body: unknown }>;
  getPaymentStatus(authHeader: string, transactionId: string): Promise<{ status: number; body: unknown }>;
  postTransactionResult(authHeader: string, payload: unknown): Promise<{ status: number; body: unknown }>;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export class InProcessRouteCaller implements RouteCaller {
  async postTelemetry(authHeader: string, payload: unknown) {
    const { POST } = await import('@/app/api/vending/telemetry/route');
    const response = await POST(
      new Request('http://localhost/api/vending/telemetry', {
        method: 'POST',
        headers: { authorization: authHeader, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    );
    return { status: response.status, body: await readJson(response) };
  }

  async postPayment(authHeader: string, body: unknown) {
    const { POST } = await import('@/app/api/vending/payments/route');
    const response = await POST(
      new Request('http://localhost/api/vending/payments', {
        method: 'POST',
        headers: { authorization: authHeader, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
    return { status: response.status, body: await readJson(response) };
  }

  async getPaymentStatus(authHeader: string, transactionId: string) {
    const { GET } = await import('@/app/api/vending/payments/[id]/route');
    const response = await GET(
      new Request(`http://localhost/api/vending/payments/${transactionId}`, { headers: { authorization: authHeader } }),
      { params: Promise.resolve({ id: transactionId }) },
    );
    return { status: response.status, body: await readJson(response) };
  }

  async postTransactionResult(authHeader: string, payload: unknown) {
    const { POST } = await import('@/app/api/vending/transactions/route');
    const response = await POST(
      new Request('http://localhost/api/vending/transactions', {
        method: 'POST',
        headers: { authorization: authHeader, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    );
    return { status: response.status, body: await readJson(response) };
  }
}
