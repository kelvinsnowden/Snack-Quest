import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  darajaGateway,
  resetDarajaTokenCache,
} from '@/lib/integrations/daraja/darajaGateway';
import { DarajaConfigError } from '@/lib/integrations/daraja/config';

const REQUIRED_ENV = {
  DARAJA_CONSUMER_KEY: 'test-key',
  DARAJA_CONSUMER_SECRET: 'test-secret',
  DARAJA_SHORTCODE: '174379',
  DARAJA_PASSKEY: 'test-passkey',
  DARAJA_CALLBACK_URL: 'https://example.com/api/webhooks/daraja',
};

function setEnv(vars: Record<string, string>) {
  for (const [key, value] of Object.entries(vars)) {
    process.env[key] = value;
  }
}

function clearDarajaEnv() {
  for (const key of Object.keys(REQUIRED_ENV)) {
    delete process.env[key];
  }
}

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
    clearDarajaEnv();
    resetDarajaTokenCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearDarajaEnv();
  });

  it('throws DarajaConfigError when credentials are not configured', async () => {
    await expect(
      darajaGateway.initiateStkPush({
        phone: '254700000000',
        amountKes: 500,
        accountReference: 'ORDER-1',
        transactionDesc: 'Snack Quest order',
      }),
    ).rejects.toBeInstanceOf(DarajaConfigError);
  });

  it('fetches a token then initiates the STK push on success', async () => {
    setEnv(REQUIRED_ENV);
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
    setEnv(REQUIRED_ENV);
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
        phone: 'not-a-phone',
        amountKes: 500,
        accountReference: 'ORDER-1',
        transactionDesc: 'Snack Quest order',
      }),
    ).rejects.toThrow(/Daraja STK push failed/);
  });

  it('reuses a cached token instead of re-fetching on a second call', async () => {
    setEnv(REQUIRED_ENV);
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
});
