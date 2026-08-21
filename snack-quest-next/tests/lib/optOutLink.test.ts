import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  SmsOptOutSecretMissingError,
  buildOptOutToken,
  buildOptOutUrl,
  optOutSuffix,
  verifyOptOutToken,
} from '@/lib/sms/optOutLink';

const ORIGINAL_SECRET = process.env.SMS_OPTOUT_SECRET;

beforeEach(() => {
  process.env.SMS_OPTOUT_SECRET = 'test-opt-out-secret';
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) {
    delete process.env.SMS_OPTOUT_SECRET;
  } else {
    process.env.SMS_OPTOUT_SECRET = ORIGINAL_SECRET;
  }
});

describe('opt-out token', () => {
  it('round-trips a normalised number', () => {
    expect(verifyOptOutToken(buildOptOutToken('254712345678'))).toBe('254712345678');
  });

  it('issues a different signature per number, so one token never opts out another', () => {
    const a = buildOptOutToken('254712345678');
    const b = buildOptOutToken('254712345679');

    expect(a).not.toBe(b);
    expect(verifyOptOutToken(a)).toBe('254712345678');
    expect(verifyOptOutToken(b)).toBe('254712345679');
  });

  /** The whole reason the token is signed: `?phone=` alone would let anyone unsubscribe any number, and enumerate the register while they were at it. */
  it('rejects a token whose number was swapped for another', () => {
    const token = buildOptOutToken('254712345678');
    const signature = token.slice(9);

    expect(verifyOptOutToken(`799999999${signature}`)).toBeNull();
  });

  it('rejects a tampered signature', () => {
    const token = buildOptOutToken('254712345678');
    const tampered = `${token.slice(0, -1)}${token.at(-1) === 'a' ? 'b' : 'a'}`;

    expect(verifyOptOutToken(tampered)).toBeNull();
  });

  it('rejects a token signed with a different secret', () => {
    const token = buildOptOutToken('254712345678');
    process.env.SMS_OPTOUT_SECRET = 'a-different-secret';

    expect(verifyOptOutToken(token)).toBeNull();
  });

  it.each(['', '   ', 'nonsense', '712345678', 'abcdefghijk', '12345'])(
    'returns null rather than throwing on malformed input (%s)',
    (input) => {
      expect(verifyOptOutToken(input)).toBeNull();
    },
  );

  it('verifies nothing when the secret is unset, instead of accepting everything', () => {
    const token = buildOptOutToken('254712345678');
    delete process.env.SMS_OPTOUT_SECRET;

    expect(verifyOptOutToken(token)).toBeNull();
  });

  it('refuses to build a link without a secret, rather than emitting one that cannot be honoured', () => {
    delete process.env.SMS_OPTOUT_SECRET;

    expect(() => buildOptOutToken('254712345678')).toThrow(SmsOptOutSecretMissingError);
  });
});

describe('opt-out URL', () => {
  it('builds a link under /s and tolerates a trailing slash on the site URL', () => {
    expect(buildOptOutUrl('https://snackquests.shop/', '254712345678')).toBe(
      `https://snackquests.shop/s/${buildOptOutToken('254712345678')}`,
    );
  });

  it('drops the scheme in the SMS suffix, since phones linkify the bare domain anyway', () => {
    const suffix = optOutSuffix(buildOptOutUrl('https://snackquests.shop', '254712345678'));

    expect(suffix).not.toContain('https://');
    expect(suffix).toContain('snackquests.shop/s/');
  });

  /**
   * A cost guard, not a style preference. Every character shares a
   * 160-character segment with the message, and going one character over
   * doubles what a campaign costs to send. At `/sms/stop/` with a
   * 10-character signature and the scheme included this ran to 60 —
   * 37% of a segment — which is what drove the shorter path, the shorter
   * signature and dropping `https://`.
   */
  it('keeps the whole opt-out suffix to about a quarter of an SMS segment', () => {
    const suffix = optOutSuffix(buildOptOutUrl('https://snackquests.shop', '254712345678'));

    expect(suffix.length).toBeLessThanOrEqual(45);
  });
});
