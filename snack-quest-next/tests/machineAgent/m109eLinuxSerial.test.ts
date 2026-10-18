import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PortSerialTransport, openLinuxSerialPort, type BytePort } from '@/machine-agent/transport/linuxSerialTransport';
import { M109eProtocolClient } from '@/machine-agent/m109e/protocolClient';
import { FakeM109eBoard } from '@/machine-agent/transport/fakeM109e';
import { FakeClock } from '@/machine-agent/agent/clock';
import { hex } from '@/machine-agent/m109e/frame';

const BOARD_ID = [0, 0x64, 0, 0x3b, 4, 0x47, 0x36, 0x32, 0x33, 0x38, 0x36, 0x39];

/** A port wired straight to a fake board, delivering each reply in small chunks. */
function chunkyPort(board: FakeM109eBoard, options: { silent?: boolean } = {}): BytePort {
  const listeners: ((chunk: Uint8Array) => void)[] = [];
  return {
    async write(bytes) {
      const reply = options.silent ? null : board.handle(bytes);
      if (!reply) return;
      for (let i = 0; i < reply.length; i += 3) {
        const piece = reply.slice(i, i + 3);
        setTimeout(() => listeners.forEach((listener) => listener(piece)), 5 + i);
      }
    },
    onData: (listener) => void listeners.push(listener),
    close: async () => undefined,
  };
}

describe('PortSerialTransport', () => {
  it('assembles a reply that arrives in pieces', async () => {
    const board = new FakeM109eBoard(1, BOARD_ID, new FakeClock());
    const client = new M109eProtocolClient(new PortSerialTransport(chunkyPort(board)));
    expect((await client.getId(1)).hex).toBeTruthy();
    expect(await client.readTemperature(1)).toBe(4.5);
  });

  it('gives up after the timeout when the board says nothing', async () => {
    const board = new FakeM109eBoard(1, BOARD_ID, new FakeClock());
    const transport = new PortSerialTransport(chunkyPort(board, { silent: true }));
    const started = Date.now();
    expect(await transport.request(new Uint8Array(20), { settleMs: 5, timeoutMs: 60 })).toBeNull();
    expect(Date.now() - started).toBeGreaterThanOrEqual(55);
  });

  it('drops stray bytes on flush so a late reply is never taken for the next one', async () => {
    let emit: (chunk: Uint8Array) => void = () => undefined;
    const transport = new PortSerialTransport({ write: async () => undefined, onData: (listener) => void (emit = listener), close: async () => undefined });
    emit(new Uint8Array(20).fill(7));
    await transport.flushInput();
    expect(await transport.request(new Uint8Array(20), { settleMs: 1, timeoutMs: 20 })).toBeNull();
  });
});

describe('openLinuxSerialPort (real tty, via a pseudo-terminal)', () => {
  let child: ReturnType<typeof spawn> | null = null;
  afterEach(() => {
    child?.kill();
    child = null;
  });

  it('configures the line with stty and talks to a board through it', async () => {
    child = spawn('python3', ['-I', resolve(__dirname, 'helpers/ptyBridge.py')], { stdio: ['pipe', 'pipe', 'inherit'] });
    const lines = createInterface({ input: child.stdout! });
    const iterator = lines[Symbol.asyncIterator]();
    const device = (await iterator.next()).value as string;
    expect(device).toMatch(/^\/dev\/pts\//);

    const board = new FakeM109eBoard(1, BOARD_ID, new FakeClock());
    // Answer every request the agent writes to the "cable" as the board would.
    void (async () => {
      for (let line = await iterator.next(); !line.done; line = await iterator.next()) {
        const reply = board.handle(Uint8Array.from(Buffer.from(line.value as string, 'hex')));
        child?.stdin?.write(`${reply ? hex(reply).replace(/ /g, '') : '-'}\n`);
      }
    })();

    const port = await openLinuxSerialPort(device, 9600);
    const client = new M109eProtocolClient(new PortSerialTransport(port));
    try {
      const id = await client.getId(1);
      expect(id.hex).toBeTruthy();
      expect(await client.readTemperature(1)).toBe(4.5);
    } finally {
      await port.close();
    }
  }, 15_000);
});
