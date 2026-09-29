import { describe, expect, it } from 'vitest';
import { crc16Modbus, crcWireBytes } from '@/machine-agent/m109e/crc16Modbus';
import { decodeFrame, encodeFrame, encodeRequest, fromHex, hex, FrameError } from '@/machine-agent/m109e/frame';
import { CMD, decode, request } from '@/machine-agent/m109e/commands';
import { describeMotorResult } from '@/machine-agent/m109e/resultCodes';

/**
 * Golden frames from the M109E document. The document itself isn't in
 * the repository; these are the frames whose printed checksums
 * docs/hardware/M109E_COMPATIBILITY_AUDIT.md recorded (§2.1, Appendix B).
 * Each frame's data bytes were recovered by finding the one frame of
 * that command whose CRC equals the printed CRC — so the codec below is
 * checked against the manufacturer's numbers, not against itself.
 */
const DOCUMENTED = [
  { what: '10H request (§5.10)', frame: '01 10 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00', printedCrc: '2D DD' },
  { what: '10H reply: 58 %RH, 23 °C, Z3 = 0 (§5.10)', frame: '00 10 3A 17 00 00 00 00 00 00 00 00 00 00 00 00 00 00', printedCrc: 'B9 9C' },
  { what: '2AH request, motor 0 (§5.11)', frame: '01 2A 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00', printedCrc: '1F 70' },
  { what: '2AH reply "closed" (§6; §5.11 misprints it)', frame: '00 2A 01 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00', printedCrc: '8F 1C' },
];

/** The three the audit found misprinted, with the value the algorithm gives. */
const MISPRINTED = [
  { what: '2AH reply as printed in §5.11', frame: '00 2A 01 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00', printed: '11 89', correct: '8F 1C' },
  { what: '2BH request, row 0 (the 2AH CRC reused)', frame: '01 2B 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00', printed: '1F 70', correct: '4E E0' },
  { what: '2BH reply, ten switches closed', frame: '00 2B 01 01 01 01 01 01 01 01 01 01 00 00 00 00 00 00', printed: '12 89', correct: '69 AA' },
];

describe('M109E CRC16-MODBUS', () => {
  it.each(DOCUMENTED)('matches the printed CRC of the $what', ({ frame, printedCrc }) => {
    expect(hex(crcWireBytes(fromHex(frame)))).toBe(printedCrc);
  });

  it.each(MISPRINTED)('shows the $what is a misprint', ({ frame, printed, correct }) => {
    const computed = hex(crcWireBytes(fromHex(frame)));
    expect(computed).not.toBe(printed);
    expect(computed).toBe(correct);
  });

  it('is the standard CRC-16/MODBUS (check value for "123456789" is 0x4B37)', () => {
    expect(crc16Modbus(Buffer.from('123456789', 'ascii'))).toBe(0x4b37);
  });
});

describe('M109E frames', () => {
  it('encodes the documented requests byte for byte', () => {
    expect(hex(request.readHumidity(1))).toBe(`${DOCUMENTED[0].frame} 2D DD`);
    expect(hex(request.readSwitch(1, 0))).toBe(`${DOCUMENTED[2].frame} 1F 70`);
    expect(hex(request.readRowSwitches(1, 0))).toBe(`${MISPRINTED[1].frame} 4E E0`);
  });

  it('decodes the documented replies', () => {
    const humidity = decodeFrame(fromHex(`${DOCUMENTED[1].frame} B9 9C`), { address: 0, command: CMD.READ_HUMIDITY });
    // The example reply's Z3 is 0, which by the document's own words means "not the latest sample" (D6).
    expect(decode.readHumidity(humidity.data)).toEqual({ humidityPct: 58, celsius: 23, fresh: false });
    expect(decode.readSwitch(decodeFrame(fromHex(`${DOCUMENTED[3].frame} 8F 1C`)).data)).toBe('closed');
    const row = decode.readRowSwitches(decodeFrame(fromHex(`${MISPRINTED[2].frame} 69 AA`)).data);
    expect(row).toEqual([...Array(10).fill('closed'), 'open']);
  });

  it('refuses a frame of the wrong length, a bad CRC, the wrong address or a different command', () => {
    const good = fromHex(`${DOCUMENTED[3].frame} 8F 1C`);
    expect(() => decodeFrame(good.subarray(0, 19))).toThrow(FrameError);
    const badCrc = good.slice();
    badCrc[19] ^= 0xff;
    expect(() => decodeFrame(badCrc)).toThrowError(/bad CRC/);
    expect(() => decodeFrame(good, { address: 1 })).toThrowError(/addressed to 0/);
    expect(() => decodeFrame(good, { address: 0, command: CMD.READ_ROW_SWITCHES })).toThrowError(/echoes command 2A/);
    const flipped = good.slice();
    flipped[2] = 0x00; // a changed data byte breaks the CRC
    expect(() => decodeFrame(flipped)).toThrowError(/bad CRC/);
  });

  it('only addresses boards 1–8: never the host address, never the broadcast', () => {
    expect(() => encodeRequest(0, CMD.GET_ID)).toThrow(FrameError);
    expect(() => encodeRequest(9, CMD.GET_ID)).toThrow(FrameError);
    expect(() => encodeRequest(255, CMD.GET_ID)).toThrow(FrameError);
    expect(Object.values(CMD)).not.toContain(0xff);
  });

  it('lays out a motor run as Y1–Y7 and refuses out-of-range values', () => {
    const frame = request.motorRun(1, { motor: 7, motorType: 0x03, curtainMode: 2, switchDelayTenths: 15, timeoutTenths: 0, lockTimeTenths: 0 });
    expect(hex(frame.subarray(0, 9))).toBe('01 05 07 03 02 0F 00 00 00');
    const base = { motor: 7, motorType: 0x03, curtainMode: 2 as const, switchDelayTenths: 15, timeoutTenths: 0, lockTimeTenths: 0 };
    expect(() => request.motorRun(1, { ...base, motor: 60 })).toThrow(/motor index must be 0–59/);
    expect(() => request.motorRun(1, { ...base, motorType: 0x0f })).toThrow(FrameError);
    expect(() => request.motorRun(1, { ...base, switchDelayTenths: 1 })).toThrow(FrameError);
    expect(() => request.motorRun(1, { ...base, timeoutTenths: 251 })).toThrow(FrameError);
    expect(() => encodeFrame(1, CMD.MOTOR_RUN, new Array(17).fill(0))).toThrow(FrameError);
  });

  it('decodes a motor poll, the board id, temperatures and outputs', () => {
    const poll = decode.motorPoll(Uint8Array.from([2, 7, 0x01, 0x03, 0xe8, 0x01, 0xf4, 0x0b, 0xb8, 35, 0, 0, 0, 0, 0, 0]));
    expect(poll).toEqual({ state: 'finished', rawState: 2, motor: 7, result: 1, peakCurrentMa: 1000, averageCurrentMa: 500, runTimeMs: 3000, dropMs: 35 });
    expect(describeMotorResult(poll.result).name).toBe('overcurrent');
    expect(decode.motorPoll(new Uint8Array(16).fill(9)).state).toBeNull();
    // The §6 Get ID example's reply bytes.
    expect(decode.getId(Uint8Array.from([0x00, 0x64, 0x00, 0x3b, 0x04, 0x47, 0x36, 0x32, 0x33, 0x38, 0x36, 0x39, 0, 0, 0, 0])).hex).toBe('0064003B0447363233383639');
    const temp = (hi: number, lo: number) => decode.readTemperature(Uint8Array.from([hi, lo, ...new Array(14).fill(0)]));
    expect(temp(0x00, 0xe6)).toBe(23);
    expect(temp(0xff, 0x9c)).toBe(-10);
    expect(temp(0xfe, 0x0c)).toBeNull(); // −50.0 °C = no sensor
    expect(() => decode.writeOutput(Uint8Array.from([1, 0xf1, ...new Array(14).fill(0)]), { index: 1, on: false })).toThrow(FrameError);
    expect(() => decode.writeOutput(Uint8Array.from([1, 0xf1, ...new Array(14).fill(0)]), { index: 1, on: true })).not.toThrow();
  });
});
