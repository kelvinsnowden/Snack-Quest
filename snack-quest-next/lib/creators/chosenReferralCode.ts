/**
 * The rules a creator's chosen referral code has to satisfy
 * (§ creators choose their own code).
 *
 * Deliberately free of `server-only` and of any repository import, so
 * the sign-up form can apply the exact same rules as it is typed and
 * the server can apply them again on submit. One definition, two
 * places it runs — the alternative is a form that accepts something
 * the server then rejects, which is the worst way to learn a rule.
 */

export const MIN_REFERRAL_CODE_LENGTH = 3;
export const MAX_REFERRAL_CODE_LENGTH = 20;

export type ReferralCodeRejection =
  | 'too-short'
  | 'too-long'
  | 'bad-characters'
  | 'no-letter';

/**
 * Upper-cased and stripped of the punctuation people reach for when
 * typing a "handle".
 *
 * `ReferralService.validateCode` upper-cases whatever a customer types
 * before looking it up, so a code stored in any other case could never
 * match — normalising here rather than rejecting means somebody typing
 * "snack quest" gets SNACKQUEST instead of an error about spaces.
 */
export function normalizeReferralCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s._-]+/g, '');
}

/**
 * Why a normalized code cannot be used, or `null` when it can.
 *
 * Split from the message so a caller can decide how to phrase it —
 * the form says it one way while it is being typed, the API another
 * when the whole thing is refused.
 */
export function rejectionFor(code: string): ReferralCodeRejection | null {
  if (code.length < MIN_REFERRAL_CODE_LENGTH) return 'too-short';
  if (code.length > MAX_REFERRAL_CODE_LENGTH) return 'too-long';
  // Letters and digits only. Anything else has already been stripped
  // by `normalizeReferralCode`, so reaching here means a character
  // nobody should be putting in a code they will read out loud.
  if (!/^[A-Z0-9]+$/.test(code)) return 'bad-characters';
  // A code with no letters at all reads as an order number rather than
  // a name, and "use code 12345" is an invitation to mistype.
  if (!/[A-Z]/.test(code)) return 'no-letter';
  return null;
}

export function messageForRejection(reason: ReferralCodeRejection): string {
  switch (reason) {
    case 'too-short':
      return `Use at least ${MIN_REFERRAL_CODE_LENGTH} characters.`;
    case 'too-long':
      return `Keep it to ${MAX_REFERRAL_CODE_LENGTH} characters or fewer.`;
    case 'bad-characters':
      return 'Letters and numbers only.';
    case 'no-letter':
      return 'Include at least one letter.';
  }
}

/** Convenience for the common "is this shape usable at all" question. */
export function isUsableReferralCode(code: string): boolean {
  return rejectionFor(code) === null;
}
