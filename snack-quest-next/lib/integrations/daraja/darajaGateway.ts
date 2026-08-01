import 'server-only';

import { getDarajaConfig, getDarajaB2CConfig, getDarajaReversalConfig, type DarajaConfig } from './config';
import { withRetry } from '../shared/withRetry';
import { withCircuitBreaker } from '../shared/withCircuitBreaker';
import type {
  B2CPaymentResult,
  B2CResultCallback,
  PaymentCallbackResult,
  PaymentGateway,
  PayoutGateway,
  RefundGateway,
  ReversalResult,
  ReversalResultCallback,
  StkPushResult,
  StkQueryResult,
} from '../types';

const GATEWAY_NAME = 'daraja';

// Keyed by businessId — each tenant has its own consumerKey/secret and
// therefore its own token; a single shared cache would leak one
// tenant's token into another's requests.
const tokenCache = new Map<string, { value: string; expiresAt: number }>();

/** Reset between test runs / after a credential change. Not used in production code paths. */
export function resetDarajaTokenCache(): void {
  tokenCache.clear();
}

async function fetchAccessToken(
  businessId: string,
  config: Pick<DarajaConfig, 'consumerKey' | 'consumerSecret' | 'baseUrl'>,
  options: { forceRefresh?: boolean } = {},
): Promise<string> {
  const cached = tokenCache.get(businessId);
  if (!options.forceRefresh && cached && cached.expiresAt > Date.now()) {
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

/**
 * "Test Connection" (§ Integration Portal) — real, side-effect-free:
 * the OAuth token fetch above is the one Daraja call with no
 * transactional consequence, so this forces a fresh (non-cached)
 * attempt and reports success/failure. Never initiates an STK push,
 * B2C payout, or reversal — those all move real money.
 */
export async function testDarajaConnection(businessId: string): Promise<void> {
  const config = await getDarajaConfig(businessId);
  await fetchAccessToken(businessId, config, { forceRefresh: true });
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

interface B2CResultParameter {
  Key: string;
  Value: string | number;
}

// Shared shape: B2C and Transaction Reversal results both come back as
// the same `Result` envelope (ResultCode/ResultDesc/conversation ids/
// TransactionID/ResultParameters) — one interface, reused by
// `verifyB2CResult` and `verifyReversalResult` below, not two
// structurally-identical copies.
interface RawDarajaB2CResult {
  Result?: {
    ResultCode: number;
    ResultDesc: string;
    OriginatorConversationID: string;
    ConversationID: string;
    TransactionID?: string;
    ResultParameters?: { ResultParameter: B2CResultParameter[] };
  };
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

class DarajaGateway implements PaymentGateway, PayoutGateway, RefundGateway {
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

  /**
   * M-Pesa Express Query (§ Daraja Production Integration Verification
   * Audit §2.4/§7) — a fallback for a `CheckoutRequestID` whose real
   * callback never arrived. Same request-signing as `initiateStkPush`
   * (fresh timestamp + password each call, per Safaricom's own
   * requirement), but unlike a push, a *query* has no side effect —
   * safe to retry on a transient network failure, unlike every other
   * money-moving method in this Gateway.
   */
  async queryStkStatus(input: {
    businessId: string;
    checkoutRequestId: string;
  }): Promise<StkQueryResult> {
    const config = await getDarajaConfig(input.businessId);
    const accessToken = await fetchAccessToken(input.businessId, config);
    const timestamp = timestampNow();
    const password = buildPassword(config, timestamp);

    return withCircuitBreaker(`${GATEWAY_NAME}:${input.businessId}`, () =>
      withRetry(async () => {
        const response = await fetch(
          `${config.baseUrl}/mpesa/stkpushquery/v1/query`,
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
              CheckoutRequestID: input.checkoutRequestId,
            }),
          },
        );

        const data = (await response.json()) as Record<string, unknown>;
        if (!response.ok) {
          throw new Error(
            `Daraja STK query failed: ${data.errorMessage ?? response.status}`,
          );
        }

        return {
          merchantRequestId: String(data.MerchantRequestID),
          checkoutRequestId: String(data.CheckoutRequestID),
          responseCode: String(data.ResponseCode),
          responseDescription: String(data.ResponseDescription),
          resultCode: Number(data.ResultCode),
          resultDesc: String(data.ResultDesc),
        };
      }),
    );
  }

  /**
   * Initiates a real M-Pesa B2C disbursement (`CommandID: BusinessPayment`
   * — a business paying an individual, not a salary or promotion
   * payout, matching a withdrawal). Same non-retry discipline as
   * `initiateStkPush`: Safaricom has no dedup key for this request, so
   * a blind retry after a network failure risks paying out twice.
   * `WithdrawalService` owns the decision of what to do after an
   * ambiguous failure, not this Gateway.
   */
  async initiateB2CPayment(input: {
    businessId: string;
    phone: string;
    amountKes: number;
    remarks: string;
    occasion?: string;
  }): Promise<B2CPaymentResult> {
    const config = await getDarajaB2CConfig(input.businessId);
    const accessToken = await fetchAccessToken(input.businessId, config);

    return withCircuitBreaker(`${GATEWAY_NAME}-b2c:${input.businessId}`, async () => {
      const response = await fetch(`${config.baseUrl}/mpesa/b2c/v1/paymentrequest`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          InitiatorName: config.initiatorName,
          SecurityCredential: config.securityCredential,
          CommandID: 'BusinessPayment',
          Amount: Math.round(input.amountKes),
          PartyA: config.shortcode,
          PartyB: input.phone,
          Remarks: input.remarks,
          QueueTimeOutURL: config.queueTimeoutUrl,
          ResultURL: config.resultUrl,
          Occasion: input.occasion ?? '',
        }),
      });

      const data = (await response.json()) as Record<string, unknown>;
      if (!response.ok || data.ResponseCode !== '0') {
        throw new Error(
          `Daraja B2C payment request failed: ${
            data.errorMessage ?? data.ResponseDescription ?? response.status
          }`,
        );
      }

      return {
        originatorConversationId: String(data.OriginatorConversationID),
        conversationId: String(data.ConversationID),
        responseCode: String(data.ResponseCode),
        responseDescription: String(data.ResponseDescription),
      };
    });
  }

  verifyB2CResult(payload: unknown): B2CResultCallback {
    const result = (payload as RawDarajaB2CResult).Result;
    if (!result) {
      throw new Error('Malformed Daraja B2C result payload: missing Result');
    }

    const params = result.ResultParameters?.ResultParameter ?? [];
    const findParam = (key: string): string | number | undefined =>
      params.find((p) => p.Key === key)?.Value;

    const succeeded = result.ResultCode === 0;

    return {
      originatorConversationId: result.OriginatorConversationID,
      conversationId: result.ConversationID,
      resultCode: result.ResultCode,
      resultDesc: result.ResultDesc,
      succeeded,
      transactionId: succeeded ? result.TransactionID : undefined,
      amountKes: succeeded ? Number(findParam('TransactionAmount')) : undefined,
      transactionCompletedAt: succeeded ? String(findParam('TransactionCompletedDateTime')) : undefined,
    };
  }
  /**
   * Initiates a real M-Pesa Transaction Reversal (`CommandID:
   * TransactionReversal`) — reverses a specific prior C2B transaction
   * by its own M-Pesa receipt number, not a phone-number+amount payout
   * like B2C. `RecieverIdentifierType: '11'` (organization shortcode)
   * is the fixed value Safaricom's API expects for a reversal back to
   * the paybill's own shortcode. Same non-retry discipline as
   * `initiateStkPush`/`initiateB2CPayment`: no dedup key, so a blind
   * retry after a network failure risks reversing the same transaction
   * twice. `RefundService` owns what to do after an ambiguous failure.
   */
  async initiateReversal(input: {
    businessId: string;
    transactionId: string;
    amountKes: number;
    remarks: string;
    occasion?: string;
  }): Promise<ReversalResult> {
    const config = await getDarajaReversalConfig(input.businessId);
    const accessToken = await fetchAccessToken(input.businessId, config);

    return withCircuitBreaker(`${GATEWAY_NAME}-reversal:${input.businessId}`, async () => {
      const response = await fetch(`${config.baseUrl}/mpesa/reversal/v1/request`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          Initiator: config.initiatorName,
          SecurityCredential: config.securityCredential,
          CommandID: 'TransactionReversal',
          TransactionID: input.transactionId,
          Amount: Math.round(input.amountKes),
          ReceiverParty: config.shortcode,
          RecieverIdentifierType: '11',
          ResultURL: config.resultUrl,
          QueueTimeOutURL: config.queueTimeoutUrl,
          Remarks: input.remarks,
          Occasion: input.occasion ?? '',
        }),
      });

      const data = (await response.json()) as Record<string, unknown>;
      if (!response.ok || data.ResponseCode !== '0') {
        throw new Error(
          `Daraja reversal request failed: ${
            data.errorMessage ?? data.ResponseDescription ?? response.status
          }`,
        );
      }

      return {
        originatorConversationId: String(data.OriginatorConversationID),
        conversationId: String(data.ConversationID),
        responseCode: String(data.ResponseCode),
        responseDescription: String(data.ResponseDescription),
      };
    });
  }

  verifyReversalResult(payload: unknown): ReversalResultCallback {
    const result = (payload as RawDarajaB2CResult).Result;
    if (!result) {
      throw new Error('Malformed Daraja reversal result payload: missing Result');
    }

    const params = result.ResultParameters?.ResultParameter ?? [];
    const findParam = (key: string): string | number | undefined =>
      params.find((p) => p.Key === key)?.Value;

    const succeeded = result.ResultCode === 0;

    return {
      originatorConversationId: result.OriginatorConversationID,
      conversationId: result.ConversationID,
      resultCode: result.ResultCode,
      resultDesc: result.ResultDesc,
      succeeded,
      transactionId: succeeded ? result.TransactionID : undefined,
      amountKes: succeeded ? Number(findParam('Amount')) : undefined,
      transactionCompletedAt: succeeded ? String(findParam('TransactionCompletedDateTime')) : undefined,
    };
  }
}

export const darajaGateway: PaymentGateway & PayoutGateway & RefundGateway = new DarajaGateway();
