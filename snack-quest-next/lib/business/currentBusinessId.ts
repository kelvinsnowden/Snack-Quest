import 'server-only';

/**
 * Which tenant a public-facing, non-webhook deployment belongs to
 * (§ Creator Portal auth). Admin/staff/webhook code resolves
 * `businessId` from a session, a URL segment, or a phone-number
 * lookup — but a public sign-up form has none of those, so it falls
 * back to the same `SNACK_QUEST_BUSINESS_ID` env var every seed
 * script already uses (scripts/seedBusiness.mjs and friends), keeping
 * one contract for "which business is this deployment" everywhere.
 */
export function getCurrentBusinessId(): string {
  return process.env.SNACK_QUEST_BUSINESS_ID ?? 'snack-quest';
}
