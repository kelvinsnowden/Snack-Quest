import 'server-only';

import { creatorRepository } from '@/repositories/creatorRepository';
import { referralLinkRepository } from '@/repositories/referralLinkRepository';
import { referralCodeReservationRepository } from '@/repositories/referralCodeReservationRepository';
import {
  messageForRejection,
  normalizeReferralCode,
  rejectionFor,
} from '@/lib/creators/chosenReferralCode';

/**
 * Whether a creator may have the code they asked for
 * (§ creators choose their own code).
 *
 * Three places a code can already be spoken for, and all three are
 * checked because they came into existence at different times:
 *
 *   the reservation doc   every code claimed since claiming became
 *                         atomic
 *   the membership        what a creator is shown on their dashboard
 *   the referral link     what a purchase is actually checked against
 *
 * Checking only the reservations would hand a new creator a code one
 * of the original thirty-one is already using. Checking only the
 * membership and link would miss a code reserved half a second ago by
 * a registration still in flight.
 */

export type ReferralCodeAvailability =
  | { available: true; code: string }
  | { available: false; code: string; reason: 'invalid' | 'taken'; message: string };

/** The one message a customer-facing surface should ever show for a taken code. */
const TAKEN_MESSAGE = 'That code is already taken. Try another.';

class ReferralCodeService {
  /**
   * Deliberately says only "taken", never who has it. A creator does
   * not need to know which of their peers holds SNACKS, and answering
   * that turns this into a directory of other people's codes.
   */
  async checkAvailability(businessId: string, raw: string): Promise<ReferralCodeAvailability> {
    const code = normalizeReferralCode(raw);

    const rejection = rejectionFor(code);
    if (rejection) {
      return { available: false, code, reason: 'invalid', message: messageForRejection(rejection) };
    }

    const [reservedBy, onMembership, link] = await Promise.all([
      referralCodeReservationRepository.findOwner(businessId, code),
      creatorRepository.existsByReferralCode(businessId, code),
      referralLinkRepository.findByCode(businessId, code),
    ]);

    if (reservedBy || onMembership || link) {
      return { available: false, code, reason: 'taken', message: TAKEN_MESSAGE };
    }

    return { available: true, code };
  }
}

export const referralCodeService = new ReferralCodeService();
export { TAKEN_MESSAGE as REFERRAL_CODE_TAKEN_MESSAGE };
