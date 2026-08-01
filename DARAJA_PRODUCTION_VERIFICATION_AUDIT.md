# Daraja Production Integration Verification Audit

**Date:** 2026-08-01
**Scope:** `snack-quest-next/lib/integrations/daraja/`, `services/paymentService.ts`, `services/withdrawalService.ts`, `services/refundService.ts`, `app/api/webhooks/daraja/**`, `lib/webhooks/verifyDarajaWebhookRequest.ts`, and their tests.
**Method:** direct source inspection, cross-referenced against Safaricom's real, documented API behavior. No code changed. Every finding below is grounded in a named file/line or a named external source.

## A note on documentation access before anything else

`developer.safaricom.co.ke` is blocked by this session's network egress policy (confirmed `403` at the proxy level — the same policy that blocked `help.whatchimp.com` in the prior task; not a transient failure, and I did not retry around it). Two things filled the gap, and I'm distinguishing them explicitly because they carry different evidentiary weight:

1. **You pasted the actual content of `/apis/BusinessPayBill`** mid-audit. Important correction this surfaces: **that page documents Business PayBill (`POST /mpesa/b2b/v1/paymentrequest`) — a B2B org-to-paybill transfer API.** Snack Quest OS does not implement this and has no use for it (we don't pay other paybills; we *receive* customer payments via STK Push, *pay out* via B2C, and *reverse* transactions). So this page doesn't document our STK Push checkout flow at all. What it *does* confirm, and what I've used below: the shared `Result` callback envelope (`ResultType`, `ResultCode`, `ResultDesc`, `OriginatorConversationID`, `ConversationID`, `TransactionID`, `ResultParameters.ResultParameter[]` as `{Key, Value}` pairs, `ReferenceData.ReferenceItem[]`) that Safaricom reuses across its async B2B/B2C/Reversal-style APIs, the `SecurityCredential`-is-pre-encrypted convention, and the `QueueTimeOutURL`/`ResultURL` pair — all of which our B2C/Reversal code already assumes, and this now **confirms** rather than assumes.
2. **You then pasted the actual content of the M-Pesa Express Query page** (`POST https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query`) — this is the STK Push Query / transaction-status endpoint discussed in §2.4/§7 below. This upgrades that section from a WebSearch-sourced claim to a primary-source-confirmed one; I've updated §2.4 and §3 accordingly with the exact request/response fields from what you pasted.
3. **WebSearch**, for everything else remaining (OAuth flow details, STK Push request/response fields, ResultCode meanings) — indexed summaries and third-party technical write-ups, not the primary source. I've marked every claim still sourced this way. Where one materially affects the verdict, I've flagged it as **worth confirming against the primary docs directly** rather than treating it as certain.

If you can paste the actual STK Push initiation page (`/apis/MpesaExpressSimulate` or wherever Safaricom hosts it) and the OAuth page, I'll re-verify those remaining sections against primary source too.

---

## 1. Executive Summary

Snack Quest OS's Daraja integration is **substantially more disciplined than what "sandbox works" usually implies.** It already has: a real 3-part callback verification (checkout-request match, exact-amount match, idempotency), a Firestore-backed idempotency ledger shared across every provider webhook (not Daraja-specific ad-hoc code), per-tenant credential isolation with no hardcoded secrets anywhere, deliberate non-retry-on-money-movement discipline (explicitly commented, not accidental), and honest "money collected but can't fulfill" handling that pings a human rather than silently failing. This is not naive sandbox code.

That said, two things genuinely need attention before this is unconditionally production-ready, and one thing needs a decision: **(1)** the codebase never uses Safaricom's STK Push Query endpoint, so a lost/delayed callback — a documented real-world Safaricom behavior — leaves an order in limbo with the customer already charged, until they contact support; **(2)** the Daraja webhook secret is deliberately fail-open when unconfigured, and **no business currently exists in the production `snack-quest-os` Firestore** (verified directly, read-only, against production moments ago — `businesses` collection is empty), meaning this fail-open path has never been exercised against a real Safaricom callback and its actual configured/unconfigured state for a real tenant is simply unknown today; **(3)** every non-zero STK ResultCode is currently collapsed into one generic "payment wasn't completed" message, which is safe but not the friendliest handling of Safaricom's genuinely distinct failure reasons (cancelled vs. no funds vs. timeout).

Nothing found here requires a rewrite. Everything required is additive: one new Gateway method (STK Push Query) and its caller, a pre-launch checklist item (confirm the webhook secret is actually set for the real tenant), and an optional customer-messaging improvement.

---

## 2. Compliance Report

### 2.1 Authentication (OAuth)

| Item | Finding | Status |
|---|---|---|
| Endpoint | `GET {baseUrl}/oauth/v1/generate?grant_type=client_credentials` (`darajaGateway.ts:49`) — matches Safaricom's real OAuth endpoint. | ✅ |
| Auth header | `Authorization: Basic base64(consumerKey:consumerSecret)` (`darajaGateway.ts:40-42,50`) — correct per every source consulted. | ✅ |
| Base URLs | Sandbox `https://sandbox.safaricom.co.ke`, Production `https://api.safaricom.co.ke` (`config.ts:77-81`) — matches real Safaricom base URLs exactly. | ✅ |
| Token reuse | Per-business in-memory cache (`tokenCache`, `darajaGateway.ts:23`), keyed so tenant A never reuses tenant B's token. | ✅ |
| Token expiry | Refreshes 60s before Safaricom's own `expires_in` (`darajaGateway.ts:67`). Real token TTL is ~3599s (~1hr); the codebase doesn't hardcode this — it reads `expires_in` from Safaricom's own response, which is more correct than hardcoding. | ✅ |
| Retry on OAuth failure | `withRetry` + `withCircuitBreaker` wrap the token fetch (`darajaGateway.ts:46-47`) — correctly safe to retry, since a token fetch has no side effect (explicitly commented). | ✅ |

**No findings.** This is the cleanest-verified section — every claim matched independently-sourced documentation with no ambiguity.

### 2.2 STK Push

| Field | Sent as | Real Daraja field? |
|---|---|---|
| `BusinessShortCode` | `config.shortcode` | ✅ Required |
| `Password` | `base64(shortcode + passkey + timestamp)` (`buildPassword`, `darajaGateway.ts:85-89`) | ✅ Correct, standard formula |
| `Timestamp` | `yyyyMMddHHmmss` (`timestampNow`, `darajaGateway.ts:91-102`) | ✅ Correct format |
| `TransactionType` | hardcoded `'CustomerPayBillOnline'` | ✅ Correct for a PayBill-type shortcode (the alternative, `CustomerBuyGoodsOnline`, is for till numbers — confirm which shortcode type this business actually holds; see §7) |
| `Amount` | `Math.round(input.amountKes)` | ✅ Correct — Daraja requires an integer amount |
| `PartyA` | customer phone | ✅ |
| `PartyB` | `config.shortcode` | ✅ |
| `PhoneNumber` | customer phone (same value as PartyA) | ✅ Correct — this duplication is standard Daraja API shape, not a bug |
| `CallBackURL` | tenant-specific URL with `?key=` webhook secret appended | ✅ Present; see §7 for the secret's fail-open caveat |
| `AccountReference` | `SQ-{conversationId.slice(0,8)}` | ✅ Present, ≤13 chars as required (`SQ-` + 8 hex chars = 11 chars) |
| `TransactionDesc` | `'Snack Quest order'` | ✅ Present, well under the 182-char limit a WebSearch source cited for ResultCode 2001 |

**Status: ✅ Fully compliant**, with one item worth a five-minute confirmation, not a code change: verify the real shortcode Snack Quest holds is a PayBill (not Buy Goods/till) shortcode, since `TransactionType` is hardcoded to the PayBill variant.

### 2.3 Callback Processing

| Scenario | Handling | Evidence |
|---|---|---|
| Successful payment | `ResultCode === 0` → extract `Amount`, `MpesaReceiptNumber`, `TransactionDate`, `PhoneNumber` from `CallbackMetadata.Item[]` (`verifyCallback`, `darajaGateway.ts:205-233`) | ✅ |
| Failed payment | Any non-zero `ResultCode` → `succeeded: false`, no metadata extraction attempted (correct — Safaricom doesn't send `CallbackMetadata` on failure) | ✅ |
| Cancelled (ResultCode 1032) | Falls into the generic failed path → conversation reset to `awaiting_customer_payment_confirmation`, customer told "reply PAY to try again" (`conversationService.ts:713-729`) | 🟡 Functionally correct, not distinguished from other failure reasons in customer messaging — see §7 |
| Timeout (ResultCode 1037) | Same generic failed path | 🟡 Same as above |
| Duplicate callback | `webhookEventRepository.recordIfNew()` — atomic Firestore `.create()`, keyed on `{businessId}:daraja:{checkoutRequestId}` (`paymentService.ts:107-116`) — **verified end-to-end**, not just by code inspection: `tests/integration/conversationJourney.test.ts:506-523` sends the identical callback payload twice and asserts exactly one order is created. | ✅ Confirmed idempotent by a real test, not just design intent |
| Unexpected/malformed payload | `darajaGateway.verifyCallback` throws → caught, `{status: 'ignored', reason}` returned, no crash (`paymentService.ts:97-105`) | ✅ |
| Unmatched callback (no attempt found) | Recorded to `webhookEventRepository` as `failed` with an explicit reason, surfaced later via the existing unmatched-payments reconciliation UI (`paymentService.ts:118-129`) | ✅ — this is the Payment Reconciliation feature mentioned in your existing-context list, confirmed wired to this exact path |
| Cross-tenant defense | If a matched attempt's parent intent belongs to a *different* `businessId` than the URL the callback arrived on, treated as unmatched rather than acted on (`paymentService.ts:132-145`) | ✅ Defense-in-depth beyond what's strictly required, given `CheckoutRequestID` is already globally unique per Safaricom |

**Is it idempotent? Yes — confirmed, not assumed.** The idempotency key is `checkoutRequestId`, which Safaricom guarantees unique per STK push attempt.

**One real edge case this doesn't fully guard**, worth naming even though it's low-probability: if a customer replies `PAY` twice in quick succession *before* the first STK attempt resolves, two separate `PaymentIntent.attempts` get created (each with a genuinely distinct `checkoutRequestId`), so idempotency (keyed on `checkoutRequestId`) does **not** collapse them — Safaricom will eventually deliver two distinct callbacks, and whichever resolves *last* wins the `paymentIntents/{id}.status` write (`paymentIntentRepository.updateStatus`, no optimistic-concurrency guard). In practice this needs the customer to double-tap `PAY` inside the ~seconds it takes to see the bot's first reply, which is unlikely but not impossible on a flaky connection. Not a data-loss bug — both attempts are independently and correctly recorded in the `attempts` subcollection either way, and `completeOrder()` is keyed off a specific `ProcessCallbackResult`, so an order is never double-created — but the *intent-level* `status` field could show `'succeeded'` after actually the customer's second attempt failed, or vice versa, if both land close together. Low priority given how narrow the window is, but worth a one-line note in code if you want it documented rather than fixed.

### 2.4 Transaction Status / Query Endpoint

**Finding: Safaricom's M-Pesa Express Query API (`POST /mpesa/stkpushquery/v1/query`, "check the status of a Lipa Na M-Pesa Online Payment") exists and is not used anywhere in this codebase.** Confirmed via the primary Safaricom documentation you pasted directly. Exact request body:

```json
{
  "BusinessShortCode": "174379",
  "Password": "<base64(Shortcode+Passkey+Timestamp)>",
  "Timestamp": "20160216165627",
  "CheckoutRequestID": "ws_CO_260520211133524545"
}
```

Every one of these four fields is already computable by existing code — `BusinessShortCode`/`Password`/`Timestamp` use the exact same `config.shortcode`/`buildPassword`/`timestampNow` this codebase already has in `darajaGateway.ts`, and `CheckoutRequestID` is already stored on every `PaymentAttempt` (`paymentIntentRepository.addAttempt`). Response body:

```json
{
  "ResponseCode": "0",
  "ResponseDescription": "The service request has been accepted successfully",
  "MerchantRequestID": "22205-34066-1",
  "CheckoutRequestID": "ws_CO_13012021093521236557",
  "ResultCode": "0",
  "ResultDesc": "The service request is processed successfully."
}
```

Note this response's `ResultCode`/`ResultDesc` are the **same values and same meanings** as the async callback's `Body.stkCallback.ResultCode`/`ResultDesc` (Safaricom's own docs give `1032: Request canceled by the user` as the example non-zero case) — so `DarajaGateway.verifyCallback`'s existing `ResultCode`-interpretation logic (§2.3) can be reused as-is for a query response; this is a new request/response pair, not a new result-interpretation concept.

**Why this matters, concretely**: Safaricom's callback delivery is not guaranteed-instant or guaranteed-once in practice — a documented, common real-world failure mode is a callback that's delayed, lost, or never arrives (network partition on Safaricom's side, a tunnel drop during a flaky mobile connection, etc.). Today, if that happens: `PaymentIntent.status` stays `'processing'` forever, the conversation stays wherever `initiateAttempt` left it, and the customer — who may have actually completed the M-Pesa PIN prompt and been charged — never gets an order. Nothing in this codebase ever asks Safaricom "so what actually happened to that CheckoutRequestID?" There's no cron sweep, no manual "check status" admin action, nothing.

**Recommendation**: add `darajaGateway.queryStkStatus(businessId, checkoutRequestId)` (same request-signing pattern as `initiateStkPush` — reuses `fetchAccessToken`/`buildPassword`/`timestampNow`, no new plumbing, and the exact request shape above) and a scheduled sweep (same shape as the existing `retry-notifications` Vercel Cron job) that queries any `PaymentIntent` still `'processing'` after, say, 2 minutes — long enough for a real customer PIN-entry window, short enough to catch a lost callback quickly. This is additive; nothing about the existing callback-driven path changes, it's a fallback for when that path doesn't fire.

### 2.5 Error Handling

| Documented error case | Handling | Status |
|---|---|---|
| Authentication failure (bad consumer key/secret) | `fetchAccessToken` throws with Safaricom's own error body included (`darajaGateway.ts:52-55`); `testDarajaConnection` surfaces this via Test Connection in the Integration Portal | ✅ |
| Invalid STK request (bad shortcode/passkey mismatch, etc.) | Non-`'0'` `ResponseCode` → thrown with `errorMessage`/`ResponseDescription` (`darajaGateway.ts:186-193`); caught by `ConversationService.confirmAndFreeze`'s try/catch, customer told to retry, conversation returned to a retryable step (`conversationService.ts:555-574`) | ✅ |
| Network failure during STK initiation | Same catch path as above — `fetch` rejecting is caught the same way as a non-OK response | ✅ |
| Duplicate requests | Covered in §2.3 | ✅ |
| Customer cancellation (ResultCode 1032) | Generic failed path (§2.3) | 🟡 Functionally handled, not distinguished |
| Insufficient balance (ResultCode 1025, per WebSearch) | Generic failed path | 🟡 Same |
| Expired request | Generic failed path — Safaricom's STK prompt itself expires client-side on the phone; the callback for this arrives as a normal failure ResultCode, so this is already covered by the generic path, just not distinguished in copy | 🟡 |
| Timeout (ResultCode 1037) | Generic failed path | 🟡 |
| Malformed callback | `verifyCallback` throws → `{status: 'ignored'}`, route still 200s (never causes a retry-storm) | ✅ |

**None of the 🟡 items are broken.** Every one of them safely returns the customer to a retryable state with a clear "reply PAY to try again" — no stuck conversations, no silent failures, no crashes. The gap is purely in *customer-facing message specificity*: "cancelled" and "you don't have enough M-Pesa balance" are different situations a real customer would want worded differently, and Safaricom hands you exactly the `ResultCode` needed to do that. This is a UX polish item, not a correctness or production-readiness blocker.

---

## 3. Endpoint Comparison Matrix

| Endpoint | Real Daraja path | Used for | Compliance |
|---|---|---|---|
| OAuth token | `GET /oauth/v1/generate?grant_type=client_credentials` | Every authenticated call | ✅ Fully compliant |
| STK Push | `POST /mpesa/stkpush/v1/processrequest` | Checkout | ✅ Fully compliant (§2.2) |
| STK Push Query (M-Pesa Express Query) | `POST /mpesa/stkpushquery/v1/query` | — | ❌ **Not implemented** (§2.4, primary docs confirmed) — not "incorrect", genuinely absent |
| B2C Payment Request | `POST /mpesa/b2c/v1/paymentrequest` | Withdrawal payouts | ✅ Fully compliant — `CommandID: 'BusinessPayment'` is the correct command for a business-to-individual payout (not `SalaryPayment`/`PromotionPayment`, which are for different disbursement categories) |
| Transaction Reversal | `POST /mpesa/reversal/v1/request` | Refunds | ✅ Fully compliant — `RecieverIdentifierType: '11'` (org shortcode) matches the documented value for a reversal back to the paybill itself |
| Business PayBill (B2B) | `POST /mpesa/b2b/v1/paymentrequest` | — | N/A — not a Snack Quest OS use case, see the note at the top of this report |

No endpoint currently in use was found to be incorrectly implemented (no ❌ within the endpoints actually used). The one ❌ is an absent capability, not a wrong one.

---

## 4. Security Review

| Item | Finding | Status |
|---|---|---|
| Secrets management | Every Daraja credential (`consumerKey`, `consumerSecret`, `passkey`, `b2cSecurityCredential`, etc.) is resolved per-business from `businesses/{businessId}/integrationSecrets/daraja` via `businessIntegrationSecretRepository`, never a bare `process.env` read at runtime (`config.ts`). At rest, these fields are covered by the field-level AES-256-GCM envelope encryption built in an earlier phase (`lib/secrets/secretCipher.ts`), transparently applied by the same repository. | ✅ |
| `SecurityCredential` handling | Never handled as a raw password anywhere in this codebase — stored pre-encrypted (Safaricom's own RSA-certificate encryption, done once outside this app) per `types/business.ts:109-113`'s explicit doc comment, matching exactly what the B2B PayBill doc you pasted describes for the same field. | ✅ |
| Callback endpoint protection | A per-business random secret (`webhookSecret`, `scripts/setDarajaWebhookSecret.mjs`) is embedded as `?key=` in every `CallBackURL`/`ResultURL`/`QueueTimeOutURL` this codebase submits to Safaricom, and checked via constant-time comparison (`timingSafeEqualStrings`, `lib/webhooks/webhookSecret.ts`) on every inbound webhook (`verifyDarajaWebhookRequest.ts`). This is the right mechanism given a real, confirmed constraint: **Safaricom signs nothing** — no HMAC header, no request signature — so a URL-embedded shared secret is the only verifiable mechanism available, and it's genuinely defensible engineering, not a shortcut. | ✅ mechanism; 🟡 **verification status unknown for the real tenant** — see below |
| **Fail-open when unconfigured** | `checkWebhookSecret` returns `{ok: true}` when no `webhookSecret` is set for that business, with only a `console.warn` (`webhookSecret.ts`, `verifyDarajaWebhookRequest.ts:31-35`). This is explicitly a *deliberate* rollout-safety choice, not an oversight — but it means an **unconfigured business's Daraja callback endpoint accepts any POST from anyone claiming to be Safaricom**, with only `checkoutRequestId`/amount/idempotency matching as the actual defense against a forged callback. Since the amount and `checkoutRequestId` must match a real pending attempt to do anything, a random attacker POST can't fabricate a fake *successful* order out of nothing — but it **could** forge a *failure* result for a real pending `checkoutRequestId` (visible to anyone who can guess or observe one), falsely telling a customer their payment failed when it actually succeeded. | 🟡 Needs a decision — see Required Changes |
| **Production tenant status** | Checked directly, read-only, against the live `snack-quest-os` Firestore project moments ago: **the `businesses` collection is currently empty.** No tenant has been provisioned in production yet, meaning **this webhook secret has literally never been exercised against a real Safaricom callback**, and its configured/unconfigured status for the real business is not yet a fact that exists. This is the report's single most important finding for interpreting everything else here: **nothing in this audit has been validated against production traffic, because there is no production traffic yet.** | ⚠️ Not a code defect — a fact about deployment state that changes how "production-ready" should be read |
| Replay protection | The webhook secret alone doesn't prevent replay of a *legitimately-captured* callback (no nonce/timestamp-window check) — but replaying an old callback for an already-`succeeded`/`failed` `checkoutRequestId` hits the idempotency ledger and is rejected as a duplicate (§2.3), so replay is effectively defended by idempotency, not by the secret itself. | ✅ Effectively covered, by a different mechanism than the one that would normally be named for this |
| Request validation | Amount and business-scoping validated (§2.3); no schema/JSON-shape validation library used, but every field access is defensive (`?.`, explicit `throw` on missing `Body.stkCallback`) rather than assuming shape | ✅ |
| Logging | `console.warn` on fail-open path; failures recorded to `webhookEventRepository` with a real reason string, visible via the Operations dashboard (Phase 5) and the unmatched-payments reconciliation UI — genuine, not just console noise | ✅ |

---

## 5. Architecture Review (Gateway Evaluation)

**What's architecturally correct — keep as-is:**
- The `PaymentGateway`/`PayoutGateway`/`RefundGateway` interface split, with `DarajaGateway` implementing all three. STK push, B2C, and reversal genuinely are different capabilities with different credential requirements (`getDarajaConfig` vs `getDarajaB2CConfig` vs `getDarajaReversalConfig`), and the interfaces reflect that correctly rather than forcing one bloated `DarajaGateway` interface.
- Deliberate non-retry-on-money-movement (`initiateStkPush`, `initiateB2CPayment`, `initiateReversal` all explicitly *not* wrapped in `withRetry`, with a comment explaining why for each). This is correct Daraja-specific judgment — none of these three APIs give you a dedup key to make a blind retry safe.
- Per-business token cache, keyed correctly, with correct expiry handling.
- The shared `webhookEventRepository` idempotency ledger being reused *as-is* for Daraja rather than a Daraja-specific idempotency mechanism — right call, since the atomicity primitive (`.create()`) and the doc-ID scheme are provider-agnostic by design.
- Keeping the Route layer thin (`app/api/webhooks/daraja/**`) — verification and idempotency happen in `verifyDarajaWebhookRequest`/`PaymentService`/`WithdrawalService`/`RefundService`, not duplicated per-route.

**What should change:**
- Add `queryStkStatus` to `PaymentGateway` (§2.4) — additive, no existing method signature changes.
- Nothing else. This does not need a rewrite; the brief's own framing ("do not recommend rewrites unless the official API requires them") — nothing found requires one.

**What should remain unchanged:**
- Everything else in §5's "correct" list above, plus the B2C/Reversal implementations, which this audit found no fault with.

---

## 6. Multi-Tenant Review

Confirmed: every credential resolution (`getDarajaConfig`, `getDarajaB2CConfig`, `getDarajaReversalConfig`) takes `businessId` and reads from that business's own `integrationSecrets/daraja` document — no shared/global Daraja credential exists anywhere in the runtime path. The token cache is businessId-keyed (confirmed by a dedicated test: `darajaGateway.test.ts:207`, "a second tenant never reuses the first tenant's token"). Callback URLs are tenant-specific (`/api/webhooks/daraja/{businessId}` and its B2C/reversal siblings), so Safaricom's own routing — not payload inspection — determines which tenant a callback belongs to, and `PaymentService.processCallback` independently cross-checks the matched intent's `businessId` against the URL's `businessId` as defense-in-depth (§2.3). **Fully compliant, no findings.**

---

## 7. Required Changes

Ranked by what's actually blocking vs. what's an improvement:

1. **🟡 Recommended before launch, not launch-blocking on its own — confirm the real Daraja shortcode type.** `TransactionType` is hardcoded to `CustomerPayBillOnline`. If Snack Quest's real Safaricom shortcode is a Buy Goods/Till number rather than a PayBill, this field is wrong and STK pushes will fail outright in production even though they work in sandbox (sandbox test shortcodes are typically PayBill-type by default, which is exactly the kind of "works in sandbox, wrong in production" gap this audit was asked to catch). Five-minute check: confirm with whoever holds the Safaricom merchant account.
2. **🟡 Recommended — verify the production `daraja.webhookSecret` will actually be set before go-live**, and consider making it fail-**closed** in production specifically once it is (still fail-open in a documented, deliberate way for the *first* rollout of a *new* tenant, exactly as designed today — but a checklist item, not a silent assumption, before this tenant goes live with real money moving).
3. **🟡 Recommended — implement STK Push Query as a fallback sweep** (§2.4) so a lost/delayed Safaricom callback doesn't leave a paid customer without an order indefinitely.
4. **Optional, UX-only — distinguish ResultCode-specific customer messaging** (cancelled vs. insufficient funds vs. timeout) instead of one generic "reply PAY to try again" message. Not required for correctness.
5. **Optional, low-probability edge case — document (or add an optimistic-concurrency guard for) the double-PAY race** described in §2.3, if you want it formally closed rather than just narrow enough to accept as-is.

None of these require touching `verifyCallback`, `initiateStkPush`'s request shape, the OAuth flow, B2C, or Reversal — all independently verified compliant.

---

## 8. Risks

- **Highest actual risk right now isn't a code defect — it's that nothing here has been exercised against production traffic yet** (empty `businesses` collection, confirmed directly). Every finding above is a static-analysis + sandbox-test-suite verification, exactly the caveat you asked me to watch for going in.
- A lost/delayed Safaricom callback (§2.4) is the most realistic "customer paid, got nothing" scenario absent from today's implementation.
- The fail-open webhook secret (§4) is a real, if narrow, forgery surface for *false failure* callbacks specifically — not for fabricating fake successful orders.
- The shortcode-type assumption (§7.1) is a "looks right until the first real production STK push" class of risk — exactly the kind sandbox testing cannot catch, since Safaricom's sandbox doesn't enforce this the same way.

---

## 9. Final Verdict

**🟡 Minor changes recommended before launch.**

Not 🔴: nothing found is broken, nothing found requires a rewrite, and the architecture (Gateway boundary, idempotency ledger, per-tenant credentials, non-retry discipline) is genuinely sound — better than what "it works in the sandbox" usually implies. Not ✅ unconditionally: there's a real gap (no transaction-status fallback for lost callbacks), a real unconfirmed assumption (shortcode type) that's cheap to check but expensive if wrong, and a real unknown (whether the production webhook secret will be set) that this audit surfaced rather than assumed away — plus the honest fact that none of this has touched real production traffic yet.

Recommended sequence: confirm the shortcode type (§7.1, five minutes) → confirm/set the production webhook secret as part of the go-live checklist (§7.2) → add STK Push Query as a fallback sweep (§7.3, the one genuine code change) → ship. Items 4-5 in §7 can follow post-launch without blocking it.
