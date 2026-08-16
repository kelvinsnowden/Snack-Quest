import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  darajaGateway,
  resetDarajaTokenCache,
  testDarajaConnection,
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

describe('DarajaGateway.queryStkStatus', () => {
  beforeEach(() => {
    resetDarajaTokenCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('queries the real M-Pesa Express Query endpoint and parses a successful result', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'daraja', SECRET);
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        String(url).includes('/oauth/v1/generate')
          ? new Response(JSON.stringify({ access_token: 'token-abc', expires_in: '3599' }), { status: 200 })
          : new Response(
              JSON.stringify({
                ResponseCode: '0',
                ResponseDescription: 'The service request has been accepted successfully',
                MerchantRequestID: '22205-34066-1',
                CheckoutRequestID: 'ws_CO_13012021093521236557',
                ResultCode: '0',
                ResultDesc: 'The service request is processed successfully.',
              }),
              { status: 200 },
            ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await darajaGateway.queryStkStatus({
      businessId: BUSINESS_ID,
      checkoutRequestId: 'ws_CO_13012021093521236557',
    });

    expect(result).toEqual({
      merchantRequestId: '22205-34066-1',
      checkoutRequestId: 'ws_CO_13012021093521236557',
      responseCode: '0',
      responseDescription: 'The service request has been accepted successfully',
      resultCode: 0,
      resultDesc: 'The service request is processed successfully.',
    });
    const [, queryCall] = fetchMock.mock.calls;
    expect(String(queryCall[0])).toContain('/mpesa/stkpushquery/v1/query');
    const body = JSON.parse(String(queryCall[1].body));
    expect(body).toMatchObject({
      BusinessShortCode: '174379',
      CheckoutRequestID: 'ws_CO_13012021093521236557',
    });
    expect(body.Password).toBeTruthy();
    expect(body.Timestamp).toBeTruthy();
  });

  it('parses a definitive failure result (e.g. cancelled by user)', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'daraja', SECRET);
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        String(url).includes('/oauth/v1/generate')
          ? new Response(JSON.stringify({ access_token: 'token-abc', expires_in: '3599' }), { status: 200 })
          : new Response(
              JSON.stringify({
                ResponseCode: '0',
                ResponseDescription: 'The service request has been accepted successfully',
                MerchantRequestID: '22205-34066-2',
                CheckoutRequestID: 'ws_CO_cancelled',
                ResultCode: '1032',
                ResultDesc: 'Request cancelled by user.',
              }),
              { status: 200 },
            ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await darajaGateway.queryStkStatus({
      businessId: BUSINESS_ID,
      checkoutRequestId: 'ws_CO_cancelled',
    });

    expect(result.responseCode).toBe('0');
    expect(result.resultCode).toBe(1032);
  });

  it('throws when the query request itself fails at the HTTP level', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'daraja', SECRET);
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        String(url).includes('/oauth/v1/generate')
          ? new Response(JSON.stringify({ access_token: 'token-abc', expires_in: '3599' }), { status: 200 })
          : new Response(JSON.stringify({ errorMessage: 'Bad Request - Invalid CheckoutRequestID' }), { status: 400 }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      darajaGateway.queryStkStatus({ businessId: BUSINESS_ID, checkoutRequestId: 'not-a-real-id' }),
    ).rejects.toThrow(/Daraja STK query failed/);
  });
});

const B2C_SECRET = {
  ...SECRET,
  b2cInitiatorName: 'testapiuser',
  b2cSecurityCredential: 'encrypted-credential-base64',
  // Set explicitly, not left to auto-provisioning
  // (businessIntegrationSecretRepository.ensureWebhookSecret), so the
  // ResultURL/QueueTimeOutURL assertions below can be exact-match
  // rather than asserting only a prefix.
  webhookSecret: 'test-webhook-secret',
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
    expect(body.ResultURL).toBe(`https://example.com/api/webhooks/daraja/${BUSINESS_ID}/b2c-result?key=test-webhook-secret`);
    expect(body.QueueTimeOutURL).toBe(`https://example.com/api/webhooks/daraja/${BUSINESS_ID}/b2c-timeout?key=test-webhook-secret`);
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

describe('DarajaGateway.initiateReversal', () => {
  beforeEach(() => {
    resetDarajaTokenCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws DarajaReversalNotConfiguredError when only C2B credentials exist', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'daraja', SECRET);

    await expect(
      darajaGateway.initiateReversal({
        businessId: BUSINESS_ID,
        transactionId: 'NLJ7RT61SV',
        amountKes: 2500,
        remarks: 'Order refund',
      }),
    ).rejects.toThrow(/no Daraja operator credentials configured/);
  });

  it('initiates a real reversal request on success, reusing the B2C operator credentials', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'daraja', B2C_SECRET);
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        String(url).includes('/oauth/v1/generate')
          ? new Response(JSON.stringify({ access_token: 'token-abc', expires_in: '3599' }), { status: 200 })
          : new Response(
              JSON.stringify({
                ConversationID: 'AG_20191219_00005797af5d7d76',
                OriginatorConversationID: '16740-34861180-2',
                ResponseCode: '0',
                ResponseDescription: 'Accept the service request successfully.',
              }),
              { status: 200 },
            ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await darajaGateway.initiateReversal({
      businessId: BUSINESS_ID,
      transactionId: 'NLJ7RT61SV',
      amountKes: 2500,
      remarks: 'Order refund',
      occasion: 'order-1',
    });

    expect(result).toEqual({
      originatorConversationId: '16740-34861180-2',
      conversationId: 'AG_20191219_00005797af5d7d76',
      responseCode: '0',
      responseDescription: 'Accept the service request successfully.',
    });
    const [, reversalCall] = fetchMock.mock.calls;
    expect(String(reversalCall[0])).toContain('/mpesa/reversal/v1/request');
    const body = JSON.parse(reversalCall[1].body);
    expect(body.Initiator).toBe('testapiuser');
    expect(body.SecurityCredential).toBe('encrypted-credential-base64');
    expect(body.CommandID).toBe('TransactionReversal');
    expect(body.TransactionID).toBe('NLJ7RT61SV');
    expect(body.Amount).toBe(2500);
    expect(body.ReceiverParty).toBe('174379');
    expect(body.RecieverIdentifierType).toBe('11');
    expect(body.ResultURL).toBe(`https://example.com/api/webhooks/daraja/${BUSINESS_ID}/reversal-result?key=test-webhook-secret`);
    expect(body.QueueTimeOutURL).toBe(`https://example.com/api/webhooks/daraja/${BUSINESS_ID}/reversal-timeout?key=test-webhook-secret`);
  });

  it('throws when Daraja rejects the reversal request', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'daraja', B2C_SECRET);
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        String(url).includes('/oauth/v1/generate')
          ? new Response(JSON.stringify({ access_token: 'token-abc', expires_in: '3599' }), { status: 200 })
          : new Response(JSON.stringify({ errorMessage: 'Invalid TransactionID' }), { status: 400 }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      darajaGateway.initiateReversal({
        businessId: BUSINESS_ID,
        transactionId: 'bad-receipt',
        amountKes: 2500,
        remarks: 'Order refund',
      }),
    ).rejects.toThrow(/Daraja reversal request failed/);
  });
});

describe('DarajaGateway.verifyReversalResult', () => {
  it('parses a successful reversal result', () => {
    const result = darajaGateway.verifyReversalResult({
      Result: {
        ResultType: 0,
        ResultCode: 0,
        ResultDesc: 'The service request is processed successfully.',
        OriginatorConversationID: '16740-34861180-2',
        ConversationID: 'AG_20191219_00005797af5d7d76',
        TransactionID: 'RJ34HAY7Q',
        ResultParameters: {
          ResultParameter: [
            { Key: 'Amount', Value: 2500 },
            { Key: 'TransactionCompletedDateTime', Value: '19.12.2019 11:45:50' },
          ],
        },
      },
    });

    expect(result).toEqual({
      originatorConversationId: '16740-34861180-2',
      conversationId: 'AG_20191219_00005797af5d7d76',
      resultCode: 0,
      resultDesc: 'The service request is processed successfully.',
      succeeded: true,
      transactionId: 'RJ34HAY7Q',
      amountKes: 2500,
      transactionCompletedAt: '19.12.2019 11:45:50',
    });
  });

  it('parses a failed reversal result without transaction fields', () => {
    const result = darajaGateway.verifyReversalResult({
      Result: {
        ResultType: 0,
        ResultCode: 2001,
        ResultDesc: 'The initiator information is invalid.',
        OriginatorConversationID: '16740-34861180-3',
        ConversationID: 'AG_20191219_00005797af5d7d77',
      },
    });

    expect(result.succeeded).toBe(false);
    expect(result.transactionId).toBeUndefined();
    expect(result.amountKes).toBeUndefined();
  });

  it('throws on a malformed payload missing Result', () => {
    expect(() => darajaGateway.verifyReversalResult({ unexpected: true })).toThrow(
      /Malformed Daraja reversal result/,
    );
  });
});

describe('testDarajaConnection', () => {
  beforeEach(() => {
    resetDarajaTokenCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves when Daraja accepts the OAuth credentials', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'daraja', SECRET);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ access_token: 'tok-1', expires_in: '3599' }), { status: 200 }),
      ),
    );

    await expect(testDarajaConnection(BUSINESS_ID)).resolves.toBeUndefined();
  });

  it('throws when Daraja rejects the OAuth credentials', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'daraja', SECRET);
    // withRetry retries a thrown failure — a fresh Response per call,
    // since a single Response instance's body can only be read once.
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response('Bad credentials', { status: 401 }))));

    await expect(testDarajaConnection(BUSINESS_ID)).rejects.toThrow(/Daraja OAuth failed/);
  });

  it('bypasses a cached token so the test always reflects the current credentials', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'daraja', SECRET);
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/oauth/v1/generate')) {
        return Promise.resolve(new Response(JSON.stringify({ access_token: 'tok-1', expires_in: '3599' }), { status: 200 }));
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            ResponseCode: '0',
            ResponseDescription: 'Success',
            MerchantRequestID: 'm-1',
            CheckoutRequestID: 'c-1',
            CustomerMessage: 'Success',
          }),
          { status: 200 },
        ),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    // Prime the cache via a normal call, then test again — a second
    // live OAuth request must still happen.
    await darajaGateway.initiateStkPush({
      businessId: BUSINESS_ID,
      phone: '254700000000',
      amountKes: 100,
      accountReference: 'ORDER-1',
      transactionDesc: 'test',
    });
    await testDarajaConnection(BUSINESS_ID);

    const oauthCalls = fetchMock.mock.calls.filter((call: unknown[]) => String(call[0]).includes('/oauth/v1/generate'));
    expect(oauthCalls.length).toBe(2);
  });
});
