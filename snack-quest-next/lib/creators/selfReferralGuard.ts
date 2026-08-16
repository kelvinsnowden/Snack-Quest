import { creatorRepository } from '@/repositories/creatorRepository';

/**
 * § Security audit — self-referral: nothing previously stopped a
 * creator from checking out with their own referral code, getting the
 * discount AND crediting themselves a real commission
 * (`ConversationService.completeOrder` → `ReferralService.awardCommission`
 * pays out unconditionally once `referralLinkId`/`referralOwnerId` are
 * set on the frozen snapshot). Checked two ways, since a buyer doesn't
 * have to be logged into their own creator session to type their own
 * code in:
 *
 * 1. The buyer's own verified creator session uid (never a
 *    client-supplied claim — see `isCreatorCheckout`'s own doc
 *    comment) matches the code's owner.
 * 2. The checkout phone number matches the owner's registered M-Pesa
 *    payout number — catches a guest checkout using their own code
 *    without being logged into the portal at all.
 *
 * Either match voids the referral entirely (both callers null out
 * `referral` before computing the discount and before persisting
 * `referralLinkId`/`referralOwnerId` on the snapshot) — not just the
 * discount, since a self-referral that still credited a commission
 * would be the same fraud with extra steps.
 */
export async function isSelfReferral(input: {
  referralOwnerId: string;
  buyerCreatorUid?: string | null;
  buyerPhone: string | null;
}): Promise<boolean> {
  if (input.buyerCreatorUid && input.buyerCreatorUid === input.referralOwnerId) {
    return true;
  }
  if (!input.buyerPhone) {
    return false;
  }
  const owner = await creatorRepository.findById(input.referralOwnerId);
  return Boolean(owner?.payoutPhoneNumber && owner.payoutPhoneNumber === input.buyerPhone);
}
