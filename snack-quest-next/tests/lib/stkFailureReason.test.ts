import { describe, expect, it } from 'vitest';
import {
  classifyStkFailure,
  isRetryableWithoutChange,
  type StkFailureCategory,
} from '@/lib/payments/stkFailureReason';

/**
 * Telling a customer what actually went wrong (§ accurate payment
 * failure feedback).
 *
 * The property under test throughout is that nothing is invented. A
 * recognised code gets its own explanation; an unrecognised one gets
 * none at all, and the screen falls back to saying only that the
 * payment did not go through.
 */

describe('classifyStkFailure', () => {
  /*
   * Both of these are verbatim from production callbacks. They share
   * ResultCode 1037 and mean opposite things: the first never reached
   * the handset, the second reached it and went unanswered. A customer
   * whose phone was off and a customer who ignored the prompt need
   * different instructions, and keying on the code alone would give
   * them the same one.
   */
  it('separates the two real meanings of 1037 by what Safaricom said', () => {
    const unreachable = classifyStkFailure(1037, 'DS timeout user cannot be reached.');
    const noResponse = classifyStkFailure(1037, 'No response from user.');

    expect(unreachable?.category).toBe('unreachable');
    expect(unreachable?.message).toMatch(/could not reach your phone/i);
    expect(unreachable?.nextStep).toMatch(/switched on|network/i);

    expect(noResponse?.category).toBe('no_response');
    expect(noResponse?.message).toMatch(/not answered in time/i);

    expect(unreachable?.message).not.toBe(noResponse?.message);
  });

  /** A 1037 worded some third way still timed out; which side it timed out on is left unsaid rather than picked. */
  it('falls back to a timeout it can stand behind for an unfamiliar 1037 wording', () => {
    const reason = classifyStkFailure(1037, 'Some wording nobody has seen before');
    expect(reason?.category).toBe('no_response');
    expect(reason?.message).toMatch(/timed out/i);
  });

  /* Also verbatim from production. */
  it('names a user cancellation as a cancellation', () => {
    const reason = classifyStkFailure(1032, 'Request Cancelled by user.');
    expect(reason?.category).toBe('cancelled');
    expect(reason?.message).toMatch(/cancelled/i);
  });

  it.each<[number, StkFailureCategory, RegExp]>([
    [1, 'insufficient_funds', /not enough money/i],
    [2001, 'wrong_pin', /PIN/i],
    [1019, 'expired', /expired/i],
    [1001, 'busy', /already|in progress/i],
    [1025, 'system', /could not process/i],
    [9999, 'system', /could not process/i],
  ])('explains result code %s as %s', (code, category, messagePattern) => {
    const reason = classifyStkFailure(code, 'whatever Safaricom said');
    expect(reason?.category).toBe(category);
    expect(reason?.message).toMatch(messagePattern);
  });

  /*
   * The rule the whole module exists for. A code we do not know is not
   * an invitation to pick the most likely story: a customer told the
   * wrong cause acts on it, retrying against a problem they do not have
   * or topping up a wallet that was never short.
   */
  it.each([1234, 17, 4999, 2002, -1, 0.5])('returns null rather than guessing at code %s', (code) => {
    expect(classifyStkFailure(code, 'Some unfamiliar description')).toBeNull();
  });

  it('returns null when there is no code at all', () => {
    expect(classifyStkFailure(null)).toBeNull();
    expect(classifyStkFailure(undefined)).toBeNull();
  });

  /** Every explanation has to end somewhere useful, or it is just a nicer way of saying "it failed". */
  it('gives every recognised failure a next step', () => {
    for (const code of [1, 1001, 1019, 1025, 1032, 1037, 2001, 9999]) {
      expect(classifyStkFailure(code, '')?.nextStep, `code ${code}`).toBeTruthy();
    }
  });
});

describe('isRetryableWithoutChange', () => {
  /* Retrying an empty wallet or an off phone just fails again. */
  it('is false for the failures that need something fixed first', () => {
    expect(isRetryableWithoutChange('insufficient_funds')).toBe(false);
    expect(isRetryableWithoutChange('unreachable')).toBe(false);
  });

  it('is true for the failures a plain retry can clear', () => {
    expect(isRetryableWithoutChange('cancelled')).toBe(true);
    expect(isRetryableWithoutChange('busy')).toBe(true);
    expect(isRetryableWithoutChange('system')).toBe(true);
  });
});
