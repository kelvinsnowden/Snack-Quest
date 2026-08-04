import { timingSafeEqualStrings } from './webhookSecret';

/**
 * Shared-secret auth for every WhatChimp Bridge API route (§ WhatChimp
 * Integration Redesign) — same header/env var `/checkout/start` and
 * `/checkout/pay` already established (`x-checkout-api-key` against
 * `WHATCHIMP_CHECKOUT_API_KEY`), factored out once five routes need it
 * instead of two. Unlike `checkWebhookSecret`'s deliberate fail-open
 * (retrofitted onto routes already handling live traffic), these are
 * brand-new routes with nothing depending on them yet — strict from
 * day one: a missing or unconfigured key always rejects.
 */
export function verifyWhatchimpBridgeRequest(request: Request): boolean {
  const expectedKey = process.env.WHATCHIMP_CHECKOUT_API_KEY;
  const providedKey = request.headers.get('x-checkout-api-key');
  if (!expectedKey || !providedKey) {
    return false;
  }
  return timingSafeEqualStrings(providedKey, expectedKey);
}
