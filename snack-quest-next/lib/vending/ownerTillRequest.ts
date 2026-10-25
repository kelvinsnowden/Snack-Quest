import 'server-only';

import { defaultRateLimiter } from '@/lib/rateLimit/rateLimiter';
import type { ConnectInput } from '@/services/ownerPaymentAccountService';

/** Each check asks Safaricom; a few an hour is plenty for an owner fixing a typo. */
const CHECK_LIMIT = { name: 'owner-till-check', limit: 10, windowSeconds: 60 * 60 };

/** True when this owner has run too many till checks this hour. A limiter outage never blocks them. */
export async function connectRateLimited(partnerId: string): Promise<boolean> {
  try {
    return !(await defaultRateLimiter().check([{ key: `owner-till:${partnerId}`, rule: CHECK_LIMIT }])).allowed;
  } catch (error) {
    console.error('[owner till] rate limit check failed', error);
    return false;
  }
}

/** The till form's fields from a request body; the service validates them. */
export function connectInputFrom(body: Record<string, unknown>): ConnectInput {
  const text = (value: unknown) => (typeof value === 'string' ? value : '');
  return {
    accountType: body.accountType === 'paybill' ? 'paybill' : 'till',
    shortcode: text(body.shortcode),
    headOfficeShortcode: text(body.headOfficeShortcode) || null,
    consumerKey: text(body.consumerKey),
    consumerSecret: text(body.consumerSecret),
    passkey: text(body.passkey),
    sameKeysAs: text(body.sameKeysAs) || null,
  };
}
