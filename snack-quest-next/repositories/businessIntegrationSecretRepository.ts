import 'server-only';

import { randomBytes } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { decryptSecret, encryptSecret, isEncryptedSecret } from '@/lib/secrets/secretCipher';
import { getSecretFieldKeys } from '@/lib/integrations/fieldManifest';
import type { IntegrationProvider, IntegrationSecretMap } from '@/types';

/**
 * `businesses/{businessId}/integrationSecrets/{provider}` reads/writes
 * (see `types/business.ts`). Every Gateway config module resolves its
 * per-tenant credentials through this, never through `process.env` —
 * `process.env` is only ever touched by seed scripts, which write the
 * *first* tenant's (Snack Quest's) credentials in here once, exactly
 * like any other tenant would provide their own.
 *
 * `get`/`set` transparently encrypt/decrypt the fields the field
 * manifest marks `secret: true` (§ Integration Portal,
 * `lib/secrets/secretCipher.ts`) — every existing caller (Gateway
 * config modules, seed scripts) keeps working unchanged; they never
 * see ciphertext.
 */

export class IntegrationSecretNotFoundError extends Error {
  constructor(businessId: string, provider: IntegrationProvider) {
    super(
      `No ${provider} integration configured for business ${businessId}. Run the relevant seed script or configure it via the admin tooling.`,
    );
    this.name = 'IntegrationSecretNotFoundError';
  }
}

function applyToSecretFields<P extends IntegrationProvider>(
  provider: P,
  data: Record<string, unknown>,
  transform: (value: string) => string,
): Record<string, unknown> {
  const result = { ...data };
  for (const key of getSecretFieldKeys(provider)) {
    const value = result[key];
    if (typeof value === 'string' && value.length > 0) {
      result[key] = transform(value);
    }
  }
  return result;
}

class BusinessIntegrationSecretRepository {
  async get<P extends IntegrationProvider>(
    businessId: string,
    provider: P,
  ): Promise<IntegrationSecretMap[P]> {
    const snapshot = await adminFirestore
      .collection('businesses')
      .doc(businessId)
      .collection('integrationSecrets')
      .doc(provider)
      .get();
    if (!snapshot.exists) {
      throw new IntegrationSecretNotFoundError(businessId, provider);
    }
    const data = snapshot.data() as Record<string, unknown>;
    return applyToSecretFields(provider, data, decryptSecret) as unknown as IntegrationSecretMap[P];
  }

  /** Same as `get`, but returns `null` instead of throwing when unconfigured — for status/listing callers that expect "missing" as a normal outcome. */
  async find<P extends IntegrationProvider>(
    businessId: string,
    provider: P,
  ): Promise<IntegrationSecretMap[P] | null> {
    try {
      return await this.get(businessId, provider);
    } catch (error) {
      if (error instanceof IntegrationSecretNotFoundError) {
        return null;
      }
      throw error;
    }
  }

  async set<P extends IntegrationProvider>(
    businessId: string,
    provider: P,
    secret: IntegrationSecretMap[P],
  ): Promise<void> {
    const encrypted = applyToSecretFields(provider, secret as unknown as Record<string, unknown>, encryptSecret);
    await adminFirestore
      .collection('businesses')
      .doc(businessId)
      .collection('integrationSecrets')
      .doc(provider)
      .set({ ...encrypted, updatedAt: FieldValue.serverTimestamp() });
  }

  /**
   * Guarantees a real `webhookSecret` exists for a provider whose
   * webhook URL this app itself resubmits on every outbound API call
   * (currently only `daraja` — see `lib/webhooks/webhookSecret.ts` for
   * why that resubmission property is what makes auto-provisioning
   * safe: Safaricom always receives the *current* secret embedded in
   * the callback URL, so there is no window where a stale, unkeyed URL
   * is registered anywhere). Pass the caller's already-fetched
   * `webhookSecret` value in as `current` — if set, it's returned
   * unchanged; if missing, a fresh random one is generated, persisted,
   * and returned, so the very next outbound call (and every one after)
   * embeds a real key without any operator having to remember to run
   * `scripts/setDarajaWebhookSecret.mjs`.
   *
   * NOT used for `jumia`: its webhook URL is registered once in
   * Jumia's own merchant dashboard rather than resubmitted per call,
   * so silently generating a secret here would start rejecting real
   * inbound tracking webhooks the moment it's set, with no way for
   * this app to also update the external registration. That one still
   * needs the manual script + a manual dashboard update.
   */
  async ensureWebhookSecret(businessId: string, provider: 'daraja', current: string | undefined): Promise<string> {
    if (current) {
      return current;
    }
    const generated = randomBytes(24).toString('hex');
    await this.update(businessId, provider, { webhookSecret: generated });
    return generated;
  }

  /** Partial update — merges `patch` onto whatever's already stored (or nothing, for a first-time setup), so the Integration Portal can save just the fields an admin actually changed. */
  async update<P extends IntegrationProvider>(
    businessId: string,
    provider: P,
    patch: Partial<IntegrationSecretMap[P]>,
  ): Promise<void> {
    const encrypted = applyToSecretFields(provider, patch as unknown as Record<string, unknown>, encryptSecret);
    await adminFirestore
      .collection('businesses')
      .doc(businessId)
      .collection('integrationSecrets')
      .doc(provider)
      .set({ ...encrypted, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }

  /**
   * Whether every currently-stored secret field for this provider is
   * actually encrypted at rest right now (§ Secret management
   * abstraction) — reads the raw, undecrypted document, unlike `get`/
   * `find`. Returns `null` when nothing is configured yet or the
   * provider has no secret-flagged fields (nothing to encrypt), so
   * callers can distinguish "not applicable" from "not yet encrypted".
   * A `false` here after `SECRET_ENCRYPTION_KEY` is set is expected and
   * not an error — see `lib/secrets/secretCipher.ts`'s doc comment on
   * why rotating/enabling the key requires no migration step: values
   * re-encrypt themselves the next time they're saved through the
   * portal.
   */
  async isEncryptedAtRest<P extends IntegrationProvider>(businessId: string, provider: P): Promise<boolean | null> {
    const snapshot = await adminFirestore
      .collection('businesses')
      .doc(businessId)
      .collection('integrationSecrets')
      .doc(provider)
      .get();
    if (!snapshot.exists) {
      return null;
    }
    const data = snapshot.data() as Record<string, unknown>;
    const secretKeys = getSecretFieldKeys(provider);
    const configuredValues = secretKeys
      .map((key) => data[key])
      .filter((value): value is string => typeof value === 'string' && value.length > 0);
    if (configuredValues.length === 0) {
      return null;
    }
    return configuredValues.every(isEncryptedSecret);
  }

  /** Records a "Test Connection" outcome (§ Integration Portal) — its own method, not `update`, since `lastTestedAt` needs a real server timestamp rather than a client-supplied value. */
  async recordTestResult(
    businessId: string,
    provider: IntegrationProvider,
    result: { status: 'success' | 'failure'; error: string | null },
  ): Promise<void> {
    await adminFirestore
      .collection('businesses')
      .doc(businessId)
      .collection('integrationSecrets')
      .doc(provider)
      .set(
        {
          lastTestedAt: FieldValue.serverTimestamp(),
          lastTestStatus: result.status,
          lastTestError: result.error,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
  }
}

export const businessIntegrationSecretRepository = new BusinessIntegrationSecretRepository();
