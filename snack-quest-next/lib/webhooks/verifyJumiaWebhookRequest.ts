import 'server-only';

import { businessIntegrationSecretRepository } from '@/repositories/businessIntegrationSecretRepository';
import { checkWebhookSecret } from './webhookSecret';

/**
 * The verification the Jumia tracking webhook route runs first (§
 * Logistics: wire tracking webhook consumption) — same URL-embedded
 * shared-secret mechanism, checked against the business's stored
 * `JumiaIntegrationSecret.webhookSecret`, as
 * `verifyDarajaWebhookRequest`; see that function's own comment for
 * why this mechanism (not a provider-signed header) is the real one
 * available.
 */
export async function verifyJumiaWebhookRequest(
  businessId: string,
  request: Request,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const key = new URL(request.url).searchParams.get('key');

  let webhookSecret: string | undefined;
  try {
    const secret = await businessIntegrationSecretRepository.get(businessId, 'jumia');
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
      `[jumia webhook] business ${businessId} has no webhookSecret configured — accepting an unverified tracking update. Run scripts/setJumiaWebhookSecret.mjs to fix.`,
    );
  }
  return { ok: true };
}
