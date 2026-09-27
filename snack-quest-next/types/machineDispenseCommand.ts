import type { Timestamp } from 'firebase/firestore';
import type { DispenseResultStatus } from '@/lib/vending/hardwareAdapter';

/**
 * REQUESTED → AUTHORIZED → SENT → ACKNOWLEDGED → DISPENSING → DISPENSED,
 * with REJECTED / TIMEOUT / FAILED / UNKNOWN as the ways it can end
 * otherwise (§ MACHINE COMMAND SAFETY).
 *
 * - `requested` — the claim exists; nothing else has happened.
 * - `authorized` — Snack Quest's own checks passed (payment verified
 *   server-side, integration active). Nothing has left the building.
 * - `sent` — handed to the integration. For an inbound (poll-based)
 *   machine this means "queued for the machine to collect".
 * - `acknowledged` — the machine (or its manufacturer's cloud)
 *   confirmed it received the instruction.
 * - `dispensing` — the machine reports the vend cycle has started.
 * - `dispensed` — the machine reports the product came out. The only
 *   state that consumes inventory.
 * - `rejected` — provably never executed: refused by our own checks,
 *   by the machine, or it never reached the machine at all. Safe to
 *   refund.
 * - `failed` — the machine reports it tried and did not dispense.
 * - `timeout` — sent, and no outcome arrived in time.
 * - `unknown` — the outcome genuinely cannot be determined (a request
 *   that timed out mid-flight, a machine reporting it doesn't know).
 *   Never retried automatically; a human decides.
 *
 * `timeout` and `unknown` stay open to a late authoritative report —
 * a machine that reconnects and says what really happened outranks the
 * sweep's guess, the same rule `MachineTransactionStatus.manual_review`
 * follows.
 */
export type DispenseCommandStatus =
  | 'requested'
  | 'authorized'
  | 'sent'
  | 'acknowledged'
  | 'dispensing'
  | 'dispensed'
  | 'rejected'
  | 'timeout'
  | 'failed'
  | 'unknown';

export const DISPENSE_COMMAND_STATUS_TRANSITIONS: Record<DispenseCommandStatus, DispenseCommandStatus[]> = {
  requested: ['authorized', 'rejected'],
  authorized: ['sent', 'acknowledged', 'rejected', 'unknown'],
  // A queued machine may report its outcome without a separate ack.
  sent: ['acknowledged', 'dispensing', 'dispensed', 'failed', 'rejected', 'timeout', 'unknown'],
  acknowledged: ['dispensing', 'dispensed', 'failed', 'timeout', 'unknown'],
  dispensing: ['dispensed', 'failed', 'timeout', 'unknown'],
  dispensed: [],
  rejected: [],
  failed: [],
  timeout: ['dispensed', 'failed'],
  unknown: ['dispensed', 'failed'],
};

export const TERMINAL_DISPENSE_COMMAND_STATUSES: readonly DispenseCommandStatus[] = ['dispensed', 'rejected', 'failed'];

/** Statuses in which the machine may still be acting on the command — what the timeout sweep watches. */
export const IN_FLIGHT_DISPENSE_COMMAND_STATUSES: readonly DispenseCommandStatus[] = ['sent', 'acknowledged', 'dispensing'];

/**
 * `machineDispenseCommands/{dsp_<transactionId>}` — the physical-side
 * record of one instruction to dispense one unit.
 *
 * **The document id is the idempotency key.** It is derived from the
 * paid transaction (which already belongs to exactly one machine and
 * one slot), and it is claimed with Firestore `create()` *before* any
 * hardware is contacted. A retried payment callback, a double-tapped
 * button, a concurrent reconciliation — all of them hit the same id,
 * find the claim already taken, and return the existing command without
 * reaching the machine a second time. Nothing about this depends on
 * frontend state.
 *
 * Kept apart from `machineTransactions` on purpose: a transaction's
 * status is about money (was the customer charged, do we owe a
 * refund); this is about the machine (was it told, did it hear, what
 * did it do). "Payment succeeded" and "product dispensed" are
 * different facts from different systems, recorded in different places.
 */
export interface MachineDispenseCommand {
  businessId: string;
  machineId: string;
  machineCode: string;
  /** Human-readable, `DSP-XXXXXXXX` — also what an outbound adapter sends the manufacturer as its idempotency key, so their API deduplicates retries too. */
  commandRef: string;
  /** `{transactionId}:{machineId}` — documented form of the key the document id encodes. */
  idempotencyKey: string;
  transactionId: string;
  /** The verified payment reference at the moment of dispatch — never set from a device. */
  paymentRef: string | null;
  slotCode: string;
  /** The manufacturer's own slot name, resolved at dispatch — what an inbound machine is told to vend from. */
  manufacturerSlotId: string | null;
  productId: string;
  quantity: 1;
  adapterKey: string;
  delivery: 'synchronous' | 'queued' | null;
  /** The adapter/hardware correlation reference, once the integration issued one. */
  vendRef: string | null;
  status: DispenseCommandStatus;
  statusHistory: { status: DispenseCommandStatus; at: Timestamp; detail: string | null }[];
  failureReason: string | null;
  /** Machine-readable classification of why it failed or is unknown (lib/vending/integrationErrors.ts) — what recovery branches on. Null on success. */
  failureCode: string | null;
  dispenseResultStatus: DispenseResultStatus | null;
  /** `system:payment`, `system:reconciliation`, or a staff uid. */
  requestedBy: string;
  /** A queued command the machine hasn't collected by now must never be executed — the customer has walked away and will be refunded. */
  expiresAt: Timestamp;
  /** Pull reconciliation (outbound integrations): attempts so far, and when to ask the manufacturer again. Backs off; stops after the last step and leaves the case to a human. */
  reconcileAttempts?: number;
  nextReconcileAt?: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export function dispenseCommandDocId(transactionId: string): string {
  return `dsp_${transactionId}`;
}
