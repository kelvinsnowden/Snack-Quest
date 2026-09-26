/**
 * MDB (Multi-Drop Bus) frame primitives — the small, universally
 * documented part of MDB 4.2 (§ D of
 * docs/HARDWARE_COMPATIBILITY_ARCHITECTURE.md): the checksum
 * algorithm, the address-byte structure a VMC uses to address a
 * peripheral, and the three single-byte response codes every MDB
 * peripheral uses regardless of device class.
 *
 * Deliberately excludes peripheral-specific command tables (cashless
 * device commands, coin mechanism commands, specific status byte
 * meanings) — those vary by device class and require the actual MDB
 * specification document to encode correctly. Inventing them from
 * memory would be exactly the "do not implement speculative commands"
 * mistake this architecture doc warns against; what's here is real and
 * tested, and nothing else is claimed.
 *
 * MDB physically transmits 9 bits per byte (8 data bits + 1 mode bit)
 * over a non-standard serial line. There is no real serial port
 * anywhere in this repository, and there never will be directly — this
 * is a Next.js web application, not gateway firmware
 * (§ B of docs/HARDWARE_COMPATIBILITY_ARCHITECTURE.md). `MdbByte`
 * represents that 9th bit explicitly so a real transport (gateway
 * software, not here) has an unambiguous wire format to translate to
 * and from. Nothing in this file performs any I/O.
 */

export interface MdbByte {
  /** The 8-bit data value. */
  data: number;
  /** The 9th "mode" bit — true for an address/command byte, false for a plain data byte. */
  mode: boolean;
}

/** Universal single-byte peripheral responses, independent of device class. */
export const MDB_ACK = 0x00;
export const MDB_RET = 0xaa;
export const MDB_NAK = 0xff;

export class InvalidMdbByteError extends Error {
  constructor(value: number) {
    super(`MDB data byte must be an integer 0-255, got ${value}`);
    this.name = 'InvalidMdbByteError';
  }
}

function requireByteRange(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new InvalidMdbByteError(value);
  }
}

/** MDB's checksum: the sum of every data byte in the packet, mod 256. */
export function mdbChecksum(bytes: number[]): number {
  bytes.forEach(requireByteRange);
  return bytes.reduce((sum, byte) => (sum + byte) & 0xff, 0);
}

/**
 * The address byte a VMC (master) sends to address one peripheral
 * device class and one command on it — 5 bits of device-class address,
 * 3 bits of command, carried on a mode=true byte.
 */
export function encodeAddressByte(deviceClass: number, command: number): MdbByte {
  requireByteRange(deviceClass);
  requireByteRange(command);
  if (deviceClass > 0x1f) {
    throw new Error(`MDB device class address must fit in 5 bits (0-31), got ${deviceClass}`);
  }
  if (command > 0x07) {
    throw new Error(`MDB command must fit in 3 bits (0-7), got ${command}`);
  }
  return { data: (deviceClass << 3) | command, mode: true };
}

export function decodeAddressByte(byte: MdbByte): { deviceClass: number; command: number } {
  if (!byte.mode) {
    throw new Error('Cannot decode a data byte as an address byte — its mode bit is not set');
  }
  return { deviceClass: byte.data >> 3, command: byte.data & 0x07 };
}

export interface MdbFrame {
  /** Data bytes only — the checksum is carried separately, never folded into `data`. */
  data: number[];
  checksum: number;
}

/** Builds a frame with its checksum computed from `data` — a checksum is never hand-supplied. */
export function buildFrame(data: number[]): MdbFrame {
  return { data: [...data], checksum: mdbChecksum(data) };
}

/** True only if `frame.checksum` actually matches `frame.data` — the check a real transport must run on every inbound frame before acting on it. */
export function verifyFrame(frame: MdbFrame): boolean {
  return mdbChecksum(frame.data) === frame.checksum;
}
