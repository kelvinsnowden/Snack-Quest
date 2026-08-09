import { describe, expect, it } from 'vitest';
import {
  InvalidPhoneNumberError,
  isValidKenyanPhone,
  normalizeKenyanPhone,
} from '@/lib/checkout/phone';

/**
 * The website checkout's phone normalization (§ Website Becomes the
 * Primary Commerce Channel). This is the one place a typed-in number
 * becomes the MSISDN an STK push is sent to, so the tests that matter
 * are the rejections: a number this function accepts wrongly is a
 * payment prompt sent to a stranger.
 */

describe('normalizeKenyanPhone', () => {
  it('accepts every form a Kenyan customer actually types', () => {
    for (const input of [
      '0712345678',
      '0712 345 678',
      '+254712345678',
      '+254 712 345 678',
      '254712345678',
      '712345678',
      '(0712) 345-678',
    ]) {
      expect(normalizeKenyanPhone(input)).toBe('254712345678');
    }
  });

  it('accepts the 01x range as well as 07x', () => {
    expect(normalizeKenyanPhone('0110000000')).toBe('254110000000');
    expect(normalizeKenyanPhone('254110000000')).toBe('254110000000');
  });

  it('rejects anything that is not unambiguously a Kenyan mobile number', () => {
    for (const input of [
      '',
      '0712345',           // too short
      '07123456789',       // too long
      '0812345678',        // not a mobile prefix
      '254812345678',      // not a mobile prefix
      '+1 555 010 4567',   // wrong country
      'not a phone',
    ]) {
      expect(() => normalizeKenyanPhone(input)).toThrow(InvalidPhoneNumberError);
      expect(isValidKenyanPhone(input)).toBe(false);
    }
  });

  it('never silently truncates a too-long number into a valid-looking one', () => {
    // The failure mode worth naming: 2547123456789 must not become
    // 254712345678 by dropping a digit — that is someone else's line.
    expect(() => normalizeKenyanPhone('2547123456789')).toThrow(InvalidPhoneNumberError);
  });
});
