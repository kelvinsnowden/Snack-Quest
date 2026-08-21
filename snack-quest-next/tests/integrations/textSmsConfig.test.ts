import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { businessIntegrationSecretRepository } from '@/repositories/businessIntegrationSecretRepository';
import {
  describeTextSmsConfig,
  getTextSmsConfig,
  missingTextSmsEnv,
  TextSmsNotConfiguredError,
} from '@/lib/integrations/sms/config';
import { IntegrationDisabledError } from '@/lib/integrations/shared/assertEnabled';
import { textSmsGateway } from '@/lib/integrations/sms/textSmsGateway';
import { resetCircuitBreaker } from '@/lib/integrations/shared/withCircuitBreaker';

/**
 * Which TextSMS account a business's texts go out through
 * (§ Integration Portal: SMS).
 *
 * The behaviour that matters is the choice, not the send itself: a
 * business that connected its own account must send from its own
 * sender ID, one that hasn't must keep sending exactly as it did when
 * SMS was deployment-wide only, and a business with neither must be
 * told the thing it can actually act on.
 */

const CONFIGURED = 'biz-textsms-configured';
const UNCONFIGURED = 'biz-textsms-unconfigured';

const ENV_KEYS = ['TEXTSMS_API_KEY', 'TEXTSMS_PARTNER_ID', 'TEXTSMS_SHORTCODE', 'TEXTSMS_BASE_URL'] as const;
const ORIGINAL: Record<string, string | undefined> = {};

beforeEach(async () => {
  for (const key of ENV_KEYS) {
    ORIGINAL[key] = process.env[key];
  }
  process.env.TEXTSMS_API_KEY = 'deployment-key';
  process.env.TEXTSMS_PARTNER_ID = '1111';
  process.env.TEXTSMS_SHORTCODE = 'SHARED_ID';
  delete process.env.TEXTSMS_BASE_URL;
  resetCircuitBreaker('textSms');

  for (const businessId of [CONFIGURED, UNCONFIGURED]) {
    await adminFirestore
      .collection('businesses')
      .doc(businessId)
      .collection('integrationSecrets')
      .doc('textSms')
      .delete()
      .catch(() => undefined);
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of ENV_KEYS) {
    if (ORIGINAL[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = ORIGINAL[key];
    }
  }
});

async function connectTextSms(overrides: Record<string, unknown> = {}) {
  await businessIntegrationSecretRepository.set(CONFIGURED, 'textSms', {
    apiKey: 'business-key',
    partnerId: '9999',
    senderId: 'SNACKQUEST',
    ...overrides,
  } as never);
}

describe('getTextSmsConfig', () => {
  it("prefers the business's own account over the deployment's", async () => {
    await connectTextSms();

    await expect(getTextSmsConfig(CONFIGURED)).resolves.toMatchObject({
      apiKey: 'business-key',
      partnerId: '9999',
      senderId: 'SNACKQUEST',
      source: 'business',
    });
  });

  it('falls back to the deployment account for a business that has connected nothing', async () => {
    await expect(getTextSmsConfig(UNCONFIGURED)).resolves.toMatchObject({
      apiKey: 'deployment-key',
      senderId: 'SHARED_ID',
      source: 'deployment',
    });
  });

  /**
   * The fallback exists so nothing that worked before this feature
   * stops working — not so that a half-filled form can silently break
   * a business that never noticed it saved one.
   */
  it('treats a half-filled account as not connected and falls back rather than failing', async () => {
    await connectTextSms({ senderId: '' });

    await expect(getTextSmsConfig(CONFIGURED)).resolves.toMatchObject({ source: 'deployment' });
  });

  /** Pausing an integration has to stop it, not reroute its traffic through the platform's account and somebody else's sender ID. */
  it('refuses to fall back when the business has explicitly paused its account', async () => {
    await connectTextSms({ enabled: false });

    await expect(getTextSmsConfig(CONFIGURED)).rejects.toBeInstanceOf(IntegrationDisabledError);
  });

  it('strips a trailing slash from a business-supplied base URL', async () => {
    await connectTextSms({ baseUrl: 'https://partner.textsms.co.ke/' });

    await expect(getTextSmsConfig(CONFIGURED)).resolves.toMatchObject({
      baseUrl: 'https://partner.textsms.co.ke',
    });
  });

  describe('when neither source is configured', () => {
    beforeEach(() => {
      for (const key of ['TEXTSMS_API_KEY', 'TEXTSMS_PARTNER_ID', 'TEXTSMS_SHORTCODE']) {
        delete process.env[key];
      }
    });

    it('points at the fix the person reading it can actually perform', async () => {
      const error = await getTextSmsConfig(UNCONFIGURED).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(TextSmsNotConfiguredError);
      // Leading with the environment variables would send an operator
      // to whoever administers the host, and then to a redeploy. The
      // admin page is the route that works without either.
      expect((error as Error).message).toMatch(/^SMS is not configured\. Open Admin → Settings → Integrations/);
      expect((error as Error).message).toMatch(/no redeploy/);
    });

    it('still names the unset deployment variables, for whoever does administer the host', async () => {
      await expect(getTextSmsConfig(UNCONFIGURED)).rejects.toThrow(
        /TEXTSMS_API_KEY, TEXTSMS_PARTNER_ID, TEXTSMS_SHORTCODE are unset/,
      );
    });
  });
});

describe('the gateway sends with whichever account won', () => {
  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }

  const success = { responses: [{ 'respose-code': 200, 'response-description': 'Success', messageid: 42 }] };

  it("uses the business's own key and sender ID", async () => {
    await connectTextSms();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(success));
    vi.stubGlobal('fetch', fetchMock);

    await textSmsGateway.send({ businessId: CONFIGURED, to: '254713482448', body: 'hi' });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({
      apikey: 'business-key',
      partnerID: '9999',
      shortcode: 'SNACKQUEST',
    });
  });

  it("uses the deployment's key for a business that connected nothing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(success));
    vi.stubGlobal('fetch', fetchMock);

    await textSmsGateway.send({ businessId: UNCONFIGURED, to: '254713482448', body: 'hi' });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({
      apikey: 'deployment-key',
      shortcode: 'SHARED_ID',
    });
  });

  /**
   * Two businesses on one deployment must not be able to send as each
   * other. This is the test that would fail if the config were ever
   * cached in a module-level variable rather than resolved per call.
   */
  it('does not let one business inherit another business’s sender ID', async () => {
    await connectTextSms();
    // A fresh Response per call, not one shared instance: a body can
    // only be read once, so `mockResolvedValue` would hand the second
    // send an already-drained stream and fail it for the wrong reason.
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse(success));
    vi.stubGlobal('fetch', fetchMock);

    await textSmsGateway.send({ businessId: CONFIGURED, to: '254713482448', body: 'hi' });
    await textSmsGateway.send({ businessId: UNCONFIGURED, to: '254713482448', body: 'hi' });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).shortcode).toBe('SNACKQUEST');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string).shortcode).toBe('SHARED_ID');
  });
});

describe('describeTextSmsConfig', () => {
  it('reports which of the two accounts is in effect', async () => {
    await connectTextSms();

    await expect(describeTextSmsConfig(CONFIGURED)).resolves.toEqual({
      state: 'configured',
      source: 'business',
      senderId: 'SNACKQUEST',
    });
    await expect(describeTextSmsConfig(UNCONFIGURED)).resolves.toEqual({
      state: 'configured',
      source: 'deployment',
      senderId: 'SHARED_ID',
    });
  });

  /** "Paused" and "never set up" need different answers, because they need different fixes. */
  it('separates a paused account from one that was never set up', async () => {
    await connectTextSms({ enabled: false });
    await expect(describeTextSmsConfig(CONFIGURED)).resolves.toEqual({ state: 'paused' });

    for (const key of ['TEXTSMS_API_KEY', 'TEXTSMS_PARTNER_ID', 'TEXTSMS_SHORTCODE']) {
      delete process.env[key];
    }
    await expect(describeTextSmsConfig(UNCONFIGURED)).resolves.toEqual({ state: 'unconfigured' });
  });
});

describe('missingTextSmsEnv', () => {
  it('is empty when the deployment account is complete', () => {
    expect(missingTextSmsEnv()).toEqual([]);
  });

  it('names only the settings that are actually absent', () => {
    delete process.env.TEXTSMS_PARTNER_ID;

    expect(missingTextSmsEnv()).toEqual(['TEXTSMS_PARTNER_ID']);
  });
});
