import { execFile } from 'node:child_process';
import { constants, openSync } from 'node:fs';
import { ReadStream } from 'node:tty';
import { promisify } from 'node:util';
import { FRAME_LENGTH } from '../m109e/frame';
import type { SerialTransport } from './serialTransport';

/** The two things the transport needs from a port: send bytes, and hear bytes as they arrive. */
export interface BytePort {
  write(bytes: Uint8Array): Promise<void>;
  onData(listener: (chunk: Uint8Array) => void): void;
  close(): Promise<void>;
}

/**
 * Request/reply over a raw byte port. A reply can arrive in several
 * chunks (USB-serial adapters deliver a few bytes at a time), so bytes
 * are collected until a whole frame is in or the timeout passes. Bytes
 * that arrive while no request is waiting are kept until the next
 * `flushInput`, which the protocol client calls before every request —
 * a late reply can never be read as the answer to a new question.
 */
export class PortSerialTransport implements SerialTransport {
  private buffer: number[] = [];
  private waiter: (() => void) | null = null;
  private closed = false;

  constructor(
    private readonly port: BytePort,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((done) => setTimeout(done, ms)),
  ) {
    port.onData((chunk) => {
      for (const byte of chunk) this.buffer.push(byte);
      this.waiter?.();
    });
  }

  async request(frame: Uint8Array, timing: { settleMs: number; timeoutMs: number }): Promise<Uint8Array | null> {
    if (this.closed) throw new Error('serial port closed');
    await this.port.write(frame);
    await this.sleep(timing.settleMs);
    const deadline = Date.now() + Math.max(0, timing.timeoutMs - timing.settleMs);
    while (this.buffer.length < FRAME_LENGTH) {
      const left = deadline - Date.now();
      if (left <= 0) break;
      await new Promise<void>((done) => {
        const timer = setTimeout(done, left);
        this.waiter = () => {
          clearTimeout(timer);
          done();
        };
      });
      this.waiter = null;
    }
    if (this.buffer.length < FRAME_LENGTH) return null;
    // Exactly one frame is the reply; anything after it is left for the next flush.
    const reply = Uint8Array.from(this.buffer.slice(0, FRAME_LENGTH));
    this.buffer = this.buffer.slice(FRAME_LENGTH);
    return reply;
  }

  async flushInput(): Promise<void> {
    this.buffer = [];
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.port.close();
  }
}

const run = promisify(execFile);

/**
 * A serial device on Linux (a USB-RS232 adapter at /dev/ttyUSB0, or the
 * Pi's own UART). The line is set to the document's 8N1, raw, no flow
 * control, with `stty`, and read through Node's own non-blocking tty
 * stream — no native modules, so the agent stays one plain file of
 * JavaScript. The agent must be the only program with the port open
 * (acceptance test X1).
 */
export async function openLinuxSerialPort(device: string, baud = 9600): Promise<BytePort> {
  await run('stty', ['-F', device, String(baud), 'cs8', '-cstopb', '-parenb', 'raw', '-echo', '-ixon', '-ixoff', '-crtscts', 'clocal', 'cread']);
  const fd = openSync(device, constants.O_RDWR | constants.O_NOCTTY | constants.O_NONBLOCK);
  const stream = new ReadStream(fd);
  return {
    write: (bytes) =>
      new Promise<void>((done, fail) => {
        stream.write(bytes, (error) => (error ? fail(error) : done()));
      }),
    onData(listener) {
      stream.on('data', (chunk: Buffer | string) => listener(typeof chunk === 'string' ? Buffer.from(chunk, 'latin1') : chunk));
    },
    close: () =>
      new Promise<void>((done) => {
        stream.once('close', () => done());
        stream.destroy();
      }),
  };
}
