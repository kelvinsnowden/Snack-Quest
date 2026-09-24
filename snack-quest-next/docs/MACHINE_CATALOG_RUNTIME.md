# Machine catalog runtime — the customer screen's own read

The customer-facing contract for one machine's own sellable catalog —
what the screen calls, what it must never call, and what "version"
actually means here. `docs/MACHINE_ASSORTMENT.md` is the authoritative
doc for the assortment *domain* (assort/link-slot/visibility/price
override, promotional windows); this document is specifically the
runtime read a screen/gateway drives against it, cross-referenced from
`docs/VENDING_OS_ARCHITECTURE.md` §2 and `docs/MACHINE_RUNTIME.md` §3.

## 1. One route, scoped to one machine

```
GET /api/vending/machines/{machineId}/catalog
```

Device-authenticated (`authenticateDevice`), and the authenticated
token's `machineId` must equal the path's `{machineId}` — a request
for any other machine's catalog 404s, exactly like
`GET /api/vending/payments/[id]`'s own cross-machine probing
discipline: **never revealed to exist, never merely forbidden.** There
is no route that returns the *global* catalogue to a device, and there
never should be — a customer screen has no legitimate reason to see
another machine's assortment, prices, or promotions, and giving it the
means to would make machine isolation a client-side convention instead
of a server-enforced fact.

## 2. Response shape

```json
{
  "catalogVersion": "2026-09-24T10:00:00.000Z",
  "items": [
    {
      "productId": "sku-1",
      "productCatalogue": "snackItem",
      "slotCode": "A01",
      "name": "Korean Spicy Snack",
      "description": null,
      "imageUrl": "...",
      "category": "snacks",
      "priceKes": 350,
      "sellable": true,
      "displayOrder": 1,
      "promotionalState": "none"
    }
  ]
}
```

Every field the screen needs to render a tile and decide whether to
let a customer attempt a purchase is already decided —
`sellable`/`priceKes`/`promotionalState` are never derived on-device.
`machineAssortmentService.getSellableCatalog` (`services/machineAssortmentService.ts`)
is the single function that computes this: it reads *only* this
machine's own `MachineAssortment` rows and `MachineSlot`s, filters to
`assorted && visible`, resolves the product name/image/price from the
referenced `snackItem`/`package` (with per-machine overrides applied —
`customerFacingName`, `priceOverrideKes`, ...), and computes `sellable`
as `slot exists && slot.enabled && slot.currentQuantity > 0 &&
machine.status === 'active'`. A screen renders this list; it makes no
decision of its own.

## 3. `catalogVersion` is deterministic, not a timestamp of "now"

Earlier, this route returned `new Date().toISOString()` on every call
— which meant two consecutive reads with *nothing changed* reported
two different "versions," making version comparison meaningless.
`machineAssortmentService.getCatalogVersion` fixes this: it is the
latest `updatedAt` across every `MachineAssortment` row and
`MachineSlot` belonging to this machine (both already carry a real
audit timestamp bumped on every write), falling back to the machine's
own `updatedAt` when nothing is assorted yet. Two reads with no
underlying write in between return the exact identical string
(`tests/api/vendingMachineCatalogRoute.test.ts`,
`tests/services/machineAssortmentService.test.ts`).

It is deliberately a conservative **upper bound**, not the tightest
possible signal: it changes on *every* row/slot write for the machine,
including one that turns out not to affect what's currently rendered
(e.g. a product that was already invisible getting re-priced). A
gateway that treats a version change as "worth a re-fetch" will
occasionally re-fetch for no visible reason — harmless. What it must
never do is fail to signal a real change, and reading the underlying
data's own timestamps rather than deriving anything from what
`getSellableCatalog` currently filters to guarantees that.

## 4. Local cache — the model a gateway would implement

`docs/MACHINE_RUNTIME.md` §3 covers this from the gateway's side in
full; restated briefly here because it's this route's own contract:
a gateway fetches once, stores `{ catalogVersion, lastSyncedAt, items }`
locally, and on a later sync compares its cached `catalogVersion`
against a fresh call's — equal means "nothing changed, serve the
cache," different means "re-fetch and replace." If the cloud is
unreachable, the gateway falls back to its last-known-good cache
rather than failing closed. **No such cache is implemented on the
device side in this repository** — there is no device to run it on
yet — but this route now returns a version that actually supports that
model, which it didn't before.

## 5. Machine isolation is tested, not assumed

`tests/services/machineAssortmentService.test.ts`'s
`MachineAssortmentService — isolation` suite and
`tests/services/partnerIsolation.test.ts` prove the property the brief
names directly: assorting SKU1 to Machine A and SKU2 to Machine B
means Machine A's catalog contains SKU1 and never SKU2, and vice
versa — `catalogA.some((item) => item.productId === sku2)` is
asserted `false`. The brief's own illustrative scenario names two
specific machines (`SQ-001` with a Korean snack + Japanese candy,
`SQ-002` with an American candy + Japanese drink); this codebase's
tests prove the identical isolation property generically (Machine A /
Machine B, arbitrary SKUs) rather than hard-coding those two literal
fixture machines — the property under test is the same, the fixture
names are not claimed to literally exist.

Per-machine price differences are covered the same way: `priceKes`
resolves as `row.priceOverrideKes ?? slot?.priceKes ?? fallbackPriceKes`,
so the same globally-catalogued SKU can have three different resolved
prices across three machines depending on which override level each
one actually set — exercised in `tests/services/machineAssortmentService.test.ts`.

## 6. Out-of-stock-but-assorted

A product stays in the response (with `sellable: false`) once its slot
empties, rather than disappearing — `getSellableCatalog` filters on
`assorted && visible`, not on stock. This lets a screen show "sold
out" rather than silently vanishing an item a customer might have
already been looking at, and lets an unassorted-but-still-tracked
product distinguish itself from one genuinely removed from the
machine's lineup (`unassortProduct` sets `assorted: false`, which *does*
remove it from the response — a deliberate, separate decision from
running out of stock).

## Still NEXT/SCALE

A real gateway-side cache implementation; a push-based "catalog
changed" notification instead of poll-and-compare (the same
`CloudTransport`/MQTT gap named in `docs/MACHINE_RUNTIME.md`);
screen-side promotional/merchandising rendering beyond the flat item
list this route returns today.
