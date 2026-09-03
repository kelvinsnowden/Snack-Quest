import 'server-only';

import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';

/**
 * `businesses/{businessId}/referralCodes/{CODE}` — one document per
 * claimed referral code, existing only so that claiming one is atomic
 * (§ creators choose their own code).
 *
 * Firestore has no uniqueness constraint. Everywhere else in this
 * codebase that gets away with "check, then write" does so because the
 * value being checked is random: `generateUniqueReferralCode` appends
 * four random digits, so two creators registering in the same second
 * colliding is a lottery win. A code a person *chose* is the opposite —
 * two creators both wanting SNACKS is the likely case, not the freak
 * one, and the failure is silent and about money: two live links share
 * a code and commission goes to whichever one `findByCode` happens to
 * return.
 *
 * The document ID is the code itself, so `create` — which fails if the
 * document already exists — is the claim. That is a real mutual
 * exclusion rather than a read that hopes nothing changes underneath
 * it.
 *
 * Deliberately NOT backfilled for the codes that existed before this:
 * a legacy code is a static fact, nothing is racing to create one, so
 * a plain query against memberships and links settles those (see
 * `referralCodeService.checkAvailability`). Reservations only have to
 * mediate between two *new* claims, which is exactly what they do.
 */
const RESERVATION_SUBCOLLECTION = 'referralCodes';

function reservationRef(businessId: string, code: string) {
  return adminFirestore
    .collection('businesses')
    .doc(businessId)
    .collection(RESERVATION_SUBCOLLECTION)
    .doc(code);
}

/**
 * Claims a code inside the caller's transaction, or fails the whole
 * transaction if somebody else holds it.
 *
 * `tx.create` rather than `tx.set`: set would overwrite another
 * creator's claim without a word, which is the bug this file exists to
 * make impossible.
 */
export function claimReferralCodeInTransaction(
  tx: Transaction,
  businessId: string,
  code: string,
  ownerId: string,
): void {
  tx.create(reservationRef(businessId, code), {
    businessId,
    code,
    ownerId,
    createdAt: FieldValue.serverTimestamp(),
  });
}

class ReferralCodeReservationRepository {
  /** Whether this code is already claimed, and by whom — `null` when it is free. */
  async findOwner(businessId: string, code: string): Promise<string | null> {
    const snapshot = await reservationRef(businessId, code).get();
    return snapshot.exists ? ((snapshot.data()?.ownerId as string) ?? null) : null;
  }
}

export const referralCodeReservationRepository = new ReferralCodeReservationRepository();
