# Audit: why the backend is slow, and what the machine network needs

Written before any vending code was added, against the live codebase and
production Firestore on 22 September 2026.

Every number below was measured. Where a number could not be measured
from here, it says so instead of guessing.

---

## 1. Current architecture, as it actually is

The short version: **the architecture is already largely what the vending
plan asks for.** Most of the usual suspects for a slow Firebase app are
absent from this codebase, and it is worth being precise about that
before proposing changes, because several obvious "fixes" would be
solving problems this project does not have.

| Layer | What is there |
|---|---|
| Framework | Next.js App Router, deployed on Vercel. **No Cloud Functions** — there is no `functions/` directory; all server code is route handlers (129) and server components. |
| Data access | `repositories/` (49 files) wrap every Firestore query. `services/` (43 files, ~15k lines) hold business logic. UI does not touch Firestore. |
| Admin SDK | `lib/firebase/admin.ts`, guarded by `import 'server-only'` — a build-time error if it is ever pulled into a client bundle. Lazily initialised behind a Proxy. |
| Client SDK | `lib/firebase/client.ts` is the **only** file importing `firebase/firestore` on the client. Auth + a narrow rules-enforced read exception. |
| Realtime | **Zero `onSnapshot` listeners in the entire codebase.** Every apparent match is `attributionSnapshot` or `createFromConversationSnapshot`. |
| Storage | Vercel Blob, not Firebase Storage. Firebase is Auth + Firestore only. |
| Scheduled work | Three Vercel crons (`retry-notifications`, `reconcile-stk-payments`, `reconcile-stuck-withdrawals`), nightly. |
| Indexes | 82 composite indexes in `firestore.indexes.json`. |
| Rules | 498 lines. |
| Roles | `admin \| super_admin \| agent \| warehouse \| finance`. **No partner role.** |
| Region | Firestore `africa-south1`; Vercel functions pinned to `cpt1`. Already co-located — see `docs/HOSTING_REGIONS.md`. |

So, pre-emptively, from the brief's list of suspected causes:

- **Realtime listener sprawl** — does not exist. Nothing listens.
- **Client-side Firestore fan-out** — does not exist. The browser does not query Firestore.
- **Cold starts / slow Cloud Functions** — not applicable. There are none.
- **Cross-region latency** — already found and fixed in a previous change; the DB and the functions are ~1,270 km apart, ~20 ms.
- **Missing service layer** — already built. Part 4 of the brief is essentially already satisfied.
- **Sequential awaits on page loads** — the two heaviest pages already use `Promise.all` across all their fetches.
- **Counting by reading documents** — `countByBusiness`, `countByStatus` use Firestore's `count()` aggregation.
- **Per-request session re-verification** — `getStaffSession` is wrapped in React `cache()`, so it verifies once per request.

That is a genuinely well-built application. The slowness has a narrower
cause, and it is measurable.

---

## 2. Why it is slow

### The production data, measured

```
  24740  pageViews          <-- dominant
   5750  analyticsEvents
    521  domainEvents
    421  webhookInspections
    323  auditLogs
     ...
     34  orders
   -----
  32492  documents total, 34 collections
```

The business has **34 orders**. It has **24,740 page views**. The
analytics collections are three orders of magnitude larger than the
commercial ones, and they are what the admin pages read.

### Finding 1 — the admin dashboard reads 20,000 documents to draw a few KPI cards

`app/admin/(protected)/page.tsx` calls
`businessAnalyticsService.getTraffic(businessId, 30)`. To compute a
30-day window *and its preceding 30-day window*, that calls
`pageViewRepository.listSince(businessId, previousCutoff)` — 60 days of
page views, capped at `MAX_PAGE_VIEWS_PER_QUERY = 20000`
(`repositories/pageViewRepository.ts:15`).

Measured against production Firestore:

| Query | Docs | Payload |
|---|---|---|
| `orders` (limit 1000) | 34 | 108 KB |
| `orders` (limit 5) | 6 | 18 KB |
| `shipments` (limit 500) | 34 | 16 KB |
| **`pageViews` (60d, cap 20000)** | **20,000** | **3,701 KB** |
| **Dashboard total** | **20,074 docs** | **3.8 MB** |

### Finding 2 — the analytics page reads 60,000 documents, most of them twice over

`app/admin/(protected)/analytics/page.tsx` fires 14 service calls in one
`Promise.all`. Nine of them independently call
`orderRepository.listByBusiness(businessId, { limit: 1000 })`:

```
services/businessAnalyticsService.ts:343   getRevenueOverview
services/businessAnalyticsService.ts:564   getWebFunnel
services/businessAnalyticsService.ts:630   getCac
services/businessAnalyticsService.ts:673   getCacByChannel
services/businessAnalyticsService.ts:764   getRevenueByChannel
services/businessAnalyticsService.ts:798   getCreatorRoi
services/businessAnalyticsService.ts:857   getRefundRate
services/businessAnalyticsService.ts:893   getRepeatPurchaseRate
services/businessAnalyticsService.ts:958   getLtv
```

Nine identical queries, nine round trips, nine deserialisations of the
same documents — plus a tenth read of `orders` inside
`fulfillmentAccountingService.getOverview`. And `pageViews` is read three
more times.

| | Docs | Payload |
|---|---|---|
| `orders` × 9 | 306 | 972 KB |
| `pageViews` × 3 | 60,000 | 10,926 KB |
| `shipments`, `conversations` | 85 | 66 KB |
| **Analytics total** | **60,391 docs** | **12.0 MB** |

Today that costs little in money (Firestore bills ~60k reads per page
load — about US$0.02 — but it is 60k reads *per admin page view*). It
costs a lot in time.

### Finding 3 — the cost is the document volume, not the network

The earlier region fix removed latency as the explanation, so I isolated
the remaining cost by seeding a local Firestore emulator with 21,426
page-view documents of the real shape and running the exact
`listSince` query over loopback — **no WAN round trip at all**:

```
docs returned        : 20000  (of 21426 matching)
fetch + transport    : 1673ms   <- localhost, no WAN RTT
.data() deserialise  :   26ms
in-memory aggregate  :   29ms
TOTAL per call       : 1725ms
```

Deserialisation and aggregation are trivial — 55 ms combined. **The 1.67
seconds is Firestore streaming 20,000 documents**, and no amount of
region tuning or faster JavaScript touches it. That call happens once on
the dashboard and three times on the analytics page.

> **Caveat, stated plainly.** The production timings in Findings 1–2 were
> taken from this sandbox, which has a **507 ms** single-document RTT to
> `africa-south1` (median of 5). Those absolute wall-clock figures —
> 6.5 s and 11.1 s — are therefore inflated and are *not* what a Cape Town
> function sees. **The document counts and payload sizes are exact.** The
> emulator number above is the honest, network-free floor, and it is the
> one to plan against.

### Finding 4 — traffic analytics is already silently wrong

This is the finding I would act on first, because it is a correctness bug
in production right now, not a future risk.

```
pageViews last  7d:   2700
pageViews last 30d:  21426   <-- over the 20,000 cap
pageViews last 60d:  24740   <-- over the 20,000 cap
pageViews total   :  24740
```

`listSince` caps at 20,000 and applies **no `orderBy`**. Firestore
therefore returns an arbitrary 20,000 of the 21,426 matching documents
and the service aggregates them as if they were the whole set. Every
traffic figure on the dashboard and the analytics page is currently
computed from an unpredictable ~93% sample, presented as exact. It will
get worse every day.

The emulator run reproduced it exactly: `20000 of 21426 matching → 1426
silently dropped`.

### Finding 5 — the date window never reaches the database

```ts
// services/businessAnalyticsService.ts:342
async getRevenueOverview(businessId: string, days = 30) {
  const { orders } = await orderRepository.listByBusiness(businessId, { limit: 1000 });
  const cutoff = Date.now() - days * 86400000;
  const inWindow = orders.filter((o) => ... toMillis(o.data.createdAt) >= cutoff);
```

`days` is a filter applied **in memory after the fetch**.
`orderRepository.listByBusiness` takes `status`, `limit` and `cursor` —
no date range. So "last 30 days" reads the newest 1,000 orders
regardless.

At 34 orders this is harmless. Past 1,000 orders it stops being a
performance issue and becomes a wrong-answer issue: `getLtv` and
`getCac` both reason about a customer's **first-ever** order, and a
newest-1000 window cannot see it. The metric will not error. It will
quietly report a better number than the truth.

### Finding 6 — the analytics collections have no retention

Neither `pageViews` nor `analyticsEvents` has a TTL policy
(`firestore.indexes.json` has exactly one `fieldOverride`, unrelated) and
no cron prunes them. Growth is ~2,700/week, ~386/day, and every row is
kept forever while every admin page load scans the recent slice of it.

### Finding 7 — the whole marketing site is uncacheable

`app/(marketing)/layout.tsx:24` sets `export const dynamic = 'force-dynamic'`,
with the reasoning that stock and contact details can change at any time.
That is true, and it does not require `force-dynamic`: it requires short
revalidation. As written, every visit to every marketing page is a full
server render with Firestore reads and **no CDN caching at all**. This is
the most likely cause of slow *customer-facing* page loads, as distinct
from slow admin pages.

### Finding 8 — N+1 on creator identity

`services/businessAnalyticsService.ts:614` and `:829` both do
`userRepository.findById(creatorId)` once per creator inside a
`Promise.all`. Concurrent, so not serial — but still one read per creator,
twice per analytics render, growing with the creator roster (33 today).
`getAll()` on document refs would make it one.

---

## 3. Evidence table

| Area | Current implementation | Problem | Evidence | Impact | Fix | Priority |
|---|---|---|---|---|---|---|
| Traffic analytics | `listSince` caps 20,000, no `orderBy` | Silently drops matching rows | 21,426 in 30d vs 20,000 cap; emulator dropped 1,426 | **Wrong numbers, today** | Pre-aggregate daily; never scan raw | **P0** |
| Dashboard | `getTraffic` reads 60d of pageViews | 20,000 docs / 3.7 MB per load | Measured | 1.7 s floor, network-free | Read `traffic_daily` rollups | **P0** |
| Analytics page | 9× identical `orders` query | Same data fetched nine times | `businessAnalyticsService.ts` lines listed above | 10 round trips where 1 would do | Request-scoped memo, then read-model | **P0** |
| Analytics page | pageViews read 3× | 60,000 docs / 10.9 MB | Measured | Dominant page cost | Rollups | **P0** |
| Date windows | Filtered in memory after `limit: 1000` | `days` never reaches Firestore | `:343`, `:630`, `:958` | Wrong LTV/CAC past 1,000 orders | `where('createdAt','>=',…)` + index | **P1** |
| Retention | None on pageViews/analyticsEvents | Unbounded growth | No TTL, no prune job | Cost and latency grow forever | TTL policy + daily rollup | **P1** |
| Marketing site | `force-dynamic` on the layout | No CDN caching anywhere | `layout.tsx:24` | Slow customer pages | ISR + tag invalidation on stock write | **P1** |
| Creator metrics | `findById` per creator ×2 | N+1 | `:614`, `:829` | Grows with roster | `getAll()` batch | **P2** |
| `analyticsEvents` | No `businessId+createdAt` index | Ad-hoc range queries fail | `FAILED_PRECONDITION` when I tried one | Blocks future queries | Add index | **P2** |

### Top 5 bottlenecks today

1. `pageViews` scans — 20,000 docs, 1.7 s network-free, up to 4× per admin session.
2. The 9× duplicate `orders` query on the analytics page.
3. `force-dynamic` marketing layout — zero CDN caching on the customer path.
4. No aggregate/read-model layer; every dashboard recomputes from raw rows.
5. No retention, so #1 worsens daily.

### Top 5 architectural risks before vending

1. **`limit: N` used as a substitute for a date range.** A machine network generates orders of magnitude more events than 34 orders. This pattern must not be carried into `machine_transactions` or `machine_telemetry_events`.
2. **No read-model/rollup layer.** Fleet dashboards cannot be built on raw scans.
3. **No partner role and no tenant scoping.** `StaffRole` has no `partner`; rules and services assume one business. Partner isolation must be designed in, not retrofitted.
4. **No idempotency primitives for ingest.** `webhookEvents` exists for payments, but there is no general event-dedup mechanism for machine telemetry, which *will* deliver duplicates.
5. **Analytics collections are already the largest thing in the database** before a single machine exists.

---

## 4. Can Firebase support the machine network?

**Yes — and the read pattern, not the database, is what has to change.**

The evidence for that answer:

- The expensive workload is **not** transactional. Orders, payments and
  conversations are small, indexed, cursor-paginated and fast. Firestore
  is doing that job well.
- The expensive workload is **analytical** — "count these 20,000 rows and
  group them by day". Firestore is a poor fit for that *when asked to do
  it on every page load from raw documents*, and a fine fit when asked to
  read one pre-computed summary document per day.
- Every measured problem above is a consequence of recomputing analytics
  from raw rows. None of them is a consequence of Firestore's limits on
  writes, transactions, indexing or scale.

A fleet of 500 machines at, say, 40 vends/day is 20,000 transactions/day.
Written as immutable documents with a daily rollup, a partner dashboard
reads **one summary document per machine per day** — 500 documents for a
day, 12 for a month per machine — instead of scanning 600,000 rows a
month. That is comfortably inside Firestore's envelope.

Where Firestore would genuinely strain, and the honest triggers to watch:

| Signal | Threshold to act |
|---|---|
| Sustained writes to one document | >1/sec — never keep a `globalStats` doc |
| Ad-hoc multi-dimensional queries ("revenue by product by venue-type by hour") | When product wants this interactively, add BigQuery export — not a migration |
| Telemetry volume | If heartbeats land in Firestore at 500 machines × 1/min = 720k writes/day, move heartbeats to a dedicated store and keep only current state in Firestore |

**Recommendation: do not migrate.** Revisit only when a measured
workload — not a forecast — hits one of those rows. A migration now would
spend months replacing the part of the system that demonstrably works
while leaving the part that is actually slow untouched.

---

## 5. The fix, before any vending code

The same three patterns solve the current slowness *and* are the
foundation the fleet needs. Doing them first is not a detour.

**(a) Rollup documents.** A nightly job (a fourth Vercel cron) and an
incremental update on write:

```
traffic_daily/{businessId}_{YYYY-MM-DD}     views, uniqueSessions, byPath, byReferrer
orders_daily/{businessId}_{YYYY-MM-DD}      orderCount, revenueKes, refundKes, byChannel
```

Dashboards read 30–60 small documents instead of 20,000 large ones.
Raw rows stay for audit; nothing is thrown away. This turns Finding 4
from "silently wrong" into "exact", because the rollup counts every
document as it arrives rather than sampling 20,000 of them later.

**(b) Request-scoped memoisation.** Wrap `orderRepository.listByBusiness`
in React `cache()` — the same primitive `getStaffSession` already uses.
Nine identical calls in one render collapse to one, for a one-line
change, with no behavioural difference.

**(c) Real date ranges.** Add `since`/`until` to `listByBusiness` and push
the window into the query with a `businessId + createdAt` index. Fixes
the correctness cliff in `getLtv`/`getCac` as a side effect.

**(d) Retention.** Firestore TTL on `pageViews` and `analyticsEvents`
(90 days), once the rollups mean nothing needs the raw rows.

**(e) Marketing caching.** Replace `force-dynamic` with `revalidate` plus
`revalidateTag` on stock writes.

Expected effect — stated as a prediction to be verified, not a promise:
the dashboard's dominant read drops from 20,000 documents to roughly 60,
and the analytics page from 60,391 to a few hundred. I will measure it
rather than assert it.

---

## 6. Discovery Machine data model (design only — no code written)

Additive. Nothing in the existing model changes. Machine slots reference
the **existing** `snackItems`/`packages` catalogue; there is no second
product catalogue.

```
partners/{partnerId}                     ← new tenant entity, NOT one per machine
machines/{machineId}                     ← machineCode, serial, oem, firmware,
                                            status, connectivity, lastSeenAt,
                                            partnerId, locationId, businessId
machine_location_history/{id}            ← machineId, locationId, lat/lng, venue,
                                            effectiveFrom, effectiveTo, movedBy, reason
locations/{locationId}                   ← venue, address, floor, zone, lat, lng,
                                            accuracyMetres, venueOwnerId
machine_slots/{machineId}_{slotCode}     ← productId → existing catalogue, priceKes,
                                            capacity, currentQuantity, enabled
machine_transactions/{txnId}             ← immutable; paymentRef, vendRef, amounts,
                                            separate payment state and vend state
machine_inventory_movements/{id}         ← RESTOCK|SALE|ADJUSTMENT|WASTE|TRANSFER,
                                            quantityDelta, before, after, sourceTxnId
machine_telemetry_events/{eventId}       ← append-only, idempotencyKey, raw payload
machine_daily_summary/{machineId}_{date} ← the read model the dashboards actually use
partner_daily_summary/{partnerId}_{date} ← portfolio rollup — one doc, not N machines
```

Four points that the brief is right to insist on, and that the model
above encodes deliberately:

1. **Payment state and vend state are separate fields, never one status.**
   `PAID + VEND_FAILED` is a refund obligation and must be representable
   and queryable. This mirrors how `paymentIntents` and `orders` are
   already kept apart in this codebase.
2. **Stock is derived from the movement ledger, not stored as truth.**
   `currentQuantity` on the slot is a cache; the ledger reconciles it.
3. **Location history is separate from the machine.** A transaction is
   attributable to where it happened, which a mutable `machine.locationId`
   cannot do.
4. **One partner, many machines, one account.** `partners/{partnerId}` is
   the tenant; machines carry `partnerId`. The partner dashboard reads
   `partner_daily_summary` — **one document**, not one request per machine.
   A partner with 27 machines opens one page and issues one read.

### Partner portfolio dashboard, concretely

The brief's requirement that a 27-machine partner should not trigger 27
requests is exactly the rollup pattern from §5 applied a second time:

- **Portfolio KPIs** → `partner_daily_summary/{partnerId}_{today}` — 1 read.
- **Machine fleet list** → `machines where partnerId == X` — N small docs, no transactions.
- **Live status** → derived from `machine.lastSeenAt` against configurable thresholds (online/stale/offline), not a listener per machine.
- **History** → `machine_daily_summary` range query, paginated.

Realtime is warranted for exactly four things — machine status, current
stock alerts, the latest transaction, and faults — and those are small,
bounded documents. Historical transactions are paginated queries, never
listeners. This codebase currently has zero listeners, so realtime would
be introduced deliberately and narrowly rather than removed later.

### Isolation

`StaffRole` gains `partner`; partner sessions carry `partnerId`;
repositories take it as a required scope the way they take `businessId`
today; and Firestore rules enforce it independently of the service layer.
Hiding UI is not isolation. This needs its own rules tests alongside the
existing 214 test files — specifically the case the brief names: partner
A must not be able to read machine M006.

---

## 7. What I have not done

I have written **no code**, per the instruction. Nothing in the repo
changed except this document.

Also not yet done, and honestly flagged:

- **Load testing at 50/100/500 synthetic machines.** The harness is
  straightforward (the emulator seeding above is the same technique) but
  it should be run against the *proposed* model, which does not exist yet.
  Numbers before that would be numbers about nothing.
- **Machine gateway / OEM adapter design** beyond the principle that
  telemetry normalises through an adapter interface rather than binding
  to one manufacturer.
- **Settlement modelling.** Deliberately deferred: the commercial terms
  are not set, and `docs`-level speculation about revenue splits would
  bake in assumptions nobody has agreed.

## 8. Suggested order of work

1. Rollups + request-scoped memoisation + date ranges + TTL (§5). Measure before and after.
2. Fix the truncation bug (Finding 4) — it is reporting wrong numbers now.
3. Marketing caching (Finding 7).
4. Partner tenancy: role, session scope, rules, tests.
5. Machine/location/slot model, additively.
6. Transactions + inventory ledger + payment/vend separation.
7. Telemetry ingest with idempotency, then heartbeat/status.
8. Admin fleet dashboard, then partner portfolio dashboard, both on rollups.
9. Load test at 5 / 50 / 500 synthetic machines. Re-answer §4 with those numbers.

Steps 1–3 are worth doing regardless of whether a single machine is ever
deployed.
