import { randomUUID } from 'node:crypto';
import { newNonce, signedHeaders, type FetchLike } from '@/sdk/typescript/snackQuestMachine';
import { SandboxOnlyError } from './v1Machine';

/**
 * A manufacturer's cloud in Model A (Snack Quest calls their API; they
 * push events back to us) — the webhook half, signed exactly as the
 * Machine API v1 §8 requires, with the delivery shape the generic
 * adapter parses: `{ deliveryId, events: [{ type, machineId, eventId,
 * occurredAt?, slotId?, data? }] }`.
 *
 * Faults: re-deliver the same delivery (at-least-once senders), send a
 * body that is not in the agreed shape, or sign with a stale clock.
 * Sandbox keys only.
 */
export interface WebhookEvent {
  type: string;
  machineId: string;
  eventId?: string;
  occurredAt?: string;
  slotId?: string;
  data?: Record<string, unknown>;
}

export class SimulatedManufacturerCloud {
  readonly inject = { redeliver: 0, malformedNext: false, clockSkewSeconds: 0 };
  readonly deliveries: { deliveryId: string; status: number; code: string | null }[] = [];

  constructor(
    private readonly fetchImpl: FetchLike,
    private readonly credentials: { keyId: string; secret: string },
    private readonly slug: string,
  ) {
    if (!credentials.keyId.startsWith('sqk_test_')) throw new SandboxOnlyError();
  }

  /** Sends one delivery (plus `inject.redeliver` identical re-deliveries, each freshly signed). Returns every response. */
  async send(events: WebhookEvent[], deliveryId = `dlv-${randomUUID()}`): Promise<{ status: number; code: string | null; data: Record<string, unknown> | null }[]> {
    const body = this.inject.malformedNext ? JSON.stringify({ unexpected: true }) : JSON.stringify({ deliveryId, events: events.map((event) => ({ eventId: event.eventId ?? `evt-${randomUUID()}`, ...event })) });
    this.inject.malformedNext = false;
    const results = [];
    for (let attempt = 0; attempt <= this.inject.redeliver; attempt += 1) {
      results.push(await this.post(body, deliveryId));
    }
    return results;
  }

  private async post(body: string, deliveryId: string) {
    const path = `/api/v1/webhooks/manufacturers/${this.slug}`;
    const timestamp = Math.floor(Date.now() / 1000) + this.inject.clockSkewSeconds;
    const headers = { ...signedHeaders({ keyId: this.credentials.keyId, secret: this.credentials.secret, method: 'POST', pathWithQuery: path, body, timestamp, nonce: newNonce() }), 'Content-Type': 'application/json' };
    const response = await this.fetchImpl(`http://sandbox.invalid${path}`, { method: 'POST', headers, body });
    let parsed: { data?: Record<string, unknown>; error?: { code: string } } | null = null;
    try {
      parsed = JSON.parse(await response.text());
    } catch {
      parsed = null;
    }
    const result = { status: response.status, code: parsed?.error?.code ?? null, data: parsed?.data ?? null };
    this.deliveries.push({ deliveryId, status: result.status, code: result.code });
    return result;
  }
}
