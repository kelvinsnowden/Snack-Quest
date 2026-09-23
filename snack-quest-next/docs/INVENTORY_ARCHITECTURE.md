# Inventory architecture: what's unified today, what isn't yet, and why

Written against the live codebase before any code in this pass. The
brief asks for "one inventory truth capable of supporting warehouses,
machines, stores, fridges, transit, vehicles, quarantine, damaged,
expired, other locations" while also explicitly saying "do NOT force
vending inventory into the existing box inventory model." Both
instructions are correct, and satisfying both is the point of this
document: **the workflows stay separate; the ledger discipline is
already the same shape, and this document is where that gets made
explicit rather than migrated by force.**

---

## 1. Audit: the inventory truths that exist today

| Truth | Granularity | Ledger | Cached balance | Used by |
|---|---|---|---|---|
| **Box/warehouse inventory** | `packageId` (a whole box) | `InventoryMovement` (`restock`/`correction`/`damaged`/`other`/`purchase_order_received`/`expired`/`written_off`) + `InventoryBatch` (from purchase-order receipts, with real supplier/cost/expiry) | `Package.stockCount` (optional — undefined means untracked) | Box fulfillment: `PurchaseOrderService`, `InventoryService`, the Admin Inventory view |
| **Vending machine inventory** | `machineId` + `slotCode` (a physical slot) | `MachineInventoryMovement` (`restock`/`sale`/`manual_adjustment`/`waste`/`return`) | `MachineSlot.currentQuantity` | `machineSlotService`, `machineInventoryMovementService`, vend authorization |
| **Individual snack stock** | `snackItemId` | **None** — `SnackItem.stockCount` is an optional, informally-set field with no movement history behind it at all | `SnackItem.stockCount` (optional) | The premium-pick/recipe picker's own out-of-stock check |

**These are already the same *shape* of ledger** — signed delta,
resulting balance captured at write time, a reason enum, an actor,
immutable — independently arrived at twice (box, then vending) because
each was built against its own real workflow rather than a shared
abstraction nobody had asked for yet at either point. That convergence
is the evidence a real unification is possible; it is not, by itself,
a reason to force one now.

## 2. Why this pass does not migrate box inventory into one collection

A real migration would mean: picking one canonical `InventoryLocation`
+ movement shape, writing a backfill for every existing
`InventoryMovement`/`InventoryBatch`/`Package.stockCount` row, updating
every one of `PurchaseOrderService`/`InventoryService`'s call sites
(and their own tests), and doing all of that against **production data
already in use for real box fulfillment** — with the one thing the
whole brief insists on twice ("Do not break existing box operations",
"Do not declare complete if the implementation is merely mocked")
being exactly the property a rushed migration is most likely to
violate. This is SCALE-bucket work: real, valuable, and not
something to attempt as a side effect of building the vending
commerce layer this pass is actually about.

**What this pass does instead:** treats `machineId` as already being
today's one instance of "an `InventoryLocation` that isn't a
warehouse" — `MachineInventoryMovement`'s own doc comment already says
this ("a separate collection... because it is a separate physical
reality", not because machines are exempt from the ledger discipline).
Nothing new is invented for the vending side; the KSh 100,000 reserve
(§3 below) is computed by reading the *existing* `MachineSlot` +
`MachineInventoryMovement` data, proving that today's vending ledger
already carries enough information to answer the brief's own
questions about it — without a migration.

## 3. The target model, for when a real migration is warranted

```
InventoryLocation
  ├── type: 'warehouse' | 'machine' | 'store' | 'fridge' | 'transit' | 'vehicle'
  ├── id (today: a warehouse's implicit singleton, or a Machine's own id)
  └── ownerBusinessId

InventoryMovement (generalized)
  ├── sku (today: packageId | snackItemId — the same discriminator MachineSlot.productCatalogue already uses)
  ├── quantityDelta, unitCostKes, totalCostKes
  ├── sourceLocation, destinationLocation
  ├── reason: RECEIPT | TRANSFER_OUT | TRANSFER_IN | RESTOCK | SALE | RETURN |
  │           DAMAGE | EXPIRY | ADJUSTMENT | COUNT_ADJUSTMENT | WASTE | QUARANTINE | RELEASE
  ├── sourceTransactionId, batchId, actor, idempotencyKey
  └── createdAt (immutable)

InventoryBalance (materialized view, reconstructable from movements)
  └── (sku × location) → { onHand, reserved, available, inTransit, damaged, quarantined }
```

The existing `InventoryMovementReason` and `MachineInventoryMovementReason`
enums are already near-subsets of the generalized `reason` list above
— migrating would mostly be a rename/merge, not a redesign, which is
itself evidence the current split was the right call to make
incrementally rather than a mistake to have made at all.

**Migration path, when it's warranted:** add the generalized
collections additively (new collection names, so nothing existing is
touched); write both old and new ledgers from every existing call site
for one release; backfill historical rows once; cut reads over to the
new collections; remove the dual-write. Each step is independently
safe to ship and roll back — the property a big-bang migration cannot
offer.

## 4. The KSh 100,000 machine inventory reserve (§ MACHINE_COMMERCE.md's own commercial framing)

Built this pass as a **computed view**, not a new ledger — proof the
existing vending inventory data already answers this question.

```ts
machineInventoryReserveService.getReserveStatus(businessId, machineId): {
  targetKes: number;        // Machine.inventoryReserveTargetKes ?? DEFAULT_RESERVE_TARGET_KES (100_000)
  currentAtCostKes: number; // sum over MachineSlot rows: currentQuantity × unit cost, where cost is known
  currentAtRetailKes: number; // sum: currentQuantity × slot.priceKes
  varianceKes: number;      // currentAtCostKes - targetKes
  replenishmentRequiredKes: number; // max(0, -varianceKes)
  unpricedSlotCount: number; // slots whose product has no known unit cost (see below)
}
```

**Honest gap, not silently rounded over:** unit cost is only known when
a slot's product is a `SnackItem` (`expectedUnitCostKes`). A slot
selling a whole `Package` has no cost field today — `Package` was
built for online box sales, where cost was never tracked per-box (see
`docs/MACHINE_ASSORTMENT.md` §1). Those slots' `currentAtCostKes`
contribution is `0` and they're counted in `unpricedSlotCount` rather
than silently treated as free stock or as having no bearing on the
reserve — the caller sees exactly how much of the reserve figure is
real and how much is an unpriced gap, rather than one number that
quietly hides which.

Exposed as `GET /api/vending/machines/{id}/reserve` (staff-facing,
`ADMIN_FINANCE_OR_WAREHOUSE`) and rendered on the machine detail
admin page's "Assortment & inventory reserve" card — the target/
current-at-cost/current-at-retail/variance/replenishment figures
above, plus the unpriced-slot warning, all read live rather than
cached.

## 5. Restocking (§ 17 of the brief)

`RestockTask` already exists with a 5-state workflow
(`pending → assigned → in_progress → completed`, or `cancelled`) that
auto-opens on low stock (`machineSlotService.checkLowStock`). The
brief's 8-stage workflow (`DRAFT → APPROVED → PICKING → DISPATCHED →
IN_TRANSIT → RECEIVED → PARTIALLY_RECEIVED → CANCELLED`) is a real
refinement — picker/dispatcher/receiver roles and partial-receipt
discrepancy tracking aren't representable in the current 5 states —
but expanding a working task's status enum mid-flight, with an admin
UI and tests already built against the current 5, is exactly the kind
of change that needs its own careful pass rather than a rider on this
one. **Deliberately not touched this pass** — flagged here as the
next real gap, not missed by oversight.
