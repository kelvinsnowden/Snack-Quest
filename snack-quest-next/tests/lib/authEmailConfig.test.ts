import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { businessIntegrationSecretRepository } from '@/repositories/businessIntegrationSecretRepository';
import {
  getAuthEmailConfig,
  InvalidAuthEmailConfigError,
} from '@/lib/integrations/authEmail/config';
import { getIntegrationFieldManifest, getRequiredFieldKeys } from '@/lib/integrations/fieldManifest';

/**
 * The SMTP settings Firebase Authentication sends password resets
 * through (§ Integration Portal: auth email). Everything here is about
 * refusing bad input *before* it reaches Google, whose own error for a
 * malformed port is far less useful than ours.
 */

const BUSINESS_ID = 'auth-email-test-business';

const VALID = {
  senderEmail: 'noreply@snackquests.shop',
  senderName: 'Snack Quest',
  host: 'smtp.mailgun.org',
  port: '587',
  securityMode: 'START_TLS',
  username: 'postmaster@snackquests.shop',
  password: 'super-secret',
};

async function save(overrides: Record<string, string> = {}) {
  await businessIntegrationSecretRepository.update(BUSINESS_ID, 'authEmail', {
    ...VALID,
    ...overrides,
  } as never);
}

beforeEach(async () => {
  await adminFirestore
    .collection('businesses')
    .doc(BUSINESS_ID)
    .collection('integrationSecrets')
    .doc('authEmail')
    .delete()
    .catch(() => undefined);
});

describe('auth email field manifest', () => {
  it('treats only the SMTP password as a secret', () => {
    const manifest = getIntegrationFieldManifest('authEmail');
    const secretKeys = manifest.filter((field) => field.secret).map((field) => field.key);
    expect(secretKeys).toEqual(['password']);
  });

  it('requires everything Firebase needs, and nothing it does not', () => {
    expect(getRequiredFieldKeys('authEmail').sort()).toEqual(
      ['host', 'password', 'port', 'securityMode', 'senderEmail', 'username'].sort(),
    );
  });
});

describe('getAuthEmailConfig', () => {
  it('reads a complete configuration back', async () => {
    await save();
    await expect(getAuthEmailConfig(BUSINESS_ID)).resolves.toEqual({
      senderEmail: 'noreply@snackquests.shop',
      senderName: 'Snack Quest',
      host: 'smtp.mailgun.org',
      port: 587,
      securityMode: 'START_TLS',
      username: 'postmaster@snackquests.shop',
      password: 'super-secret',
    });
  });

  it('treats a blank sender name as absent rather than an empty display name', async () => {
    await save({ senderName: '' });
    await expect(getAuthEmailConfig(BUSINESS_ID)).resolves.toMatchObject({ senderName: null });
  });

  it.each(['0', '70000', 'five-eight-seven', '587.5'])(
    'refuses the unusable port %s with a message naming the usual ones',
    async (port) => {
      await save({ port });
      await expect(getAuthEmailConfig(BUSINESS_ID)).rejects.toBeInstanceOf(
        InvalidAuthEmailConfigError,
      );
      await expect(getAuthEmailConfig(BUSINESS_ID)).rejects.toThrow(/587|465/);
    },
  );

  it('accepts a lowercase security mode rather than failing on capitalisation', async () => {
    await save({ securityMode: 'ssl' });
    await expect(getAuthEmailConfig(BUSINESS_ID)).resolves.toMatchObject({ securityMode: 'SSL' });
  });

  it('refuses a security mode Identity Platform does not support', async () => {
    await save({ securityMode: 'TLS_1_2' });
    await expect(getAuthEmailConfig(BUSINESS_ID)).rejects.toBeInstanceOf(
      InvalidAuthEmailConfigError,
    );
  });

  it('refuses to hand over credentials while the integration is switched off', async () => {
    await save();
    await businessIntegrationSecretRepository.update(BUSINESS_ID, 'authEmail', {
      enabled: false,
    } as never);
    await expect(getAuthEmailConfig(BUSINESS_ID)).rejects.toThrow(/disabled/i);
  });
});
