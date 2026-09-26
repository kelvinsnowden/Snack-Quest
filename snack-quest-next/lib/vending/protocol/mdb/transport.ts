import type { MdbByte } from './frame';

/**
 * How something below the protocol layer actually gets bytes onto and
 * off of an MDB bus (§ D of docs/HARDWARE_COMPATIBILITY_ARCHITECTURE.md).
 * No implementation of this beyond `MockMdbTransport` exists in this
 * repository. A real one is gateway software running on hardware
 * physically wired to a machine's MDB bus — this Next.js application
 * has no such connection and never will directly (§ B of the same
 * doc). Building a fake "real" transport here, with no hardware to
 * prove it against, would be exactly the "do not claim hardware
 * integration works without a real machine or simulator" mistake this
 * architecture is built to avoid.
 */
export interface MdbTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  write(bytes: MdbByte[]): Promise<void>;
  onFrame(handler: (bytes: MdbByte[]) => void): void;
}

/** In-memory, test-only — used by this repository's own protocol tests, never by anything that talks to real hardware. */
export class MockMdbTransport implements MdbTransport {
  private connected = false;
  private readonly handlers: ((bytes: MdbByte[]) => void)[] = [];
  readonly written: MdbByte[][] = [];

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async write(bytes: MdbByte[]): Promise<void> {
    if (!this.connected) {
      throw new Error('MockMdbTransport: write() called before connect()');
    }
    this.written.push(bytes);
  }

  onFrame(handler: (bytes: MdbByte[]) => void): void {
    this.handlers.push(handler);
  }

  /** Test helper — simulates a peripheral sending bytes back over the bus. */
  emitFrame(bytes: MdbByte[]): void {
    this.handlers.forEach((handler) => handler(bytes));
  }
}
