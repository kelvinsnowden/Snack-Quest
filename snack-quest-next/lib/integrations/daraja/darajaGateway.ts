import 'server-only';

import { getDarajaConfig, type DarajaConfig } from './config';
import { withRetry } from '../shared/withRetry';
import { withCircuitBreaker } from '../shared/withCircuitBreaker';
import type { PaymentCallbackResult, PaymentGateway, StkPushResult } from '../types';

const GATEWAY_NAME = 'daraja';

// Keyed by businessId — each tenant has its own consumerKey/secret and
// therefore its own token; a single shared cache would leak one
// tenant's token into another's requests.
const tokenCache = new Map<string, { value: string; expiresAt: number }>();

/** Reset between test runs / after a credential change. Not used in production code paths. */
export function resetDarajaTokenCache(): void {
  tokenCache.clear();
}

async function fetchAccessToken(businessId: string, config: DarajaConfig): Promise<string> {
  const cached = tokenCache.get(businessId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const credentials = Buffer.from(
    `${config.consumerKey}:${config.consumerSecret}`,
  ).toString('base64');

  // OAuth token fetch has no side effects — safe to retry on transient
  // failure, unlike the STK push initiation below.
  const data = await withCircuitBreaker(`${GATEWAY_NAME}:${businessId}`, () =>
    withRetry(async () => {
      const response = await fetch(
        `${config.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
        { headers: { Authorization: `Basic ${credentials}` } },
      );
      if (!response.ok) {
        throw new Error(
          `Daraja OAuth failed: ${response.status} ${await response.text()}`,
        );
      }
      return (await response.json()) as {
        access_token: string;
        expires_in: string;
      };
    }),
  );

  const entry = {
    value: data.access_token,
    // Refresh a minute early rather than racing the provider's own expiry.
    expiresAt: Date.now() + (Number(data.expires_in) - 60) * 1000,
  };
  tokenCache.set(businessId, entry);
  return entry.value;
}

function buildPassword(config: DarajaConfig, timestamp: string): string {
  return Buffer.from(`${config.shortcode}${config.passkey}${timestamp}`).toString(
    'base64',
  );
}

function timestampNow(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    now.getFullYear().toString() +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds())
  );
}

interface StkCallbackMetadataItem {
  Name: string;
  Value: string | number;
}

interface RawDarajaCallback {
  Body?: {
    stkCallback?: {
      MerchantRequestID: string;
      CheckoutRequestID: string;
      ResultCode: number;
      ResultDesc: string;
      CallbackMetadata?: { Item: StkCallbackMetadataItem[] };
    };
  };
}

class DarajaGateway implements PaymentGateway {
  async initiateStkPush(input: {
    businessId: string;
    phone: string;
    amountKes: number;
    accountReference: string;
    transactionDesc: string;
  }): Promise<StkPushResult> {
    const config = await getDarajaConfig(input.businessId);
    const accessToken = await fetchAccessToken(input.businessId, config);
    const timestamp = timestampNow();
    const password = buildPassword(config, timestamp);

    // Deliberately NOT wrapped in withRetry: Daraja's STK push has no
    // dedup key, so a blind retry after a network failure risks
    // sending a second real prompt to the customer's phone. Whether to
    // retry after an ambiguous failure is a decision for PaymentService
    // (§7), which has payment-intent state to reason about whether a
    // prior attempt actually reached Safaricom — this Gateway doesn't.
    return withCircuitBreaker(`${GATEWAY_NAME}:${input.businessId}`, async () => {
      const response = await fetch(
        `${config.baseUrl}/mpesa/stkpush/v1/processrequest`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            BusinessShortCode: config.shortcode,
            Password: password,
            Timestamp: timestamp,
            TransactionType: 'CustomerPayBillOnline',
            Amount: Math.round(input.amountKes),
            PartyA: input.phone,
            PartyB: config.shortcode,
            PhoneNumber: input.phone,
            CallBackURL: config.callbackUrl,
            AccountReference: input.accountReference,
            TransactionDesc: input.transactionDesc,
          }),
        },
      );

      const data = (await response.json()) as Record<string, unknown>;
      if (!response.ok || data.ResponseCode !== '0') {
        throw new Error(
          `Daraja STK push failed: ${
            data.errorMessage ?? data.ResponseDescription ?? response.status
          }`,
        );
      }

      return {
        merchantRequestId: String(data.MerchantRequestID),
        checkoutRequestId: String(data.CheckoutRequestID),
        responseCode: String(data.ResponseCode),
        responseDescription: String(data.ResponseDescription),
        customerMessage: String(data.CustomerMessage),
      };
    });
  }

  verifyCallback(payload: unknown): PaymentCallbackResult {
    const callback = (payload as RawDarajaCallback).Body?.stkCallback;
    if (!callback) {
      throw new Error(
        'Malformed Daraja callback payload: missing Body.stkCallback',
      );
    }

    const items = callback.CallbackMetadata?.Item ?? [];
    const findItem = (name: string): string | number | undefined =>
      items.find((item) => item.Name === name)?.Value;

    const succeeded = callback.ResultCode === 0;

    return {
      checkoutRequestId: callback.CheckoutRequestID,
      merchantRequestId: callback.MerchantRequestID,
      resultCode: callback.ResultCode,
      resultDesc: callback.ResultDesc,
      amountKes: succeeded ? Number(findItem('Amount')) : undefined,
      mpesaReceiptNumber: succeeded
        ? String(findItem('MpesaReceiptNumber'))
        : undefined,
      transactionDate: succeeded
        ? String(findItem('TransactionDate'))
        : undefined,
      phoneNumber: succeeded ? String(findItem('PhoneNumber')) : undefined,
    };
  }
}

export const darajaGateway: PaymentGateway = new DarajaGateway();
