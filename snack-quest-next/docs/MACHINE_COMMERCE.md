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

**`createDraft` idempotency, hardened (Phase 4 bug fix).** The overlap
check and the write are now one atomic Firestore transaction
(`machineSettlementRepository.createIfNoOverlap`) — closing a real
race the original implementation had: two concurrent `createDraft`
calls for the same machine/period (a double-click, a retried request)
could both pass a read-then-write overlap check before either had
written, producing two draft settlements over the same revenue. The
gross/COGS/subscription arithmetic stays computed before the
transaction (real arithmetic over already-settled facts, safe to
compute outside it); only "does this period already have a
settlement" needs to be atomic with the write itself, the same
distinction `finalize()` already drew for its own credit path below.

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

## 10. Owner Portal — partner authentication + self-service UI (§ PART 2 — OWNER PORTAL, implemented, Phase 4)

§9's own "No partner login/session" gap is what this section closes.
`lib/auth/partnerSession.ts` + `services/partnerAuthService.ts` mirror
`lib/auth/creatorSession.ts`'s existing pattern field-for-field — its
own cookie (`PARTNER_SESSION_COOKIE`, never shared with the staff or
creator session, so all three can coexist in one browser without ever
being conflated), Firebase Auth verifying the identity, and
`requirePartnerSession`/`verifyPartnerSessionFromRequest` covering
Server Components and Route Handlers the same way
`requireStaffSession`/`verifyStaffSessionFromRequest` already do for
staff. This is deliberately **not** a new auth system — it's the
existing pattern applied to a third actor type.

The Owner Portal itself (`app/partner/(protected)/**`, mobile-first)
is the partner's own authenticated view of exactly the data §6–§8
already compute for them: a dashboard (`page.tsx`) summarizing wallet
balance and recent settlements, `machines/[machineId]/page.tsx` for a
single machine's own economics, `subscription/page.tsx`, and
`wallet/page.tsx` (balance, ledger, a self-service withdrawal request
against the same `POST /api/vending/partners/me/withdrawals` endpoint
§7's engine already exposes — scoped to the authenticated partner's
own `ownerId`, never a body-supplied one; see that route's own tests
for the identity-scoping assertion this matters most for). Every read
here is scoped through `machineService.assertPartnerOwnsMachine` or
the equivalent partner-scoped repository call — the same enforcement
primitive `docs/SNACK_INTELLIGENCE.md` §14 already established for
owner-facing intelligence reads, applied to owner-facing commerce
reads. §9's "no bulk/self-service withdrawal UI for the partner
themselves" gap is now closed by this same portal, not by extending
the staff-facing `RequestPartnerWithdrawalAction`.

## 11. Owner vs. location economics — location expenses (§ PART 7, implemented, Phase 4)

A location has real costs — rent, a placement fee, electricity — that
belong to the machine owner, not to Snack Quest, and §3 already
states plainly that Snack Quest's own settlement math never nets them
out. This section builds the owner's own record of those costs, on
the owner's own side of that boundary: `LocationOwnerExpenses`
(`monthlyRentKes`, `placementFeeKes`, `monthlyElectricityKes`,
`locationCommissionPct`), written by the owner themselves through
`PUT /api/vending/partners/me/locations/{locationId}/expenses` and
`components/partner/LocationExpensesForm.tsx` in the Owner Portal.

**Nothing entered here ever reaches Snack Quest's settlement math.**
`machineSettlementService`'s `distributableOwnerKes` formula (§3, §6)
reads none of these fields — this is purely the owner's own
record-keeping, exactly like a landlord tracking their own utility
bills separately from what a tenant pays them. The form's own copy
says so explicitly, rather than leaving an owner to guess whether
filling it in changes what they're paid — the same "never let a UI
imply a consequence the code doesn't actually have" discipline this
codebase applies to `revenueSharePartnerPct` (§1's own table:
"structurally present," never silently assumed to do anything).

## 12. Central payment/vend reconciliation (§ PART 4, implemented, Phase 4)

`services/vendingReconciliationService.ts` is the staff-facing answer
to "did every payment become a vend, and every vend come from a real
payment" — assembled from signals the state machine in
`docs/VENDING_OS_ARCHITECTURE.md` §5 already produces, not a parallel
correlation engine. Two issue kinds, both real and both detectable
today:

- **Payment-without-vend / stuck transactions** — every
  `MachineTransaction` currently sitting in `manual_review`: an amount
  mismatch, a stuck-transaction timeout with no device report ever
  arriving, or an explicit device `unknown` vend result. This *is*
  the reconciliation-issue queue, not an approximation of it — the
  correlation work already happened inside the transaction's own
  state machine; this reads its output.
- **Vend-without-payment** — a device's own vend report whose
  `vendRef` matched no transaction at all
  (`machineTelemetryEventRepository`'s `vend_result` events with
  `processingError` set). Reachable only from a genuine hardware/
  protocol anomaly, since a vend is only ever authorized from an
  already-paid transaction in this architecture — never from the
  diagnostic Test Vend action, which creates no transaction and is
  excluded from this signal by definition.

Exposed as `GET /api/vending/reconciliation`
(`ADMIN_FINANCE_OR_WAREHOUSE`) and rendered on an admin Reconciliation
page listing both issue lists. **Deliberately not attempted, rather
than faked:** duplicate payment and unknown payment (a vending STK
callback matching no transaction at all) — both would need to be told
apart from the e-commerce checkout's own unmatched-payment bucket,
which needs a schema change to the webhook ledger this pass didn't
make; named as real future work in
`docs/VENDING_OPERATIONS_RUNBOOK.md`'s own NEXT list, not glossed
over. Every `payment_reconciliation_issue` this service surfaces also
feeds the Alert Center (`docs/VENDING_OS_ARCHITECTURE.md` §11) — the
same signal, two surfaces, never two independently-maintained copies
of it.

## 13. Audit-log coverage (Phase 4)

Every financial write this document describes — subscription
payment/waive/pause/resume/cancel, settlement draft creation and
finalization, a withdrawal request, an alert acknowledge/resolve —
now writes a real `AuditLog` entry, closing a gap where roughly half
of this domain's mutating routes recorded no audit trail at all.
Covered by route-level tests asserting the write actually happens
(`auditLogRepository.listByBusiness` against the real emulator, not
just a mocked call), not merely that the route returns 200 —
see `docs/VENDING_OPERATIONS_RUNBOOK.md` § for where staff actually go
to read this trail.

## 14. What this pass does not do, and why

- **No automatic subscription charging** (§5) — a real payments
  decision, not this pass's to make.
- **No revenue-share settlement path removed.** It stays, unused by
  every agreement that exists today, available if a future commercial
  decision actually sets `revenueSharePartnerPct`.
- **No fraud scoring for partner withdrawals beyond the existing
  honest `0`** — same as `requestWithdrawal` already does for
  creators; inventing a score would be worse than admitting none
  exists.
- **No duplicate-payment / unknown-payment detection** (§12) — needs a
  webhook-ledger schema change this pass didn't make; named, not
  hidden.
- **No automatic re-charge for a stalled `settlement_failure` alert**
  — the alert tells a human a draft is stale; finalizing it is still
  always a deliberate `ADMIN_ONLY` action, never automated.
