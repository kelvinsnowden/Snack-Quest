# Snack Intelligence — data sources, formulas, and limitations

The Snack Intelligence layer (§ SNACK QUEST OS PHASE 3) learns from
every machine, location, and product the same way the rest of this
codebase does: real arithmetic over real data, never a hard-coded
conclusion. This document is the honest account of exactly what that
arithmetic is, where it reads from, what it deliberately does not
claim, and what real future work (§27) would still need. It does not
rebuild anything from Phases 1/2 — inventory, payments, vending, and
the machine catalog stay exactly what they already were; every service
here reads from that layer, none of them writes to it.

## 1. Data sources

Nothing here scans raw transaction collections on a dashboard request
(§14's own instruction). Every intelligence read is one of:

| Source | What it holds | Read by |
|---|---|---|
| `machineDailySummary/{machineId}__{date}` | One machine's rolled-up day — `vendingRollupService.computeMachineDay`, extended this phase with `byProduct[...].cogsKes/grossProfitKes/category`, `unpricedUnitsSold`, `stockoutProductIds` | `machineAssortmentIntelligenceService`, `productIntelligenceService`, `locationIntelligenceService`, `ownerIntelligenceService` |
| `networkDailySummary/{businessId}__{date}` | The whole fleet's rolled-up day, composed by summing every machine's own `machineDailySummary` for that date, plus a `byCategory` breakdown | `networkIntelligenceService` |
| `locations/{locationId}` | The location profile (§ LOCATION PROFILE) — type, city, foot traffic, customer type, ... | `locationService`, everything keyed by `locationId` |
| `machineAssortments`, `machineSlots` | Current assortment/slot state — the *live* signal for "is this currently sellable/stocked/dead," never a rollup snapshot for "right now" questions | `machineAssortmentIntelligenceService`, `productIntelligenceService` |
| `machineTransactions` (bounded, windowed reads only) | Hour-of-day/day-of-week sales distribution (§ TIME INTELLIGENCE) — a direct, bounded `streamRange` query over the last `windowDays`, the "windowed question, query the range directly" rule `docs/ANALYTICS_ROLLUPS.md` states, never an unbounded scan | `productIntelligenceService.getTimeIntelligence` |
| `intelligenceRecommendations/{id}` | Every RESTOCK/ASSORTMENT_CHANGE/REMOVE_PRODUCT/MOVE_PRODUCT/PRICE_REVIEW/PRODUCT_OPPORTUNITY/LOCATION_PROFILE recommendation this system has produced, with its lifecycle and outcome | `recommendationEngineService` |

`machineDailySummary`/`networkDailySummary` are rebuilt nightly by the
extended `rebuild-vending-rollups` cron and self-heal on read for any
day nobody has rebuilt yet (`computeMachineDay`/`computeNetworkDay` —
same pairing `docs/ANALYTICS_ROLLUPS.md` §3 already establishes for
`trafficDaily`).

## 2. The four catalog layers (§ MACHINE-SPECIFIC ASSORTMENT INTELLIGENCE)

`machineAssortmentIntelligenceService.classifyMachineCatalogLayers` is
the one place these four numbers are computed, and they are never
confused with each other:

- **Global catalog** — every active `snackItem`/`package` this
  business's catalogue holds, business-wide.
- **Machine assortment** — rows in `machineAssortments` with
  `assorted: true` for this one machine, regardless of visibility or
  stock.
- **Currently stocked** — assorted rows whose linked slot reports
  `currentQuantity > 0`, read live from `machineSlots`.
- **Currently sellable** — `machineAssortmentService.getSellableCatalog`'s
  own `sellable: true` count: assorted, visible, stocked, *and*
  `machine.status === 'active'`.

A product that exists globally but was never assorted to a given
machine is never interpreted as "out of stock" on that machine — it
simply never enters that machine's assortment count at all (§6's own
example, reproduced directly in
`tests/services/machineAssortmentIntelligenceService.test.ts`).

## 3. Product intelligence formulas (§ PRODUCT INTELLIGENCE)

For a set of machines (network-wide, or one location's own),
`productIntelligenceService` sums each machine's `byProduct` entries
over a trailing window (`trailingWindow(windowDays)`, ending
yesterday — today is never included, since today's rollup is never
stored):

- **`unitsSold`, `revenueKes`, `cogsKes`, `grossProfitKes`** — direct
  sums across every carrying machine's rollup.
- **`marginPct`** — `grossProfitKes / revenueKes`, `null` when
  `revenueKes` is `0` rather than a division-by-zero pretending to be
  a real percentage.
- **`velocityPerDay`** — `unitsSold / daysObserved`, where
  `daysObserved` is the number of days any carrying machine actually
  had a stored rollup — not a fixed constant.
- **`locationsStocked`** vs. **`locationsSelling`** — two different,
  deliberately separate counts: the first is "currently
  `assorted && visible` at this location" (a live-state read), the
  second is "actually sold at least one unit here in the window" (a
  rollup read). A product can be stocked at five locations and only
  sell at two — the gap between those two numbers *is* a real signal
  (feeding `shallow_assortment_high_demand` and dead-stock detection),
  not noise to collapse away.
- **`stockoutFrequencyPct`** — the share of (machine × day)
  observations in the window where this product appeared in that
  day's `stockoutProductIds` snapshot. This is a **frequency**, not a
  **duration** — see §6 below for exactly what `stockoutProductIds`
  can and cannot say.

## 4. Location DNA (§ LOCATION DNA)

`locationIntelligenceService.getLocationDna` composes one location's
own `LocationDna` from every machine currently at that location
(`machineRepository.listByLocation` — a location can hold zero, one,
or many machines, never assumed to be exactly one):

- Revenue/units/transactions/AOV/gross profit/margin — the same
  sum-and-divide arithmetic as §3, at location scope.
- **`revenuePerDayKes`/`unitsPerDay`** — divided by `daysObserved`
  (the max number of rolled-up days seen across this location's own
  machines), never by the raw window length.
- **`categoryMix`** — summed from each machine's own
  `byProduct[...].category`.
- **`stockoutRatePct`** — `stockoutObservations / (machineCount ×
  daysObserved)`, `0` when either factor is `0`.
- **`peakHours`/`peakDays`** — summed per-machine
  `getTimeIntelligence` results (§1's bounded windowed query).
- **`topProducts`/`slowProducts`**, **`deadStockProductIds`**,
  **`assortmentDepth`** — derived from `productIntelligenceService`
  and `machineAssortmentIntelligenceService`'s own per-machine reads,
  composed rather than re-derived from scratch.

The brief's own university/Asian-snacks/12-14/17-20 example (§4) is
illustrative text in the brief, not a rule encoded anywhere in this
code — every number above is calculated from whatever this location's
real machines actually reported.

## 5. Assortment/slot performance (§ ASSORTMENT PERFORMANCE)

`machineAssortmentIntelligenceService.getAssortmentPerformance` reads
one machine's assorted slots and sums their `byProduct` totals over
the window, then classifies each slot:

- **`dead`** — `unitsSold === 0` in the window, while still assorted.
- **`currentlyStockedOut`** — the slot's *live* `currentQuantity`,
  never a rollup snapshot (a slot could have restocked since the last
  rollup ran).
- **`highVelocity`/`underperforming`** — top/bottom quartile of
  *this machine's own* slots by `revenueKes`, computed fresh per
  machine (`quartile(0.75)`/`quartile(0.25)` over that machine's own
  `revenues` array) — a three-slot machine and a thirty-slot machine
  are never compared against the same absolute bar.

## 6. Stockout intelligence and its honest limit (§ STOCKOUT INTELLIGENCE)

`MachineDailySummary.stockoutProductIds` is written once per rollup
build — a **point-in-time snapshot** of "which assorted+visible
products had zero sellable quantity right when this day's rollup was
computed" (typically the next morning, via the nightly cron, or
whenever a read self-heals a missing day). It answers "was this
product stocked out around when this day closed," not "for how many
hours during the day," and not "did it stock out and get restocked
twice in one day." A finer-grained answer would need either an
event-sourced stockout log or intra-day rollup snapshots, neither of
which exists — named here as real future work, not glossed over.

**Downtime exclusion** (§9: "a machine that was offline for two days
should not be treated as having two days of normal demand") is real,
not aspirational: every velocity figure this codebase computes for a
single machine (`SlotPerformance.velocityPerDay`, and the restock
recommendation generator that reads it) divides by `activeDays`, not
by the raw window length. `activeDays` counts only days where the
machine's own rollup shows a real sign of life — `heartbeatCount > 0`
or `transactionCount > 0` — both already-recorded facts, nothing
invented. A machine silent for two days (no heartbeat, no
transaction) contributes zero to `activeDays` for those two days, so
its real sales on the days it *was* reachable are never diluted by
the days it wasn't. Proven directly in
`tests/services/machineAssortmentIntelligenceService.test.ts`'s
"excludes a genuinely offline day" case. Network- and location-scoped
velocity (`productIntelligenceService`) currently divides by
`daysObserved` (days with *any* stored rollup for a carrying machine)
rather than a fleet-wide `activeDays` — a coarser but still real
denominator; tightening it to exclude individual machines' offline
days from the network-level average is named as NEXT-bucket work
below.

## 7. Dead stock (§ DEAD STOCK)

A slot is dead when `unitsSold === 0` across the window while still
carrying stock. `recommendationEngineService.generateDeadStockRecommendations`
turns each dead slot into a `REMOVE_PRODUCT` recommendation — reduce
replenishment or reconsider the assortment. **Nothing here moves
inventory automatically** (§10's own instruction) — the recommendation
is written `pending`; only a staff `approve`/`dismiss` call
(`POST /api/vending/recommendations/{id}/approve|dismiss`) changes
anything, and even then only the recommendation's own status —
whatever physical action a staff member actually took stays their own
separate act (recorded in `actionTaken` as free text, not executed by
this code).

## 8. Restock intelligence (§ RESTOCK INTELLIGENCE)

`recommendationEngineService.generateRestockRecommendations` computes,
per assorted slot: `velocityPerDay` (§6's downtime-aware figure),
`daysOfStockRemaining = currentQuantity / velocityPerDay`, and — only
when that's under a 7-day target —
`recommendedQuantity = min(capacity - currentQuantity, ceil(velocityPerDay
× 7) - currentQuantity)`, floored at zero. The 7-day target and the
14-day measurement window are real, named operating choices
(`TARGET_DAYS_OF_STOCK`), not fabricated precision — no lead-time data
exists yet to refine them further, so they aren't pretended to be more
precise than that. The recommendation is written once, deduplicated
against any existing `pending` one for the same slot, and — per §8's
own instruction — **feeds** the existing restock workflow
(`docs/INVENTORY_ARCHITECTURE.md` §5's `RestockTask`); it never creates
a `RestockTask` itself.

**Shared with the Operations Command Center (Phase 4).** The
velocity/days-remaining/recommended-quantity arithmetic above is
factored out as one exported pure function, `computeRestockNeed`
(`services/recommendationEngineService.ts`), specifically so
`docs/INVENTORY_ARCHITECTURE.md` §7's live, fleet-wide Restock
Command Center table can reuse it rather than re-deriving the same
numbers a second way — a slot's days-of-stock-remaining can never
disagree between "today's command-center table" and "the stored
`RESTOCK` recommendation for this slot," because both read the one
function.

## 9. Location-to-location learning and new-machine recommendations (§11, §12)

`peerLearningService.getProductLocationTypeAffinity` groups every
location currently selling a given product by `locationType` and
compares average revenue per location across types — naming a
"best-performing" type only when **at least two different types**
each have at least one location actually selling it (one type
"winning" against zero comparison points is not a real comparison).
`recommendAssortmentForNewMachine` ranks the global catalogue's own
products by real revenue-per-location among *existing* locations of
the proposed type, optionally filtered to a price band — the ranking
method is fixed; the actual SKU list it returns is never hard-coded.

## 10. Product opportunity engine (§13) — three heuristics, not machine learning

`peerLearningService.findProductOpportunities` runs three deterministic
checks, each explicitly named for what it is (§23: never call a
statistical heuristic machine learning):

1. **`shallow_assortment_high_demand`** — one of the network's own top-5
   revenue categories whose products are, on average, stocked at fewer
   than 30% of all locations (with at least 3 locations total, so a
   two-location network can't trigger this from noise).
2. **`repeated_stockout`** — `stockoutFrequencyPct >= 30` for a product
   with real data behind it (`dataQuality !== 'insufficient_data'`).
3. **`price_gap`** — a product's own realized price
   (`revenueKes / unitsSold`) more than 25% away from its category's
   **peer median** price — a median, and with the product itself
   excluded from its own peer set, specifically so one real outlier
   doesn't drag the comparison point every other peer is measured
   against toward itself (a mean would do exactly that with only 3-4
   products in a category; proven in
   `tests/services/peerLearningService.test.ts`).

Every opportunity carries a `reason` (a sentence, not a score) and
`supportingMetrics` (the exact numbers behind that sentence) — never a
bare confidence number with nothing to check it against.

## 11. Network intelligence and location benchmarking (§14, §15)

`networkIntelligenceService.getNetworkOverview` composes revenue,
units, margin, top/fastest-growing categories, and
`inventoryUnitsDeployed`/`inventoryValueKes` from `networkDailySummary`
plus one live slot read (inventory-on-hand is a current-state
question a rollup can't answer, the same reasoning §1's table already
states). **Fastest-growing categories** split the window into first
and second half by date and compare per-half revenue — `growthPct` is
`null`, not `0` or a huge fabricated percentage, when the first half
had zero revenue to compare against.

`compareLocations` returns each requested location's own full
`LocationDna` side by side — no composite score, no "winner" field.
§15 explicitly warns against a simplistic overall ranking, and this
code has nothing in it that could produce one even by accident: there
is no field anywhere in `LocationDna` that isn't a real, individually
meaningful metric.

## 12. Recommendation lifecycle and learning from outcomes (§18, §21)

Every recommendation this system writes — restock, dead-stock,
product-opportunity — is the same `IntelligenceRecommendation` shape:
`type`, `target`, `reason`, `supportingMetrics`, `confidence`,
`status` (`pending → approved | dismissed`, terminal either way),
`actionTaken`/`actionedBy`/`actionedAt`, and
`outcome`/`outcomeMetrics`/`outcomeRecordedAt`. `recordOutcome` is
only callable on an `approved` recommendation
(`RecommendationNotApprovedError` otherwise) — recording an outcome
for something nobody acted on would be measuring an effect that never
happened. Nothing here *computes* an outcome automatically yet: a
staff member records what actually happened (e.g. "sales increased
23%" from the brief's own §21 example) through
`POST /api/vending/recommendations/{id}/outcome`. Automatically
re-measuring a recommendation's own metrics some fixed time after
approval and writing the outcome without a human typing it in is real,
named future work (§ Still NEXT below) — not built this phase, because
doing it well needs a policy (how long to wait, which metric actually
proves the recommendation right) this codebase has no real data yet
to justify.

## 13. Confidence and data quality (§22) — never manufactured

Every intelligence computation that produces a `confidence` or
`dataQuality` value derives it from one real signal:
`classifyDataQuality(daysObserved, windowDays)` —

- **`actual`** — `daysObserved >= 7` *and* `daysObserved >=
  windowDays × 0.5`.
- **`estimated`** — some real data exists, but under that bar.
- **`insufficient_data`** — zero rolled-up days observed.

`recommendationEngineService.confidenceFor` maps this directly:
`actual → high`, `estimated → medium`, `insufficient_data → (no
recommendation written at all)`. There is no path in this codebase
that writes a recommendation with a confidence higher than the data
underneath it actually supports, and no path that writes one from
zero data with a "low" confidence label pretending that's better than
nothing.

## 14. Owner vs. operator intelligence (§19, §20)

`ownerIntelligenceService.getMachineOwnerSummary` is deliberately the
*only* code path a machine owner's own view goes through — it never
calls `networkIntelligenceService` or `peerLearningService` at all,
not just filters their output, so confidential network-wide/supplier
intelligence is never computed for that path in the first place.
`OWNER_VISIBLE_RECOMMENDATION_TYPES` explicitly excludes
`PRODUCT_OPPORTUNITY` (the one recommendation type whose reasoning can
cite network-wide category/peer data) from what an owner's summary
ever returns. Every owner-facing route
(`GET /api/vending/partners/{partnerId}/machines/{machineId}/intelligence`)
starts with `machineService.assertPartnerOwnsMachine` — the same
enforcement primitive every other partner-facing read in this fleet
already uses.

## 15. Future AI readiness (§23) — the data shape, not a model

Every dataset above is already structured the way a future predictive
model would want it: per-(location, product, category, price,
inventory, sales, uptime, time) observations, and — once §12's
outcome-tracking is used in practice — labeled
(recommendation → action → outcome) triples. **No LLM or ML model is
introduced this phase.** Everything computed is a deterministic
statistic (a sum, a ratio, a quartile, a median, a grouped average)
with a traceable formula, exactly what §23 asks for as the starting
point. The clean, structured shape of `ProductPerformance`,
`LocationDna`, and `IntelligenceRecommendation` is what a future
model would train against; building that model is real, deliberately
deferred work.

## Still NEXT/SCALE

- A dedicated `productDailySummary` (or similar) rollup, once
  per-machine iteration in `productIntelligenceService` becomes the
  actual bottleneck at real fleet scale — today it iterates every
  carrying machine's own `machineDailySummary.listRange`, which is
  correct but not the cheapest possible read past some machine count.
- Network/location-scoped velocity using a true `activeDays`
  denominator per machine (today: `daysObserved`, a coarser proxy —
  see §6).
- Intra-day stockout timing/duration (today: one point-in-time
  snapshot per rollup build, not a continuous trace).
- Automatic outcome measurement for an approved recommendation,
  instead of a human typing in what happened.
- Seasonal analysis (§17: "do not infer seasonality from insufficient
  data") — deliberately not built at all this phase; this network does
  not yet have enough calendar-year history for a season-level bucket
  to mean anything, and a fabricated one would violate §22 directly.
- A real predictive/ML model over the data shapes this phase
  establishes (§23) — explicitly not attempted yet.
- Fleet-scale load testing of every rollup/aggregation path here at
  real machine/location counts, the same gap already named for the
  vending foundation itself.
