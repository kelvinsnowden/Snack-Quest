/**
 * The referral program's fixed economics (§ referral system overhaul)
 * — no longer creator- or admin-settable per link. Every creator gets
 * exactly one permanent link, auto-generated at registration, using
 * these numbers:
 *
 * - The customer discount is the same for everyone, always.
 * - The commission a creator earns is decided once, at registration,
 *   by their real registration order within their business, and is
 *   then stored on `creatorProfile.commissionRateKes` — an early
 *   creator keeps the higher rate forever, even once the business has
 *   long since passed the first-`EARLY_CREATOR_LIMIT` mark.
 */

/** Fixed customer discount every referral link applies, in KES. */
export const REFERRAL_DISCOUNT_KES = 250;

/** How many creators, by real registration order within a business, lock in `EARLY_CREATOR_COMMISSION_KES` permanently. */
export const EARLY_CREATOR_LIMIT = 50;

/** Commission for the first `EARLY_CREATOR_LIMIT` creators ever registered on a business, in KES. */
export const EARLY_CREATOR_COMMISSION_KES = 500;

/** Commission for every creator registered after the first `EARLY_CREATOR_LIMIT`, in KES. */
export const STANDARD_CREATOR_COMMISSION_KES = 300;

/** Resolves the permanent commission rate for the `registrationNumber`th creator ever registered on a business (1-indexed). */
export function resolveCommissionRateKes(registrationNumber: number): number {
  return registrationNumber <= EARLY_CREATOR_LIMIT
    ? EARLY_CREATOR_COMMISSION_KES
    : STANDARD_CREATOR_COMMISSION_KES;
}
