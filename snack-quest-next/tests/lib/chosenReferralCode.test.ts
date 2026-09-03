import { describe, expect, it } from 'vitest';
import {
  isUsableReferralCode,
  messageForRejection,
  normalizeReferralCode,
  rejectionFor,
} from '@/lib/creators/chosenReferralCode';

/**
 * The shape rules for a code a creator picked
 * (§ creators choose their own code).
 *
 * These run in two places — in the sign-up field as it is typed, and
 * again on the server before the code is claimed — which is the whole
 * reason they live in a module with no server imports. A form that
 * accepts something the server then rejects is the worst way to learn
 * a rule, so there is one definition of the rule.
 */

describe('normalizeReferralCode', () => {
  /*
   * `ReferralService.validateCode` upper-cases whatever a customer
   * types before looking it up, so a lower-case code in the database
   * could never match anything.
   */
  it('upper-cases, because that is how a code is matched at checkout', () => {
    expect(normalizeReferralCode('snacks')).toBe('SNACKS');
  });

  /** Fixing what someone meant beats an error about a space. */
  it('strips the punctuation people put in a handle', () => {
    expect(normalizeReferralCode('  snack quest ')).toBe('SNACKQUEST');
    expect(normalizeReferralCode('snack-quest')).toBe('SNACKQUEST');
    expect(normalizeReferralCode('snack_quest')).toBe('SNACKQUEST');
    expect(normalizeReferralCode('snack.quest')).toBe('SNACKQUEST');
  });
});

describe('rejectionFor', () => {
  it('accepts a plain code', () => {
    expect(rejectionFor('SNACKS')).toBeNull();
    expect(rejectionFor('AMINA254')).toBeNull();
    expect(isUsableReferralCode('SNACKS')).toBe(true);
  });

  it('refuses one too short to be distinctive', () => {
    expect(rejectionFor('AB')).toBe('too-short');
  });

  it('refuses one too long to say out loud', () => {
    expect(rejectionFor('A'.repeat(21))).toBe('too-long');
  });

  /*
   * A code with no letters reads as an order number rather than a
   * name, and "use code 12345" is an invitation to mistype.
   */
  it('refuses digits alone', () => {
    expect(rejectionFor('12345')).toBe('no-letter');
  });

  /** Anything normalization did not strip has no business in a spoken code. */
  it('refuses characters that survived normalization', () => {
    expect(rejectionFor('SNACK!')).toBe('bad-characters');
    expect(rejectionFor('SNÄCK')).toBe('bad-characters');
  });

  /** Every rejection has something to say — a code refused in silence teaches nothing. */
  it('has a message for every reason it refuses', () => {
    for (const reason of ['too-short', 'too-long', 'bad-characters', 'no-letter'] as const) {
      expect(messageForRejection(reason).length).toBeGreaterThan(0);
    }
  });
});
