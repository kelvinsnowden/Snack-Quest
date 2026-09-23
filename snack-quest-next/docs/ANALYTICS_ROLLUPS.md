# The analytics rollup pattern — for the fleet build to reuse, not reinvent

This documents the primitives added while fixing the admin Analytics
page (see `docs/FLEET_ARCHITECTURE_AUDIT.md` for the diagnosis and the
measured before/after). It exists because the Discovery Machine
network is going to have exactly this same problem, one order of
magnitude sooner and worse: a fleet of machines will generate
transactions and telemetry the way `pageViews` generates rows, and the
first fleet dashboard will be tempted to scan them the way the old
`getTraffic` did. This is the pattern that dashboard should use
instead, already built, tested, and measured — the fleet build should
extend it, not design a second one beside it.

## The rule

**Two different questions get two different answers, and the
difference is not optional:**

1. **"In the last N days"** — a *windowed* question. Query the range
   directly (`since`/`until` pushed into the Firestore query, or a
   cursor-paged stream if the window is unbounded above). Never fetch a
   fixed count and filter by date afterward — that is correct only
   until the collection has more rows than the count, and it fails by
   silently reporting a better number than the truth, not by erroring.
2. **"Ever" / "first-ever" / "all machines, right now"** — an
   *aggregate* question that cannot be answered from any window,
   however wide. This needs a rollup: one small document holding the
   already-computed answer, rebuilt from the raw event stream rather
   than scanned live on every read.

The fleet's own version of each: "machine M001's sales this week" is
(1); "does partner P001's dashboard load in one read for all 27
machines" is (2).

## The four pieces, and where the fleet plugs in

### 1. Date-range queries at the repository boundary

`orderRepository` (`repositories/orderRepository.ts`) now exposes:

- `listByBusiness(businessId, { since, until, status, limit, cursor })`
  — paginated, for a UI list.
- `countInRange(businessId, { since, until, status })` — a
  Firestore `count()` aggregation, no documents read.
- `streamRange(businessId, { since, until, status, pageSize })` /
  `streamAll(businessId, { pageSize })` — an async generator, cursor-paged,
  no cap. For a job that has to see *everything* in a range (a rollup
  rebuild), never a request handler with an open-ended window.

**Reuse for machines:** `machine_transactions` and
`machine_telemetry_events` want the identical three methods
(`listByBusiness`/`countInRange`/`streamRange`) on their own
repositories, keyed by `machineId` or `partnerId` the way these are
keyed by `businessId`. Copy the shape, not just the idea — the tests in
`tests/repositories/orderRepositoryDateRange.test.ts` are a template
for what a repository offering this contract has to prove: the window
is `[since, until)`, a missing bound means unbounded on that side, and
`streamRange` yields every matching row regardless of page size.

### 2. Request-scoped memoisation, for when several metrics need the same read

`lib/analytics/requestCache.ts`:

```ts
const cache = new AnalyticsRequestCache(); // one per request
await Promise.all([
  metricA(businessId, days, cache),
  metricB(businessId, days, cache),
]); // one underlying read, not two
```

`AnalyticsRequestCache.memo(key, load)` memoises **promises**, not
values, so concurrent callers in the same `Promise.all` share the one
in-flight read instead of racing to start their own; a rejected read is
evicted rather than cached, so one failure doesn't poison the next
caller. `NoRequestCache` is the default when nothing is passed — every
method stays correct and independently testable on its own.

**Why this exists rather than React's `cache()`:** it looks like the
obvious tool, and it does not work outside a real request scope —
there is a unit probe of that fact in this session's history, and it
failed exactly as predicted the moment it was tried under a test
runner. An explicit, constructable scope is the only version of this
that can be given to a route handler *and* asserted against in a test.

**Reuse for machines:** the admin fleet dashboard and the partner
portfolio dashboard will each fire several metrics in one
`Promise.all` the same way the analytics page does. Construct one
`AnalyticsRequestCache` per request, thread it through every metric
that reads `machine_transactions`/`machine_telemetry_events`, and the
"27 machines, one read" requirement in the fleet brief falls out of
this for free — it is the exact mechanism, not a new one.

### 3. Daily rollups, for anything read far more often than it changes

`services/analyticsRollupService.ts` + `repositories/trafficDailyRepository.ts`:

- One document per business per **day** (`trafficDaily/{businessId}__{date}`),
  holding visit count, unique-visitor count, and a per-path breakdown —
  computed once, from every matching row, not a sample of them.
- Unique visitors over a *range* is a **union**, not a sum of the daily
  counts — a visitor active on two days is one visitor for the week and
  two for the days. The ids are kept in sharded subcollections
  (`visitorShards`, capped per shard so a busy day can't outgrow a
  single document) specifically so a range query can union them
  exactly, not approximate them.
- **Self-healing on read:** a completed day with no stored rollup is
  computed on the spot and written, so correctness never depends on the
  nightly job having run — it only depends on someone having asked.
  Today itself is never stored, because today is not over: `getTraffic`
  computes it live every time.
- A fourth Vercel cron, `rebuild-analytics-rollups`
  (`app/api/cron/rebuild-analytics-rollups/route.ts`), keeps the last
  three days current nightly, so the self-healing path is a safety net
  a real request should rarely have to use, not the normal way this gets
  built.

**Reuse for machines:** `machine_daily_summary/{machineId}__{date}` and
`partner_daily_summary/{partnerId}__{date}`, exactly as sketched in
`FLEET_ARCHITECTURE_AUDIT.md` §6, are this same primitive with a
different key and a different set of counted fields (transaction
count, units sold, gross sales, stockouts, uptime instead of visits and
paths). The self-healing-on-read + nightly-cron pairing is what makes
this safe to ship before the cron infrastructure around it is fully
trusted — copy it rather than shipping the fleet's version without it.

### 4. Lifetime rollups, for questions no window can answer

`repositories/customerLifetimeRepository.ts`: one document per
customer (`customerLifetime/{businessId}__{phoneNumber}`), holding
their first-order date, first-order acquisition channel, order count
and total revenue — rebuilt from a full `streamAll` of the business's
orders, because an order's *status* can change long after it was
created (a refund removes revenue a previous rebuild already counted),
so unlike a finished calendar day there is no "this slice is done"
boundary to heal incrementally. `getLtv`/`getCac`/`getCacByChannel` all
read this instead of inferring "first order" from a windowed scan,
which is the specific bug this closes — see the audit's Part 2 for the
measured KSh 200,000 the old algorithm silently dropped at 1,200
orders.

Reads it via Firestore's own `count()`/`sum()` aggregation
(`aggregateLifetime`), not by fetching every document — the same
reason `countInRange` exists on the order repository: the answer is a
number, and Firestore can compute it without shipping the rows.

**Reuse for machines:** less directly applicable to a single machine
(a machine doesn't have a "lifetime" the way a customer does), but the
*pattern* — a rollup rebuilt from a full stream because status changes
retroactively, aggregated rather than fetched — is exactly what a
partner's all-time portfolio totals need once settlements and
adjustments exist (§25 of the fleet architecture doc). Build that on
this same shape rather than a fresh one when it's needed.

## What not to copy

- **Don't put a global counter on one document.** Every rollup here is
  sharded by business+day or business+customer specifically so writes
  spread across many small documents instead of hammering one. A fleet
  equivalent of `machines/globalStats` receiving every machine's write
  is the write-hotspot mistake `FLEET_ARCHITECTURE_AUDIT.md` §29
  already warns against — this pattern is how that gets avoided in
  practice, not just in principle.
- **Don't skip the "why is this two documents" question.** `trafficDaily`
  and its `visitorShards` are two collections for one concept because a
  union needs the actual ids and a dashboard card doesn't. Reach for
  that split only when a real query needs it, the same way this one
  did.
- **Don't rebuild synchronously in a request unless the volume is
  still small enough to make that free.** `ensureCustomerLifetime`
  (on `BusinessAnalyticsService`) rebuilds on every read today, which
  is honest at 34 orders and is documented, in the same method, as the
  thing to change first — move it to cron-only and read what's there —
  once it isn't.
