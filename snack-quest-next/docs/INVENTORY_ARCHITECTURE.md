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

## 5. Restocking (§ 17 of the brief — implemented, later pass)

Rebuilt from the flat 5-state model this section originally flagged as
a gap (`pending → assigned → in_progress → completed`, or `cancelled`)
into the brief's own 8-stage chain:

```
DRAFT → APPROVED → PICKING → DISPATCHED → IN_TRANSIT → RECEIVED
                                                       ↘ PARTIALLY_RECEIVED
(cancellable from DRAFT/APPROVED/PICKING/DISPATCHED only)
```

`RESTOCK_TASK_STATUS_TRANSITIONS` (`types/restockTask.ts`) is the one
source of truth for which moves are legal;
`restockTaskRepository.moveStatus[InTransaction]` checks it before
every write, so a stage can never be skipped and a terminal task
(`received`/`partially_received`/`cancelled`) can never be resurrected
through this layer. `RestockTaskService` (`services/restockTaskService.ts`)
is the new orchestration layer this workflow needed and never had
before — each stage is its own method (`approve`/`startPicking`/
`dispatch`/`markInTransit`/`receive`/`cancel`), recording the one real
actor that stage adds (`pickedBy`/`dispatchedBy`/`receivedBy`) rather
than one `assignedTo` field standing in for three different people.

**Discrepancy, never silently absorbed.** `receive()` derives the
terminal state from what actually happened, never from what the
caller claims: if every item's `quantityReceived` matches what
`dispatch()` recorded as `quantityDispatched`, the task lands on
`received`; if any item came up short, it lands on
`partially_received` with that item's exact `discrepancyQuantity`
(`quantityDispatched - quantityReceived`) stored, plus an optional
`discrepancyNote`. Both are terminal — a real shortfall becomes a new
task once someone acts on it, not a reopened old one, the same
"no half-finished-period bookkeeping" discipline
`docs/MACHINE_COMMERCE.md`'s subscription model already commits to.

**Completing creates real ledger movements, atomically with the task
itself.** `receive()` runs as a single Firestore transaction spanning
the task document *and* every slot document a received item touches —
reading the task and every needed slot first, then writing the
movements, the slot quantities, and the task's new status/items
together (Firestore transactions require every read before any
write). This was a deliberate design choice, not the obvious one:
calling the existing `MachineInventoryMovementService.recordMovement`
per item (its own transaction per call) would leave a real gap — a
crash between "recorded received" and "added the stock" is exactly
the ledger/cache disagreement that service's own doc comment exists to
prevent, and receiving is not naturally idempotent (a retry would
double-credit whatever succeeded the first time), so inlining the
slot-quantity update into the same transaction as the task's own
status write was the only way to make both true at once. Each written
`MachineInventoryMovement` carries the new `restockTaskId`/`batchId`/
`expiresAt` fields (§4 below) — a receipt is traceable back to the
task and the lot it came from, not just an anonymous `+8`.

**`warehouseId`/`batchId` are plain references, not a live draw
against a real inventory ledger.** No `InventoryLocation`/generalized
inventory model exists in code yet (§3 above designs it, doesn't build
it) — building that integration (actually decrementing a warehouse's
own stock when a restock task dispatches from it) is its own pass, not
a rider on this one. What exists today is honest about that: a
`warehouseId` is recorded, never validated against a real warehouse
inventory balance.

**API:** `GET /api/vending/restock` (list, unchanged shape), `POST`
(create a draft manually — the same shape `checkLowStock` uses
automatically), and one route per stage under
`/api/vending/restock/{taskId}/{approve,start-picking,dispatch,mark-in-transit,receive,cancel}`
— six distinct real-world actions, not a body-shape switch on one
endpoint. All `ADMIN_OR_WAREHOUSE`, matching this domain's existing
gate.

**Admin UI:** a "Restock tasks" card on the machine detail page lists
every task (status badge, items with needed/dispatched/received/
discrepancy, priority, opened date) and renders the one action a
task's current stage actually offers — never every button at once,
and `dispatch`/`receive` require the operator to see and confirm the
real per-item quantity before submitting, defaulted but never silently
assumed.

**Migration:** no production restock task predates this rebuild — the
whole vending system is pre-launch, simulator-only, with zero real
machines deployed — so there is no live data migrating an old `status`
value would need to handle. Had real `pending`/`assigned`/
`in_progress`/`completed` rows existed, the honest migration would
have been a one-time backfill mapping `pending→draft`,
`assigned`/`in_progress→picking` (with `pickedBy` set to the old
`assignedTo`), `completed→received` (with every item's
`quantityDispatched`/`quantityReceived` backfilled equal to
`quantityNeeded`, since the old model never distinguished them) —
recorded here in case it's ever needed, not built, since there is
nothing to run it against.

**Deliberately still not built:** route planning across many
machines' tasks (docs/FLEET_ARCHITECTURE_AUDIT.md §23's own Phase-2
framing, unchanged), and the real warehouse-inventory draw described
above.
