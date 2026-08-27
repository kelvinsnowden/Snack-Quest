import 'server-only';

import {
  getDarajaConfig,
  getDarajaB2CConfig,
  getDarajaReversalConfig,
  getDarajaTransactionStatusConfig,
  type DarajaConfig,
} from './config';
import { withRetry } from '../shared/withRetry';
import { withCircuitBreaker } from '../shared/withCircuitBreaker';
import {
  formatPreflightFailure,
  inspectDarajaConfig,
  interpretCallbackProbe,
  interpretStkCredentialProbe,
  type DarajaPreflightIssue,
} from './preflight';
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
  TransactionStatusQueryAck,
  TransactionStatusResult,
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
 * A `CheckoutRequestID` in Safaricom's format that cannot correspond to
 * a real transaction — the zeroes are not a value their sequence
 * produces. Used to ask the query endpoint a question whose answer is
 * about the credentials rather than about any customer's payment.
 */
const PROBE_CHECKOUT_REQUEST_ID = 'ws_CO_00000000000000000000000000';

/**
 * Asks Safaricom to validate this shortcode and passkey, without
 * charging anyone.
 *
 * The STK *query* endpoint checks `BusinessShortCode` and `Password`
 * before it looks up the `CheckoutRequestID`, so querying an id that
 * cannot exist separates "these credentials are wrong" from "that
 * transaction is unknown". Nothing is initiated and no prompt is sent
 * — this is the closest thing to a dry run that Daraja offers.
 */
async function probeStkCredentials(
  businessId: string,
  config: DarajaConfig,
  accessToken: string,
): Promise<DarajaPreflightIssue | null> {
  const timestamp = timestampNow();
  const response = await fetch(`${config.baseUrl}/mpesa/stkpushquery/v1/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      BusinessShortCode: config.businessShortcode,
      Password: buildPassword(config, timestamp),
      Timestamp: timestamp,
      CheckoutRequestID: PROBE_CHECKOUT_REQUEST_ID,
    }),
  });

  return interpretStkCredentialProbe({ ok: response.ok, body: await response.text() });
}

/** Long enough for a cold serverless start, short enough that Test Connection still feels like a button. */
const CALLBACK_PROBE_TIMEOUT_MS = 8000;

/**
 * Asks the configured callback URL whether Safaricom could actually
 * reach it — see `interpretCallbackProbe` for why this is worth a
 * network call, and why it is a GET.
 *
 * `redirect: 'manual'` is the entire point. `fetch` follows redirects
 * by default, so a URL that 308s to another host would come back as a
 * healthy 405 from wherever it landed and this check would pass the
 * exact configuration it exists to catch.
 */
async function probeCallbackReachability(config: DarajaConfig): Promise<DarajaPreflightIssue | null> {
  try {
    const response = await fetch(config.callbackUrl, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(CALLBACK_PROBE_TIMEOUT_MS),
    });

    // Host only, never the URL: `config.callbackUrl` carries the
    // webhook secret in its path, and a redirect's `Location` carries
    // it straight through — this string ends up in `lastTestError`, on
    // screen, and in logs.
    let redirectedToHost: string | null = null;
    const location = response.headers.get('location');
    if (location) {
      try {
        redirectedToHost = new URL(location, config.callbackUrl).host;
      } catch {
        redirectedToHost = null;
      }
    }

    return interpretCallbackProbe({ status: response.status, redirectedToHost, error: null });
  } catch (error) {
    return interpretCallbackProbe({
      status: null,
      redirectedToHost: null,
      error: error instanceof Error ? error.message : 'unknown error',
    });
  }
}

/**
 * "Test Connection" (§ Integration Portal) — real, side-effect-free,
 * and no longer misleadingly narrow.
 *
 * It used to fetch an OAuth token and call that a pass. A token proves
 * the consumer key and secret are a valid pair and nothing else: not
 * the shortcode, not the passkey, not that a prompt can reach a phone.
 * So it reported "connection succeeded" on an account where every
 * checkout was failing — which is worse than no button at all, because
 * it moved the search away from what was actually broken.
 *
 * Now it checks, in order: the token; the stored configuration
 * (`inspectDarajaConfig`); whether Safaricom could actually reach the
 * callback URL; and the shortcode/passkey pairing, live, against
 * Safaricom. Still never initiates an STK push, B2C payout or reversal
 * — those all move real money.
 *
 * The callback probe is the half that answers "did the money arrive
 * but the order never appear?", which the credential checks cannot:
 * credentials being perfect is exactly the state a business is in when
 * pushes succeed and callbacks are being swallowed before they reach
 * the app.
 *
 * Warnings are reported without failing the test. Only a blocker
 * throws, because a Test Connection that fails a working configuration
 * would repeat the original sin in the other direction.
 */
export async function testDarajaConnection(businessId: string): Promise<void> {
  const config = await getDarajaConfig(businessId);
  const accessToken = await fetchAccessToken(businessId, config, { forceRefresh: true });

  const issues = inspectDarajaConfig(config);

  // Skipped when the URL is already known to be malformed, unreachable
  // or plain HTTP — probing it would only restate what
  // `inspectCallbackUrl` just said, in vaguer terms.
  if (!issues.some((issue) => issue.field === 'callbackUrl')) {
    const callbackIssue = await probeCallbackReachability(config);
    if (callbackIssue) {
      issues.push(callbackIssue);
    }
  }

  // Only worth asking Safaricom if the credentials are at least
  // well-formed — probing with a shortcode that cannot be one produces
  // an error about the shortcode, which is already known.
  if (!issues.some((issue) => issue.severity === 'blocker')) {
    const probe = await probeStkCredentials(businessId, config, accessToken);
    if (probe) {
      issues.push(probe);
    }
  }

  if (issues.some((issue) => issue.severity === 'blocker')) {
    throw new Error(formatPreflightFailure(issues));
  }
  if (issues.length > 0) {
    console.warn(`Daraja preflight warnings for ${businessId}: ${formatPreflightFailure(issues)}`);
  }
}

/**
 * Built from `businessShortcode`, not `shortcode`.
 *
 * Safaricom validates the password against whatever is sent as
 * `BusinessShortCode`, so for a Buy Goods till whose Head Office number
 * differs, hashing the till instead produces a password that does not
 * match the request — the subtlest half of the same bug the two-field
 * split exists to fix.
 */
function buildPassword(config: DarajaConfig, timestamp: string): string {
  return Buffer.from(`${config.businessShortcode}${config.passkey}${timestamp}`).toString(
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

// Shared shape: B2C, Transaction Reversal, and Transaction Status Query
// results all come back as the same `Result` envelope (ResultCode/
// ResultDesc/conversation ids/TransactionID/ResultParameters) — one
// interface, reused by `verifyB2CResult`, `verifyReversalResult`, and
// `verifyTransactionStatusResult` below, not three
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
            // Identifies the organisation. Equal to `shortcode` for a
            // Paybill; the Head Office number for a Buy Goods till.
            BusinessShortCode: config.businessShortcode,
            Password: password,
            Timestamp: timestamp,
            // 'CustomerBuyGoodsOnline' for a Till (Buy Goods) shortcode,
            // 'CustomerPayBillOnline' for a Paybill — sending the wrong
            // one for the account type doesn't fail loudly, it charges
            // through the wrong M-Pesa product code, so this must match
            // the real shortcode's actual type (§ Daraja M-Pesa Express
            // production readiness).
            TransactionType: config.accountType === 'till' ? 'CustomerBuyGoodsOnline' : 'CustomerPayBillOnline',
            Amount: Math.round(input.amountKes),
            PartyA: input.phone,
            // Receives the funds — always the paybill or till itself.
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
              // `businessShortcode`, matching `buildPassword` — NOT
              // `shortcode`. Safaricom validates the password against
              // whatever is declared here, so for a Buy Goods till with
              // a separate Head Office number the two disagreeing is a
              // guaranteed "Wrong credentials" on every reconciliation
              // query, against a push that itself works fine. Same
              // pairing the STK push above sends.
              BusinessShortCode: config.businessShortcode,
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
   * payout, matching a withdrawal), against the B2C **v3** endpoint —
   * v1 is a different, older contract; verified against the Daraja B2C
   * documentation this was built to (§ Daraja B2C production
   * readiness). Same non-retry discipline as `initiateStkPush`: a blind
   * retry after a network failure risks paying out twice — but unlike
   * the v1 contract (where Safaricom minted the correlation id and
   * only returned it in the response), v3 requires *us* to supply
   * `OriginatorConversationID` as a real request field. That value is
   * never generated here — the caller (`WithdrawalService`) generates
   * and durably persists it *before* calling this method, specifically
   * so a crash between "Daraja accepted the request" and "we recorded
   * the response" still leaves a real correlation id on record to
   * reconcile against later (`queryTransactionStatus`).
   * `WithdrawalService` owns the decision of what to do after an
   * ambiguous failure, not this Gateway.
   */
  async initiateB2CPayment(input: {
    businessId: string;
    phone: string;
    amountKes: number;
    remarks: string;
    occasion?: string;
    originatorConversationId: string;
  }): Promise<B2CPaymentResult> {
    const config = await getDarajaB2CConfig(input.businessId);
    const accessToken = await fetchAccessToken(input.businessId, config);

    return withCircuitBreaker(`${GATEWAY_NAME}-b2c:${input.businessId}`, async () => {
      const response = await fetch(`${config.baseUrl}/mpesa/b2c/v3/paymentrequest`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          OriginatorConversationID: input.originatorConversationId,
          InitiatorName: config.initiatorName,
          SecurityCredential: config.securityCredential,
          CommandID: 'BusinessPayment',
          Amount: Math.round(input.amountKes),
          PartyA: config.shortcode,
          PartyB: input.phone,
          Remarks: input.remarks,
          QueueTimeOutURL: config.queueTimeoutUrl,
          ResultURL: config.resultUrl,
          // Safaricom's own B2C v3 field is spelled "Occassion" (not
          // the more conventional "Occasion" the Reversal API below
          // uses) — a real, documented inconsistency between the two
          // products, not a typo introduced here.
          Occassion: input.occasion ?? '',
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

  /**
   * Transaction Status Query (§ Daraja B2C production readiness —
   * stuck-withdrawal reconciliation) — the B2C equivalent of
   * `queryStkStatus`, but itself asynchronous (like B2C/Reversal): this
   * only returns Safaricom's acknowledgement that the query was
   * accepted, never the actual answer — that arrives later at
   * `config.resultUrl`, parsed by `verifyTransactionStatusResult`.
   * Queries by `OriginatorConversationID` (the id `WithdrawalService`
   * generated and persisted before the *original* B2C call) rather
   * than a Transaction ID/receipt number, since a stuck withdrawal is
   * exactly the case where no receipt number was ever received.
   *
   * The exact request field set below reflects Daraja's documented
   * Transaction Status Query contract as of this writing — verify it
   * against a live sandbox call before relying on this reconciliation
   * path in production (see the production-readiness report).
   */
  async queryTransactionStatus(input: {
    businessId: string;
    originatorConversationId: string;
    remarks: string;
    occasion?: string;
  }): Promise<TransactionStatusQueryAck> {
    const config = await getDarajaTransactionStatusConfig(input.businessId);
    const accessToken = await fetchAccessToken(input.businessId, config);

    // A query has no dedup key of its own to protect and does not move
    // money — safe to retry on a transient network failure, same
    // reasoning as `queryStkStatus`.
    return withCircuitBreaker(`${GATEWAY_NAME}-txstatus:${input.businessId}`, () =>
      withRetry(async () => {
        const response = await fetch(`${config.baseUrl}/mpesa/transactionstatus/v1/query`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            Initiator: config.initiatorName,
            SecurityCredential: config.securityCredential,
            CommandID: 'TransactionStatusQuery',
            OriginatorConversationID: input.originatorConversationId,
            PartyA: config.shortcode,
            IdentifierType: '4',
            ResultURL: config.resultUrl,
            QueueTimeOutURL: config.queueTimeoutUrl,
            Remarks: input.remarks,
            Occasion: input.occasion ?? '',
          }),
        });

        const data = (await response.json()) as Record<string, unknown>;
        if (!response.ok || data.ResponseCode !== '0') {
          throw new Error(
            `Daraja transaction status query failed: ${
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
      }),
    );
  }

  verifyTransactionStatusResult(payload: unknown): TransactionStatusResult {
    const result = (payload as RawDarajaB2CResult).Result;
    if (!result) {
      throw new Error('Malformed Daraja transaction status result payload: missing Result');
    }

    const params = result.ResultParameters?.ResultParameter ?? [];
    const findParam = (key: string): string | number | undefined =>
      params.find((p) => p.Key === key)?.Value;

    const queryItselfSucceeded = result.ResultCode === 0;
    // "TransactionStatus" is Safaricom's own free-text field for the
    // *queried* transaction's real outcome — deliberately read as a
    // raw, optional string and never coerced into a boolean here.
    // `WithdrawalService.handleTransactionStatusResult` is the only
    // place allowed to decide what counts as "safe to mark paid", and
    // it requires an exact 'Completed' match, nothing looser.
    const transactionStatus = queryItselfSucceeded
      ? (findParam('TransactionStatus') as string | undefined)
      : undefined;

    return {
      originatorConversationId: result.OriginatorConversationID,
      conversationId: result.ConversationID,
      resultCode: result.ResultCode,
      resultDesc: result.ResultDesc,
      transactionStatus,
      transactionId: queryItselfSucceeded ? result.TransactionID : undefined,
      amountKes: queryItselfSucceeded && findParam('Amount') != null ? Number(findParam('Amount')) : undefined,
      transactionCompletedAt: queryItselfSucceeded
        ? (findParam('FinalisedTime') as string | undefined) ?? (findParam('TransactionCompletedDateTime') as string | undefined)
        : undefined,
    };
  }
}

export const darajaGateway: PaymentGateway & PayoutGateway & RefundGateway = new DarajaGateway();
