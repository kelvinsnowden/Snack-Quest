import { createHmac } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildOptOutToken, verifyOptOutToken, buildOptOutUrl, optOutSuffix } from '@/lib/sms/optOutLink';

/**
 * The opt-out token, now that the number is enciphered rather than
 * printed (§ opt-out link without the phone number in it).
 *
 * Two properties carry this whole module. It has to round-trip for
 * every number that can be texted — a token that fails to decode is a
 * customer who cannot leave — and it must not be reversible by anyone
 * without the secret, which is the entire reason for the change.
 */
beforeAll(() => {
  process.env.SMS_OPTOUT_SECRET = 'test-secret-value';
});

const SAMPLES = [
  '254700000000',
  '254712345678',
  '254799999999',
  '254100000000',
  '254999999999',
];

describe('opt-out token', () => {
  it('round-trips every sample number', () => {
    for (const phone of SAMPLES) {
      expect(verifyOptOutToken(buildOptOutToken(phone))).toBe(phone);
    }
  });

  /*
   * The Feistel is a permutation over 30 bits, so the failure mode this
   * guards is a collision or a value that decodes to the wrong length —
   * both of which would be silent and would only show up as somebody
   * else being unsubscribed.
   */
  it('round-trips across the whole subscriber range without collision', () => {
    const seen = new Map<string, string>();
    for (let subscriber = 700000000; subscriber < 700020000; subscriber += 1) {
      const phone = `254${subscriber}`;
      const token = buildOptOutToken(phone);
      expect(verifyOptOutToken(token)).toBe(phone);
      expect(seen.has(token)).toBe(false);
      seen.set(token, phone);
    }
    expect(seen.size).toBe(20000);
  });

  it('does not contain the phone number', () => {
    const token = buildOptOutToken('254712345678');
    expect(token).not.toContain('712345678');
    expect(token).not.toContain('12345678');
    expect(/\d{9}/.test(token)).toBe(false);
  });

  it('is 11 characters, and shorter than the link it replaces', () => {
    const token = buildOptOutToken('254712345678');
    expect(token).toHaveLength(11);
    expect(token.length).toBeLessThan('712345678a1b2c3d4'.length);
  });

  it('refuses a token forged without the secret', () => {
    const real = buildOptOutToken('254712345678');
    // Same shape, same alphabet, one character different.
    const forged = `${real.slice(0, 10)}${real[10] === 'a' ? 'b' : 'a'}`;
    expect(verifyOptOutToken(forged)).toBeNull();
  });

  it('refuses nonsense rather than throwing', () => {
    for (const bad of ['', '   ', 'aaaaaaaaaaa', '!!!!!!!!!!!', 'zzzzzzzzzzzz', '712345678']) {
      expect(() => verifyOptOutToken(bad)).not.toThrow();
      expect(verifyOptOutToken(bad)).toBeNull();
    }
  });

  it('two adjacent numbers produce unrelated tokens', () => {
    const a = buildOptOutToken('254712345678');
    const b = buildOptOutToken('254712345679');
    const shared = [...a].filter((character, index) => character === b[index]).length;
    // A leaky scheme would differ in one place; a permutation should not.
    expect(shared).toBeLessThan(8);
  });
});

/**
 * Links already sitting in customers' message histories. An opt-out
 * that stops working is a person who tries to leave and cannot, which
 * is the one failure this module exists to prevent.
 */
describe('tokens issued before the change', () => {
  it('still honours the digits-and-signature form', () => {
    const digits = '712345678';
    const signature = createHmac('sha256', 'test-secret-value')
      .update(digits)
      .digest('hex')
      .slice(0, 8);

    expect(verifyOptOutToken(`${digits}${signature}`)).toBe('254712345678');
  });

  it('still refuses a legacy token with a wrong signature', () => {
    expect(verifyOptOutToken('712345678deadbeef')).toBeNull();
  });
});

describe('what the customer actually sees', () => {
  it('is a scheme-less link on its own line', () => {
    const suffix = optOutSuffix(buildOptOutUrl('https://snackquests.shop', '254712345678'));
    expect(suffix.startsWith('\nStop snackquests.shop/s/')).toBe(true);
    expect(suffix).not.toContain('https://');
  });

  it('costs 36 characters of the segment, down from 42', () => {
    const suffix = optOutSuffix(buildOptOutUrl('https://snackquests.shop', '254712345678'));
    expect(suffix).toHaveLength(36);
  });
});
