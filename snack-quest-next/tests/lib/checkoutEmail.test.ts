import { describe, expect, it } from 'vitest';
import { isAcceptableEmailInput, normalizeEmail } from '@/lib/checkout/email';

/**
 * Optional email capture (§ optional email capture).
 *
 * The governing rule is that this field must never cost a sale. Every
 * order is already reachable by phone, so the address is an extra —
 * which means the failure mode to guard against is not "a bad address
 * got stored" but "a paying customer was turned away over one".
 */

describe('normalizeEmail', () => {
  it('trims and lowercases, so the same person is one address', () => {
    expect(normalizeEmail('  Wanjiru.Kamau@Example.COM ')).toBe('wanjiru.kamau@example.com');
  });

  it.each([
    'a@b.co',
    'first.last@sub.domain.co.ke',
    'plus+tag@gmail.com',
    "o'brien@example.com",
    'name_with_underscore@example.org',
    '123@456.com',
  ])('accepts %s', (value) => {
    expect(normalizeEmail(value)).toBe(value.toLowerCase());
  });

  it.each([
    ['', 'empty'],
    ['   ', 'whitespace only'],
    ['wanjiru', 'no @'],
    ['wanjiru@', 'nothing after the @'],
    ['@example.com', 'nothing before the @'],
    ['wanjiru@example', 'no dot in the domain'],
    ['wanjiru @example.com', 'a space'],
    ['wanjiru@exa mple.com', 'a space in the domain'],
    ['wanjiru@@example.com', 'two @'],
    ['wanjiru@.com', 'empty domain label'],
  ])('rejects %s (%s)', (value) => {
    expect(normalizeEmail(value)).toBeNull();
  });

  it('rejects an address too long to be one, so a stray paste cannot become a stored field', () => {
    expect(normalizeEmail(`${'a'.repeat(250)}@example.com`)).toBeNull();
  });

  it.each([null, undefined, 42, {}, []])('returns null rather than throwing for %s', (value) => {
    expect(normalizeEmail(value as never)).toBeNull();
  });

  /**
   * Deliberately permissive. A stricter pattern rejects legitimate
   * addresses — plus tags, new TLDs, non-ASCII locals — far more often
   * than it catches a real mistake, and the only reliable test of an
   * address is sending to it.
   */
  it('does not try to police the domain beyond having one', () => {
    expect(normalizeEmail('someone@a-brand-new-tld.snacks')).toBe('someone@a-brand-new-tld.snacks');
  });
});

describe('isAcceptableEmailInput', () => {
  /** The field is optional, so blank is a complete answer rather than an unfinished one. */
  it.each(['', '   '])('treats %s as acceptable, since the field is optional', (value) => {
    expect(isAcceptableEmailInput(value)).toBe(true);
  });

  it('accepts a usable address', () => {
    expect(isAcceptableEmailInput('wanjiru@example.com')).toBe(true);
  });

  /** The one case worth stopping for: something was typed, and it cannot be an address, and the customer is still looking at it. */
  it('flags something typed that cannot be an address', () => {
    expect(isAcceptableEmailInput('wanjiru@')).toBe(false);
  });
});
