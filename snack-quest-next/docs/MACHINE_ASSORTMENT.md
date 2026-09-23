# Machine assortment: global catalog → per-machine sellable catalog

Written against the live codebase before any code in this pass, per
the brief's own instruction to audit first. Companion to
`docs/MACHINE_COMMERCE.md` (the economics this assortment layer feeds)
and `docs/INVENTORY_ARCHITECTURE.md` (the inventory truth it reads).

---

## 1. Audit: what already exists

| Concept | State | Where |
|---|---|---|
| Global product catalog | **EXISTING / KEEP** | `SnackItem` (individual snacks, has `expectedUnitCostKes`) + `Package` (curated boxes, no cost field — a box's cost is implicit in what it's assembled from, never tracked per-box today). `MachineSlot.productId`/`productCatalogue: 'package' \| 'snackItem'` already references one of these — "one global catalog, two tables for two different kinds of thing sold" already exists; there is no third table to invent. |
| Machine → physical slot | **EXISTING / KEEP** | `MachineSlot` (`machineId`, `slotCode`, `productId`, `productCatalogue`, `priceKes`, `capacity`, `currentQuantity`, `enabled`, `position`). |
| Machine inventory ledger | **EXISTING / KEEP** | `MachineInventoryMovement` — immutable, `slotId`-scoped, `MachineSlot.currentQuantity` is a cache of it. |
| **Machine assortment** ("what does Snack Quest want this machine to sell") | **MISSING** | `MachineSlot` conflates catalog intent, physical position, and live inventory into one document. There is no way today to say "this machine is *configured* to sell Korean Spicy Snack" independently of whether a slot has been assigned to it yet, and no per-machine customer-facing name/description/image/price-override with an audit trail. |
| Three-state sellability (assorted / stocked / sellable) | **MISSING** | `MachineSlot.enabled` is one boolean; nothing derives "assorted but out of stock" as a distinct, representable state from "not assorted at all". |
| Customer-facing machine catalog API | **MISSING** | No route returns a machine-scoped, sellability-annotated product list. `GET /api/vending/machines/[id]/slots` (existing) is a staff-facing operational read of raw slot rows — not a customer catalog, not device-authenticated for this purpose, and it returns raw fields a screen has no business deciding logic from. |
| Price overrides with audit trail | **MISSING** | `MachineSlot.priceKes` is a plain field; changing it (`machineSlotService.setPrice`) writes no history of what it was, when, or who changed it. |

**Why this isn't a rebuild:** `MachineSlot` already correctly owns the
physical/inventory half of this brief's model ("where is the product
physically assigned", "how many units exist"). What's missing is the
*catalog-intent* layer above it ("what does Snack Quest want this
machine to sell") and the *derived* layer below it ("what can a
customer buy right now"). Both are additive — nothing about
`MachineSlot`, `MachineInventoryMovement`, or the services that already
read/write them changes.

---

## 2. The model this pass builds

```
GLOBAL PRODUCT CATALOG (existing: SnackItem | Package)
        │
        ▼
MACHINE ASSORTMENT  ← NEW — "Snack Quest configured this machine to sell this product"
        │              (assorted flag, customer-facing overrides, display order,
        │               price override + audit trail, optional slot link)
        ▼
SLOT CONFIGURATION  ← EXISTING (MachineSlot) — "where, physically"
        │
        ▼
LIVE INVENTORY      ← EXISTING (MachineInventoryMovement / MachineSlot.currentQuantity)
        │              — "how many units exist, right now"
        ▼
MACHINE STATUS      ← EXISTING (Machine.status, deriveConnectivityStatus)
        │
        ▼
SELLABLE CATALOG    ← NEW — derived, not stored: assortment × slot × inventory × status
        │
        ▼
CUSTOMER SCREEN     ← NEW — GET /api/vending/machines/[id]/catalog (device-authenticated)
```

### `MachineAssortment` (`types/machineAssortment.ts`)

```ts
interface MachineAssortment {
  businessId: string;
  machineId: string;
  productId: string;
  productCatalogue: 'package' | 'snackItem';
  /** Snack Quest's own decision that this machine should carry this product — independent of whether a slot has been assigned yet. */
  assorted: boolean;
  /** Set once a physical slot is assigned; null while a product is assorted but not yet placed. */
  slotCode: string | null;
  displayOrder: number;
  category: string | null;
  /** Overrides the global catalog's name/description/image for THIS machine's screen — null falls back to the global product's own fields. */
  customerFacingName: string | null;
  customerFacingDescription: string | null;
  customerFacingImageUrl: string | null;
  priceOverrideKes: number | null;
  promotionalState: 'none' | 'featured' | 'new' | 'limited_time';
  effectiveFrom: Timestamp | null;
  effectiveTo: Timestamp | null;
  visible: boolean;
}
```

`priceOverrideKes` changes are written through
`machineAssortmentService.setPriceOverride`, which appends to a new
`machineAssortmentPriceHistory` collection (append-only: who, when, old
→ new) rather than silently overwriting — the audit trail section 11
of the brief asks for, applied narrowly to the one field that's
actually a commercial decision rather than to every field on the
document.

### The three states, made real

| | `assorted` | slot exists & has stock | `sellable` (derived) |
|---|---|---|---|
| Not part of this machine's plan | `false` | — | `false` |
| Planned, not yet placed | `true` | no slot | `false` |
| Placed, empty | `true` | slot, qty 0 | `false` |
| Placed, disabled | `true` | slot, qty > 0, `enabled: false` | `false` |
| Machine offline/maintenance | `true` | slot, qty > 0, enabled | `false` |
| Live | `true` | slot, qty > 0, enabled | **`true`** |

`sellable` is never stored. `machineAssortmentService.getSellableCatalog`
computes it on every read from `assortment.assorted`,
`assortment.visible`, `slot.enabled`, `slot.currentQuantity > 0`, and
`machine.status === 'active'` — the same "derive, don't cache a
decision" discipline `deriveConnectivityStatus` already holds for
online/offline, applied to sellability.

### Isolation, tested directly

Machine A's assortment rows are the *only* source `getSellableCatalog`
reads for Machine A. A product existing globally, or being assorted to
Machine B, has no path into Machine A's result — there is no query
here that could return it by accident. This is what
`tests/services/machineAssortmentService.test.ts` proves directly
(§ brief's own named test: Machine A has SKU1 not SKU2; the API for
Machine A must never return SKU2 merely because SKU2 exists globally).

---

## 3. Customer-facing API

`GET /api/vending/machines/{machineId}/catalog` — device-authenticated
(the same `authenticateDevice()` every other device route uses), scoped
to the authenticated token's own `machineId`. Returns:

```json
{
  "catalogVersion": "2026-09-24T10:00:00.000Z",
  "items": [
    { "slotCode": "A01", "productId": "...", "name": "Korean Spicy Snack",
      "description": "...", "imageUrl": "...", "priceKes": 350,
      "sellable": true, "displayOrder": 1, "promotionalState": "none" },
    { "slotCode": "A03", "productId": "...", "name": "Korean Drink",
      "priceKes": 400, "sellable": false, "displayOrder": 3, "promotionalState": "none" }
  ]
}
```

The screen renders exactly this. It never independently decides price,
availability, or eligibility — those decisions are made server-side by
`machineAssortmentService.getSellableCatalog` before the response is
ever built.

### Local cache / offline (§ 10 of the brief)

`catalogVersion` (an ISO timestamp of the assortment/slot data's own
last-write) is what a real gateway would compare against its last
cached version to decide whether to re-fetch — this route already
returns everything a cache-and-compare gateway needs. **A gateway-side
cache itself is not built in this pass**: there is no real gateway
process in this repository to hold one (the same reason a real MQTT
transport isn't built — see `docs/HARDWARE_COMPATIBILITY_ARCHITECTURE.md`).
The API contract is deliberately shaped so that when a gateway exists,
"cache the last successful response, serve it if a re-fetch fails" is
a client-side concern with nothing server-side left to build.

---

## 4. Staff admin API (implemented, later pass)

The staff surface referenced above (`§ 3`'s own note about the
customer route being deliberately thin) — every catalog-intent
decision a staff member actually makes:

- `GET /api/vending/machines/{id}/assortment` — every row for a
  machine, regardless of `assorted`/`visible` (the admin view; the
  customer route above only ever sees the filtered, sellable subset).
- `POST /api/vending/machines/{id}/assortment` — assorts (or
  re-enables) a product; refuses a `productId` the global catalogue
  doesn't actually have (`ProductNotFoundError`, never silently
  invented).
- `PATCH /api/vending/machines/{id}/assortment/{productCatalogue}/{productId}`
  — the four mutations that exist without a full re-assort: unassort,
  link/unlink a physical slot, hide/show on the customer screen, set
  (or clear) a price override — same "apply whichever field was given"
  convention `.../slots` PATCH already uses.
- `GET .../assortment/{productCatalogue}/{productId}` — the
  `priceOverrideKes` audit trail for one product on one machine.

Also added: `GET /api/vending/machines/{id}/reserve` — the KSh 100,000
reserve status (§ INVENTORY_ARCHITECTURE.md §4), and a "Assortment &
inventory reserve" card on the machine detail admin page rendering
both. See `docs/MACHINE_COMMERCE.md` §9 for the subscription/settlement/
wallet API surface added alongside this.

---

## 5. What this pass does not do, and why

- **Does not touch `MachineSlot` or `machineSlotService`.** They
  already correctly own physical/inventory concerns; assortment is
  additive on top, not a replacement.
- **Does not build a drag-and-drop bulk merchandising UI.** The staff
  API above (§4) plus a read-only table on the machine detail page
  cover assort/un-assort/price-override/visibility; a richer
  merchandising screen (drag-to-reorder, bulk edit across machines) is
  a UI investment beyond what this pass's time was spent proving.
- **Does not expand `promotionalState` beyond a plain enum with dates.**
  A real promotion *engine* (bundled discounts, time-boxed pricing
  campaigns across machines) is explicitly SCALE-bucket per
  `docs/VENDING_OS_BENCHMARK.md`'s own phasing — unchanged by this pass.
