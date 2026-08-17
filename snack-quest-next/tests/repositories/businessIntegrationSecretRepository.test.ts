import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import {
  businessIntegrationSecretRepository,
  IntegrationSecretNotFoundError,
} from '@/repositories/businessIntegrationSecretRepository';

const BUSINESS_ID = 'biz-integration-secret-repo-test';
const TEST_KEY = 'b'.repeat(64);

beforeEach(async () => {
  await adminFirestore.recursiveDelete(
    adminFirestore.collection('businesses').doc(BUSINESS_ID).collection('integrationSecrets'),
  );
});

afterEach(() => {
  delete process.env.SECRET_ENCRYPTION_KEY;
});

describe('businessIntegrationSecretRepository', () => {
  it('round-trips a secret via set/get', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'daraja', {
      consumerKey: 'ck',
      consumerSecret: 'cs',
      shortcode: '123456',
      accountType: 'till',
      passkey: 'pk',
      callbackUrl: 'https://example.com/cb',
      env: 'sandbox',
    });

    const found = await businessIntegrationSecretRepository.get(BUSINESS_ID, 'daraja');
    expect(found.consumerKey).toBe('ck');
    expect(found.shortcode).toBe('123456');
  });

  it('throws IntegrationSecretNotFoundError for an unconfigured provider', async () => {
    await expect(businessIntegrationSecretRepository.get(BUSINESS_ID, 'jumia')).rejects.toThrow(
      IntegrationSecretNotFoundError,
    );
  });

  it('find() returns null instead of throwing for an unconfigured provider', async () => {
    expect(await businessIntegrationSecretRepository.find(BUSINESS_ID, 'meta')).toBeNull();
  });

  it('update() merges a partial patch without clobbering untouched fields', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'whatchimp', {
      apiKey: 'key-1',
      phoneNumberId: 'phone-1',
    });

    await businessIntegrationSecretRepository.update(BUSINESS_ID, 'whatchimp', { catalogId: 'cat-1' });

    const found = await businessIntegrationSecretRepository.get(BUSINESS_ID, 'whatchimp');
    expect(found.apiKey).toBe('key-1');
    expect(found.phoneNumberId).toBe('phone-1');
    expect(found.catalogId).toBe('cat-1');
  });

  it('encrypts secret fields at rest when SECRET_ENCRYPTION_KEY is set, transparently decrypting on read', async () => {
    process.env.SECRET_ENCRYPTION_KEY = TEST_KEY;

    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'jumia', {
      apiKey: 'super-secret-jumia-key',
      merchantId: 'merchant-1',
    });

    const raw = await adminFirestore
      .collection('businesses')
      .doc(BUSINESS_ID)
      .collection('integrationSecrets')
      .doc('jumia')
      .get();
    expect(raw.data()?.apiKey).not.toBe('super-secret-jumia-key');
    expect(String(raw.data()?.apiKey)).toMatch(/^enc:v1:/);
    // Non-secret fields stay in the clear.
    expect(raw.data()?.merchantId).toBe('merchant-1');

    const decrypted = await businessIntegrationSecretRepository.get(BUSINESS_ID, 'jumia');
    expect(decrypted.apiKey).toBe('super-secret-jumia-key');
  });

  it('leaves an existing plaintext secret readable after encryption is turned on for new writes', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'meta', {
      pixelId: 'pixel-1',
      accessToken: 'plaintext-token',
    });

    process.env.SECRET_ENCRYPTION_KEY = TEST_KEY;
    const found = await businessIntegrationSecretRepository.get(BUSINESS_ID, 'meta');
    expect(found.accessToken).toBe('plaintext-token');
  });

  describe('isEncryptedAtRest', () => {
    it('returns null when nothing is configured for that provider yet', async () => {
      expect(await businessIntegrationSecretRepository.isEncryptedAtRest(BUSINESS_ID, 'jumia')).toBeNull();
    });

    it('returns false when a secret is stored without an encryption key configured', async () => {
      await businessIntegrationSecretRepository.set(BUSINESS_ID, 'jumia', {
        apiKey: 'plain-key',
        merchantId: 'merchant-1',
      });
      expect(await businessIntegrationSecretRepository.isEncryptedAtRest(BUSINESS_ID, 'jumia')).toBe(false);
    });

    it('returns true once the secret is saved with an encryption key configured', async () => {
      process.env.SECRET_ENCRYPTION_KEY = TEST_KEY;
      await businessIntegrationSecretRepository.set(BUSINESS_ID, 'jumia', {
        apiKey: 'encrypted-key',
        merchantId: 'merchant-1',
      });
      expect(await businessIntegrationSecretRepository.isEncryptedAtRest(BUSINESS_ID, 'jumia')).toBe(true);
    });

    it('flips back to false for a provider whose secret predates the key, until it is re-saved', async () => {
      await businessIntegrationSecretRepository.set(BUSINESS_ID, 'meta', {
        pixelId: 'pixel-1',
        accessToken: 'plaintext-token',
      });
      process.env.SECRET_ENCRYPTION_KEY = TEST_KEY;
      expect(await businessIntegrationSecretRepository.isEncryptedAtRest(BUSINESS_ID, 'meta')).toBe(false);

      await businessIntegrationSecretRepository.update(BUSINESS_ID, 'meta', { accessToken: 'plaintext-token' });
      expect(await businessIntegrationSecretRepository.isEncryptedAtRest(BUSINESS_ID, 'meta')).toBe(true);
    });
  });
});
