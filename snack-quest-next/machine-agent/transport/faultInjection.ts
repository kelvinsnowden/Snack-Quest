import { encodeFrame } from '../m109e/frame';
import type { SerialTransport } from './serialTransport';

/**
 * Wraps a transport and breaks it on purpose, one request at a time — for
 * tests and bench drills (acceptance tests R9, R10, X2–X4).
 *
 * - `drop_request`: the frame never reaches the board; the host hears nothing.
 * - `drop_reply`: the board acts on the frame, but its reply is lost. To
 *   the host this looks exactly like `drop_request` — which is the point.
 * - `corrupt_reply`: one byte of the reply is flipped (the CRC catches it).
 * - `truncate_reply`: the reply is cut short.
 * - `wrong_echo` / `wrong_address`: a well-formed reply to something else.
 */
export type SerialFault = 'drop_request' | 'drop_reply' | 'corrupt_reply' | 'truncate_reply' | 'wrong_echo' | 'wrong_address';

export class FaultInjectingTransport implements SerialTransport {
  private readonly queue: { fault: SerialFault; onlyCommand: number | null }[] = [];
  /** Faults actually applied, in order. */
  readonly applied: { fault: SerialFault; command: number }[] = [];

  constructor(private readonly inner: SerialTransport) {}

  /** Applies `fault` to the next request (or the next one for `onlyCommand`). */
  inject(fault: SerialFault, onlyCommand: number | null = null): void {
    this.queue.push({ fault, onlyCommand });
  }

  async request(frame: Uint8Array, timing: { settleMs: number; timeoutMs: number }): Promise<Uint8Array | null> {
    const index = this.queue.findIndex((entry) => entry.onlyCommand === null || entry.onlyCommand === frame[1]);
    const fault = index === -1 ? null : this.queue.splice(index, 1)[0].fault;
    if (fault) this.applied.push({ fault, command: frame[1] });
    if (fault === 'drop_request') return null;
    const reply = await this.inner.request(frame, timing);
    if (!reply || !fault) return reply;
    const copy = reply.slice();
    switch (fault) {
      case 'drop_reply':
        return null;
      case 'corrupt_reply':
        copy[5] ^= 0x5a;
        return copy;
      case 'truncate_reply':
        return copy.subarray(0, 12);
      // Well-formed (valid CRC) replies that answer the wrong question: only the address/echo checks catch these.
      case 'wrong_echo':
        return encodeFrame(copy[0], copy[1] ^ 0x01, copy.subarray(2, 18));
      case 'wrong_address':
        return encodeFrame(3, copy[1], copy.subarray(2, 18));
      default:
        return copy;
    }
  }

  flushInput(): Promise<void> {
    return this.inner.flushInput();
  }

  close(): Promise<void> {
    return this.inner.close();
  }
}
