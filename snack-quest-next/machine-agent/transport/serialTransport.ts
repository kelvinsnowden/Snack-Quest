/**
 * The serial line to the M109E board(s). The real implementation (a
 * USB-serial or UART port on the host) is written when the host is
 * known (M109E audit §6.3, Q6/Q7); everything above this interface runs
 * the same against the fake board.
 *
 * `request` writes one 20-byte frame, waits `settleMs`, and returns the
 * bytes read before `timeoutMs` — or `null` when no complete reply
 * arrived. It never retries and never interprets the bytes; the protocol
 * client does both.
 */
export interface SerialTransport {
  request(frame: Uint8Array, timing: { settleMs: number; timeoutMs: number }): Promise<Uint8Array | null>;
  /** Discards anything already waiting on the line (stray or late bytes) before a new request. */
  flushInput(): Promise<void>;
  close(): Promise<void>;
}

/** The document's timing (§4.2): wait 50 ms after sending, give up after 1 s. */
export const DOCUMENTED_TIMING = { settleMs: 50, timeoutMs: 1000 } as const;
