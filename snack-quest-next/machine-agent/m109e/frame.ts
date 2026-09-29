import { crcWireBytes } from './crc16Modbus';

/** Every M109E frame is exactly 20 bytes: `[address][command][16 data bytes][CRC low][CRC high]` (§4.3). */
export const FRAME_LENGTH = 20;
export const DATA_LENGTH = 16;
/** Replies carry the host's address, 0, and echo the command code. */
export const HOST_ADDRESS = 0;
export const MIN_BOARD_ADDRESS = 1;
export const MAX_BOARD_ADDRESS = 8;

export type FrameErrorKind = 'length' | 'crc' | 'address' | 'command' | 'argument';

export class FrameError extends Error {
  constructor(
    readonly kind: FrameErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'FrameError';
  }
}

export interface Frame {
  address: number;
  command: number;
  /** Always 16 bytes. */
  data: Uint8Array;
}

function assertByte(value: number, what: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) throw new FrameError('argument', `${what} must be a byte (0–255), got ${value}`);
}

/** Builds a frame; `data` is zero-padded to 16 bytes. The address is not range-checked here — requests and replies use different ranges. */
export function encodeFrame(address: number, command: number, data: ArrayLike<number> = []): Uint8Array {
  assertByte(address, 'address');
  assertByte(command, 'command');
  if (data.length > DATA_LENGTH) throw new FrameError('argument', `at most ${DATA_LENGTH} data bytes, got ${data.length}`);
  const frame = new Uint8Array(FRAME_LENGTH);
  frame[0] = address;
  frame[1] = command;
  for (let i = 0; i < data.length; i += 1) {
    assertByte(data[i], `data[${i}]`);
    frame[2 + i] = data[i];
  }
  const [lo, hi] = crcWireBytes(frame.subarray(0, 18));
  frame[18] = lo;
  frame[19] = hi;
  return frame;
}

/** A request from the host to one board (address 1–8). The broadcast address 255 is deliberately not accepted: it is only for changing a board's address, which the runtime never does. */
export function encodeRequest(boardAddress: number, command: number, data: ArrayLike<number> = []): Uint8Array {
  if (!Number.isInteger(boardAddress) || boardAddress < MIN_BOARD_ADDRESS || boardAddress > MAX_BOARD_ADDRESS) {
    throw new FrameError('argument', `board address must be ${MIN_BOARD_ADDRESS}–${MAX_BOARD_ADDRESS}, got ${boardAddress}`);
  }
  return encodeFrame(boardAddress, command, data);
}

/**
 * Parses and checks a frame. A reply is only accepted when it is exactly
 * 20 bytes, its CRC is right, and — when `expect` is given — it is
 * addressed to the host and echoes the command that was sent. Anything
 * else throws; nothing is ever interpreted from a frame that fails.
 */
export function decodeFrame(bytes: Uint8Array, expect?: { address?: number; command?: number }): Frame {
  if (bytes.length !== FRAME_LENGTH) throw new FrameError('length', `frame must be ${FRAME_LENGTH} bytes, got ${bytes.length}`);
  const [lo, hi] = crcWireBytes(bytes.subarray(0, 18));
  if (bytes[18] !== lo || bytes[19] !== hi) {
    throw new FrameError('crc', `bad CRC: frame has ${hex([bytes[18], bytes[19]])}, computed ${hex([lo, hi])}`);
  }
  if (expect?.address !== undefined && bytes[0] !== expect.address) {
    throw new FrameError('address', `reply addressed to ${bytes[0]}, expected ${expect.address}`);
  }
  if (expect?.command !== undefined && bytes[1] !== expect.command) {
    throw new FrameError('command', `reply echoes command ${hex([bytes[1]])}, expected ${hex([expect.command])}`);
  }
  return { address: bytes[0], command: bytes[1], data: bytes.slice(2, 18) };
}

/** Space-separated upper-case hex, the way the document prints frames and the way every frame is logged. */
export function hex(bytes: ArrayLike<number>): string {
  return Array.from({ length: bytes.length }, (_, i) => (bytes[i] & 0xff).toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

/** Parses hex as printed ("01 2A 00 …"); for tests and the bench tool. */
export function fromHex(text: string): Uint8Array {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  return Uint8Array.from(parts.map((part) => {
    if (!/^[0-9a-fA-F]{2}$/.test(part)) throw new FrameError('argument', `not a hex byte: "${part}"`);
    return parseInt(part, 16);
  }));
}

/** 16-bit big-endian (high byte first), as the document specifies for 2-byte values (§4.3.3). */
export function u16(high: number, low: number): number {
  return ((high & 0xff) << 8) | (low & 0xff);
}

export function s16(high: number, low: number): number {
  const value = u16(high, low);
  return value >= 0x8000 ? value - 0x10000 : value;
}
