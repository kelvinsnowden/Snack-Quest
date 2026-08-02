import 'server-only';

import crypto from 'node:crypto';

/**
 * Field-level envelope encryption for values stored in
 * `integrationSecrets` (§ Integration Portal). This is a storage-format
 * concern, not a provider concern — `businessIntegrationSecretRepository`
 * calls `encryptSecret`/`decryptSecret` transparently on the fields the
 * field manifest (`lib/integrations/fieldManifest.ts`) marks `secret:
 * true`, so nothing above the repository (Gateway config modules, seed
 * scripts, the Integration Portal service) ever sees ciphertext or has
 * to know encryption exists.
 *
 * `SECRET_ENCRYPTION_KEY` unset (local/emulator dev, and any existing
 * deployment that hasn't set it yet) is a deliberate, honest fallback:
 * values are stored as-is, exactly today's behavior — never a hard
 * failure that would block seeding a business in dev. Once the key is
 * set, every new write is encrypted; existing plaintext values keep
 * decrypting correctly (the `ENC_PREFIX` check below just returns them
 * unchanged) until the next time they're written, so rotating this on
 * requires no migration step or downtime.
 *
 * This is deliberately the whole abstraction for now (§ Secret
 * management abstraction) — a future move to a real KMS/Secret Manager
 * only needs to change what `loadKey()` returns (a fetched key instead
 * of a parsed env var), never the call sites in the repository.
 */

const ALGORITHM = 'aes-256-gcm';
const ENC_PREFIX = 'enc:v1:';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export class SecretEncryptionKeyMissingError extends Error {
  constructor() {
    super(
      'A secret value is encrypted but SECRET_ENCRYPTION_KEY is not set in this environment — cannot decrypt. Set the same key used to encrypt it.',
    );
    this.name = 'SecretEncryptionKeyMissingError';
  }
}

function loadKey(): Buffer | null {
  const raw = process.env.SECRET_ENCRYPTION_KEY;
  if (!raw) {
    return null;
  }
  if (!/^[0-9a-f]{64}$/i.test(raw)) {
    throw new Error(
      'SECRET_ENCRYPTION_KEY must be a 64-character hex string (32 bytes) — generate one with `openssl rand -hex 32`.',
    );
  }
  return Buffer.from(raw, 'hex');
}

/** Encrypts a plaintext value for storage. Returns it unchanged if no key is configured (see module doc comment). */
export function encryptSecret(plaintext: string): string {
  const key = loadKey();
  if (!key) {
    return plaintext;
  }
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return ENC_PREFIX + Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

/** Decrypts a value previously stored via `encryptSecret`. Legacy/unencrypted values (no `enc:v1:` prefix) pass through unchanged. */
export function decryptSecret(stored: string): string {
  if (!stored.startsWith(ENC_PREFIX)) {
    return stored;
  }
  const key = loadKey();
  if (!key) {
    throw new SecretEncryptionKeyMissingError();
  }
  const raw = Buffer.from(stored.slice(ENC_PREFIX.length), 'base64');
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

/** True once a value has actually gone through `encryptSecret` with a real key — used only for status/observability, never a correctness check. */
export function isEncryptedSecret(stored: string): boolean {
  return stored.startsWith(ENC_PREFIX);
}

/** Whether this deployment has `SECRET_ENCRYPTION_KEY` set — the Integration Portal surfaces this so a non-developer operator can see, without reading environment variables directly, whether secrets are being encrypted at rest. */
export function isEncryptionConfigured(): boolean {
  return loadKey() !== null;
}
