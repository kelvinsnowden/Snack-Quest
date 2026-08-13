/**
 * Whether a package's `offerExpiresAt` Timestamp has passed (§
 * exit-intent rescue offer) — same "null/missing is never expired"
 * discipline as `lib/creator/campaignPresentation.ts`'s
 * `isDeadlinePassed`. Checked both when deciding whether to surface
 * the rescue offer and at the checkout gate itself
 * (`ConversationService.startWebCheckout`), so a stale bookmarked
 * link can't buy at an expired price after the offer's own UI would
 * no longer show it.
 */
export function isOfferExpired(offerExpiresAt: unknown): boolean {
  const timestamp = offerExpiresAt as { toMillis?: () => number } | null | undefined;
  const millis = timestamp?.toMillis ? timestamp.toMillis() : null;
  return millis !== null && millis < Date.now();
}
