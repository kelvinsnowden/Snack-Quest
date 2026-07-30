# Snack Quest — TDD Completeness Audit: End-to-End Customer Journey

Prepared against `TECHNICAL_DESIGN_DOCUMENT.md` (as of commit `addf527`,
27 sections + ADR-0000) and the actual current codebase (`server.ts`,
~12,650 lines, plus `src/types/database.ts`, `src/lib/attributionTracker.ts`),
not against the TDD's own self-description. Every "current state" claim
below is cited to a specific file:line; every TDD gap is cited to the
section that should cover it but doesn't, or confirmed absent by grep
across the whole document.

**Method.** Read the TDD end-to-end (all 27 sections + the ADR). Cross-
referenced every requested capability area against both the TDD and the
real backend to distinguish three cases that matter differently: (a) a
capability that's real and substantial in `server.ts` today but has no
Firestore/Service/Repository design in the TDD — a genuine migration
gap, not a "nice to have"; (b) a capability that's genuinely new (no
current implementation, no TDD design) — net-new scope, not a
regression risk; (c) a capability the TDD does cover, fully or partly.

**Critical caveat on every "current: ..." citation below.** "Current
state exists" in this document means **the current codebase already
models the capability in code** — the data shapes, the state machines,
the edge cases (duplicate callbacks, expired requests, fraud flags) have
already been thought through once. It does **not** mean any of it is a
working production integration. Confirmed by repo-wide search: there is
no outbound `fetch`/`axios` call to any real external host anywhere in
`server.ts` or `src/` — `axios` isn't even a dependency — and every
"integration" (Daraja, Whatchimp, Meta/TikTok/Google, SendGrid, Twilio)
is simulated against the local in-memory/JSON store. The "AI chatbot"
is keyword-matching (`if (lower.includes('buy'))`-style intent
classification with a hardcoded confidence score), not an LLM call —
`@google/genai` is a listed dependency that is never imported or
invoked anywhere. Separately, and specific to payments: two competing
route implementations exist for several endpoints (a thinner
`src/modules/*` router and a materially richer inline `server.ts`
version), and because Express matches routes in registration order and
the thinner router mounts first, **the richer inline logic — including
the more detailed duplicate-callback and fraud-scoring code cited
below — is currently dead/unreachable code** for those specific paths.
Every citation below is accurate about *what code exists in the repo*;
where the richer version is the one currently shadowed, that's called
out explicitly. None of this changes this audit's core finding — the
TDD needs to design these capabilities regardless of whether today's
version is live, shadowed, or simulated — but it matters for how much
of the current code is actually portable versus merely a useful design
reference.

---

## 1. Executive Summary

**Can the platform support Snack Quest today, as designed?** No — not
without a second design pass. The TDD is a **rigorous, correct, and
close-to-complete design for one slice of the business: the Creator
Portal's auth/campaign/withdrawal loop**, which is exactly the slice
this session audited most deeply beforehand. Layered against the
*whole* business — marketing attribution, the ordering/checkout funnel,
Daraja payment processing, WhatsApp/Whatchimp conversational commerce,
the referral system, and cross-cutting operational patterns (webhooks,
idempotency, retries, background jobs) — it has real, substantial gaps:
not "an open question to resolve," but **collections, Services,
Repositories, and entire subsystems that don't exist in the document at
all**, covering functionality that is demonstrably real (if
simulated/demo-quality) in `server.ts` right now.

This is not a criticism of the TDD's quality where it does apply — §4's
layered architecture, §6's auth design, §9's security rules, and the
Phase 0 implementation built on them are sound and should not be
redone. It's a scope problem: the document was written, and reviewed,
primarily through the Creator Portal lens, and several entire business
capabilities present in the current codebase were never brought into
the data model or service catalog.

**The concrete risk if Phase 1 continues as currently scoped:** every
phase in §23 after Phase 1 will hit collections, Services, and
integration points that don't exist yet, in inconsistent, expensive-to-
retrofit ways once real screens and rules already assume the current
12-collection schema. Marketing attribution fields already exist on the
real `Order` type (`utm_source`, `fbclid`, `gclid`, `ttclid`,
`referral_code_used`, `session_id`, `landing_page_id` — all real fields,
`src/types/database.ts:381-417`) and are captured client-side today
(`src/lib/attributionTracker.ts`) — but the TDD's `orders` collection
(§8) has none of them. Building Phase 2 (marketing/checkout, §23) against
today's TDD would ship an `orders` collection that **cannot record how a
sale happened**, which is not a small omission for a platform whose
growth model depends on paid acquisition and referrals.

**Recommendation:** do not start Phase 2 (marketing site + checkout)
or Phase 4 (Customer Quest Center) against the TDD as it stands. Phase
1 (Creator Portal pilot) can continue — it's the one phase this
document actually supports end to end — but the TDD needs a second,
focused revision covering §8 (data model), a new architecture section
for the integration/webhook layer, and the missing Services/Repositories
before Phase 2 begins. Section 5 below proposes exactly that reordering.

---

## 2. Coverage Matrix

Legend: **✅ Full** — TDD designs this correctly and completely. **🟡
Partial** — TDD names the capability but the design is thin, narrower
than what the current system already does, or missing a necessary
piece (data model, idempotency, etc.). **❌ Missing** — no TDD design
exists at all, confirmed by full-document grep, not an inference.

### Marketing & Attribution

| Capability | Status | TDD Section | Evidence |
|---|---|---|---|
| Meta Ads / Pixel | ❌ Missing | — | Zero mentions in TDD. Current: `attributionTracker.ts:204-214` dispatches `window.fbq` browser-side; `server.ts:411-413` config row for Meta CAPI integration |
| Meta Conversion API (server-side) | ❌ Missing | — | Zero mentions. Current: `server.ts:7624-7691` (`POST /api/v1/marketing/events`) computes `advanced_matching` and dispatches to ad platforms (simulated) |
| TikTok Ads | ❌ Missing | — | Zero mentions. Current: `ttclid` captured (`attributionTracker.ts:37`), stored on `Order` (`database.ts:408`) |
| Google Ads | ❌ Missing | — | Zero mentions. Current: `gclid` captured/stored same as above; `server.ts:1118-1119` config row |
| UTM tracking | ❌ Missing | — | Zero mentions of "UTM" anywhere in the TDD. Current: full first/last-touch UTM capture (`attributionTracker.ts:28-66`), persisted per-order (`database.ts:404-405`) |
| Landing page attribution | ❌ Missing | — | Zero mentions. Current: `LandingPage` type (`database.ts:89`), per-LP conversion counters (`server.ts:7669-7682`) |
| Session tracking | ❌ Missing | — | TDD's `SessionRecord`-equivalent doesn't exist in §8. Current: `SessionRecord` type (`database.ts:172`), `getOrCreateSessionId()` (`attributionTracker.ts:16-23`) |
| Referral attribution | 🟡 Partial | §4, §8 (fields only) | `referralCode` field exists on `creatorProfiles`/`customerProfiles` (§8); no `referrals` collection, no attribution-event linkage. Current has a dedicated `Referral` type (`database.ts:622`) and `db.referrals` with `referrer_creator_id`/`referrer_customer_id`/status tracking (`server.ts:2669`, `:2720`, `:2783`) |
| Coupon attribution | ❌ Missing | — | No coupon/discount *system* anywhere in TDD or current codebase — genuinely net-new. Current has only a single hardcoded promo string (`SNACK25`, `src/services/deliveryService.ts:394`) and a free-text `promo_code` field passed through a UI form with no managed-coupon backing — not a system to migrate |

### Customer Acquisition

| Capability | Status | TDD Section | Evidence |
|---|---|---|---|
| Landing pages | ❌ Missing (as a managed entity) | §5.1 (mentions "landing pages" as a marketing-site feature, no data model) | Current has a real `LandingPage` type + per-page conversion tracking (`database.ts:89`, `server.ts:7669-7682`) |
| WhatsApp CTA / click-to-chat | 🟡 Partial | §5.1 (implied) | `formatWhatsAppUrl()` exists client-side (`attributionTracker.ts:261-266`); no server design for capturing the resulting conversation |
| AI chatbot | ❌ Missing | — | Zero mentions. Current: a rule-based conversational flow exists — `POST /api/v1/delivery/chimp-flow/next-step` (`server.ts:4692-4780`+), a hardcoded county → delivery-method → order-creation decision tree — but it is **not an LLM/AI chatbot**: intent classification elsewhere is pure keyword matching (`server.ts:11295-11314`, `if (lower.includes('buy'))`-style, hardcoded `confidence_score: 0.94`), and `@google/genai` is a listed dependency that is never imported or called anywhere in the repo |
| Whatchimp integration | ❌ Missing | — | Zero mentions of "Whatchimp"/"WhatChimp" anywhere in the TDD (only generic "WhatsApp notification dispatch," §16). Current: `cfg-whatchimp` integration config (`server.ts:338-352`), the conversational flow above, inbound/outbound `CustomerCommunicationLog` (`database.ts:341`) |
| Customer onboarding | 🟡 Partial | §5.3 | Portal-level description only; no onboarding Service/flow detail comparable to Creator Portal's |
| Returning customers | 🟡 Partial | §6 (auth persists) | Covered incidentally via Firebase Auth session persistence; no explicit returning-customer product logic (recognized landing experience, saved delivery details, etc.) |
| Guest checkout | ✅ Full | §5.1 | Explicitly required to remain possible: "Guest checkout must remain possible — don't force account creation to buy a box" |
| User registration | 🟡 Partial | §6 | Firebase email/password covered; customer-specific registration flow (vs. creator's) not detailed, and §26 Q2 leaves the identity method itself as an open question. **New finding, not in `ARCHITECTURE_REPORT.md`:** the current customer signup handler stores `password_hash: password || 'default123'` (`server.ts:9973`) — the raw password, unhashed, despite the field name — a real credential-handling bug in a code path `ARCHITECTURE_REPORT.md` didn't cover (that report audited creator/admin auth, not customer signup specifically). Firebase Auth in the target architecture (§6) makes this moot going forward, but it's worth recording since it's a live finding in the codebase this audit touched |
| Login | ✅ Full | §6 | Well-designed — session cookies, cross-subdomain, role claims |

### Ordering Flow

| Capability | Status | TDD Section | Evidence |
|---|---|---|---|
| Mystery Box purchase | 🟡 Partial | §8 (`orders` collection) | Basic `orders`/`orders/items` collections exist; no `packages`/`products` collection at all — `orders.packageId` references nothing defined in §8 |
| Multiple box types | ❌ Missing (data model) | — | Current has a full `Package` type (SKU, pricing, referral-discount eligibility, wallet eligibility, creator-commission flag, nationwide availability — `database.ts:96-110`); TDD has no equivalent collection |
| Monthly themes | ❌ Missing | — | No concept anywhere in TDD *or* current codebase — net-new |
| Subscription capability | ❌ Missing | — | No concept anywhere in TDD *or* current codebase — net-new. §5.3 lists "subscription management" once as unscoped future work, no design |
| Gift orders | ❌ Missing | — | No concept anywhere in TDD *or* current codebase — net-new |
| Delivery options (door vs. pickup) | ❌ Missing | — | Zero mentions in TDD (`customerProfiles.deliveryAddress` is a single free-text field, §8). Current has real county/area-based pickup-station selection and door-delivery-vs-pickup pricing logic in the chimp-flow orchestrator (`server.ts:4708-4733`) |
| Pickup points | ❌ Missing | — | No `pickup_stations`-equivalent collection in TDD §8. Current has real pickup station data keyed by county/area (`server.ts:4699`, `:4725`) |
| Shipping fee calculation | ❌ Missing | — | No design in TDD. Current has real, differentiated fees (KSh 150 pickup vs. KSh 350 door delivery, `server.ts:4718-4719`) |
| Inventory reservation | ❌ Missing | — | No concept anywhere in TDD. Current has a real `reserveInventory()` engine with a 15-minute expiry (`server.ts:5335-5347+`), an `InventoryReservation` type (`database.ts:485`), and a `reservation_expired` payment-status branch (`server.ts:5309`) |

### Payments — M-Pesa Daraja

| Capability | Status | TDD Section | Evidence |
|---|---|---|---|
| STK Push | 🟡 Partial | §10 (one API row), §16 | Named as an API row and an external service; no request/response schema, no state machine |
| Payment verification | 🟡 Partial | §10 (webhook row) | Webhook route named, no verification logic (signature check, amount match) specified |
| Callback handling | 🟡 Partial | §10 | Route named (`/api/webhooks/mpesa/callback`); current has a materially more detailed callback handler with receipt extraction and duplicate detection (`server.ts:5850-5930`+) that the TDD doesn't reflect |
| Failed payments | ❌ Missing | — | No `payment_failed` state design in TDD. Current: explicit `'payment_failed'` timeline event type (`database.ts:465-470`+) |
| Expired requests | ❌ Missing | — | No STK-expiry design in TDD. Current: `'reservation_expired'`/timeout handling exists (`server.ts:5309`) |
| Duplicate callbacks | ❌ Missing | — | Zero mentions of duplicate-callback handling in TDD. Current has a **designed** duplicate-detection path — `duplicateCallbacksCount` query, `'stk_push_callback_duplicate'` event type (`server.ts:5660`, `:5892`) — but this is inside the richer inline `server.ts` STK-callback handler, which is currently **shadowed/unreachable** (the thinner `src/api/webhooks/darajaWebhook.ts` router mounts first and wins for the same path). A separate, live, provider-agnostic idempotency utility does run today — `src/api/utils/idempotency.ts` (in-memory `Map` + TTL, generic webhook-idempotency check at `server.ts:8341-8360`) — so the pattern exists and works, just not specifically wired into the payment path that's actually reachable |
| Payment reconciliation | ❌ Missing | — | No reconciliation collection/Service in TDD §4/§8. Current: `PaymentReconciliationRecord`/`UnmatchedPayment` types (`database.ts:440-461`), reconciliation endpoints (`server.ts:6169-6208`+, `:6295+`) — real bookkeeping logic operating on simulated settlement data, not a real Daraja settlement feed |
| Refund support | ❌ Missing | — | No refund concept anywhere in TDD (`§16`'s external-services table doesn't mention refunds either). Current: `POST /api/v1/orders/:id/refund` (`server.ts:4024-4070`, also `:6260-6280`), wallet-credit-return option, full audit trail — real bookkeeping, simulated settlement |
| Idempotency | ❌ Missing | — | Zero mentions of "idempoten*" anywhere in the 2,147-line TDD. Current has a real, live, generic idempotency-key utility (`src/api/utils/idempotency.ts`, in-memory `Map` with TTL cleanup) applied to webhooks generally (`server.ts:8341-8360`) and `idempotency_key` fields on payment-adjacent records (`database.ts:428`) — the pattern is proven and working today, it just needs a durable (Firestore-backed, not in-memory) home in the target architecture, since an in-memory `Map` has the same serverless-statelessness problem flagged for rate limiting below |
| Order creation after payment success | 🟡 Partial | §11 (`OrderPaid` event) | The event exists conceptually; the actual state transition (pending → paid → order created/confirmed) and its interaction with inventory reservation above isn't specified |

### WhatsApp / Whatchimp

| Capability | Status | TDD Section | Evidence |
|---|---|---|---|
| AI conversations | ❌ Missing | — | No design. Current: rule-based multi-step conversational flow, state passed between turns (`server.ts:4692-4780`+) — see the chatbot caveat above, this is not an LLM |
| Order status updates | 🟡 Partial (designed, not verified live) | §4 (`NotificationService`), §11 | Covered generically as WhatsApp notification dispatch. Current logs the intent to send (`addNotificationLog(..., 'whatsapp', ...)`, `server.ts:3953-3955`) with `status: 'queued'` — grep confirms these records are almost never transitioned to `'sent'` anywhere in the codebase, meaning even the simulation doesn't complete the delivery loop, only the "we decided to notify" half of it |
| Payment reminders | 🟡 Partial | §4, §11 (generic) | Covered only as "a notification," no specific reminder/retry cadence design |
| Delivery notifications | 🟡 Partial (same as order status above) | §4, §11 | Same pattern and same caveat — logged as queued, not observed transitioning to sent |
| Referral messaging | ❌ Missing | — | Not named as a notification type or event consumer anywhere |
| Campaign/broadcast messaging | ❌ Missing | — | No broadcast/segment-messaging concept in TDD, and no bulk-send/campaign-blast endpoint found in the current codebase either — `marketing_whatsapp` consent flags (`database.ts:359-367`) exist, but nothing reads them to actually send a broadcast |
| Support escalation | ❌ Missing | — | No `SupportTicket`-equivalent collection anywhere in TDD §8. Current: full `SupportTicket`/`SupportTicketNote` types with category/priority/status (`database.ts:289-332`) |
| Human takeover | ❌ Missing | — | No concept in TDD. Current: a real state machine — `POST /api/v1/conversations/takeover` (`server.ts:11698-11733`, sets an `assigned_agent` + exclusive-lock object) plus intent-based auto-escalation (`server.ts:11440-11441`) |
| Webhook handling (inbound) | 🟡 Partial | §10 (route named) | `POST /api/webhooks/whatsapp` is named "(if kept)" — treated as optional/uncertain, not designed. Current's real inbound handler (`src/api/webhooks/webhookControllers.ts:7-33`) only logs the payload — no parsing/dispatch beyond that |

**Does the current architecture include an integration layer suitable
for Whatchimp?** No. The TDD has no concept of an "integration layer"
at all — `lib/` (§13) has `firebase/`, `auth/`, `firestore/`,
`validation/`, `flags/`, and three ported utility files, nothing for
third-party API clients (Daraja, Whatchimp, Meta, SendGrid). Every
external call implicitly happens "from a Service" (§4's diagram shows
`SVC --> External`) with no client/adapter abstraction, no retry policy,
no credential-rotation story specific to each provider. This is a real
architectural gap, not just a missing collection — see §4 (Missing
Architecture) below.

### Referral System

| Capability | Status | TDD Section | Evidence |
|---|---|---|---|
| Referral codes | ✅ Full (field-level) | §8 | `referralCode` on both `creatorProfiles` and `customerProfiles` |
| Creator referral links | 🟡 Partial | §8 (field only) | Code exists; link-generation/QR-code convention not specified (current has both, `server.ts:2685-2686`) |
| Customer referral links | 🟡 Partial | §8 (field only) | Same as above |
| Referral attribution | 🟡 Partial | §11 (event consumer only) | "Referral bonus processing" is named as a consumer of `OrderPaid`/`QuestCompleted`, but there's no `referrals` collection to attribute *to* — nothing records who referred whom, when, or their status |
| Referral rewards | 🟡 Partial | §11 | Same gap — the *mechanism* (an event fires) exists; the *record* of what was rewarded doesn't |
| Fraud prevention | 🟡 Partial | §8 (`withdrawals.fraudScore` only) | Fraud scoring exists for withdrawals specifically, not for referrals. Current has a dedicated `'fraud_flagged'` referral status (`database.ts:55`) with no TDD equivalent |
| Commission tracking | 🟡 Partial | §8 (`creatorProfiles.pendingEarningsKes` etc.) | Raw balance fields exist; no per-referral/per-conversion commission record |
| Wallet credits | ✅ Full (customer side) | §4, §8 | `WalletService` + `walletTransactions` — well-designed, atomic, ledger-enforced |
| Referral analytics | ❌ Missing | — | No design. Current has real referral-performance aggregation (`server.ts:2732-2733`, `:3571-3573`) |

**Are additional collections/services/repositories/events required?**
Yes — a `referrals` collection (mirroring the current `Referral` type),
a `ReferralRepository`, and expanding `ReferralService` beyond "bonus
qualification rules" to actually own attribution recording, fraud
flagging, and commission calculation as a real state machine — the same
treatment §4 already gives `WithdrawalService`.

### Creator Journey

| Capability | Status | TDD Section |
|---|---|---|
| Creator onboarding | ✅ Full | §6, §8 (auto-created `creatorProfiles`) |
| Applications (pre-onboarding approval) | 🟡 Partial | Not designed — current system has creators self-register directly (`server.ts` creator-auth routes), no admin-approval-before-activation step in either system, so this may be a genuine product decision to make, not a migration gap |
| Campaign discovery | ✅ Full | §4 (`CampaignService.listActive()`), §9 |
| Content submission | ✅ Full | §4, §8, §9 |
| Approval workflow | ✅ Full | §4, §10 |
| Wallet (creator earnings) | 🟡 Partial | §8 (raw fields), **no ledger** | `availableCashKes`/`pendingEarningsKes`/`lifetimeEarningsKes` are plain fields on `creatorProfiles` mutated presumably by `CampaignService`/`WithdrawalService` — unlike customer wallets, there is **no `walletTransactions`-equivalent ledger for creator earnings**, so the "a balance never changes without a paired ledger write" discipline §4 explicitly calls out for customers doesn't apply symmetrically to creators. See Missing Architecture below |
| Withdrawal | ✅ Full | §4, §8, §9 — this is the TDD's best-designed subsystem |
| Notifications | ✅ Full (generic) | §4, §11 |
| Referral earnings | 🟡 Partial | Same referral-system gap as above |

### Admin Journey

| Capability | Status | TDD Section |
|---|---|---|
| Order management | 🟡 Partial | §4 (`OrderService` named, thin), §5.4 (scope listed, no design) |
| Customer management (CRM) | ❌ Missing | No `CustomerService`/`CustomerRepository` named anywhere. Current has a substantial CRM surface with no TDD equivalent: `CustomerSegment`, `CustomerTag`, `CustomerTimelineEvent`, `CustomerInternalNote`, `CustomerCommunicationLog`, `CustomerSurveyRecord`, `CustomerPrivacyConsent/Request` (`database.ts:247-380`) |
| Creator management | 🟡 Partial | Implied via `CampaignService`/`WithdrawalService`; no explicit creator-suspension/moderation Service |
| Campaign management | ✅ Full | §4 |
| Financial reconciliation | ❌ Missing | No `PaymentReconciliationService`/Repository, no idempotency data model — see Payments section above |
| Withdrawal approval | ✅ Full | §4, §9, §10 |
| Analytics | 🟡 Partial | `AnalyticsService` (§4) is scoped only to "conversion rate, tier progress" — creator-specific, not admin business analytics (revenue, CAC, cohorts) |
| Audit logs | ✅ Full | §8, §9, §22 |
| Notification management | 🟡 Partial | `NotificationService` (§4) composes/dispatches; no admin surface for managing templates, segments, or broadcast campaigns |

### Notifications

| Capability | Status | TDD Section |
|---|---|---|
| Email | 🟡 Partial (dispatch designed, no send capability anywhere yet) | §4, §11, §16 (SendGrid named) | Current has no SendGrid SDK dependency and no `sgMail`/SMTP call anywhere — only an *inbound* webhook receiver for delivery/bounce events (`src/api/webhooks/webhookControllers.ts:63-89`). Outbound send doesn't exist today in either system |
| WhatsApp | 🟡 Partial (dispatch designed, delivery not verified) | §4, §11, §16 | See the WhatsApp/Whatchimp section above — records log `status: 'queued'`, essentially never observed transitioning to `'sent'` |
| Push notifications | ❌ Missing | Not mentioned anywhere in the TDD. Current has only a browser permission-request stub (`Notification.requestPermission()`, `src/components/quest-center/QuestCenterContainer.tsx:160-179`) — no service worker, no FCM/VAPID keys, no server-side dispatch |
| In-app notifications | ✅ Full | §8 (`notifications` collection), §9 |
| SMS (future) | 🟡 Partial | Not designed, and the current `NotificationChannel` type includes `'sms'` (`database.ts:63`) as a peer to WhatsApp/email in name only — `.env.example` defines Twilio credentials but zero Twilio SDK usage exists anywhere in the repo |

**Should an event-driven notification service exist?** Conceptually
yes, and §11 already gets the *shape* right — `NotificationService` as
a consumer of domain events, dispatched async via Cloud Functions
triggers. What's missing is the **content/template layer**: nothing in
§4/§11 specifies how a notification's copy is composed per channel
(WhatsApp template IDs are provider-specific and versioned; email needs
HTML templates; push needs platform-specific payloads) — today this is
implicit in `NotificationService`'s one-line responsibility
("composing and dispatching... the single place that decides *how*").
That's the right owner; the *what* it composes needs its own design
pass once WhatsApp/email content requirements are known.

### Meta Conversion API

| Capability | Status | TDD Section |
|---|---|---|
| Purchase / ViewContent / AddToCart / InitiateCheckout / Lead / CompleteRegistration | ❌ Missing | Zero mentions of any of these event names anywhere in the TDD. Current's own `MarketingEventType` union (`src/types/attribution.ts:7-31`) defines `Lead`, `CompleteRegistration`, `InitiateCheckout`, `Purchase`, `Refund`, `ViewContent` — but **not `AddToCart`**, so even the current system's own event taxonomy is incomplete against the standard Meta CAPI event set, not just the TDD |
| Custom events | ❌ Missing | — |
| Offline conversions | ❌ Missing | — |
| Deduplication | ❌ Missing | Current models this correctly — `generateEventId()` produces a shared `event_id` used for both browser Pixel and server CAPI dispatch specifically for Meta's own dedup rules (`attributionTracker.ts:106-111`, `:203-214`), and the fabricated CAPI response even echoes `deduplicated: true` (`src/services/marketingService.ts:161-168`) — but since no real Graph API call exists, this has never been verified against Meta's actual dedup behavior |
| Retry strategy | ❌ Missing | Not found for CAPI dispatch specifically — the current dispatcher (`dispatchToAdPlatforms`, `src/services/marketingService.ts:143-198`) always "succeeds" since its responses are fabricated, so retry logic was never needed and doesn't exist |
| Background delivery | 🟡 Partial | §11's general event-driven pattern *could* host this, but Meta CAPI dispatch isn't named as an event consumer anywhere |
| Failure handling | ❌ Missing | — |

**Is the current event-driven architecture (§11) sufficient to host
this once designed?** Mechanically, yes — Firestore triggers +
scheduled jobs is a reasonable place to hang CAPI dispatch (fire on
`OrderPaid`, `QuestCompleted`, etc.). But §11's event catalog (§11.2)
doesn't include any marketing/attribution events today, and the
Firestore data model has no collection to write attribution events to
in the first place (no `marketingEvents` equivalent to the current
`db.marketing_events`). The mechanism is sufficient; the event catalog
and data model that would use it don't exist yet.

### Analytics

| Capability | Status | TDD Section |
|---|---|---|
| Business/sales analytics | ❌ Missing | No design; `AnalyticsService` is creator-tier-scoped only |
| Creator analytics | ✅ Full | §4 (`AnalyticsService`) |
| Marketing attribution | ❌ Missing | Depends entirely on the missing marketing-events data model above |
| Funnel analysis | ❌ Missing | — |
| LTV | ❌ Missing | — |
| CAC | ❌ Missing | — (current has a real per-channel CAC calculation, `server.ts:3563`) |
| ROAS | ❌ Missing | — |
| Referral performance | ❌ Missing | See Referral System above |
| Campaign performance | 🟡 Partial | Covered for creator campaigns (submission/approval counts); not for marketing ad campaigns |
| Customer cohorts | ❌ Missing | — |

### Integrations

| Integration | TDD Coverage |
|---|---|
| Daraja | 🟡 Partial — named, not designed (see Payments) |
| Whatchimp | ❌ Missing — see WhatsApp/Whatchimp above |
| Meta | ❌ Missing — see Meta CAPI above |
| SendGrid | 🟡 Partial — named in §16, no design detail |
| Firebase Auth | ✅ Full — §6, the TDD's strongest section |
| Firestore | ✅ Full — §8, §9 |
| Storage | 🟡 Partial — well-designed *given* it's currently blocked on the Blaze plan (§16); the abstraction (`StorageRepository`) is good, actual usage (campaign proof uploads) isn't wired to any Service yet |
| Cloud Functions | ✅ Full (as a mechanism) — §11; the *event catalog* that would use it is incomplete per the gaps above |
| Vercel | ✅ Full | §17 |
| Future Shopify integration | 🟡 Partial | `OrderSource` type already includes `'shopify'`/`'meta_shop'`/`'tiktok_shop'` (`database.ts:41`) as known current values; TDD doesn't mention any of them |
| Future ERP integration | ❌ Missing | Not mentioned; no current equivalent either — genuinely future |

### Cross-Cutting Architecture Patterns

| Pattern | Status | Evidence |
|---|---|---|
| Service Layer | ✅ Full | §4 — the TDD's best section |
| Repository Layer | ✅ Full | §4 |
| **Integration Layer** | ❌ Missing | No `lib/integrations/` (or equivalent) named in §13's folder structure at all. Every external call is implicitly "from inside a Service," with no shared client/adapter, no per-provider config, no shared retry/timeout policy |
| **Webhook Layer** | 🟡 Partial | Individual webhook routes are named (§10) as thin Route Handlers; no shared webhook-verification/idempotency/logging concern factored out — each webhook would reimplement signature checking and dedup independently |
| Background Jobs | ✅ Full (mechanism) | §11.4 — good list of *what* runs as a background job; doesn't yet cover marketing/CAPI/reconciliation jobs specifically |
| Event Bus | ✅ Full (mechanism) | §11.3 — Firestore triggers, explicitly reasoned about vs. a dedicated queue |
| Feature Flags | ✅ Full | §20 — thorough, correctly scoped |
| Secrets Management | ✅ Full | §17 — thorough |
| Observability | ✅ Full | §22 — thorough, metrics list already anticipates Daraja/WhatsApp failure tracking even though the subsystems themselves aren't designed yet |
| **Rate Limiting** | 🟡 Partial, and the existing claim is wrong | §10 says the current `sensitiveRateLimiter`/`globalRateLimiter` "ports directly." Confirmed by evidence this doesn't hold: `applyRateLimit()` (`server.ts:117-145`) is a real, working in-memory sliding-window IP counter (250 req/min global, 10 req/min on sensitive endpoints) — but it's **in-process memory**, viable only because `server.ts` is a single long-lived Express process. Vercel serverless functions share no memory across invocations, so an in-memory counter resets or fragments per instance in the target architecture. The same problem applies to the idempotency utility above (also an in-memory `Map`). Both need a durable, shared store (Firestore-backed counters, or an external store like Upstash Redis) — a real redesign, not a port |
| **Retry Policies** | ❌ Missing | Not designed for any external call (Daraja, Whatchimp, SendGrid, Meta) |
| **Circuit Breakers** | ❌ Missing | Not mentioned anywhere in the TDD; confirmed zero implementation in the current codebase too (a narrative string in an admin audit-report generator claims "auto-fallback to secondary Daraja Paybill ledger," `server.ts:11948`, but no code implements it) |
| **Outbox Pattern** | ❌ Missing | Not mentioned. Relevant specifically because Firestore triggers (§11.3) already provide at-least-once delivery for *internal* events, but nothing covers the *outbound* side — e.g., ensuring a Meta CAPI call or a Daraja STK push that fails mid-flight doesn't get silently dropped |
| **Idempotency** | ❌ Missing | See Payments above — the single most concrete, already-partially-solved-in-`server.ts` gap in the whole audit |
| **Scheduled Jobs** | ✅ Full (mechanism) | §11.4 lists several; doesn't yet include payment reconciliation cron cadence, CAPI retry sweep, etc. specifically |
| **Dead Letter Queue strategy** | ❌ Missing | Not mentioned in the TDD. §11.3 gestures at "if event volume outgrows Firestore triggers, a dedicated queue is the natural next step" but says nothing about what happens to an event that fails all retries *today*. The current codebase has only a facade: `db.message_queue` (`server.ts:11592-11593`) reports `processed`/`delayed_retry`/`dead_letter` counts from static seed data, and its "retry" endpoint (`server.ts:11652+`) flips a status field without re-dispatching anything — no real queue or worker backs it |

---

## 3. Missing Architecture

Everything below is absent from the TDD (§8/§10/§11/§13) but has a
direct current-system equivalent unless marked **(net-new)**.

**Collections** (Firestore, alongside the existing 12 in §8):
- `packages` — box/product types (mirrors current `Package`)
- `landingPages` — per-page conversion tracking
- `sessions` — visitor session + first/last-touch attribution
- `marketingEvents` — Meta/TikTok/Google CAPI event log (mirrors `db.marketing_events`)
- `referrals` — referral attribution/status/fraud (mirrors current `Referral`)
- `payments` — Daraja payment attempts, distinct from `orders` (mirrors current `Payment`)
- `unmatchedPayments` — orphaned Daraja receipts pending manual match
- `paymentReconciliations` — reconciliation audit trail
- `webhookEvents` — inbound webhook log, the natural home for idempotency-key dedup across *any* provider (Daraja, Whatchimp, SendGrid)
- `inventoryReservations` — time-boxed stock holds during checkout
- `pickupStations` — county/area-keyed delivery/pickup points
- `supportTickets` (+ notes) — customer support/escalation
- `customerSegments`, `customerTags`, `customerTimelineEvents` — CRM
- `couponCodes` — **(net-new)**, no current equivalent
- `subscriptions` — **(net-new)**
- `operatingExpenses`, `purchaseOrders`, `snacks`/`snackBatches` — inventory/accounting (Phase 5 territory per §23, but the *collections* should exist in §8's schema now per §8's own stated reasoning — "write the full ruleset against the full schema now" — which this audit found wasn't actually followed for these domains)

**Repositories:**
- `PackageRepository`, `LandingPageRepository`, `SessionRepository`,
  `MarketingEventRepository`, `ReferralRepository`, `PaymentRepository`,
  `WebhookEventRepository`, `InventoryReservationRepository`,
  `PickupStationRepository`, `SupportTicketRepository`,
  `CustomerRepository` (doesn't exist at all today, despite
  `customerProfiles` being a first-class collection)

**Services:**
- `MarketingAttributionService` — UTM/click-ID capture, session
  linkage, first/last-touch resolution
- `MetaConversionService` (and equivalents per platform, or one
  `AdConversionService` abstracting Meta/TikTok/Google) — CAPI event
  construction, dedup via shared `event_id`, retry
- `PaymentService` — STK push orchestration, callback verification,
  idempotency enforcement, state machine (initiated → callback received
  → verified/failed/expired → reconciled)
- `ReconciliationService` — matching Daraja settlement records to
  `payments`, surfacing `unmatchedPayments`
- `RefundService` (or fold into `PaymentService`/`OrderService`) —
  refund initiation, wallet-credit-return logic
- `InventoryReservationService` — reserve-on-checkout-start,
  release-on-timeout-or-cancel, confirm-on-payment
- `DeliveryService` — pickup station selection, door-delivery
  eligibility/pricing by county
- `ConversationService` (Whatchimp orchestration) — the actual
  bot-flow state machine currently living inline in `server.ts`'s route
  handler, which needs the same Service-layer treatment §4 gives
  everything else
- `CustomerService` — CRM: segments, tags, timeline, notes,
  communication log, privacy consent/requests
  — **this is the single largest concrete Service gap**: `customerProfiles`
  is a first-class §8 collection with no owning Service at all today
- `ReferralService` — exists as a name in §4 but needs real scope
  (attribution recording, fraud flagging, commission calc), not just
  "bonus qualification rules"
- `CreatorWalletService` (or extend `WalletService`) — pair every
  `creatorProfiles` financial-field mutation with a ledger write, the
  same discipline customers already get

**Webhooks** (beyond the two already named in §10):
- `POST /api/webhooks/whatchimp` — inbound WhatsApp messages (the "if
  kept" framing in §10 should become a firm design; the conversational
  flow already exists and is real)
- `POST /api/webhooks/sendgrid` — delivery/bounce/open events (config
  already exists, `server.ts:376`)
- A shared webhook-verification/idempotency middleware/utility all of
  the above route through, rather than each reimplementing signature
  checking independently

**Background Jobs / Scheduled Jobs** (beyond §11.4's current list):
- Meta/TikTok/Google CAPI retry sweep (for failed dispatches)
- Inventory reservation expiry sweep (release holds past their timeout)
- Payment reconciliation (named generically in §11.4 as "scheduled
  payout reconciliation," but scoped only to withdrawals — this needs
  a matching job for *incoming* Daraja payments, not just outgoing
  payouts)
- STK push timeout sweep (mark expired requests, release any
  associated inventory hold)

**APIs** (Route Handlers, beyond §10's table):
- `POST /api/orders/[id]/reserve-inventory`, `.../confirm`,
  `.../release`
- `POST /api/payments/mpesa/reconcile` (admin-triggered manual match)
- `POST /api/orders/[id]/refund`
- `POST /api/marketing/events` (server-side CAPI ingestion, mirroring
  the current one)
- `POST /api/referrals/apply` (validate + attribute a referral code at
  checkout)

**Events** (extending §11.2's table):
- `PaymentInitiated`, `PaymentVerified`, `PaymentFailed`,
  `PaymentExpired`, `PaymentReconciled`
- `InventoryReserved`, `InventoryReservationExpired`
- `ReferralAttributed`, `ReferralQualified`, `ReferralFraudFlagged`
- `MarketingEventCaptured` (triggers CAPI dispatch async, rather than
  the current synchronous-looking dispatch in `server.ts:7663`)

**Integrations** (new `lib/integrations/` or per-provider client
modules, none of which exist in §13's folder structure today):
- `lib/integrations/daraja/` — STK push client, callback verification
- `lib/integrations/whatchimp/` — send message, conversation flow client
- `lib/integrations/meta/` — CAPI client, dedup helper
- `lib/integrations/sendgrid/` — already implied by "SendGrid" in §16,
  never given a client module

**Workers:** none of the above strictly need a distinct "worker"
process beyond Cloud Functions (§11.3's mechanism is sufficient) — but
CAPI dispatch and payment reconciliation specifically should be
scheduled/triggered Cloud Functions, not inline Route Handler logic, to
match §11's own "don't block the request path" principle. The current
`server.ts:7663`'s `dispatchToAdPlatforms()` call happens **inline**
inside the event-tracking Route Handler — exactly the anti-pattern §11
already identified and fixed for notifications, just not yet applied
here.

---

## 4. Recommended Changes

### Critical — must add before implementation continues past Phase 1

1. **Expand §8's data model** to include `packages`, `sessions`,
   `marketingEvents`, `referrals`, `payments`, `webhookEvents`,
   `inventoryReservations`, `pickupStations` — with security rules for
   each (§9's own stated principle: write rules against the *whole*
   schema now, which this audit found wasn't fully followed).
2. **Add `orders` attribution fields** (`utmSource`, `utmCampaign`,
   `fbclid`, `gclid`, `ttclid`, `referralCodeUsed`, `sessionId`,
   `landingPageId`, `deliveryMethod`, `county`) — these already exist on
   the real `Order` type and are captured today; omitting them from the
   Firestore `orders` collection means Phase 2 ships an order model that
   regresses existing attribution capability, not just lacks new
   capability.
3. **Design idempotency as a first-class cross-cutting concern**, not a
   per-endpoint afterthought — a shared pattern (idempotency key on
   `webhookEvents`, checked before processing any Daraja/Whatchimp/
   SendGrid webhook) before Phase 2's checkout flow is built, since
   Daraja's own callback behavior (which can and does redeliver) makes
   this correctness-critical from day one, not a later hardening pass.
4. **Design `PaymentService`/`payments` collection distinct from
   `orders`** — an order's payment can be retried, fail, expire, and be
   reconciled independently of the order record itself; conflating them
   (as the current §10 API table implicitly does by routing STK push
   through `OrderService`) will force an awkward retrofit once refunds
   and reconciliation are built.
5. **Add `CustomerRepository`/`CustomerService`** — `customerProfiles`
   is already a first-class §8 collection with zero owning Service;
   this blocks Phase 4 (Customer Quest Center, §23) regardless of the
   marketing/payments gaps, since even the "manage own profile"
   capability in §7's roles table has no Service backing it today.
6. **Redesign rate limiting for the serverless execution model** — the
   TDD's claim that the existing in-memory limiters "port directly"
   (§10) is incorrect for Vercel's per-invocation execution model and
   would silently under-enforce rate limits in production if built as
   currently described.
7. **Add the Integration Layer as an explicit architecture concept** —
   a new `lib/integrations/` folder convention in §13, with each
   provider (Daraja, Whatchimp, Meta, SendGrid) getting its own client
   module that Services call, rather than ad hoc `fetch()` calls
   scattered across Services with no shared retry/timeout/credential
   convention.
8. **Resolve the `src/modules/*` vs. inline `server.ts` route
   duplication before using either as a migration source.** Confirmed
   during this audit: several payment/order endpoints have two
   competing implementations, and the *thinner*, less-capable one is
   the one actually running today (Express route registration order).
   Whoever migrates payment/referral/order logic in Phase 2 needs to
   know this going in — the more complete inline logic (duplicate-
   callback detection, richer fraud scoring) is a better design
   reference, but its *current live behavior* is the thinner version,
   and any "this already works today" assumption should be verified
   against the actually-reachable route, not just the presence of code
   in the file.

### Important — should add, doesn't block Phase 1/2 but does block Phase 2 going live for real payments/marketing

9. Referral system: `referrals` collection, expand `ReferralService`'s
   scope, add referral-specific fraud flagging distinct from
   withdrawal fraud scoring.
10. Meta/TikTok/Google CAPI: `MarketingAttributionService` +
    `AdConversionService`, event catalog extension in §11.2, background
    dispatch (not inline).
11. Inventory reservation: `InventoryReservationService` +
    `inventoryReservations` collection + expiry sweep job — checkout
    correctness depends on this once real payments are live (avoiding
    overselling during the STK-push wait window).
12. Delivery/pickup: `pickupStations` collection, `DeliveryService`,
    shipping-fee calculation logic.
13. Creator earnings ledger: extend the wallet-ledger discipline §4
    already requires for customers to creator `pendingEarningsKes`/
    `availableCashKes` mutations.
14. Support/CRM: `supportTickets` + related collections and a
    `CustomerService` scope wide enough to cover them (can be Phase 5
    per §23, but the *collection design* should happen alongside
    §8's other collections now, matching §8's own reasoning).
15. Analytics: expand `AnalyticsService` (or add a distinct
    `BusinessAnalyticsService`) to cover revenue/CAC/cohort/funnel
    metrics, not just creator tier progress.
16. Webhook layer: shared verification/idempotency utility (a durable,
    Firestore-backed version of the current in-memory one), formalize
    the Whatchimp and SendGrid webhooks from "if kept"/unmentioned to
    designed.

### Future — can wait, genuinely net-new or low-urgency

17. Coupons/discount codes (net-new — the current hardcoded promo
    string isn't a system to preserve).
18. Subscriptions (net-new).
19. Gift orders (net-new).
20. Monthly box themes (net-new).
21. Push notifications (no current implementation beyond a permission
    prompt).
22. Circuit breakers, outbox pattern, dead letter queue strategy — real
    patterns worth having, but appropriate to defer until the
    integration layer (Critical #7) exists and real failure volume
    from Daraja/Whatchimp/Meta is observed, per §11.3's own stated
    philosophy of not over-building for scale not yet reached. (The
    current `db.message_queue`/DLQ facade should not be ported — it's
    a status-flipping UI over static data, not a real queue.)
23. Shopify/ERP integrations — explicitly future per the original brief
    and no current implementation (though `OrderSource` already lists
    `'shopify'`/`'meta_shop'`/`'tiktok_shop'` as known values,
    `database.ts:41`, worth keeping in mind if Shopify moves up in
    priority).

---

## 5. Updated Implementation Order

**Yes, the roadmap should change before Phase 2 begins.** Phase 1
(Creator Portal) does not need to pause — it's the one phase this TDD
actually supports — but a **Phase 0.5 (Data Model & Integration Layer
Expansion)** should run either in parallel with the tail of Phase 1 or
immediately after it, before Phase 2 (marketing/checkout, §23) starts:

1. **Continue Phase 1** (Creator Portal pilot) as planned — unaffected
   by every gap in this audit.
2. **Insert Phase 0.5** before Phase 2:
   - Expand §8's Firestore schema per Critical items 1-2 above, with
     rules and rules-unit-tests for each new collection (matching the
     Phase 0 pattern already established).
   - Design and document the Integration Layer (Critical #7) —
     `lib/integrations/{daraja,whatchimp,meta,sendgrid}/` conventions —
     as its own short TDD addendum or ADR, since it's a genuine
     architectural addition, not an implementation detail.
   - Design `PaymentService`/`payments` and idempotency handling
     (Critical #3-4) — this is the highest-risk gap to leave undesigned
     once real money moves through Phase 2's checkout.
   - Add `CustomerRepository`/`CustomerService` (Critical #5).
   - Redesign rate limiting for serverless (Critical #6).
3. **Phase 2 (marketing/checkout)** proceeds only after Phase 0.5 lands
   — building checkout against the current §8 schema would ship an
   `orders` collection that can't record attribution, has no payment
   state machine, and no inventory-reservation correctness guarantee.
4. **Phase 3 (Admin)** — add `CustomerService`'s CRM scope (Important
   #14) and reconciliation UI here, since admin financial reconciliation
   (Important #15, part) and customer management are admin-surface
   features by nature.
5. **Phase 4 (Customer Quest Center)** — proceeds as planned once
   Phase 0.5's `CustomerService` exists; add the referral system
   (Important #9) here since customer-side referral redemption is part
   of this phase's scope already.
6. **Phase 5 (remaining admin domains)** — unchanged in scope, but the
   collections it needs (inventory, accounting) should already exist
   from Phase 0.5's schema expansion rather than being designed from
   scratch at Phase 5, per §8's own "design the whole schema up front"
   reasoning.
7. **Future work** (Critical/Future items 16-22) — unchanged, deferred
   as originally scoped.

This reordering costs one additional phase's worth of design-and-rules
work before Phase 2, in exchange for not retrofitting a payment state
machine, attribution fields, and an integration layer into a checkout
flow that's already shipped and handling real transactions.
