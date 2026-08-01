import { afterEach, describe, expect, it, vi } from 'vitest';

const TEST_KEY = 'a'.repeat(64);

describe('secretCipher', () => {
  const originalKey = process.env.SECRET_ENCRYPTION_KEY;

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.SECRET_ENCRYPTION_KEY;
    } else {
      process.env.SECRET_ENCRYPTION_KEY = originalKey;
    }
    vi.resetModules();
  });

  it('round-trips a plaintext value when a key is configured', async () => {
    process.env.SECRET_ENCRYPTION_KEY = TEST_KEY;
    const { encryptSecret, decryptSecret } = await import('@/lib/secrets/secretCipher');

    const ciphertext = encryptSecret('super-secret-consumer-key');
    expect(ciphertext).not.toBe('super-secret-consumer-key');
    expect(ciphertext.startsWith('enc:v1:')).toBe(true);
    expect(decryptSecret(ciphertext)).toBe('super-secret-consumer-key');
  });

  it('produces different ciphertext for the same plaintext each time (random IV)', async () => {
    process.env.SECRET_ENCRYPTION_KEY = TEST_KEY;
    const { encryptSecret } = await import('@/lib/secrets/secretCipher');

    expect(encryptSecret('same-value')).not.toBe(encryptSecret('same-value'));
  });

  it('stores plaintext unchanged when no key is configured (dev/emulator fallback)', async () => {
    delete process.env.SECRET_ENCRYPTION_KEY;
    const { encryptSecret, decryptSecret } = await import('@/lib/secrets/secretCipher');

    expect(encryptSecret('plain-value')).toBe('plain-value');
    expect(decryptSecret('plain-value')).toBe('plain-value');
  });

  it('passes through a legacy plaintext value unchanged even once a key is configured', async () => {
    process.env.SECRET_ENCRYPTION_KEY = TEST_KEY;
    const { decryptSecret } = await import('@/lib/secrets/secretCipher');

    expect(decryptSecret('a-value-written-before-encryption-existed')).toBe(
      'a-value-written-before-encryption-existed',
    );
  });

  it('throws SecretEncryptionKeyMissingError decrypting an encrypted value with no key configured', async () => {
    process.env.SECRET_ENCRYPTION_KEY = TEST_KEY;
    const { encryptSecret } = await import('@/lib/secrets/secretCipher');
    const ciphertext = encryptSecret('needs-a-key');

    delete process.env.SECRET_ENCRYPTION_KEY;
    vi.resetModules();
    const { decryptSecret, SecretEncryptionKeyMissingError } = await import('@/lib/secrets/secretCipher');

    expect(() => decryptSecret(ciphertext)).toThrow(SecretEncryptionKeyMissingError);
  });

  it('rejects a malformed key', async () => {
    process.env.SECRET_ENCRYPTION_KEY = 'not-a-valid-hex-key';
    const { encryptSecret } = await import('@/lib/secrets/secretCipher');

    expect(() => encryptSecret('value')).toThrow(/64-character hex string/);
  });
});
