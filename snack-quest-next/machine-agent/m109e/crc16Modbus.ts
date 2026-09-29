/**
 * CRC16-MODBUS as the M109E document specifies it (§4.3.4): polynomial
 * 0x8005 (processed reflected, 0xA001), initial value 0xFFFF, appended
 * low byte first. Computed over the first 18 bytes of a frame.
 */
export function crc16Modbus(bytes: ArrayLike<number>): number {
  let crc = 0xffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i] & 0xff;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
    }
  }
  return crc & 0xffff;
}

/** The two checksum bytes in wire order: low byte, then high byte. */
export function crcWireBytes(bytes: ArrayLike<number>): [number, number] {
  const crc = crc16Modbus(bytes);
  return [crc & 0xff, crc >>> 8];
}
