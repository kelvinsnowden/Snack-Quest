# Snack Quest OS: master gap analysis and architecture decisions

This document sets out what exists today against the 55-part "complete vending operating system" brief, and the architecture chosen for what is missing. It was written by reading the code at the start of the work. The build status of each item is kept up to date in `docs/OS_BUILD_REPORT.md`.

**Classification:**

| Code | Meaning |
|---|---|
| A | Already correct |
| B | Backend exists, no UI |
| C | UI exists, backend incomplete |
| D | Partial |
| E | Architecturally incorrect |
| F | Missing |

## 1. What exists

| Area | Existing implementation (files) |
|---|---|
| Machine | `types/machine.ts`: status lifecycle, `ownerPartnerId`, location, hardware identity. There is no ownership *type*: `ownerPartnerId: null` is ambiguous between "Snack Quest owns it" and "not assigned yet". |
| Owner | `types/partner.ts` (wallet balances), `partnerMachineAgreement` (a revenue-share % only), `machineOwnershipHistory`, owner portal (`app/partner/*`), `ownerPortalService`. |
| Settlement | `machineSettlementService`: gross − refunds − COGS − subscription = distributable to the owner. **COGS uses `SnackItem.expectedUnitCostKes` resolved through the slot's current configuration** (the code admits this is an approximation). Package sales are unpriced. |
| Product | `SnackItem`: `expectedUnitCostKes`, image, description, origin. `Package`: `priceKes` (the online box price). A single cost field; no wholesale price; no price history except slot retail (`machineSlotPriceHistory`) and assortment overrides. |
| Sale | `MachineTransaction.amountKes` is the retail price at the time of sale (a snapshot). **There is no cost snapshot.** |
| Inventory | Machine slot ledger (`machineInventoryMovements`, transactional; V-12 fixed). Warehouse packages: `inventoryMovements` and batches with unit cost. Warehouse snacks: a hand-edited `stockCount`. Restock tasks move stock into slots but **don't deduct the warehouse and don't record ownership**. |
| Kiosk | `components/kiosk/KioskScreen.tsx`: one 1,100-line client component. `view` state plus an `attract` flag, polling the catalogue and screen artwork, pairing secret in `localStorage`. Screen artwork: `kioskScreenImages` (menu banner and idle images, global or per machine). Assortment: category, customer name, description, image, price override, and a promotional state (`featured`, `new`, `limited_time`). |
| Ads | None. The idle screen rotates staff-uploaded images, with no campaigns, schedules, targeting, playback logging or revenue. |
| RBAC | 94 permissions, 8 templates, grants and revocations, escalation rules, view-as. The access editor exists; there is no "what can this user do" view. |
| Finance | Settlement arithmetic in `machineSettlementService`. Daily rollups (`machineDailySummary.byProduct` COGS at the *current* snack cost). Margin arithmetic in `productIntelligenceService` and the owner portal. **Margin is computed in at least three places.** |

## 2. Brief parts classified

| Part | Topic | Class | Finding / decision |
|---|---|---|---|
| 1 | Separation of machine / kiosk / cloud / owner / SQ / customer / advertiser | D | Machine, kiosk, cloud and owner are separated. SQ as owner is implicit (`ownerPartnerId: null`). Advertiser is missing. |
| 2 | Ownership as a first-class concept | E | Add an explicit `ownershipType` on the machine and commercial terms on the agreement, resolved into one `MachineEconomicProfile` (§3.1). |
| 3 | Inventory ownership (SQ / owner / consignment / transit / machine / waste) | F | Build an inventory transfer ledger with holders, ownership and cost basis (§3.4). |
| 4 | Several price concepts | E | Build a price book: landed cost, owner wholesale price, retail list price, with history (§3.2). |
| 5 | Owner margin visibility per sale | F | Owner sales view with per-sale owner cost, profit and margin; the landed cost is never sent unless the agreement allows it. |
| 6 | Owner profitability dashboard | D | Owner reports exist (sales). Profit, margin, periods, filters and charts are missing. |
| 7 | Explicit economic ledger | E | Sale economic snapshot plus one financial engine; fees, refunds, commissions, ads and subscriptions are kept as separate lines. |
| 8 | Snack Quest-owned machines | E | SQ-owned machines have no settlement and SQ COGS; the P&L is comparable with owner machines. |
| 9 | Machine P&L | F | `machinePnlService` built on the financial engine. |
| 10–14 | Kiosk experience builder, visual builder, device profiles, draft/publish/rollback, inheritance | F (D for artwork) | Structured section layout, theme tokens, 4-level inheritance, immutable published versions (§3.5). |
| 15–25 | Idle screen / advertising engine, types, scheduling, playlist, revenue, impressions, offline, content delivery, security, owner ads, internal promos | F | Advertising domain (§3.6). The existing idle images become an internal campaign source. |
| 26 | Product promotion labels | D | `promotionalState` has 3 hard-coded values. Make badges configurable (a badge catalogue). |
| 27 | Product data model | D | Add the missing catalogue fields on `SnackItem` that the business uses: brand, category, barcode, allergens, weight, status. |
| 28–31 | Product manager role, granular permissions, RBAC UI, permission simulation | D | Add permissions for cost, wholesale, kiosk, advertising and P&L; product manager without costs; an access explainer and a "what can this user do" screen. |
| 32 | Every backend capability has a UI | D | Capability matrix generator in the repo (§3.8). |
| 33 | Owner portal completeness | D | Add profitability, advertising and maintenance. |
| 34–36 | Owner wholesale sale, SQ inventory flow, transfer ledger | F | §3.4. |
| 37 | Machine economic profile visible to staff | F | Machine page "Economics" card. |
| 38 | Central margin definitions | E | `lib/finance/economics.ts`, the only place margin is computed. |
| 39–40 | Historical snapshots, price history | E / D | A snapshot on every sale; the price book with `effectiveFrom`/`effectiveTo`. |
| 41 | Financial reconciliation | D | Deep reconciliation exists (payments, stock). Add settlement vs sales, transfers vs slots, ads vs playback. |
| 42 | Kiosk service mode | F | One-time service codes from admin; a separate service screen on the kiosk. |
| 43–44 | Kiosk runtime / idle state machine | E | `lib/kiosk/runtimeMachine.ts`: an explicit transition table that the kiosk dispatches through. |
| 45 | Content sync with versions | D | The catalogue has a version; artwork doesn't. Build a versioned content package with staged activation and status reports. |
| 46–48 | Kiosk observability, analytics, ad→sale | F | Kiosk event batch endpoint, daily kiosk rollup, "post-ad interaction" metric (not attribution). |
| 49 | Admin dashboard | D | Add operations, commercial, advertising and inventory panels. |
| 50 | No duplicate logic | E | Margin is consolidated into the financial engine. |
| 51 | Scale | D | Findings from the verification audit §12. New collections are designed for per-machine and per-day reads. |
| 52 | Capability completeness audit | D | A generator script in the repo, plus a test for route permission guards. |
| 53 | Acceptance tests | — | Per phase. |

## 3. Architecture decisions

### 3.1 Ownership and the machine economic profile

**Machine fields:**
- `Machine.ownershipType`: `'snack_quest' | 'third_party' | 'partner_franchise'`.
- A machine whose `ownershipType` is missing is read as `snack_quest` when `ownerPartnerId` is null, and `third_party` otherwise. This is the only rule that keeps existing records meaning what they meant.

**Agreement fields.** `PartnerMachineAgreement` gains the commercial terms:

| Field | Values |
|---|---|
| `inventoryOwner` | `'snack_quest' \| 'machine_owner'` |
| `ownerCostBasis` | `'landed_cost' \| 'wholesale_price'`. What the owner pays for stock. Existing agreements are `landed_cost`, because that is exactly what settlement deducts today. |
| `settlementModel` | `'owner_keeps_margin' \| 'revenue_share'` |
| `adRevenueSharePartnerPct` | number |
| `maintenanceResponsibility` | `'snack_quest' \| 'owner'` |
| `showLandedCostToOwner` | boolean, default `false` |

**Resolution.** `machineEconomicProfileService.resolve(machine, at)` returns one profile. Settlement, P&L, the owner portal and sale snapshots all read the profile, never the raw fields.

### 3.2 Price book

A `productPrices` collection holds entries:

```
{ productCatalogue, productId, priceType: 'landed_cost' | 'owner_wholesale' | 'retail_list',
  amountKes, effectiveFrom, effectiveTo, createdBy, reason }
```

- Setting a price closes the open entry, in the same transaction.
- `SnackItem.expectedUnitCostKes` stays the *current* landed cost. The price book records its history, and a landed-cost change writes both.
- The machine retail price stays on the slot. It is already snapshotted per sale in `amountKes`.

### 3.3 Sale economic snapshot and the financial engine

At `createPending`, the sale stores `economics`:

```
{ retailPriceKes, landedCostKes | null, ownerWholesaleKes | null, ownershipType, inventoryOwner,
  ownerCostBasis, partnerId | null, resolvedAt }
```

- Later cost changes never alter an old sale.
- A sale without a snapshot (legacy) falls back to the current cost and is **counted and labelled** as estimated.

`lib/finance/economics.ts` holds pure functions with the only margin definitions:

```
net revenue = gross − discounts − refunds
gross profit = net revenue − COGS
gross margin = gross profit ÷ net revenue
contribution = gross profit − payment fees − owner share − location commission − subscription − maintenance − other direct costs + ad revenue share
```

- COGS for Snack Quest's view uses the landed cost.
- COGS for the owner's view uses the owner's cost basis.
- Snack Quest's wholesale margin (wholesale − landed) is its own line.

**Payment fees.** They are never invented. A business setting (`paymentFeeModel`) is needed before fees appear; without it, the P&L says "not configured".

### 3.4 Inventory ownership and the transfer ledger

The `stockTransfers` collection is the single record of stock moving between holders:

- **Holders:** `warehouse`, `transit:{restockTaskId}`, `machine:{machineId}`, `owner:{partnerId}`, `waste`, `damaged`.
- **Each entry records:** ownership (`snack_quest` or `partner:{id}`), unit cost basis, quantity, reason and actor.
- **Restock:** dispatch records warehouse → transit; receive records transit → machine.
- **Owner-owned stock:** where the agreement's `inventoryOwner` is `machine_owner`, receiving at the machine also records an `ownerWholesaleSale` (units × wholesale price at that moment). The owner portal shows it as their stock purchase, and the Snack Quest P&L shows wholesale revenue.
- **Waste:** stock removed from a machine is a typed transfer (expired, damaged, returned), which closes FA-08.

### 3.5 Kiosk experience

**Layers.** `kioskLayers` hold 4 inheritance levels: global, owner, location and machine. Each has a draft config and published version pointers. Published versions are immutable (`kioskLayerVersions`).

**Config:**
- `theme`: design tokens (colours, radii, fonts from an allow-list, button style, motion);
- `layout`: an ordered list of sections for the browse, idle, payment, success and error screens. Each section has a component type from a registry, props and visibility;
- `productCard` field toggles;
- `locale`;
- `idle`: timeout and whether ads play.

**Merge.** Deep, most specific wins; arrays of sections are replaced, not merged.

**Layout engine.** Structured and responsive (sections stack in a grid decided by the device profile), not a free canvas. Across thousands of screen sizes this is the safe choice.

**Device profiles.** `Machine.display = { diagonalInches, widthPx, heightPx, orientation, safeAreaPx }`. Touch targets have a minimum of 48 px, enforced by the renderer.

**Publishing.** Draft, then preview (an admin iframe of the real kiosk renderer in preview mode, at the profile's resolution), then publish (a new immutable version), with rollback to any earlier version. Each resolved kiosk config carries a composite version, used by content sync.

### 3.6 Advertising

**Collections:**
- `advertisers`;
- `adCampaigns`:
  - kind `internal` or `external`;
  - status;
  - schedule: dates, times, weekdays;
  - targeting: machines, locations, owners;
  - `weight` and/or `everyMinutes`;
  - `frequencyCapPerHour`;
  - billing: `flat_monthly`, `per_machine_day`, `per_completed_play` or `none`;
  - `priceKes`;
- `adCreatives`: approved media only. The type is image or video; the allowed types are JPEG, PNG, WebP, MP4 and WebM; there is a size limit; the status is `pending_review`, `approved` or `rejected`. There is never HTML or JS.

**Playlist.** A pure function builds a machine's playlist for a time window, with weighted, interleaved order and frequency caps.

**Content package.** The machine's content package carries the playlist and creative checksums.

**Playback events.** A batch endpoint takes `scheduled`, `downloaded`, `started`, `completed` and `failed` events, deduplicated by a client event id (the document id is a hash).

**Revenue.** Campaign revenue by billing model goes into `adRevenueEntries`. The owner share comes from the machine profile. Ad revenue never mixes with product margin.

### 3.7 Kiosk runtime

- **State machine.** `lib/kiosk/runtimeMachine.ts` has explicit states and transitions: BOOTING, OFFLINE, SYNCING, IDLE, SHOPPING, PAYMENT, DISPENSING, VERIFYING, SUCCESS, REFUND_PENDING, ERROR, MAINTENANCE. Ads are only allowed in IDLE and SUCCESS.
- **Content sync.** A versioned package is downloaded, validated, staged, then activated atomically, and the kiosk reports its versions.
- **Offline cache.** The Cache API holds creatives and the package. Playback and telemetry events are queued in `localStorage` and flushed with ids.
- **Service mode.** A one-time service code (15 min, hashed, audited) is issued from admin with a permission; the kiosk shows a separate service screen.

### 3.8 RBAC and completeness

- **New permissions:**
  - `products.cost.view`, `products.cost.manage`;
  - `products.wholesale.view`, `products.wholesale.manage`;
  - `products.media.manage`;
  - `machines.economics.manage`;
  - `finance.machine_pnl.view`;
  - `kiosk.view`, `kiosk.design`, `kiosk.publish`;
  - `advertising.view`, `advertising.manage`, `advertising.publish`, `advertising.analytics`;
  - `machines.service_codes.issue`.
- **Access explainer.** It shows, per permission: from the template, granted directly, removed, and effective.
- **"What can this user do?"** A page built from the same effective-permission function the server uses.
- **Capability matrix.** `scripts/audit/capabilityMatrix.ts` regenerates `docs/ADMIN_CAPABILITY_MATRIX.md` from the code, including page gates.
- **Guard test.** A test fails when a staff route method checks no permission.

## 4. Business decisions and the defaults taken

Each default follows today's behaviour where it exists; none is invented.

| Decision | Default taken | Why |
|---|---|---|
| What an owner pays for stock | `landed_cost` for existing agreements; new agreements choose | This is exactly what settlement deducts today. |
| When an owner pays for stock | Deducted from settlement for units *sold* in the period (today's rule) | Invoicing on delivery is supported as a record, not as a deduction, until the business decides. |
| Payment processing fees | Not shown until configured | Safaricom's charge depends on the account's tariff. |
| Ad revenue share with owners | 0 % unless the agreement sets it | No existing agreement promises ad revenue. |
| Who sees landed cost | Staff with `products.cost.view`; owners never, unless the agreement allows it | The brief. |
