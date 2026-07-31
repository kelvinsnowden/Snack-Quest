import 'server-only';

import { adminFirestore } from '@/lib/firebase/admin';
import { referralLinkRepository } from '@/repositories/referralLinkRepository';
import { createInTransaction as createAttributionInTransaction } from '@/repositories/referralAttributionRepository';
import { creditInTransaction as creditCreatorInTransaction } from '@/repositories/creatorEarningsLedgerRepository';
import { publishEvent } from '@/lib/events/eventBus';

/**
 * Owns referral validation and commission crediting
 * (PLATFORM_ARCHITECTURE_V2.md §8). Minimal by design: a real
 * customer today either has a valid code (gets a discount, the
 * creator gets credited) or doesn't (order proceeds at full price) —
 * attribution windows, click tracking, and fraud scoring aren't part
 * of completing an order and aren't built yet.
 */

export interface ValidatedReferral {
  referralLinkId: string;
  ownerId: string;
  discountKes: number;
  commissionKes: number;
}

class ReferralService {
  /** Returns null for an invalid/inactive/unknown code — never blocks the purchase. */
  async validateCode(code: string): Promise<ValidatedReferral | null> {
    const match = await referralLinkRepository.findByCode(code);
    if (!match) {
      return null;
    }
    return {
      referralLinkId: match.id,
      ownerId: match.data.ownerId,
      discountKes: match.data.discountKes,
      commissionKes: match.data.commissionKes,
    };
  }

  async awardCommission(input: {
    referralLinkId: string;
    ownerId: string;
    orderId: string;
    conversationId: string;
    discountKes: number;
    commissionKes: number;
  }): Promise<void> {
    await adminFirestore.runTransaction(async (tx) => {
      createAttributionInTransaction(tx, {
        referralLinkId: input.referralLinkId,
        creatorId: input.ownerId,
        orderId: input.orderId,
        conversationId: input.conversationId,
        discountKes: input.discountKes,
        commissionKes: input.commissionKes,
      });
      creditCreatorInTransaction(tx, input.ownerId, {
        type: 'referral_commission',
        orderId: input.orderId,
        referralLinkId: input.referralLinkId,
        amountKes: input.commissionKes,
      });
    });

    await publishEvent('ReferralAwarded', 'order', input.orderId, {
      referralLinkId: input.referralLinkId,
      creatorId: input.ownerId,
      commissionKes: input.commissionKes,
    });
  }
}

export const referralService = new ReferralService();
