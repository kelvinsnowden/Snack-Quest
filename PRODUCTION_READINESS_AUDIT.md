# Snack Quest OS — Production Readiness Audit

**Date:** 2026-08-01
**Scope:** `snack-quest-next/` on branch `claude/snack-quest-portal-rebuild-dtxsql`
**Method:** direct source inspection. Every claim below is grounded in a
named file. Where something is *not* implemented, that means a search of
`app/`, `components/`, `lib/`, `services/`, `repositories/`, `types/`,
and `scripts/` found no implementation — not that it was assumed absent.

---

## 1. Integration Portal Audit

### 1.1 The headline finding

**There is no Integration Portal.** No screen, form, or API route in the
entire codebase reads or writes
`businesses/{businessId}/integrationSecrets/{provider}`. Verified by
searching every `.ts`/`.tsx` file under `app/`, `components/`, and
`services/` for both the collection name and
`businessIntegrationSecretRepository` — the only non-test hits are the
repository itself, the Gateway config modules that read it, and the seed
scripts that write it.

`/admin/settings` exists but manages **business profile fields only** —
name, currency, `whatsappPhoneNumberId`, `countyCoverage`,
`adminWhatsappPhone`, `whatsappCustomerNumber`, `status`
(`app/admin/(protected)/settings/page.tsx`). No credential is reachable
from it.

Provisioning today is:
```
npm run seed:business            # writes integrationSecrets from .env.local
npm run secure:daraja-webhook    # sets darajaSecret.webhookSecret
npm run secure:jumia-webhook     # sets jumiaSecret.webhookSecret
npm run seed:staff               # creates the first super_admin
npm run seed:packages
npm run seed:pickup-stations
npm run seed:notification-templates
```

### 1.2 Integration matrix

| Integration | Supported? | Configurable from UI? | Requires code change? | Status |
|---|---|---|---|---|
| **Daraja (M-Pesa) C2B** | ✅ Real (`darajaGateway.ts`) | ❌ No | ❌ No — but requires shell access + re-running a seed script | Working; credentials CLI-only |
| **Daraja B2C (payouts)** | ✅ Real (withdrawals) | ❌ No | ❌ No | Working; `b2cInitiatorName`/`b2cSecurityCredential` CLI-only |
| **Meta Pixel** | 🟡 Pixel ID stored, only used by CAPI | ❌ No | ❌ No | No browser-side pixel script anywhere in the app |
| **Meta Conversions API** | ✅ Real (`metaConversionGateway`) | ❌ No | ❌ No | Working; server-side only |
| **WhatsApp / Whatchimp** | ✅ Real (`whatchimpGateway.ts`) | 🟡 `whatsappPhoneNumberId` yes; API key no | ❌ No | Working; API key + catalogId CLI-only |
| **Jumia** | ✅ Real (booking + tracking webhook) | ❌ No | ❌ No | Working; credentials CLI-only |
| **Firebase** | ✅ Real (Auth + Firestore) | ❌ No | ❌ No | Env vars only; change ⇒ **redeploy** |
| **Email (SendGrid)** | ✅ Real (`sendGridGateway.ts`) | ❌ No | ❌ No | Platform-wide env var; change ⇒ **redeploy** |
| **SMS (Africa's Talking)** | ✅ Real (`africasTalkingGateway.ts`) | ❌ No | ❌ No | Platform-wide env var; change ⇒ **redeploy** |
| **Vercel Blob (storage)** | ✅ Real | ❌ No | ❌ No | `BLOB_READ_WRITE_TOKEN`; change ⇒ **redeploy** |
| **Google Maps** | ❌ **Not integrated at all** | — | ✅ Yes | No Maps/geocoding code exists. Addresses are free text; pickup stations come from a static seeded dataset |
| **Analytics (3rd-party)** | ❌ **None** | — | ✅ Yes | No GA/Segment/Mixpanel/PostHog. Analytics is entirely first-party (`businessAnalyticsService`) |
| **AI Providers** | ❌ **None** | — | ✅ Yes | No OpenAI/Anthropic/Gemini. The "bot" is a deterministic state machine, not an LLM |
| **Vercel Cron** | ✅ Real (`vercel.json`) | ❌ No | ❌ No | `CRON_SECRET` env var |

### 1.3 Credential-by-credential

**Tier A — per-tenant, in Firestore** (`businesses/{id}/integrationSecrets/{provider}`):
Daraja (consumerKey, consumerSecret, shortcode, passkey, callbackUrl, env,
b2cInitiatorName, b2cSecurityCredential, webhookSecret) · Whatchimp
(apiKey, phoneNumberId, baseUrl, catalogId) · Jumia (apiKey, merchantId,
baseUrl, webhookSecret) · Meta (pixelId, accessToken, apiVersion)

| Property | Answer |
|---|---|
| Where stored | Firestore subcollection, per business |
| Editable in UI | ❌ No — seed script only |
| Requires redeploy to change | ✅ **No** (read at request time) — a genuine strength |
| Encrypted | 🟡 Google-managed encryption at rest only. **No application-level encryption/KMS** — verified: no `createCipheriv`/KMS code exists |
| Access control | ✅ Strong — `allow read, write: if false` unconditionally (`firestore.rules:337`), no admin exception. Admin SDK only |
| Test connection from UI | ❌ No |

**Tier B — platform-wide, environment variables** (change ⇒ **redeploy**):
`FIREBASE_ADMIN_*`, `NEXT_PUBLIC_FIREBASE_*`, `SENDGRID_API_KEY`,
`SENDGRID_FROM_EMAIL`, `AFRICAS_TALKING_*`, `BLOB_READ_WRITE_TOKEN`,
`CRON_SECRET`, `WHATCHIMP_WEBHOOK_VERIFY_TOKEN`,
`WHATCHIMP_WEBHOOK_SECRET`, `WHATCHIMP_CHECKOUT_API_KEY`,
`INTERNAL_AGENT_API_KEY`, `NEXT_PUBLIC_SITE_URL`.
None UI-editable. None app-encrypted (platform secret store only).

**No integration anywhere has a "Test connection" affordance.**

---

## 2. Blueprint Conformance Review

Baseline: `TECHNICAL_DESIGN_DOCUMENT.md` (original) as amended by
`PLATFORM_ARCHITECTURE_V2.md`.

| # | Blueprint requirement | Current implementation | Status | Deviation reason | Improvement? |
|---|---|---|---|---|---|
| 1 | Service / Repository layering (§4) | Fully applied + a third **Gateway** layer | ➕ | ADR-0008: services must never call providers directly | ✅ Yes |
| 2 | Marketing website (§4.1) | 10 real pages, live Firestore data, SEO, JSON-LD, sitemap/robots | ✅ | — | — |
| 3 | Creator Portal (§4.2) | Full: auth, dashboard, links, earnings, withdrawals, campaigns, leaderboard, profile | ✅ | — | — |
| 4 | **Customer Portal / Quest Center (§4.3)** | **Nothing.** No routes. `types/questSubmission.ts` + `types/walletTransaction.ts` and `customerProfile.walletBalanceKes` exist as *schema only* — zero services, repositories, or UI | ❌ | Superseded by the WhatsApp-first reframe: the conversation replaced the web funnel. But loyalty/credits were never re-homed anywhere | ⚠️ Partly — see §3 |
| 5 | Admin Portal + RBAC (§4.4) | 17 nav sections, all real. Roles enforced | ✅ | — | — |
| 6 | API Gateway subdomain (§4.5) | Next.js Route Handlers in one app | 🟡 | Single deployable is simpler at this scale | ✅ Yes |
| 7 | Firebase Auth for staff + creators (§6) | Real: session cookies, custom claims, `proxy.ts` protection | ✅ | — | — |
| 8 | Customer auth (§6) | ❌ None — customers are identified by WhatsApp number | 🟡 | Conversation *is* the session; no customer login surface exists to protect | ✅ Yes, for this model |
| 9 | Firestore data model (§8) | Implemented + heavily extended (~34 type modules) | ➕ | — | ✅ Yes |
| 10 | Security rules (§9) | Deployed live. Deny-by-default; all writes Admin-SDK-only | ✅ | Tenant-scoped *admin reads* still open — documented gap (§17.5) | — |
| 11 | Event-driven architecture (§11) | `publishEvent()` + `domainEvents` | 🟡 | Events are recorded and published in-process, not via Firestore-trigger fan-out | ⚠️ Neutral |
| 12 | Feature flags (§20) | ❌ **Not implemented** | ❌ | Never prioritised | — |
| 13 | Search strategy (§19) | ❌ Not implemented | ❌ | Explicitly "future" in the blueprint | — |
| 14 | Testing strategy (§21) | 709 tests, 96 files, incl. rules + integration | ✅ | — | — |
| 15 | **Observability (§22)** | ❌ **No Sentry/OTel/structured logging** | ❌ | Never prioritised | — |
| 16 | Conversation Domain (V2 §6) | Full state machine, human takeover | ✅ | — | — |
| 17 | PaymentIntent/Attempt + idempotency (V2 §7) | Full, incl. webhook ledger + reconciliation | ✅ | — | — |
| 18 | Delivery Domain (V2 §12) | Shipments, Jumia booking, tracking webhook, analytics | ✅ | — | — |
| 19 | Referral Domain (V2 §8) | Links, attribution, commission, withdrawals | 🟡 | Attribution *windows* and fraud scoring deliberately not built | — |
| 20 | Campaign Marketplace (V2 §9) | Browse + submissions | 🟡 | Application/submission split simplified to submissions | — |
| 21 | Multi-tenancy (V2 §17) | Real: `businessId` everywhere, per-tenant Gateway credentials, second-tenant proof test | ➕ | Upgraded from "seam" to built | ✅ Yes |
| 22 | Inventory (V2 §5, deferred to Phase 5) | Built early: batches, suppliers, POs, movements, expiry, write-offs | ➕ | Pulled forward | ✅ Yes |
| 23 | `PushGateway` / FCM (V2 §13) | ❌ Not built | ❌ | Documented as intentional | — |
| 24 | `subscriptions` commerce (V2 §5) | ❌ Schema reserved only | ❌ | Documented as intentional | — |
| 25 | County waitlist (V2 §19.20) | ❌ Not built | ❌ | Documented as intentional | — |

---

## 3. Missing Valuable Ideas (blueprint items still worth building)

### 3.1 Customer loyalty / Quest Credits — **the biggest omission**
- **Why omitted:** the WhatsApp-first reframe deleted the web Customer
  Portal that would have hosted it; the loyalty *concept* was never
  re-homed into the conversation.
- **Evidence it was intended:** `types/questSubmission.ts`,
  `types/walletTransaction.ts`, and `customerProfile.walletBalanceKes` /
  `lifetimeCreditsEarnedKes` all still exist, unused.
- **Effort:** Medium (WalletService + ledger + 2–3 conversation steps +
  admin view). The schema already exists.
- **Business value:** High — it is the only repeat-purchase lever in a
  business whose entire economics depend on reorders. The brand is
  literally called *Snack Quest*.
- **Verdict:** **Phase 2, shortly after launch.** Not a launch blocker,
  but the highest-value unbuilt idea. Leaving dead schema in place is
  itself a small debt.

### 3.2 Observability (§22)
- **Why omitted:** never prioritised against feature work.
- **Effort:** Small (Sentry + structured logging ≈ half a day).
- **Value:** High — today a failing Daraja callback in production is
  invisible until someone notices missing money.
- **Verdict:** **Before launch.**

### 3.3 Repeat-purchase automation (V2 §14)
- **Why omitted:** depends on scheduling; cron only landed recently.
- **Effort:** Small–Medium (the cron mechanism now exists).
- **Value:** High — direct revenue.
- **Verdict:** Phase 2.

### 3.4 Feature flags (§20)
- **Effort:** Small. **Value:** Medium. **Verdict:** Post-launch.

### 3.5 Referral attribution windows + fraud scoring (V2 §8)
- **Effort:** Medium. **Value:** Medium now, High once creator volume
  grows and someone games flat `commissionKes`.
- **Verdict:** Post-launch, but before scaling the creator programme.

---

## 4. Features Added Beyond the Blueprint

| Capability | Why added | How it strengthens the platform |
|---|---|---|
| **Conversation Domain + state machine** | The governing correction: WhatsApp *is* the checkout | Removes the entire web-checkout surface and its abandonment problem |
| **Gateway layer** (retry, circuit breaker, idempotency, per-tenant creds) | Blueprint had services calling APIs directly | One provider outage can't cascade; swapping a courier is a new class |
| **Real multi-tenancy** | Elevated to "Creator Commerce OS" | A second business is a document, not a fork — proven by test |
| **Inventory: batches, suppliers, POs, movements, expiry, write-offs** | Was Phase-5 "schema reserved" | Real stock control, real supplier ledger, full audit trail |
| **Agent workspace** | Door delivery needs human pricing (Bolt quotes) | Makes the hardest delivery case operable |
| **Warehouse workspace** | Packing/dispatch has no home in the blueprint | Physical ops become a first-class surface |
| **Finance workspace** | Money movement needs segregation of duties | Commission ledger, payouts, refunds, reconciliation in one role-gated place |
| **RefundService + Daraja reversals** | Blueprint only implied automatic refunds | Real customer-initiated refunds with real money movement |
| **Payment reconciliation + `unmatchedPayments`** | Daraja is at-least-once and lossy | Prevents silent revenue leakage |
| **Webhook origin verification** | Blueprint assumed provider signing that doesn't exist | Closes an open door on 3 real webhook endpoints |
| **Notification breadth (email + SMS + retry sweep + template catalog)** | Blueprint listed gateways as TBD | Real multi-channel delivery with retry |
| **Jumia pickup-station dataset + zones** | Blueprint said "pickup stations" abstractly | Real nationwide coverage from a real dataset |
| **Marketing website + full SEO** | Blueprint had a marketing site; this adds JSON-LD, OG, sitemap, a11y, reduced-motion | Real acquisition surface |
| **Audit logs + storage browser** | Not in blueprint | Traceability and asset management |

---

## 5. Admin Experience Audit — "can the owner run this without a developer?"

| Task | Doable in UI? | Where / what's missing |
|---|---|---|
| Manage snack boxes (create/edit/deactivate) | ✅ | `/admin/products` |
| Update prices | ✅ | `/admin/products` |
| Upload product images | ✅ | `/admin/products` (Vercel Blob) |
| Manage inventory / adjust stock | ✅ | `/admin/inventory` |
| Manage suppliers | ✅ | `/admin/suppliers` |
| Purchase orders (create → order → receive) | ✅ | `/admin/purchase-orders` |
| Write off expired batches | ✅ | `/admin/inventory/batches` |
| View + manage orders | ✅ | `/admin/orders` |
| Refund an order | ✅ | `/admin/orders/[id]` |
| Manage creators (approve/reject) | ✅ | `/admin/creators` |
| Manage referral links **incl. commission per link** | ✅ | `/admin/referrals` |
| Approve/reject withdrawals + execute B2C payout | ✅ | `/admin/withdrawals` |
| Payment reconciliation | ✅ | `/admin/reconciliation` |
| Monitor deliveries / manual booking / override status | ✅ | `/admin/deliveries` |
| Monitor conversations / take over from bot | ✅ | `/admin/conversations` |
| View analytics (revenue, funnel, CAC, delivery perf.) | ✅ | `/admin/analytics` |
| Audit logs | ✅ | `/admin/audit-logs` |
| Business profile (name, currency, coverage, WhatsApp no.) | ✅ | `/admin/settings` |
| **Connect / rotate Daraja** | ❌ | **Developer required** — `.env.local` + `npm run seed:business` |
| **Connect / rotate Meta (Pixel + CAPI)** | ❌ | **Developer required** |
| **Connect / rotate Whatchimp API key** | ❌ | **Developer required** |
| **Connect / rotate Jumia** | ❌ | **Developer required** |
| **Rotate SendGrid / Africa's Talking / Blob** | ❌ | **Developer + redeploy** |
| **Create/edit/deactivate staff, change roles** | ❌ | **Developer required** — `npm run seed:staff` only. No staff CRUD UI or API exists |
| **Set pickup-station delivery fees** | ❌ | **Developer required** — seeded as `0`; `deliveryZoneRuleRepository.setFee()` exists but is **called from nowhere** |
| **Manage pickup stations** | ❌ | Seed script only |
| **Edit notification templates** | ❌ | Seed script only |
| **Set a global commission rate** | ❌ | Only per-link `commissionKes` / per-campaign `commissionRateKes` |
| **View system health / integration status** | ❌ | **No such page exists** |
| **Test an integration connection** | ❌ | No such affordance |

**Verdict:** day-to-day *trading* operations are genuinely self-service —
that's a real achievement. But **onboarding, configuration, and
personnel** still require a developer at a terminal.

---

## 6. Final Gap Analysis (prioritised)

### 🔴 Critical — fix before launch

| # | Gap | Business impact | Complexity | Effort |
|---|---|---|---|---|
| C1 | **Pickup delivery fees are all `0`** — every pickup order currently ships free, and there is no UI or called code path to set a fee (`setFee()` is dead code) | **Direct, ongoing revenue loss on every pickup order** | Low | **S** (0.5–1 d): call `setFee` from a small admin screen, or seed real fees |
| C2 | **No staff management UI** — cannot add an employee, revoke a leaver's access, or change a role without a developer | Security + operational. A departing employee keeps access until a developer intervenes | Low–Med | **S–M** (1–2 d) |
| C3 | **No observability** — no error tracking on payment/webhook paths | Failed payments and dropped webhooks are invisible | Low | **S** (0.5 d) |
| C4 | **Integration credentials are developer-only** | Blocks onboarding; makes emergency key rotation a deploy event | Med | **M** (3–5 d) — see I1 |

### 🟡 Important — recommended before launch

| # | Gap | Business impact | Complexity | Effort |
|---|---|---|---|---|
| I1 | **Integration Portal** (`/admin/integrations`): per-provider forms writing `integrationSecrets`, masked values, "Test connection", status badges | Turns a developer-gated setup into a self-service one; makes multi-tenancy actually sellable | Med | **M** (3–5 d) |
| I2 | **Application-level encryption for stored secrets** (KMS/envelope). Rules already deny all client access, but plaintext in Firestore is weak defence-in-depth | Compliance + breach blast radius | Med | **M** (2–3 d) |
| I3 | **Admin UI for pickup stations + notification templates** | Removes two more developer dependencies | Low | **M** (2–3 d) |
| I4 | **System health page** — Gateway circuit-breaker state, recent webhook failures, unprocessed events, retry-queue depth | Ops visibility; pairs with C3 | Low–Med | **S–M** (1–2 d) |
| I5 | **Meta Pixel browser-side script** — Pixel ID is stored but never emitted to the client; only CAPI fires | Halves ad-attribution quality | Low | **S** (0.5 d) |
| I6 | **Decide on the dead loyalty schema** — build it or delete it | Removes misleading dead code | Low | **S** to delete / **M** to build |

### 🟢 Future — post-launch

| # | Item | Impact | Complexity | Effort |
|---|---|---|---|---|
| F1 | Customer loyalty / Quest Credits in-conversation | High (repeat purchase) | Med | **M–L** |
| F2 | Repeat-purchase automation (cron exists) | High | Med | **M** |
| F3 | Tenant-scoped security rules (blocked on staff `businessId` claim — V2 §17.5) | Med now, Critical at tenant #2 | Med | **M** |
| F4 | Referral attribution windows + fraud scoring | Med | Med | **M** |
| F5 | Batch-level FIFO consumption at checkout | Med (COGS accuracy) | Med | **M** |
| F6 | Feature flags | Med | Low | **S** |
| F7 | Google Maps / address validation | Med (failed deliveries) | Med | **M** |
| F8 | Subscriptions commerce | High (recurring revenue) | High | **L** |
| F9 | Push notifications (`PushGateway`/FCM) | Low (WhatsApp already reaches everyone) | Med | **M** |
| F10 | Search (§19) | Low at current catalogue size | Med | **M** |

---

## 7. Bottom line

What was built is substantially **larger and more operationally serious**
than the original blueprint: a real conversation-driven commerce engine
with idempotent payments, reconciliation, refunds, courier integration,
full inventory and supplier management, three role-specific staff
workspaces, a creator programme, and genuine multi-tenancy.

The consistent weakness is **not** in the transactional core — it is at
the **configuration boundary**. The system is excellent at *running* a
business and still developer-dependent at *setting one up*. The single
most valuable next unit of work is the **Integration Portal (I1)**,
which converts the already-correct per-tenant credential architecture
into something a non-developer can actually use.

Two findings need attention regardless of roadmap: **pickup delivery
fees are silently zero (C1)** — an ongoing revenue leak — and **there is
no way to revoke a staff member's access without a developer (C2)**.
