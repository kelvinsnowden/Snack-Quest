# Machine commerce: central collection, machine attribution, owner economics

Written against the live codebase before any code in this pass.
Companion to `docs/MACHINE_ASSORTMENT.md` (what a machine sells) and
`docs/INVENTORY_ARCHITECTURE.md` (what a sale consumes).

---

## 1. The business model, restated against what's actually built

Machine owners buy the physical machine and are responsible for its
location and location-side costs. Snack Quest operates the vending
business (sourcing, catalog, inventory, software, payments,
monitoring, restocking, support, analytics) and collects all customer
payments **centrally** — there is no per-machine payment account. The
owner pays Snack Quest a recurring subscription; Snack Quest never
silently absorbs the owner's own location costs into its own P&L.

This is a **different commercial shape** from what one existing type
was structurally prepared for — worth stating plainly rather than
leaving implicit:

| | `PartnerMachineAgreement.revenueSharePartnerPct` (existing) | This brief's model |
|---|---|---|
| Shape | Partner earns a % of gross sales; Snack Quest keeps the rest | Owner earns (revenue − COGS − subscription); Snack Quest's own income is the flat subscription fee |
| Status today | **Null everywhere** — "structurally present before any commercial term is actually set" (that type's own doc comment); nothing in this codebase has ever computed with a non-null value | N/A — this is what this pass activates |

**This is not a conflict to resolve by deleting anything.** The
revenue-share field was explicitly built as a placeholder for a
decision nobody had made yet ("do not invent a revenue-share
percentage... CMA-legal-review-gated" — `docs/FLEET_ARCHITECTURE_AUDIT.md`
§19). This brief *is* that decision, arriving as a subscription model
instead of a revenue-share one. The field stays (a future agreement
could still set it, and `machineSettlementService.createDraft`'s
existing revenue-share arithmetic is untouched), and the subscription
model is added as the path a settlement actually takes when an
agreement has no revenue-share percentage set — which, per the table
above, is every agreement that exists today.

---

## 2. Central collection ↔ machine attribution — audit

**Already fully satisfied.** Every `MachineTransaction` already
carries `machineId`, `slotId`, `productId`, `productCatalogue`,
`amountKes`, `paymentRef` (Safaricom's own receipt), `vendRef`
(the adapter's own dispense reference), `status`, and timestamps —
resolved server-side from the authenticated device's own token, never
from a client-supplied value (`docs/HARDWARE_COMPATIBILITY_ARCHITECTURE.md`'s
device-auth model). `Machine.ownerPartnerId` resolves machine → owner.
The question the brief poses in §2 ("Snack Quest received this payment
centrally — which machine, which owner, what inventory, what COGS,
what subscription, what's distributable") is already answerable end
to end for every field except **COGS** and **subscription**, which is
exactly what this pass adds (§4, §5 below) — not a new attribution
model, the two numbers the existing attribution was still missing.

---

## 3. Machine-level economics

```
Revenue (Σ dispensed MachineTransaction.amountKes in period)
  − Refunds
  − COGS (§4)
  − Subscription charge for the period (§5)
  = Distributable owner profit
      → credited to the owner's wallet (§6)
```

Owner-side location costs (rent, placement fees, electricity) are
**never** part of this calculation — `MachineSettlement` has no field
for them and this pass adds none. An owner may record their own
location costs separately if a future pass builds that (not this
one); Snack Quest's own settlement math never nets them out by
default, per the brief's own explicit instruction.

## 4. COGS (`MachineSettlement.cogsKes` — new field, this pass)

Computed from the **existing** `MachineInventoryMovement` ledger: sum
the `sale`-reason movements in the settlement period, and for each,
resolve `quantityDelta` (negative, so its absolute value) × the
product's unit cost. Unit cost resolution follows
`docs/INVENTORY_ARCHITECTURE.md` §4's own honest-gap rule: known when
the slot's product is a `SnackItem` (`expectedUnitCostKes`), unknown
(and reported as such via `unpricedSaleCount`, never silently zero) when
it's a `Package`.

## 5. Subscription (`MachineSubscription` — new domain, this pass)

```ts
interface MachineSubscription {
  businessId: string;
  machineId: string;
  partnerId: string;
  planName: string;
  amountKes: number;         // configurable — never hard-coded
  frequency: 'monthly' | 'weekly';
  status: 'active' | 'paused' | 'cancelled' | 'in_arrears';
  startDate: Timestamp;
  currentPeriodStart: Timestamp;
  currentPeriodEnd: Timestamp;
  renewalDate: Timestamp;
  lastPaymentStatus: 'paid' | 'unpaid' | 'waived';
  lastPaidAt: Timestamp | null;
  arrearsKes: number;
  graceUntil: Timestamp | null;
}
```

**Deliberately not wired to an automatic Daraja charge in this pass.**
Collecting a recurring charge *from* an owner (as opposed to paying
one *out*, §6) is its own real payments-integration decision —
STK-push-on-a-schedule, invoice-and-manual-reconciliation, or a card
mandate are all real options with different risk/ops tradeoffs, and
picking one without product/finance input would be inventing exactly
the kind of commercial term the brief repeatedly says not to invent.
What this pass builds is the **record**: a subscription's plan,
status, and period, with `markPeriodPaid`/`markPeriodUnpaid` as
staff-recorded actions (mirroring `withdrawalService.payWithdrawalManually`'s
"an admin recorded what actually happened" pattern) — real bookkeeping,
honest about not yet auto-charging anyone.

`machineSettlementService` reads a machine's active subscription to
net `subscriptionChargedKes` into the settlement; a machine with no
subscription record nets `0`, not null-propagated into an unusable
settlement.

## 6. Owner wallet (`Partner.availableCashKes`/`lifetimeEarnedKes` + `PartnerEarningsLedgerEntry` — extends existing patterns, this pass)

**Not a new pattern.** This codebase already has exactly this shape
twice — `CustomerWallet.balanceKes` + `WalletLedgerEntry`, and
`CreatorProfile.availableCashKes` + `CreatorEarningsLedgerEntry` — a
mutable cached balance backed by an append-only ledger of how it got
there. `Partner` gets the same pair, mirroring the creator shape most
closely since a partner, like a creator, is paid out through the
existing B2C withdrawal engine (§7).

`machineSettlementService.finalize()` is the one and only credit path:
moving a settlement `draft → finalized` reads-and-writes inside one
Firestore transaction (mirroring `WithdrawalService.approveWithdrawal`'s
own transactional discipline) that (a) checks the settlement is still
`draft`, (b) computes `distributableOwnerKes = grossSalesKes −
refundsKes − cogsKes − subscriptionChargedKes + adjustmentKes`, (c)
credits `Partner.availableCashKes` by that amount, (d) writes a
`PartnerEarningsLedgerEntry`, and (e) moves the settlement to
`finalized`. A `finalized` settlement's own status is what makes a
second `finalize()` call a no-op rather than a double credit — the
same idempotency discipline the brief's §23 explicitly asks for, and
the same mechanism (a status guard read inside the crediting
transaction) `WithdrawalService` already uses for its own
double-payment protection.

## 7. Owner withdrawal (extends `Withdrawal` — implemented, this pass)

**Reuses the entire existing B2C withdrawal engine rather than building
a second one.** `Withdrawal.ownerType` already existed as an open union
(`'creator' | 'customer'`) specifically so a real balance source could be
plugged in later without a new collection —
`WithdrawalService.requestWithdrawal` already failed closed
(`UnsupportedWithdrawalOwnerTypeError`) for any `ownerType` without one.
This pass adds `'partner'`, backed by
`partnerRepository.reserveBalanceInTransaction`/`refundBalanceInTransaction`
— the exact same two functions `creatorRepository` already provides for
`'creator'`, mirrored field-for-field (`Partner.availableCashKes` in
place of `CreatorProfile.availableCashKes`).

Every balance mutation in `WithdrawalService`
(`requestWithdrawal`/`approveWithdrawal`'s failure path/`rejectWithdrawal`/
`handleB2CResult`/`resolveAmbiguousWithdrawal`) now dispatches on the
withdrawal's own `ownerType` to the matching repository's reserve/refund
pair via one private `refundOwnerBalanceInTransaction` helper — a
partner withdrawal can never touch `creatorMemberships`, and vice versa,
by construction rather than by convention. Everything else downstream —
`approveWithdrawal`'s real Daraja B2C payout, the crash-safe
`pending → submitting` claim, the async B2C result webhook, the
Transaction Status Query reconciliation sweep, the manual-payment escape
hatch — is **inherited unmodified**. A partner withdrawal is, from
`approveWithdrawal` onward, indistinguishable in code from a creator
one; the only new code is the balance source it draws from and the
eligibility check (`requestWithdrawal` resolves the partner and checks
`status === 'active'`, mirroring the creator eligibility check exactly).

Two things deliberately do *not* carry over unchanged:
- The `creator_financial_writes_frozen` feature flag (a
  `creatorProfiles → creatorMemberships` migration guard, unrelated to
  partners) is now checked only when the withdrawal being
  approved/rejected is actually `ownerType: 'creator'` — otherwise it
  would incorrectly block partner payouts during a creator-only
  maintenance window. `assertB2CDisbursementsNotFrozen` (the general
  Daraja-outage guard) still applies to both.
- The withdrawal-approved **email** is skipped for partner withdrawals:
  `claimed.ownerId` is a `partnerId`, not a `userRepository` uid, so
  there is no real account to look an email address up against —
  consistent with §8's "no owner-facing UI/login" scope, this sends
  nothing rather than a broken link. The SMS (sent to the phone number
  on the withdrawal request itself, not looked up) still goes out, now
  correctly labeled `recipientType: 'partner'`.

This is deliberately the one piece of this brief's financial surface
this pass was willing to extend with real money-movement consequences —
because it is *only* an extension of an already-hardened, well-tested
state machine, not new financial code. Building a second withdrawal
engine for partners, instead of reusing this one, would have been the
actual risk. Covered by `tests/services/withdrawalServicePartner.test.ts`
(request/reserve, insufficient-balance, suspended/missing/cross-business
partner rejection, the creator-freeze-does-not-block-partners case,
approve/B2C, the skipped email, the labeled SMS, reject/refund) plus the
full pre-existing `tests/services/withdrawalService.test.ts` (48 tests,
re-run and still green — this extension changes no creator behavior).

---

## 8. Staff admin API + UI (implemented, this pass)

Everything above is reachable by staff, not just by service-layer
calls:

- `GET/POST /api/vending/machines/{id}/subscription`,
  `PATCH .../subscription/{subscriptionId}` (`action`:
  `recordPayment`/`waivePeriod`/`pause`/`resume`/`cancel`) —
  `ADMIN_ONLY` for every write, per §5's "financial" framing.
- `GET/POST /api/vending/machines/{id}/settlements`,
  `POST /api/vending/settlements/{id}/finalize` — creating a draft is
  `ADMIN_ONLY`; finalizing (the one write that actually credits a
  partner's wallet) is the same bar, never relaxed to finance/warehouse.
- `GET /api/vending/partners/{partnerId}/wallet` (balance + ledger),
  `.../subscriptions`, `.../settlements` — the fleet-wide, per-owner
  rollups §6's wallet model implies; `GET/POST
  /api/vending/partners/{partnerId}/withdrawals` — staff-initiated
  requests per §7, `ADMIN_ONLY` for the write.
- Admin UI: the machine detail page gained an "Assortment & inventory
  reserve" card and a "Machine economics: subscription & settlements"
  card (read-only, real data, no mocked figures); a new "Machine
  Owners" list + detail page (`/admin/vending/partners`) shows each
  owner's wallet, ledger, subscriptions, settlements and withdrawal
  history, with a "Request withdrawal" action wired to the endpoint
  above. The pre-existing `/admin/withdrawals` list/detail pages were
  extended to resolve a partner withdrawal's display name from
  `partnerService` instead of `userRepository` (a partner has no user
  account to look up) — everything else about those pages (approve/
  reject/pay-manually/resolve) already worked unmodified, because
  `WithdrawalService` dispatches on `ownerType` underneath (§7).

Every route above is covered by a route-level test
(`tests/api/vendingMachine{Assortment,Subscription,Settlements,Reserve}Route.test.ts`,
`tests/api/vendingPartnerWalletRoute.test.ts`) asserting the exact
role gate, validation, and error-code mapping, with the underlying
service mocked — the service-level behavior itself is what
`tests/services/*` already proves against the real emulator.

---

## 9. What this pass does not do, and why

- **No automatic subscription charging** (§5) — a real payments
  decision, not this pass's to make.
- **No partner login/session.** `docs/VENDING_FOUNDATION.md` already
  established "no partner login flow built yet" as deliberate scope;
  every surface this pass adds (§9) is staff-facing — an admin viewing
  or acting on a partner's behalf — not a partner's own authenticated
  session. A real partner portal is a future pass, not a gap in this
  one's own scope.
- **No bulk/self-service withdrawal UI for the partner themselves** —
  same reason as above; `RequestPartnerWithdrawalAction` is a staff
  control, not a partner-facing form.
- **No revenue-share settlement path removed.** It stays, unused by
  every agreement that exists today, available if a future commercial
  decision actually sets `revenueSharePartnerPct`.
- **No fraud scoring for partner withdrawals beyond the existing
  honest `0`** — same as `requestWithdrawal` already does for
  creators; inventing a score would be worse than admitting none
  exists.
