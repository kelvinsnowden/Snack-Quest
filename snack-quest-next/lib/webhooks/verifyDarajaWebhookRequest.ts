import 'server-only';

import { businessIntegrationSecretRepository } from '@/repositories/businessIntegrationSecretRepository';
import { checkWebhookSecret, splitBusinessIdSecret } from './webhookSecret';

/**
 * The shared verification every Daraja webhook route (STK callback,
 * B2C result/timeout, reversal result/timeout, transaction status)
 * runs first — see `webhookSecret.ts` for why a URL-embedded shared
 * secret is the real mechanism when Safaricom signs nothing.
 *
 * The secret now travels in the path, as `{businessId}~{secret}`,
 * rather than as `?key=`. Safaricom's own URL rules are restrictive
 * about callback URLs, and query strings are the part most commonly
 * reported as dropped — consistent with what production showed: STK
 * pushes accepted with real CheckoutRequestIDs and not one callback
 * ever delivered to a `?key=`-suffixed URL.
 *
 * `?key=` is still accepted. A push already in flight was sent with the
 * old-style URL, and rejecting its callback would lose a real payment
 * to fix a problem that callback did not have.
 *
 * Returns the **clean** businessId, so callers never have to remember
 * that the route parameter may carry a secret. Getting that wrong would
 * mean looking up `snack-quest~abc123` as a tenant and quietly finding
 * nothing.
 */
export async function verifyDarajaWebhookRequest(
  businessIdParam: string,
  request: Request,
): Promise<{ ok: true; businessId: string } | { ok: false; response: Response }> {
  const { businessId, key: pathKey } = splitBusinessIdSecret(businessIdParam);
  const queryKey = new URL(request.url).searchParams.get('key');
  const key = pathKey ?? queryKey;

  let webhookSecret: string | undefined;
  try {
    const secret = await businessIntegrationSecretRepository.get(businessId, 'daraja');
    webhookSecret = secret.webhookSecret;
  } catch {
    webhookSecret = undefined;
  }

  const result = checkWebhookSecret(key, webhookSecret);
  if (!result.ok) {
    return { ok: false, response: new Response('Forbidden', { status: 403 }) };
  }
  if (!webhookSecret) {
    console.warn(
      `[daraja webhook] business ${businessId} has no webhookSecret configured — accepting an unverified callback. Run scripts/setDarajaWebhookSecret.mjs to fix.`,
    );
  }
  return { ok: true, businessId };
}
