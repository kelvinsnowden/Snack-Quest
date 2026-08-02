import 'server-only';

import { randomInt } from 'node:crypto';
import { creatorRepository } from '@/repositories/creatorRepository';

const MAX_ATTEMPTS = 20;

function baseFromDisplayName(displayName: string): string {
  const letters = displayName.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 6);
  return letters.length >= 3 ? letters : 'CREATOR';
}

/**
 * A creator's default referral code (§ Creator Portal auth), assigned
 * automatically at sign-up — distinct from the named `referralLinks` a
 * creator later creates (§93), this is the one canonical code shown
 * on their profile. Scoped unique per business, checked against
 * `creatorProfiles.referralCode` (see `existsByReferralCode`) with a
 * bounded retry loop rather than a Firestore-level uniqueness
 * constraint, since Firestore has none.
 */
export async function generateUniqueReferralCode(businessId: string, displayName: string): Promise<string> {
  const base = baseFromDisplayName(displayName);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = `${base}${randomInt(1000, 9999)}`;
    const taken = await creatorRepository.existsByReferralCode(businessId, candidate);
    if (!taken) {
      return candidate;
    }
  }

  throw new Error(`Could not generate a unique referral code for "${displayName}" after ${MAX_ATTEMPTS} attempts`);
}
