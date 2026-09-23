import type { Timestamp } from 'firebase/firestore';

/**
 * `machineCommands/{commandId}` — the remote command center's own
 * record (§ H "NEXT" of docs/HARDWARE_COMPATIBILITY_ARCHITECTURE.md,
 * the original brief's `command_id/machine_id/issued_at/expires_at/
 * requested_by/command_type/payload/status/acknowledged_at/
 * completed_at/error`).
 *
 * Exists because Phase 1's HTTP-first transport choice has a real
 * consequence: the server can never synchronously call a machine that
 * only ever calls in. `machineSlotService.setPrice`/`setEnabled`
 * (the PATCH slots route) get away with calling the hardware adapter
 * directly only because the *only* adapter that exists today is an
 * in-process mock — there is no real machine on the other end of that
 * call to be unreachable. A command is the honest version of "ask a
 * remote machine to do something": write what was asked, let the
 * machine's own gateway discover it next time it calls in (polling —
 * `GET /api/vending/commands`, always correct on its own) or sooner if
 * a real-time `CloudTransport` is ever wired in to nudge it
 * (`lib/vending/protocol/cloudTransport.ts` — not built for real yet;
 * see that file's own doc comment for why), and record what actually
 * happened as a fact distinct from what was asked.
 *
 * Deliberately one command type today. Every other type sketched in
 * the original brief (`lock`/`unlock`/`updateConfiguration`/
 * `updateFirmware`/`cancelVend`) either has no adapter concept to act
 * on yet, is OTA (SCALE-bucket, not this), or has no in-flight window
 * to cancel in Phase 1's synchronous vend-authorization flow — adding
 * their command types now would be exactly the "speculative surface
 * with no caller" `docs/VENDING_OS_BENCHMARK.md` already flagged once
 * for the adapter interface itself.
 */
export type MachineCommandType = 'restart';

/**
 * `pending` → a real machine's gateway hasn't fetched this yet.
 * `acknowledged` → fetched and about to be executed; not yet proof it
 * worked. `completed`/`failed` → the machine's own report of what
 * happened, never inferred. `expired` → nothing ever acknowledged (or
 * completed) it before its own `expiresAt`, or before the
 * reconciliation sweep's timeout — mirrors
 * `MachineTransactionStatus.manual_review`'s role for stuck
 * transactions, one state earlier in the pipeline.
 */
export type MachineCommandStatus = 'pending' | 'acknowledged' | 'completed' | 'failed' | 'expired';

export interface MachineCommand {
  businessId: string;
  machineId: string;
  /** Human-readable — "CMD-XXXXXXXX", same convention as `MachineTransaction.transactionRef`. */
  commandRef: string;
  commandType: MachineCommandType;
  payload: Record<string, unknown> | null;
  status: MachineCommandStatus;
  /** The staff uid that issued this — never a device, since only a staff session can call the issuing route. */
  requestedBy: string;
  /** Computed once at issuance (`createdAt` + a TTL) — checked on acknowledgement, not filtered into the pending-list query (see `MachineCommandRepository`'s own comment for why). */
  expiresAt: Timestamp;
  acknowledgedAt: Timestamp | null;
  completedAt: Timestamp | null;
  /** Set only when `status` is `failed` — the device's own reported reason, never fabricated. */
  error: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Every status transition this command may make, keyed by its current status — enforced by `MachineCommandRepository.moveStatus`, the same discipline `MACHINE_TRANSACTION_STATUS_TRANSITIONS` already holds for transactions. */
export const MACHINE_COMMAND_STATUS_TRANSITIONS: Record<MachineCommandStatus, MachineCommandStatus[]> = {
  pending: ['acknowledged', 'expired'],
  acknowledged: ['completed', 'failed', 'expired'],
  completed: [],
  failed: [],
  expired: [],
};
