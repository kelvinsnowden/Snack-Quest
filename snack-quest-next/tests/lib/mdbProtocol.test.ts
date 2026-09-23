import { describe, expect, it } from 'vitest';
import {
  InvalidMdbByteError,
  MDB_ACK,
  MDB_NAK,
  MDB_RET,
  buildFrame,
  decodeAddressByte,
  encodeAddressByte,
  mdbChecksum,
  verifyFrame,
} from '@/lib/vending/protocol/mdb/frame';
import { MockMdbTransport } from '@/lib/vending/protocol/mdb/transport';

describe('mdbChecksum', () => {
  it('sums bytes mod 256', () => {
    expect(mdbChecksum([0x01, 0x02, 0x03])).toBe(0x06);
  });

  it('wraps around at 256', () => {
    expect(mdbChecksum([0xff, 0x02])).toBe(0x01);
  });

  it('is 0 for an empty packet', () => {
    expect(mdbChecksum([])).toBe(0);
  });

  it('rejects a byte outside 0-255', () => {
    expect(() => mdbChecksum([256])).toThrow(InvalidMdbByteError);
    expect(() => mdbChecksum([-1])).toThrow(InvalidMdbByteError);
    expect(() => mdbChecksum([1.5])).toThrow(InvalidMdbByteError);
  });
});

describe('address byte encode/decode', () => {
  it('round-trips a device class and command', () => {
    const byte = encodeAddressByte(0x10, 0x03);
    expect(byte.mode).toBe(true);
    expect(decodeAddressByte(byte)).toEqual({ deviceClass: 0x10, command: 0x03 });
  });

  it('rejects a device class that does not fit in 5 bits', () => {
    expect(() => encodeAddressByte(0x20, 0)).toThrow(/5 bits/);
  });

  it('rejects a command that does not fit in 3 bits', () => {
    expect(() => encodeAddressByte(0, 0x08)).toThrow(/3 bits/);
  });

  it('refuses to decode a data byte (mode=false) as an address byte', () => {
    expect(() => decodeAddressByte({ data: 0x10, mode: false })).toThrow(/mode bit/);
  });
});

describe('universal response codes', () => {
  it('are the documented single-byte values', () => {
    expect(MDB_ACK).toBe(0x00);
    expect(MDB_RET).toBe(0xaa);
    expect(MDB_NAK).toBe(0xff);
  });
});

describe('frame build/verify', () => {
  it('a freshly built frame always verifies', () => {
    const frame = buildFrame([0x10, 0x20, 0x30]);
    expect(verifyFrame(frame)).toBe(true);
  });

  it('a corrupted checksum fails verification', () => {
    const frame = buildFrame([0x10, 0x20, 0x30]);
    expect(verifyFrame({ ...frame, checksum: (frame.checksum + 1) & 0xff })).toBe(false);
  });

  it('corrupted data fails verification against the original checksum', () => {
    const frame = buildFrame([0x10, 0x20, 0x30]);
    expect(verifyFrame({ ...frame, data: [0x11, 0x20, 0x30] })).toBe(false);
  });
});

describe('MockMdbTransport', () => {
  it('refuses to write before connect', async () => {
    const transport = new MockMdbTransport();
    await expect(transport.write([{ data: 0x01, mode: false }])).rejects.toThrow('before connect');
  });

  it('records what was written once connected', async () => {
    const transport = new MockMdbTransport();
    await transport.connect();
    await transport.write([{ data: 0x01, mode: false }]);
    expect(transport.written).toEqual([[{ data: 0x01, mode: false }]]);
  });

  it('delivers an emitted frame to every registered handler', () => {
    const transport = new MockMdbTransport();
    const received: unknown[] = [];
    transport.onFrame((bytes) => received.push(bytes));
    transport.emitFrame([{ data: 0xaa, mode: false }]);
    expect(received).toEqual([[{ data: 0xaa, mode: false }]]);
  });
});
