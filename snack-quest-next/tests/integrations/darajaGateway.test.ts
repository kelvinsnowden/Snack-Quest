import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  darajaGateway,
  resetDarajaTokenCache,
} from '@/lib/integrations/daraja/darajaGateway';
import { IntegrationSecretNotFoundError } from '@/repositories/businessIntegrationSecretRepository';
import { businessIntegrationSecretRepository } from '@/repositories/businessIntegrationSecretRepository';

const BUSINESS_ID = 'biz-daraja-test';
const OTHER_BUSINESS_ID = 'biz-daraja-other';

const SECRET = {
  consumerKey: 'test-key',
  consumerSecret: 'test-secret',
  shortcode: '174379',
  passkey: 'test-passkey',
  callbackUrl: `https://example.com/api/webhooks/daraja/${BUSINESS_ID}`,
  env: 'sandbox' as const,
};

describe('DarajaGateway.verifyCallback', () => {
  it('parses a successful STK callback', () => {
    const result = darajaGateway.verifyCallback({
      Body: {
        stkCallback: {
          MerchantRequestID: 'merchant-1',
          CheckoutRequestID: 'checkout-1',
          ResultCode: 0,
          ResultDesc: 'The service request is processed successfully.',
          CallbackMetadata: {
            Item: [
              { Name: 'Amount', Value: 500 },
              { Name: 'MpesaReceiptNumber', Value: 'NLJ7RT61SV' },
              { Name: 'TransactionDate', Value: 20240115120000 },
              { Name: 'PhoneNumber', Value: 254700000000 },
            ],
          },
        },
      },
    });

    expect(result).toEqual({
      checkoutRequestId: 'checkout-1',
      merchantRequestId: 'merchant-1',
      resultCode: 0,
      resultDesc: 'The service request is processed successfully.',
      amountKes: 500,
      mpesaReceiptNumber: 'NLJ7RT61SV',
      transactionDate: '20240115120000',
      phoneNumber: '254700000000',
    });
  });

  it('parses a failed/cancelled STK callback without amount fields', () => {
    const result = darajaGateway.verifyCallback({
      Body: {
        stkCallback: {
          MerchantRequestID: 'merchant-2',
          CheckoutRequestID: 'checkout-2',
          ResultCode: 1032,
          ResultDesc: 'Request cancelled by user.',
        },
      },
    });

    expect(result.resultCode).toBe(1032);
    expect(result.amountKes).toBeUndefined();
    expect(result.mpesaReceiptNumber).toBeUndefined();
  });

  it('throws on a malformed payload missing Body.stkCallback', () => {
    expect(() => darajaGateway.verifyCallback({ unexpected: true })).toThrow(
      /Malformed Daraja callback/,
    );
  });
});

describe('DarajaGateway.initiateStkPush', () => {
  beforeEach(() => {
    resetDarajaTokenCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws IntegrationSecretNotFoundError when no Daraja secret is configured for this business', async () => {
    await expect(
      darajaGateway.initiateStkPush({
        businessId: 'biz-with-no-daraja-secret',
        phone: '254700000000',
        amountKes: 500,
        accountReference: 'ORDER-1',
        transactionDesc: 'Snack Quest order',
      }),
    ).rejects.toBeInstanceOf(IntegrationSecretNotFoundError);
  });

  it('fetches a token then initiates the STK push on success', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'daraja', SECRET);
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        String(url).includes('/oauth/v1/generate')
          ? new Response(
              JSON.stringify({ access_token: 'token-abc', expires_in: '3599' }),
              { status: 200 },
            )
          : new Response(
              JSON.stringify({
                MerchantRequestID: 'merchant-1',
                CheckoutRequestID: 'checkout-1',
                ResponseCode: '0',
                ResponseDescription: 'Success. Request accepted for processing',
                CustomerMessage: 'Success. Request accepted for processing',
              }),
              { status: 200 },
            ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await darajaGateway.initiateStkPush({
      businessId: BUSINESS_ID,
      phone: '254700000000',
      amountKes: 500,
      accountReference: 'ORDER-1',
      transactionDesc: 'Snack Quest order',
    });

    expect(result.checkoutRequestId).toBe('checkout-1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [tokenCall, stkCall] = fetchMock.mock.calls;
    expect(String(tokenCall[0])).toContain('/oauth/v1/generate');
    expect(String(stkCall[0])).toContain('/mpesa/stkpush/v1/processrequest');
  });

  it('throws when Daraja rejects the STK push request', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'daraja', SECRET);
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        String(url).includes('/oauth/v1/generate')
          ? new Response(
              JSON.stringify({ access_token: 'token-abc', expires_in: '3599' }),
              { status: 200 },
            )
          : new Response(
              JSON.stringify({
                requestId: 'req-1',
                errorCode: '400.002.02',
                errorMessage: 'Bad Request - Invalid PhoneNumber',
              }),
              { status: 400 },
            ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      darajaGateway.initiateStkPush({
        businessId: BUSINESS_ID,
        phone: 'not-a-phone',
        amountKes: 500,
        accountReference: 'ORDER-1',
        transactionDesc: 'Snack Quest order',
      }),
    ).rejects.toThrow(/Daraja STK push failed/);
  });

  it('reuses a cached token instead of re-fetching on a second call', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'daraja', SECRET);
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        String(url).includes('/oauth/v1/generate')
          ? new Response(
              JSON.stringify({ access_token: 'token-abc', expires_in: '3599' }),
              { status: 200 },
            )
          : new Response(
              JSON.stringify({
                MerchantRequestID: 'merchant-1',
                CheckoutRequestID: 'checkout-1',
                ResponseCode: '0',
                ResponseDescription: 'Success. Request accepted for processing',
                CustomerMessage: 'Success. Request accepted for processing',
              }),
              { status: 200 },
            ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const input = {
      businessId: BUSINESS_ID,
      phone: '254700000000',
      amountKes: 500,
      accountReference: 'ORDER-1',
      transactionDesc: 'Snack Quest order',
    };
    await darajaGateway.initiateStkPush(input);
    await darajaGateway.initiateStkPush(input);

    // 1 OAuth call + 2 STK push calls — the second initiate reused the cached token.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('caches tokens per-business — a second tenant never reuses the first tenant\'s token', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'daraja', SECRET);
    await businessIntegrationSecretRepository.set(OTHER_BUSINESS_ID, 'daraja', {
      ...SECRET,
      consumerKey: 'other-tenant-key',
      shortcode: '999999',
    });
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        String(url).includes('/oauth/v1/generate')
          ? new Response(
              JSON.stringify({ access_token: 'token-abc', expires_in: '3599' }),
              { status: 200 },
            )
          : new Response(
              JSON.stringify({
                MerchantRequestID: 'merchant-1',
                CheckoutRequestID: 'checkout-1',
                ResponseCode: '0',
                ResponseDescription: 'Success. Request accepted for processing',
                CustomerMessage: 'Success. Request accepted for processing',
              }),
              { status: 200 },
            ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await darajaGateway.initiateStkPush({
      businessId: BUSINESS_ID,
      phone: '254700000000',
      amountKes: 500,
      accountReference: 'ORDER-1',
      transactionDesc: 'Snack Quest order',
    });
    await darajaGateway.initiateStkPush({
      businessId: OTHER_BUSINESS_ID,
      phone: '254700000000',
      amountKes: 500,
      accountReference: 'ORDER-1',
      transactionDesc: 'Snack Quest order',
    });

    // Both tenants had to fetch their own OAuth token: 2 OAuth calls + 2 STK calls.
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

const B2C_SECRET = {
  ...SECRET,
  b2cInitiatorName: 'testapiuser',
  b2cSecurityCredential: 'encrypted-credential-base64',
};

describe('DarajaGateway.initiateB2CPayment', () => {
  beforeEach(() => {
    resetDarajaTokenCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws DarajaB2CNotConfiguredError when only C2B credentials exist', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'daraja', SECRET);

    await expect(
      darajaGateway.initiateB2CPayment({
        businessId: BUSINESS_ID,
        phone: '254700000000',
        amountKes: 500,
        remarks: 'Withdrawal payout',
      }),
    ).rejects.toThrow(/no Daraja B2C credentials configured/);
  });

  it('initiates a real B2C payment request on success', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'daraja', B2C_SECRET);
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        String(url).includes('/oauth/v1/generate')
          ? new Response(JSON.stringify({ access_token: 'token-abc', expires_in: '3599' }), { status: 200 })
          : new Response(
              JSON.stringify({
                ConversationID: 'AG_20191219_00005797af5d7d75f652',
                OriginatorConversationID: '16740-34861180-1',
                ResponseCode: '0',
                ResponseDescription: 'Accept the service request successfully.',
              }),
              { status: 200 },
            ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await darajaGateway.initiateB2CPayment({
      businessId: BUSINESS_ID,
      phone: '254700000000',
      amountKes: 500,
      remarks: 'Withdrawal payout',
    });

    expect(result).toEqual({
      originatorConversationId: '16740-34861180-1',
      conversationId: 'AG_20191219_00005797af5d7d75f652',
      responseCode: '0',
      responseDescription: 'Accept the service request successfully.',
    });
    const [, b2cCall] = fetchMock.mock.calls;
    expect(String(b2cCall[0])).toContain('/mpesa/b2c/v1/paymentrequest');
    const body = JSON.parse(b2cCall[1].body);
    expect(body.InitiatorName).toBe('testapiuser');
    expect(body.SecurityCredential).toBe('encrypted-credential-base64');
    expect(body.ResultURL).toBe(`https://example.com/api/webhooks/daraja/${BUSINESS_ID}/b2c-result`);
    expect(body.QueueTimeOutURL).toBe(`https://example.com/api/webhooks/daraja/${BUSINESS_ID}/b2c-timeout`);
  });

  it('throws when Daraja rejects the B2C request', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'daraja', B2C_SECRET);
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        String(url).includes('/oauth/v1/generate')
          ? new Response(JSON.stringify({ access_token: 'token-abc', expires_in: '3599' }), { status: 200 })
          : new Response(JSON.stringify({ errorMessage: 'Invalid Initiator Information' }), { status: 400 }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      darajaGateway.initiateB2CPayment({
        businessId: BUSINESS_ID,
        phone: '254700000000',
        amountKes: 500,
        remarks: 'Withdrawal payout',
      }),
    ).rejects.toThrow(/Daraja B2C payment request failed/);
  });
});

describe('DarajaGateway.verifyB2CResult', () => {
  it('parses a successful B2C result', () => {
    const result = darajaGateway.verifyB2CResult({
      Result: {
        ResultType: 0,
        ResultCode: 0,
        ResultDesc: 'The service request is processed successfully.',
        OriginatorConversationID: '16740-34861180-1',
        ConversationID: 'AG_20191219_00005797af5d7d75f652',
        TransactionID: 'NLJ41HAY6Q',
        ResultParameters: {
          ResultParameter: [
            { Key: 'TransactionAmount', Value: 500 },
            { Key: 'TransactionCompletedDateTime', Value: '19.12.2019 11:45:50' },
          ],
        },
      },
    });

    expect(result).toEqual({
      originatorConversationId: '16740-34861180-1',
      conversationId: 'AG_20191219_00005797af5d7d75f652',
      resultCode: 0,
      resultDesc: 'The service request is processed successfully.',
      succeeded: true,
      transactionId: 'NLJ41HAY6Q',
      amountKes: 500,
      transactionCompletedAt: '19.12.2019 11:45:50',
    });
  });

  it('parses a failed B2C result without transaction fields', () => {
    const result = darajaGateway.verifyB2CResult({
      Result: {
        ResultType: 0,
        ResultCode: 2001,
        ResultDesc: 'The initiator information is invalid.',
        OriginatorConversationID: '16740-34861180-2',
        ConversationID: 'AG_20191219_00005797af5d7d75f653',
      },
    });

    expect(result.succeeded).toBe(false);
    expect(result.transactionId).toBeUndefined();
    expect(result.amountKes).toBeUndefined();
  });

  it('throws on a malformed payload missing Result', () => {
    expect(() => darajaGateway.verifyB2CResult({ unexpected: true })).toThrow(/Malformed Daraja B2C result/);
  });
});
