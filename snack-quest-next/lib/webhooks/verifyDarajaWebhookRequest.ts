import 'server-only';

import { businessIntegrationSecretRepository } from '@/repositories/businessIntegrationSecretRepository';
import { checkWebhookSecret } from './webhookSecret';

/**
 * The shared verification every Daraja webhook route (STK callback,
 * B2C result/timeout, reversal result/timeout) runs first — see
 * `webhookSecret.ts`'s own comment for why a URL-embedded shared
 * secret, checked here against the business's stored
 * `DarajaIntegrationSecret.webhookSecret`, is the real mechanism.
 */
export async function verifyDarajaWebhookRequest(
  businessId: string,
  request: Request,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const key = new URL(request.url).searchParams.get('key');

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
  return { ok: true };
}
