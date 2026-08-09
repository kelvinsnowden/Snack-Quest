/**
 * The referral program's fixed economics (§ referral system overhaul)
 * — not creator- or admin-settable per link. Every creator gets
 * exactly one permanent link, auto-generated at registration, using
 * these numbers.
 *
 * The commission used to be tiered: the first 50 creators registered
 * on a business locked in KES 500 permanently, everyone after that got
 * KES 300. That tiering is gone — every affiliate now earns the same
 * KES 300, existing creators included (see
 * `scripts/setFlatCommission.mjs`, which brought the already-registered
 * ones down).
 *
 * The rate still lives on `creatorProfile.commissionRateKes` and on
 * each `referralLink.commissionKes` rather than being read from this
 * constant at award time. That is deliberate and unchanged: a
 * commission is a promise made when a customer's order is priced, and
 * `ConversationCheckoutSnapshot.referralCommissionKes` freezes it right
 * there. An order already in flight when a rate changes pays out at the
 * rate it was quoted at, not whatever this file says by the time the
 * M-Pesa callback lands.
 */

/** Fixed customer discount every referral link applies, in KES. */
export const REFERRAL_DISCOUNT_KES = 250;

/** What every affiliate earns per referred order, in KES. */
export const CREATOR_COMMISSION_KES = 300;

/**
 * Kept as a function rather than inlining the constant at its two call
 * sites: registration order is exactly the kind of thing this program
 * has already varied commission on once, and the callers shouldn't have
 * to change again if it does.
 */
export function resolveCommissionRateKes(): number {
  return CREATOR_COMMISSION_KES;
}
