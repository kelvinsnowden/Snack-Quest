# Vending operations runbook

This document is for a staff member running the fleet day to day, not
a developer reading the codebase — that audience is served by
`docs/VENDING_OS_ARCHITECTURE.md`, `docs/INVENTORY_ARCHITECTURE.md`,
`docs/MACHINE_ASSORTMENT.md`, `docs/MACHINE_COMMERCE.md`, and
`docs/SNACK_INTELLIGENCE.md`, each cited below where the "why" behind
a step lives. Everything here describes a real, shipped page or
route — nothing in this runbook is aspirational, and every gap it
names is also named in one of those architecture docs' own "Still
NEXT/SCALE" sections.

## 1. The daily rhythm: start at the Alert Center

`/admin/vending/alerts` (Alert Center) is the front door. It re-runs a
live sweep on every page load (`alertService.evaluateAndSync`) — the
list is never stale by more than the time since the page was opened.
Ten alert types can appear, each carrying a severity
(`critical`/`warning`/`info`) and, for anything not a fleet-level
condition, the machine and location it's about.

Two different lifecycles exist, and knowing which kind you're looking
at changes what "handling" it means:

- **Condition alerts** — the system is telling you something is
  *currently* true. Fixing the underlying thing (restocking a slot,
  bringing a machine back online, finalizing a stale settlement)
  clears it automatically on the next sweep; you never need to
  manually resolve one of these unless you're deliberately
  acknowledging it as "seen, working on it."
- **Event alerts** (`machine_fault`, `inventory_discrepancy`) — the
  system is telling you something *happened*. There is no "cleared"
  signal for these — restocking the slot or fixing the fault does not
  make the alert disappear on its own. You close these yourself,
  with a resolution note, once you've actually looked into what
  happened.

**Acknowledge** (`POST /api/vending/alerts/{id}/acknowledge`) marks an
alert as being worked on — it stays open, now with your name attached
as `assignee`. **Resolve** (`POST /api/vending/alerts/{id}/resolve`)
requires a non-empty resolution note and closes it; the system refuses
a blank note (`ResolutionRequiredError`) rather than let "resolved" mean
"nobody wrote down why."

## 2. What to actually do for each alert type

| Type | Severity | What it means | What to do |
|---|---|---|---|
| `machine_offline` | critical | No heartbeat past the offline threshold, on a machine marked `active` | Check the machine's own detail page (§3 below) for its last-seen time and recent telemetry; if it's a real outage, this is a site visit, not something fixed from the admin. |
| `heartbeat_missing` | warning | Heartbeat is late but not yet offline | Watch it — if it doesn't clear on its own within a sweep or two, it's about to become `machine_offline`. |
| `stockout` | critical | A slot's `currentQuantity` is `0` | Go to Restock Command Center (§3) or the machine's own Restock tasks card and create/advance a restock task (§4). Clears itself the moment stock is recorded. |
| `stockout_risk` | warning | A slot is at or below the low-stock threshold, not yet empty | Same fix as `stockout`, with more lead time — this is the alert that exists so you never have to find out about a stockout only after it's already happened. |
| `machine_fault` | critical | A real fault telemetry report from the device | Look at the machine's diagnostics panel (fault code, capability status) to decide whether it's a remote fix (a remote command, §3 of `docs/VENDING_OS_ARCHITECTURE.md`) or needs a technician. Resolve with a note once you know what happened — it never clears itself. |
| `payment_reconciliation_issue` | warning | A transaction is stuck in `manual_review`, or a device reported a vend that matched no transaction | Go to the Reconciliation page (§5 below) — this is the same issue, surfaced there with the full detail needed to actually act on it. |
| `subscription_issue` | warning | A machine's subscription is `in_arrears` | Go to that machine's owner in Machine Owners (§7) and follow up — the arrears amount is in the alert's own detail text. |
| `settlement_failure` | critical | A `draft` settlement sat unfinalized for 3+ days past its period end | Go to that machine's settlement history and finalize it (§7) — clears the moment it's finalized, since a finalized settlement stops appearing in the stale-draft read. |
| `inventory_discrepancy` | warning | A staff-recorded physical count didn't match the ledger (§6 below) | Read the detail (which way it was off, and the reason given at count time); resolve once you're satisfied the correction was legitimate — never auto-clears. |
| `expiry_risk` | warning | A slot's most-recently-restocked batch expires within 7 days | Prioritize that slot in the next restock round so old stock sells or gets pulled before it expires. Note: this reads the *most recent* restock's `expiresAt` as an approximation of what's physically in the slot, not a real batch-inventory draw — see `docs/INVENTORY_ARCHITECTURE.md` §5's own note on `batchId`. |

## 3. Operations Command Center — where to see the whole fleet at once

`/admin/vending` is the fleet-wide dashboard, not a per-machine page.
The overview strip's counts (`stockoutRiskCount`, `faultCount`,
`subscriptionIssueCount`, `reconciliationIssueCount`) are the exact
same open alerts the Alert Center shows — clicking through, you're
never looking at a number this page invented independently. Below
the strip, the fleet table supports filtering to exactly the machines
that need attention (offline, faulted, low stock) rather than
scrolling the whole roster every time.

**Restock Command Center** (`/admin/vending/restock`) is the
fleet-wide, sorted-by-urgency list of every slot that needs
restocking soon, wherever it is — the same math a stored `RESTOCK`
recommendation would use (`docs/SNACK_INTELLIGENCE.md` §8,
`docs/INVENTORY_ARCHITECTURE.md` §7), but live and not dependent on
that job having been run recently for a given machine. "Create restock
task" from a row here starts the staged workflow in §4 below.

**Catalog Preview** (a machine's own detail page →
"Preview customer catalog") shows exactly what that machine's real
customer screen would render right now — useful for checking a price
override, a promotion's start date, or why a product isn't showing up,
without needing a physical visit or a test device.

## 4. Restocking — the staged workflow

A restock task moves through eight real stages:
`draft → approved → picking → dispatched → in_transit → received` (or
`partially_received`, or `cancelled` from any of the first four
stages). Each stage is its own explicit action on the task — there is
no "mark complete" button that skips steps. The machine detail page's
"Restock tasks" card shows only the one action a task's current stage
actually offers.

**When you receive a restock**, enter what was *actually* received,
not what was dispatched. If every item matches, the task lands on
`received`; if anything came up short, it lands on
`partially_received` with the shortfall recorded per item
(`discrepancyQuantity`) — this is not a bug to work around, it's the
system correctly recording that something needs following up on. A
real shortfall becomes a new task once you act on it; a
`partially_received` task itself is never reopened.

## 5. Payment/vend reconciliation

`/admin/vending/reconciliation` lists two things, both real and both
worth a different response:

- **Payments needing review** — a transaction stuck in
  `manual_review`: an amount mismatch, a payment that timed out with
  no device report ever arriving, or a device that explicitly
  reported "I don't know what happened." Look at the transaction's
  own detail (machine, amount, failure reason) to decide the outcome
  by hand — this queue exists specifically because these are the
  cases nothing in the system can safely resolve on its own.
- **Unmatched vend reports** — a device reported dispensing something
  that matched no known transaction. Rare, and worth investigating as
  a possible hardware/protocol anomaly rather than a routine item —
  in this architecture a vend is only ever authorized from an
  already-paid transaction, so this shouldn't happen in normal
  operation.

**What this page cannot tell you, honestly:** duplicate payments and
unmatched *payments* (an M-Pesa callback that matched no transaction
at all) aren't detected today — see §10 below. If a customer disputes
being charged twice, that's a manual look at the Daraja transaction
log, not something this page will surface for you yet.

## 6. Stock discrepancies — physical counts

When a physical count doesn't match what the system shows for a slot,
record it as a discrepancy adjustment (from the machine's slot
detail) rather than quietly editing the quantity. Enter the physical
count and a real reason — the system requires a reason and refuses a
blank one. This writes one ledger movement reconciling the two
numbers and raises an `inventory_discrepancy` alert automatically, so
there's always a record of when a count happened and what it found —
including a count that finds no discrepancy at all, which is still
worth recording as "we checked, it was correct."

## 7. Settlements and owner payouts

A machine's settlement moves `draft → finalized`. Creating a draft
computes gross sales, COGS, and the subscription charge for the
period automatically — you're not entering numbers by hand. **Review
before finalizing**: finalizing is the one action that actually
credits the owner's wallet, and it cannot be undone or re-run for the
same period (a second finalize on an already-finalized settlement is
refused, not a double payment). If a settlement's own numbers look
wrong, that's a "don't finalize yet, investigate" situation, not
something to fix by finalizing and adjusting later.

**Machine Owners** (`/admin/vending/partners`) is where you see an
owner's wallet balance, ledger, subscriptions, settlements, and
withdrawal history, and where you'd request a withdrawal on their
behalf if needed. Owners can also do this themselves now — see §8.

## 8. The Owner Portal — what an owner can do without you

Machine owners have their own login (`/partner/login`, separate from
staff and creator sessions) and can see their own wallet balance and
ledger, subscription status, per-machine economics, and settlement
history — and can request their own withdrawal, the same engine
described in §7, scoped so they can only ever draw against their own
balance. They can also record their own location expenses (rent,
placement fee, electricity) for their own bookkeeping — **this never
changes what they're paid**; Snack Quest's settlement math never
reads those numbers. If an owner asks "why did entering my rent not
change my payout," that's expected behavior, not a bug.

## 9. Audit log

`/admin/audit-logs`, filterable by entity type (`alert`, `withdrawal`,
`machineSettlement`, and the rest of the vending domain's mutating
entities). Every financial write described in this runbook — a
subscription payment recorded, a settlement finalized, an alert
acknowledged or resolved, a withdrawal requested — has a real entry
here: who did it, when, and (for most entity types) the before/after
values. This is the first place to look when a number needs
explaining after the fact.

## 10. Known gaps — what this system honestly cannot do yet

Named here so nobody discovers them by surprise mid-incident:

- **Duplicate-payment and unknown-payment detection** (§5) — the
  reconciliation page can't yet tell "this M-Pesa callback never
  matched a vending transaction" apart from the e-commerce store's own
  unmatched-payment bucket. Needs a schema change to the webhook
  ledger; not built.
- **No automatic subscription charging.** A subscription's `paid`/
  `unpaid`/`waived` state is staff-recorded, never auto-charged via a
  scheduled Daraja push — a real payments decision for a future pass.
- **No automatic re-charge or reminder for a `settlement_failure`
  alert beyond the alert itself.** Finalizing stays a deliberate,
  `ADMIN_ONLY` action.
- **`expiry_risk` is an approximation** (§2) — it reads the most
  recent restock's `expiresAt`, not a real batch-level inventory draw.
  Treat it as "probably this batch," not a guarantee.
- **No route-planning across many machines' restock tasks.** The
  Restock Command Center tells you what's urgent fleet-wide; it
  doesn't sequence a technician's actual route.
- **No mutual TLS or a device-credential revocation push.** A
  revoked device credential stops working on its next request, not
  instantly — see `docs/VENDING_OS_ARCHITECTURE.md` §7.

For anything not covered by this runbook, the architecture docs listed
at the top are the next place to look — each one states plainly what
it built and what it deliberately didn't.
