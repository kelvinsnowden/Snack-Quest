import type { Timestamp } from 'firebase/firestore';

/**
 * `machineTelemetryEvents/{eventId}` — every raw report a machine
 * gateway ever sends, kept append-only and verbatim
 * (§ CORE ENTITIES 5, § "do not treat arbitrary device telemetry as
 * trusted financial data").
 *
 * This is the landing zone, not the record of truth for anything
 * downstream. A `vend_result` event here is a *claim* the machine
 * made; `MachineTransactionService.applyVendResult()` reads it,
 * checks `idempotencyKey` against what has already been applied, and
 * only then updates a transaction — through the same status machine
 * every other caller goes through, never by trusting this payload
 * directly. `heartbeat`/`fault`/`temperature`/`door` events update
 * `Machine.lastSeenAt` and nothing financial at all.
 *
 * Never overwritten and never deleted by ordinary application code —
 * `processed`/`processingError` are the only fields a later pass may
 * set, and they describe what was *done* with the event, not a
 * correction to what it *said*.
 */
export type MachineTelemetryEventType =
  | 'heartbeat'
  | 'status'
  | 'fault'
  | 'temperature'
  | 'door_open'
  | 'door_close'
  | 'connectivity_online'
  | 'connectivity_offline'
  | 'vend_result'
  | 'stock_update';

export interface MachineTelemetryEvent {
  businessId: string;
  machineId: string;
  eventType: MachineTelemetryEventType;
  /**
   * The device/gateway's own idempotency key — required on every
   * ingest call (§ idempotency, § offline behaviour: "use idempotency
   * keys"). A gateway that queued this event while offline and retries
   * it after reconnecting sends the same key both times; the second
   * call is recognised and short-circuited before it can touch
   * anything else, the same `create()`-fails-on-duplicate primitive
   * `webhookEventRepository.recordIfNew` already uses.
   */
  idempotencyKey: string;
  /** The clock the device/gateway itself reported — kept distinct from `receivedAt` because a queued-while-offline event's device time can be meaningfully earlier than when it actually arrived. Never trusted for anything ordering-sensitive; `receivedAt` is. */
  deviceTimestamp: Timestamp | null;
  receivedAt: Timestamp;
  /** Verbatim, whatever the device/gateway sent — never partially parsed into this document's own fields. Structured extraction happens in the Service that reads this, on demand, not here. */
  payload: Record<string, unknown>;
  /** Which adapter/integration produced this — `'mock'` today; matches `Machine.manufacturer` for the machine it belongs to. */
  source: string;
  processed: boolean;
  processingError: string | null;
}
