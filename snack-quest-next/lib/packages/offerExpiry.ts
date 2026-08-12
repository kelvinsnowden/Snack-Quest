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

/**
 * Hours from now until `offerExpiresAt`, or `null` when unset — kept
 * here rather than inlined at its one call site
 * (`ExitIntentOfferMount.tsx`) so that Server Component's render body
 * never calls `Date.now()` directly (the same reasoning
 * `lib/creator/campaignPresentation.ts`'s `isDeadlinePassed` already
 * documents). Can be negative for an already-expired offer — the
 * caller only ever reaches this after confirming the offer is still
 * live, but this function itself makes no such assumption.
 */
export function hoursUntilOfferExpiry(offerExpiresAt: unknown): number | null {
  const timestamp = offerExpiresAt as { toMillis?: () => number } | null | undefined;
  const millis = timestamp?.toMillis ? timestamp.toMillis() : null;
  if (millis === null) {
    return null;
  }
  return (millis - Date.now()) / (60 * 60 * 1000);
}
