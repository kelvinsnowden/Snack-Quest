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
  accountType: 'till' as const,
  // Shaped like a real Safaricom passkey (64 hex characters) rather
  // than a short placeholder — the preflight now blocks a passkey too
  // short to be one, having found a seven-character value in
  // production silently killing every push.
  passkey: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
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

  it('sends CustomerBuyGoodsOnline when the configured account is a Till (Buy Goods)', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'daraja', { ...SECRET, accountType: 'till' });
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        String(url).includes('/oauth/v1/generate')
          ? new Response(JSON.stringify({ access_token: 'token-abc', expires_in: '3599' }), { status: 200 })
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
      transactionDesc: 'Snack order',
    });

    const [, stkCall] = fetchMock.mock.calls;
    const body = JSON.parse(String(stkCall[1].body));
    expect(body.TransactionType).toBe('CustomerBuyGoodsOnline');
  });

  it('sends CustomerPayBillOnline when the configured account is a Paybill', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'daraja', { ...SECRET, accountType: 'paybill' });
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        String(url).includes('/oauth/v1/generate')
          ? new Response(JSON.stringify({ access_token: 'token-abc', expires_in: '3599' }), { status: 200 })
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
      transactionDesc: 'Snack order',
    });

    const [, stkCall] = fetchMock.mock.calls;
    const body = JSON.parse(String(stkCall[1].body));
    expect(body.TransactionType).toBe('CustomerPayBillOnline');
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
        originatorConversationId: 'test-origin-conv-id',
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
      originatorConversationId: 'test-origin-conv-id',
    });

    expect(result).toEqual({
      originatorConversationId: '16740-34861180-1',
      conversationId: 'AG_20191219_00005797af5d7d75f652',
      responseCode: '0',
      responseDescription: 'Accept the service request successfully.',
    });
    const [, b2cCall] = fetchMock.mock.calls;
    expect(String(b2cCall[0])).toContain('/mpesa/b2c/v3/paymentrequest');
    const body = JSON.parse(b2cCall[1].body);
    expect(body.OriginatorConversationID).toBe('test-origin-conv-id');
    expect(body.InitiatorName).toBe('testapiuser');
    expect(body.SecurityCredential).toBe('encrypted-credential-base64');
    // Safaricom's real B2C v3 field is spelled "Occassion" — verified,
    // not a typo, see darajaGateway.ts's own comment.
    expect(body.Occassion).toBe('');
    expect(body.ResultURL).toBe(`https://example.com/api/webhooks/daraja/${BUSINESS_ID}~test-webhook-secret/b2c-result`);
    expect(body.QueueTimeOutURL).toBe(`https://example.com/api/webhooks/daraja/${BUSINESS_ID}~test-webhook-secret/b2c-timeout`);
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
        originatorConversationId: 'test-origin-conv-id',
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
    expect(body.ResultURL).toBe(`https://example.com/api/webhooks/daraja/${BUSINESS_ID}~test-webhook-secret/reversal-result`);
    expect(body.QueueTimeOutURL).toBe(`https://example.com/api/webhooks/daraja/${BUSINESS_ID}~test-webhook-secret/reversal-timeout`);
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

describe('DarajaGateway.queryTransactionStatus', () => {
  beforeEach(() => {
    resetDarajaTokenCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('queries the real Transaction Status endpoint by OriginatorConversationID, reusing B2C operator credentials', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'daraja', B2C_SECRET);
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        String(url).includes('/oauth/v1/generate')
          ? new Response(JSON.stringify({ access_token: 'token-abc', expires_in: '3599' }), { status: 200 })
          : new Response(
              JSON.stringify({
                ConversationID: 'AG_query_conv',
                OriginatorConversationID: 'query-orig-1',
                ResponseCode: '0',
                ResponseDescription: 'Accept the service request successfully.',
              }),
              { status: 200 },
            ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const ack = await darajaGateway.queryTransactionStatus({
      businessId: BUSINESS_ID,
      originatorConversationId: 'original-txn-orig-id',
      remarks: 'Reconciliation check',
      occasion: 'withdrawal-1',
    });

    expect(ack).toEqual({
      originatorConversationId: 'query-orig-1',
      conversationId: 'AG_query_conv',
      responseCode: '0',
      responseDescription: 'Accept the service request successfully.',
    });
    const [, queryCall] = fetchMock.mock.calls;
    expect(String(queryCall[0])).toContain('/mpesa/transactionstatus/v1/query');
    const body = JSON.parse(queryCall[1].body);
    expect(body.CommandID).toBe('TransactionStatusQuery');
    expect(body.OriginatorConversationID).toBe('original-txn-orig-id');
    expect(body.Initiator).toBe('testapiuser');
    expect(body.SecurityCredential).toBe('encrypted-credential-base64');
    expect(body.ResultURL).toBe(`https://example.com/api/webhooks/daraja/${BUSINESS_ID}~test-webhook-secret/transaction-status-result`);
    expect(body.QueueTimeOutURL).toBe(`https://example.com/api/webhooks/daraja/${BUSINESS_ID}~test-webhook-secret/transaction-status-timeout`);
  });

  it('throws when Daraja rejects the query request', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'daraja', B2C_SECRET);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) =>
        Promise.resolve(
          String(url).includes('/oauth/v1/generate')
            ? new Response(JSON.stringify({ access_token: 'token-abc', expires_in: '3599' }), { status: 200 })
            : new Response(JSON.stringify({ errorMessage: 'Invalid access token' }), { status: 401 }),
        ),
      ),
    );

    await expect(
      darajaGateway.queryTransactionStatus({
        businessId: BUSINESS_ID,
        originatorConversationId: 'original-txn-orig-id',
        remarks: 'Reconciliation check',
      }),
    ).rejects.toThrow(/Daraja transaction status query failed/);
  });
});

describe('DarajaGateway.verifyTransactionStatusResult', () => {
  it('reads TransactionStatus verbatim on an unambiguous Completed result', () => {
    const result = darajaGateway.verifyTransactionStatusResult({
      Result: {
        ResultType: 0,
        ResultCode: 0,
        ResultDesc: 'The service request has been accepted successfully.',
        OriginatorConversationID: 'query-orig-1',
        ConversationID: 'AG_query_conv',
        TransactionID: 'STATUSCONFIRMED1',
        ResultParameters: {
          ResultParameter: [
            { Key: 'TransactionStatus', Value: 'Completed' },
            { Key: 'Amount', Value: 2000 },
            { Key: 'FinalisedTime', Value: '20231219114550' },
          ],
        },
      },
    });

    expect(result).toEqual({
      originatorConversationId: 'query-orig-1',
      conversationId: 'AG_query_conv',
      resultCode: 0,
      resultDesc: 'The service request has been accepted successfully.',
      transactionStatus: 'Completed',
      transactionId: 'STATUSCONFIRMED1',
      amountKes: 2000,
      transactionCompletedAt: '20231219114550',
    });
  });

  it('never fabricates a transactionStatus when the query itself failed', () => {
    const result = darajaGateway.verifyTransactionStatusResult({
      Result: {
        ResultType: 0,
        ResultCode: 2,
        ResultDesc: 'Transaction not found.',
        OriginatorConversationID: 'query-orig-2',
        ConversationID: 'AG_query_conv_2',
      },
    });

    expect(result.transactionStatus).toBeUndefined();
    expect(result.transactionId).toBeUndefined();
  });

  it('throws on a malformed payload missing Result', () => {
    expect(() => darajaGateway.verifyTransactionStatusResult({ unexpected: true })).toThrow(
      /Malformed Daraja transaction status result/,
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

  /**
   * Test Connection makes three calls now: the OAuth token, a GET
   * against the configured callback URL, and a credentials probe
   * against the STK query endpoint. A token alone proves the consumer
   * key and secret are a valid pair and nothing else — it was reporting
   * success on an account where every checkout was silently failing.
   *
   * `callback` defaults to the 405 a healthy POST-only callback route
   * answers a GET with, so a test about credentials is not accidentally
   * also a test about reachability.
   *
   * A fresh Response per call, because a body can only be read once.
   */
  function stubDaraja(
    probeBody: string,
    probeStatus = 500,
    callback: { status: number; location?: string } = { status: 405 },
  ) {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/oauth/v1/generate')) {
        return Promise.resolve(
          new Response(JSON.stringify({ access_token: 'tok-1', expires_in: '3599' }), { status: 200 }),
        );
      }
      if (url.includes('/api/webhooks/daraja/')) {
        return Promise.resolve(
          new Response(null, {
            status: callback.status,
            headers: callback.location ? { location: callback.location } : undefined,
          }),
        );
      }
      return Promise.resolve(new Response(probeBody, { status: probeStatus }));
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  /** Being told the (deliberately impossible) transaction is unknown means the shortcode and passkey were accepted, which is the whole question. */
  const PROBE_CREDENTIALS_OK = JSON.stringify({
    errorCode: '500.001.1001',
    errorMessage: 'Invalid CheckoutRequestID',
  });

  it('resolves when the credentials are accepted and the configuration is sound', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'daraja', SECRET);
    stubDaraja(PROBE_CREDENTIALS_OK);

    await expect(testDarajaConnection(BUSINESS_ID)).resolves.toBeUndefined();
  });

  it('probes the credentials without initiating anything that moves money', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'daraja', SECRET);
    const fetchMock = stubDaraja(PROBE_CREDENTIALS_OK);

    await testDarajaConnection(BUSINESS_ID);

    const urls = fetchMock.mock.calls.map(([url]) => url as string);
    expect(urls.some((url) => url.includes('/mpesa/stkpushquery/v1/query'))).toBe(true);
    expect(urls.some((url) => url.includes('/stkpush/v1/processrequest'))).toBe(false);
    expect(urls.some((url) => url.includes('/b2c/'))).toBe(false);
  });

  /**
   * The failure this whole change exists for: Safaricom accepts the
   * push, returns a CheckoutRequestID, and delivers no prompt. The only
   * place that is visible before a customer hits it is here.
   */
  it('fails when M-Pesa rejects the shortcode and passkey together', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'daraja', SECRET);
    stubDaraja(JSON.stringify({ ResultCode: 4999, ResultDesc: 'Wrong credentials' }));

    await expect(testDarajaConnection(BUSINESS_ID)).rejects.toThrow(/passkey does not belong to this shortcode/);
  });

  /**
   * The other silent killer, and a real one: every credential correct,
   * every push accepted, money arriving — and the callback URL on a
   * host that 308s to another. Safaricom does not follow redirects, so
   * the edge answered every callback and the app was never invoked.
   * Nothing else in this test would have noticed: the credentials pass,
   * because the credentials were never the problem.
   */
  it('fails when the callback URL redirects instead of answering', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'daraja', SECRET);
    stubDaraja(PROBE_CREDENTIALS_OK, 500, {
      status: 308,
      location: `https://www.example.com/api/webhooks/daraja/${BUSINESS_ID}`,
    });

    await expect(testDarajaConnection(BUSINESS_ID)).rejects.toThrow(/redirects instead of answering/);
  });

  it('names the host to move the callback URL to, without leaking the webhook secret', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'daraja', {
      ...SECRET,
      webhookSecret: 'super-secret-value',
    });
    stubDaraja(PROBE_CREDENTIALS_OK, 500, {
      status: 308,
      // A real redirect carries the whole path through, secret included.
      location: `https://www.example.com/api/webhooks/daraja/${BUSINESS_ID}~super-secret-value`,
    });

    const error = await testDarajaConnection(BUSINESS_ID).catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('www.example.com');
    expect((error as Error).message).not.toContain('super-secret-value');
  });

  /** Follows redirects by default, which would land on the healthy host and pass the very configuration this catches. */
  it('asks the callback URL not to follow redirects', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'daraja', SECRET);
    const fetchMock = stubDaraja(PROBE_CREDENTIALS_OK);

    await testDarajaConnection(BUSINESS_ID);

    const call = fetchMock.mock.calls.find(([url]) => (url as string).includes('/api/webhooks/daraja/'));
    expect(call).toBeDefined();
    expect(call?.[1]).toMatchObject({ method: 'GET', redirect: 'manual' });
  });

  /** An unreachable callback URL is money taken and never confirmed, so it fails the test rather than warning. */
  it('fails when the callback URL cannot be reached at all', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'daraja', SECRET);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/oauth/v1/generate')) {
          return Promise.resolve(
            new Response(JSON.stringify({ access_token: 'tok-1', expires_in: '3599' }), { status: 200 }),
          );
        }
        if (url.includes('/api/webhooks/daraja/')) {
          return Promise.reject(new Error('getaddrinfo ENOTFOUND example.com'));
        }
        return Promise.resolve(new Response(PROBE_CREDENTIALS_OK, { status: 500 }));
      }),
    );

    await expect(testDarajaConnection(BUSINESS_ID)).rejects.toThrow(/could not be reached/);
  });

  it('fails on a sandbox passkey in production without needing to ask Safaricom', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'daraja', {
      ...SECRET,
      env: 'production' as const,
      shortcode: '4346089',
      passkey: 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919',
    });
    const fetchMock = stubDaraja(PROBE_CREDENTIALS_OK);

    await expect(testDarajaConnection(BUSINESS_ID)).rejects.toThrow(/sandbox passkey/i);
    // No point asking Safaricom about credentials already known to be wrong.
    expect(fetchMock.mock.calls.some(([url]) => (url as string).includes('/stkpushquery/'))).toBe(false);
  });

  /** A warning is worth logging and not worth failing over — failing a working account would repeat the original problem in the other direction. */
  it('still passes when the only finding is a warning', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'daraja', {
      ...SECRET,
      passkey: 'not-the-shape-safaricom-issues',
    });
    stubDaraja(PROBE_CREDENTIALS_OK);

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

/**
 * § Buy Goods Head Office number.
 *
 * Safaricom's STK Push carries two shortcodes: `BusinessShortCode`
 * identifies the organisation and is what the password is hashed
 * against, `PartyB` receives the funds. A Paybill uses one number for
 * both. A Buy Goods till usually does not — Go Live issues a Head
 * Office number alongside it.
 *
 * Sending the till as both is *accepted* by Safaricom, which returns a
 * real CheckoutRequestID, and then no prompt is delivered and no
 * callback ever arrives. It is a silent failure, which is exactly why
 * it needs a test.
 */
describe('DarajaGateway.initiateStkPush — Buy Goods shortcodes', () => {
  function acceptingFetch() {
    return vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        String(url).includes('/oauth/v1/generate')
          ? new Response(JSON.stringify({ access_token: 'token-abc', expires_in: '3599' }), { status: 200 })
          : new Response(
              JSON.stringify({
                MerchantRequestID: 'm-1',
                CheckoutRequestID: 'ws_CO_1',
                ResponseCode: '0',
                ResponseDescription: 'Success',
                CustomerMessage: 'Success',
              }),
              { status: 200 },
            ),
      ),
    );
  }

  async function pushWith(secret: Record<string, unknown>) {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'daraja', secret as never);
    const fetchMock = acceptingFetch();
    vi.stubGlobal('fetch', fetchMock);
    await darajaGateway.initiateStkPush({
      businessId: BUSINESS_ID,
      phone: '254712345678',
      amountKes: 1750,
      accountReference: 'SQ-1',
      transactionDesc: 'Snack Quest box',
    });
    const pushCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/stkpush/v1/processrequest'));
    return JSON.parse(String(pushCall![1].body));
  }

  it('sends the Head Office number as BusinessShortCode and the till as PartyB', async () => {
    const body = await pushWith({ ...SECRET, shortcode: '4346089', headOfficeShortcode: '4346000' });

    expect(body.BusinessShortCode).toBe('4346000');
    expect(body.PartyB).toBe('4346089');
    expect(body.TransactionType).toBe('CustomerBuyGoodsOnline');
  });

  /** The subtler half: Safaricom validates the password against whatever was sent as BusinessShortCode. */
  it('hashes the password against the Head Office number, not the till', async () => {
    const timestampOf = (b: Record<string, string>) => b.Timestamp;
    const body = await pushWith({ ...SECRET, shortcode: '4346089', headOfficeShortcode: '4346000' });

    const decoded = Buffer.from(body.Password, 'base64').toString('utf8');
    expect(decoded).toBe(`4346000${SECRET.passkey}${timestampOf(body)}`);
    expect(decoded.startsWith('4346089')).toBe(false);
  });

  it('uses the one shortcode for both when no Head Office number is set', async () => {
    const body = await pushWith({ ...SECRET, shortcode: '174379' });

    expect(body.BusinessShortCode).toBe('174379');
    expect(body.PartyB).toBe('174379');
    expect(Buffer.from(body.Password, 'base64').toString('utf8')).toBe(
      `174379${SECRET.passkey}${body.Timestamp}`,
    );
  });

  it('leaves a Paybill on one shortcode even if a Head Office number is present', async () => {
    const body = await pushWith({
      ...SECRET,
      accountType: 'paybill',
      shortcode: '174379',
      headOfficeShortcode: '  ',
    });

    expect(body.BusinessShortCode).toBe('174379');
    expect(body.PartyB).toBe('174379');
    expect(body.TransactionType).toBe('CustomerPayBillOnline');
  });
});
