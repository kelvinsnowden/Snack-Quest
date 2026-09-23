import 'server-only';

import { randomUUID } from 'node:crypto';
import { buildDeviceAuthHeader } from '@/lib/vending/deviceAuth';
import type { RouteCaller } from './routeCaller';

/**
 * A realistic gateway's own behavior, driven against the real API
 * surface (§24: "before connecting a physical machine, create a
 * realistic vending-machine simulator... simulate heartbeat,
 * inventory, payment, vend, dispense success, dispense failure,
 * stockout, offline periods, temperature, faults, delayed messages,
 * duplicate messages, out-of-order events, network failure, machine
 * restart"). Every method here is what a real gateway would send —
 * this class holds no test assertions of its own; it reports what
 * happened and leaves deciding whether that was correct to whoever
 * is driving it (a test, or a human watching a CLI's summary).
 *
 * Deliberately does not implement `machine restart` as a distinct
 * behavior — nothing in this codebase has a restart *command* to
 * receive yet (§ remote operations, NEXT-bucket); simulating a
 * restart a machine can't be told to do would be simulating a
 * capability that doesn't exist.
 */
export class SimulatedMachine {
  private readonly authHeader: string;
  private online = true;

  constructor(
    private readonly caller: RouteCaller,
    private readonly machineId: string,
    deviceSecret: string,
  ) {
    this.authHeader = buildDeviceAuthHeader(machineId, deviceSecret);
  }

  /** Simulates the gateway losing connectivity — every call below becomes a no-op that reports it was skipped, exactly like a real gateway with no route to the internet. */
  goOffline(): void {
    this.online = false;
  }

  comeBackOnline(): void {
    this.online = true;
  }

  async sendHeartbeat(): Promise<{ sent: boolean; status?: number }> {
    if (!this.online) {
      return { sent: false };
    }
    const { status } = await this.caller.postTelemetry(this.authHeader, {
      machineId: this.machineId,
      eventType: 'heartbeat',
      idempotencyKey: `heartbeat-${this.machineId}-${Date.now()}-${randomUUID()}`,
    });
    return { sent: true, status };
  }

  /** Sends the exact same telemetry event twice — the offline-gateway-retry case idempotency exists for. */
  async sendDuplicateTelemetry(eventType: string): Promise<{ firstStatus: number; secondStatus: number }> {
    const idempotencyKey = `dup-${this.machineId}-${randomUUID()}`;
    const first = await this.caller.postTelemetry(this.authHeader, { machineId: this.machineId, eventType, idempotencyKey });
    const second = await this.caller.postTelemetry(this.authHeader, { machineId: this.machineId, eventType, idempotencyKey });
    return { firstStatus: first.status, secondStatus: second.status };
  }

  /** Two distinct events delivered with their device-reported order reversed relative to arrival — `deviceTimestamp` carries the real order; `receivedAt` (server-stamped) never does. */
  async sendOutOfOrderTelemetry(): Promise<void> {
    const now = Date.now();
    await this.caller.postTelemetry(this.authHeader, {
      machineId: this.machineId,
      eventType: 'door_close',
      idempotencyKey: `oo-close-${this.machineId}-${randomUUID()}`,
      deviceTimestamp: new Date(now).toISOString(),
    });
    await this.caller.postTelemetry(this.authHeader, {
      machineId: this.machineId,
      eventType: 'door_open',
      idempotencyKey: `oo-open-${this.machineId}-${randomUUID()}`,
      deviceTimestamp: new Date(now - 5000).toISOString(), // reports as having happened *before* the close that was actually delivered first
    });
  }

  async reportFault(faultCode: string): Promise<{ status: number }> {
    const { status } = await this.caller.postTelemetry(this.authHeader, {
      machineId: this.machineId,
      eventType: 'fault',
      idempotencyKey: `fault-${this.machineId}-${randomUUID()}`,
      payload: { code: faultCode },
    });
    return { status };
  }

  /**
   * The full customer purchase flow: pay, poll for authorization,
   * report the dispense outcome — the same three legs
   * `docs/VENDING_OS_BENCHMARK.md` §C/§E designs for a real screen to
   * drive. `dispenseOutcome: 'success' | 'failure' | 'never-report'`
   * is what makes this a scenario driver rather than a one-shot call —
   * `'never-report'` is exactly the "machine goes offline mid-vend"
   * case the transaction-timeout sweep exists for.
   */
  /**
   * Step 1 of `buy()`, split out so a caller can wait for its own
   * "Safaricom" (real or simulated) to react before polling —
   * `buy()` itself just composes this with `waitForAuthorizationAndReport`
   * back to back, which is the right shape once a real STK push is
   * genuinely racing the poll loop, but is a race if a *test* wants
   * to inject the callback deterministically between them.
   */
  async initiatePurchase(slotId: string, phoneNumber: string): Promise<{ initiated: boolean; initiateStatus: number; transactionId: string | null }> {
    if (!this.online) {
      return { initiated: false, initiateStatus: 0, transactionId: null };
    }
    const initiate = await this.caller.postPayment(this.authHeader, { slotId, phoneNumber });
    if (initiate.status !== 201) {
      return { initiated: false, initiateStatus: initiate.status, transactionId: null };
    }
    const { id: transactionId } = initiate.body as { id: string };
    return { initiated: true, initiateStatus: initiate.status, transactionId };
  }

  /** Step 2 of `buy()`: poll until the payment resolves one way or another, then report a dispense outcome if one was authorized. */
  async waitForAuthorizationAndReport(
    transactionId: string,
    options: { maxPollAttempts?: number; dispenseOutcome?: 'success' | 'failure' | 'never-report' } = {},
  ): Promise<{ finalStatus: string | null; vendResultStatus?: number }> {
    const maxAttempts = options.maxPollAttempts ?? 10;
    let finalStatus: string | null = null;
    let vendRef: string | null = null;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const poll = await this.caller.getPaymentStatus(this.authHeader, transactionId);
      const body = poll.body as { status?: string; vendRef?: string | null };
      finalStatus = body.status ?? null;
      vendRef = body.vendRef ?? null;
      if (finalStatus === 'vend_authorized' || finalStatus === 'paid_vend_failed' || finalStatus === 'payment_failed') {
        break;
      }
    }

    if (finalStatus !== 'vend_authorized' || options.dispenseOutcome === 'never-report' || !vendRef) {
      return { finalStatus };
    }

    const dispensed = options.dispenseOutcome !== 'failure';
    const result = await this.caller.postTransactionResult(this.authHeader, {
      vendRef,
      dispensed,
      idempotencyKey: `vend-result-${transactionId}`,
      failureReason: dispensed ? null : 'jam',
    });
    return { finalStatus, vendResultStatus: result.status };
  }

  /**
   * The full flow in one call, for a real deployment where Safaricom's
   * own callback genuinely races the poll loop rather than needing to
   * be sequenced by a test. See `initiatePurchase`/
   * `waitForAuthorizationAndReport` above for the two steps this
   * composes — use those directly when a caller needs to inject
   * something (a real or simulated callback) deterministically
   * between initiating and polling.
   */
  async buy(
    slotId: string,
    phoneNumber: string,
    options: { maxPollAttempts?: number; dispenseOutcome?: 'success' | 'failure' | 'never-report' } = {},
  ): Promise<{
    initiated: boolean;
    initiateStatus: number;
    transactionId: string | null;
    finalStatus: string | null;
    vendResultStatus?: number;
  }> {
    const initiate = await this.initiatePurchase(slotId, phoneNumber);
    if (!initiate.initiated || !initiate.transactionId) {
      return { ...initiate, finalStatus: null };
    }
    const outcome = await this.waitForAuthorizationAndReport(initiate.transactionId, options);
    return { ...initiate, ...outcome };
  }
}
