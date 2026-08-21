import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { textSmsGateway } from '@/lib/integrations/sms/textSmsGateway';
import { resetCircuitBreaker } from '@/lib/integrations/shared/withCircuitBreaker';

const ENV_KEYS = ['TEXTSMS_API_KEY', 'TEXTSMS_PARTNER_ID', 'TEXTSMS_SHORTCODE', 'TEXTSMS_BASE_URL'] as const;
const ORIGINAL: Record<string, string | undefined> = {};

/**
 * A business with no TextSMS account of its own, so every case in this
 * file exercises the deployment-wide fallback — which is what these
 * tests were always about. The per-business path has its own file
 * (`tests/integrations/textSmsConfig.test.ts`).
 */
const BUSINESS_ID = 'biz-textsms-gateway';

beforeEach(() => {
  for (const key of ENV_KEYS) {
    ORIGINAL[key] = process.env[key];
  }
  process.env.TEXTSMS_API_KEY = 'test-textsms-key';
  process.env.TEXTSMS_PARTNER_ID = '9999';
  process.env.TEXTSMS_SHORTCODE = 'PROMO_ID';
  delete process.env.TEXTSMS_BASE_URL;
  // Several cases below assert on failure responses; without this the
  // breaker trips partway through the file (see resetCircuitBreaker).
  resetCircuitBreaker('textSms');
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** The exact success shape from the vendor's Postman collection, misspelled key and numeric messageid included. */
function successBody(messageid: number | string = 78726470) {
  return {
    responses: [
      {
        'respose-code': 200,
        'response-description': 'Success',
        mobile: '254713482448',
        messageid,
        networkid: '1',
      },
    ],
  };
}

describe('TextSmsGateway.send', () => {
  it('posts JSON with the vendor field names and returns the message id as a string', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(successBody()));
    vi.stubGlobal('fetch', fetchMock);

    const result = await textSmsGateway.send({ businessId: BUSINESS_ID, to: '0713482448', body: 'You earned KES 500' });

    // messageid arrives as a JSON *number*; SmsSendResult.providerMessageId is a string.
    expect(result).toEqual({ providerMessageId: '78726470' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://sms.textsms.co.ke/api/services/sendsms/');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({
      apikey: 'test-textsms-key',
      partnerID: '9999',
      mobile: '254713482448',
      message: 'You earned KES 500',
      shortcode: 'PROMO_ID',
      pass_type: 'plain',
    });
  });

  it('normalizes a local 07… number to the bare 254… MSISDN TextSMS expects', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(successBody()));
    vi.stubGlobal('fetch', fetchMock);

    await textSmsGateway.send({ businessId: BUSINESS_ID, to: '+254 713 482 448', body: 'hi' });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).mobile).toBe('254713482448');
  });

  it('rejects a number that is not a Kenyan mobile without making a request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(textSmsGateway.send({ businessId: BUSINESS_ID, to: '+1 415 555 0100', body: 'hi' })).rejects.toThrow(
      /is not a valid Kenyan mobile number/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the configured shortcode, so a branded sender ID needs no code change', async () => {
    process.env.TEXTSMS_SHORTCODE = 'SNACKQUEST';
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(successBody()));
    vi.stubGlobal('fetch', fetchMock);

    await textSmsGateway.send({ businessId: BUSINESS_ID, to: '254713482448', body: 'hi' });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).shortcode).toBe('SNACKQUEST');
  });

  it('honours TEXTSMS_BASE_URL and strips a trailing slash', async () => {
    process.env.TEXTSMS_BASE_URL = 'https://partner.textsms.co.ke/';
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(successBody()));
    vi.stubGlobal('fetch', fetchMock);

    await textSmsGateway.send({ businessId: BUSINESS_ID, to: '254713482448', body: 'hi' });

    expect(fetchMock.mock.calls[0][0]).toBe('https://partner.textsms.co.ke/api/services/sendsms/');
  });

  /**
   * Regression guard. TextSMS really does return `respose-code` — the
   * "n" is missing in their own payload. If someone "corrects" the
   * spelling in the gateway, every successful send starts being
   * recorded as a failure, and this test is what catches it.
   */
  it('reads the vendor’s misspelled respose-code key as the success signal', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(successBody())));

    await expect(textSmsGateway.send({ businessId: BUSINESS_ID, to: '254713482448', body: 'hi' })).resolves.toEqual({
      providerMessageId: '78726470',
    });
  });

  it('also accepts a correctly-spelled response-code, in case the vendor fixes it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          responses: [{ 'response-code': 200, 'response-description': 'Success', messageid: 12345 }],
        }),
      ),
    );

    await expect(textSmsGateway.send({ businessId: BUSINESS_ID, to: '254713482448', body: 'hi' })).resolves.toEqual({
      providerMessageId: '12345',
    });
  });

  it('treats a string "200" as success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(successBody('55'))));

    await expect(textSmsGateway.send({ businessId: BUSINESS_ID, to: '254713482448', body: 'hi' })).resolves.toEqual({
      providerMessageId: '55',
    });
  });

  it('throws with the vendor description and code when the response code is not 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          responses: [{ 'respose-code': 1003, 'response-description': 'Insufficient balance' }],
        }),
      ),
    );

    await expect(textSmsGateway.send({ businessId: BUSINESS_ID, to: '254713482448', body: 'hi' })).rejects.toThrow(
      /TextSMS send failed: Insufficient balance \(code 1003\)/,
    );
  });

  it('throws on a non-2xx HTTP response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 502)));

    await expect(textSmsGateway.send({ businessId: BUSINESS_ID, to: '254713482448', body: 'hi' })).rejects.toThrow(
      /TextSMS send failed: HTTP 502/,
    );
  });

  it('throws when the payload has no responses array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({})));

    await expect(textSmsGateway.send({ businessId: BUSINESS_ID, to: '254713482448', body: 'hi' })).rejects.toThrow(/TextSMS send failed/);
  });

  it('never reports success without a messageid to record', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ responses: [{ 'respose-code': 200, 'response-description': 'Success' }] })),
    );

    await expect(textSmsGateway.send({ businessId: BUSINESS_ID, to: '254713482448', body: 'hi' })).rejects.toThrow(/without a messageid/);
  });

  it.each(ENV_KEYS.filter((key) => key !== 'TEXTSMS_BASE_URL'))(
    'throws when %s is missing, without making a request',
    async (missingKey) => {
      delete process.env[missingKey];
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      // Names the specific missing setting, not the whole list — an
      // operator reading this is about to look at exactly one row.
      await expect(textSmsGateway.send({ businessId: BUSINESS_ID, to: '254713482448', body: 'hi' })).rejects.toThrow(
        new RegExp(`${missingKey} is unset`),
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});

describe('TextSmsGateway.assertReady', () => {
  it('passes when every required setting is present', async () => {
    await expect(textSmsGateway.assertReady(BUSINESS_ID)).resolves.toBeUndefined();
  });

  /** The point of the pre-flight: a bulk caller learns this once, before its send loop. */
  it('names every missing setting at once, not just the first', async () => {
    delete process.env.TEXTSMS_API_KEY;
    delete process.env.TEXTSMS_SHORTCODE;

    await expect(textSmsGateway.assertReady(BUSINESS_ID)).rejects.toThrow(
      /TEXTSMS_API_KEY, TEXTSMS_SHORTCODE are unset/,
    );
  });

  /**
   * The whole point of the per-business account: the fix an operator
   * can actually perform has to come first. Naming the environment
   * variables alone sends them to whoever administers the hosting
   * provider, and then to a redeploy — which is exactly the dead end
   * this replaced.
   */
  it('leads with the admin page, not the environment variables', async () => {
    delete process.env.TEXTSMS_PARTNER_ID;

    await expect(textSmsGateway.assertReady(BUSINESS_ID)).rejects.toThrow(
      /Admin → Settings → Integrations[\s\S]*no redeploy/,
    );
  });
});
