/**
 * The creator-only checkout discount (§ Creator-Only Offers) — KES 500
 * off any package, applied automatically at checkout whenever the
 * buyer has a valid creator session. Verified server-side from the
 * same httpOnly `sq_creator_session` cookie every other
 * creator-authenticated action already trusts
 * (`verifyCreatorSessionFromRequest`, checked in both
 * `POST /api/checkout/web` and `POST /api/checkout/web/quote`) — never
 * a client-supplied flag, so a tampered request can only ever fail to
 * get the discount, never fake having it.
 *
 * Never applies to the exit-intent rescue offer: that box is already a
 * one-time discounted price, the same rule the referral discount
 * already follows (`box.isRescueOffer` in `ConversationService`).
 */
export const CREATOR_PACKAGE_DISCOUNT_KES = 500;
