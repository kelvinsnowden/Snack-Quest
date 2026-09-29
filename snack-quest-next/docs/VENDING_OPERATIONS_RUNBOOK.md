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

`/admin/vending/alerts` (Alert Center) is the front door. Alerts are
checked on a schedule (the fast-recovery job, every few minutes when its
external scheduler is set up, and once a day by `reconcile-vending-commands`
as a backstop), not
when the page opens; the header says when they were last checked, and
**Check now** runs the sweep immediately. Each alert has a link to the
screen that fixes it (restock planning, the sale, the manufacturer, …).
Alert types each carry a severity
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
| `machine_offline` | critical | Not heard from past the offline threshold, or the machine reports itself offline, on a machine marked `active`. Planned maintenance doesn't raise it | Check the machine's own detail page (§3 below) for its last-seen time and recent telemetry; if it's a real outage, this is a site visit, not something fixed from the admin. |
| `heartbeat_missing` | warning | Missed its last check-ins but not yet offline. Machines on an integration are expected every 60 seconds by default; machines on direct telemetry every 4 minutes | Watch it — if it doesn't clear on its own within a sweep or two, it's about to become `machine_offline`. |
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
  reported "I don't know what happened." Each row links to the sale's
  own page, where it is resolved — see §5a.
- **Unmatched vend reports** — a device reported dispensing something
  that matched no known transaction. Rare, and worth investigating as
  a possible hardware/protocol anomaly rather than a routine item —
  in this architecture a vend is only ever authorized from an
  already-paid transaction, so this shouldn't happen in normal
  operation.

- **Ledger check** — each night the money, dispense and stock records
  of the last 7 days are checked against each other: a sale that
  completed but never took stock, stock taken twice for one sale, a
  refund owed for over a day, a machine that contradicted a money
  decision. Findings stay listed until someone resolves them; each
  links to its sale. With `ops.jobs.run` you can run the whole nightly
  reconciliation from here — it includes refunds the sweep can prove
  are owed, so it is not a read-only check.

**What this page cannot tell you, honestly:** duplicate payments and
unmatched *payments* (an M-Pesa callback that matched no transaction
at all) aren't detected today — see §10 below. If a customer disputes
being charged twice, that's a manual look at the Daraja transaction
log, not something this page will surface for you yet.

## 5a. Sales to review and refunds

`/admin/vending/sales/review` is the queue of every sale the system
would not decide on its own, oldest first:

- **Needs checking** (`manual_review`) — the machine couldn't say
  whether the product came out. Check the slot count, the camera or
  the customer, then either **Customer got it** (the sale becomes
  delivered revenue and one item leaves the slot) or **Refund**.
- **Refund owed** (`paid_vend_failed`) — the machine reported it did
  not dispense. **Refund**.
- **Refund to send** (`refund_requested`) — the refund is decided;
  send the money:
  - **Reverse M-Pesa payment** asks Safaricom to return the payment.
    Offered only when the sale was the only item on that M-Pesa
    payment. A cart is one payment, and the system does not assume
    Safaricom will reverse part of one. The sale is marked refunded when
    Safaricom's result arrives, usually within minutes.
  - **Record refund sent another way** is for everything else: send the
    money yourself (M-Pesa business app, cash at the site) and enter
    its confirmation code. Snack Quest can't verify that payment, so
    your name goes on the record.

Every decision needs a written reason. It is saved on the sale's
history and in the audit log. Only admins and finance can decide;
everyone else with vending access can read the sale page.

The money goes back at most once. While a reversal is with
Safaricom, nothing else can be sent. A reversal that was started but
never acknowledged (for example, the server stopped mid-send) is never
retried automatically: check the M-Pesa statement, and after 10
minutes you can record what actually happened.

**Not verified yet:** the reversal uses the same Daraja Transaction
Reversal call as box-order refunds. It is covered by automated tests
against a stubbed gateway, not yet against Safaricom's sandbox. The
customer is not sent an SMS for a vending refund, because vending sales
do not store the customer's phone number.

`/admin/vending/sales` lists every sale with filters for state,
machine and dates (Nairobi days), and **Download CSV** exports the
filtered list (up to 5,000 rows; admin and finance only; audited).

Deep reconciliation now also flags a refund decided but not sent for
more than a day (`refund_owed_too_long`).

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

**Count vs ledger.** A different question: does each slot's recorded
count equal the sum of its stock movements? The slots page has **Check
counts against the stock ledger**. They should always agree; if one
doesn't, something changed the count outside the ledger. With
`machine_inventory.adjust` you can set that slot's count to the
ledger's figure, with a reason (audited; no stock movement is written
because no stock moved). If the shelf itself is then off, do a normal
physical count as above. A ledger that adds up below zero is refused —
that needs investigating, not copying.

The slots page can also download the machine's stock movements as CSV
(`machine_inventory.export`, last 30 days by default).

## 7. Settlements and owner payouts

**Preparing** (`owner_finance.settlements.manage`): open the owner, then
**Settlements** (`/admin/vending/partners/{id}/settlements`). Pick a
machine and whole Nairobi days, preview, and save a draft. The draft
computes gross sales, refunds, cost of goods and the subscription
charge from the records — you don't type numbers. A period can't end in
the future or include days the machine belonged to someone else. Add an
adjustment only with a reason (both are shown on the CSV). Discard a
draft that's wrong and prepare it again.

**Finalizing** (`owner_finance.settlements.finalize`): drafts waiting
are at `/admin/vending/settlements`. You type the amount being credited
to finalize; it is refused if the draft still has sales under review or
the amount no longer matches what the draft would credit (someone
changed it since you looked). Finalizing credits the owner's wallet
once; it can't be undone or run twice for the same period. The owner's
revenue share on an agreement is shown for reference only — what is
credited is sales minus refunds, cost of goods and subscription, plus
any adjustment.

**Subscriptions**: the machine's setup page has a subscription card
(`owner_finance.subscriptions.manage` to change it). A subscription can
only be for the machine's current owner, in whole shillings. Recording
a payment or waiving a charge clears arrears. A machine's owner can't be
changed while a subscription is open: end it first.

**Machine Owners** (`/admin/vending/partners`) is where you see an
owner's wallet balance, ledger, subscriptions, settlements, and
withdrawal history, and where you'd request a withdrawal on their
behalf if needed. `owners.export` downloads the owner list with contact
details (audited, as it is personal data). An owner's page also shows,
per machine, the 30-day summary their portal is built from.

## 8. The Owner Portal — what an owner can do without you

Machine owners have their own login (`/partner/login`, separate from
staff and creator sessions) and can see their own wallet balance and
ledger, subscription status, per-machine economics, and settlement
history. Each sale shows where it stands: sold, under review, refund
due, refunded or in progress. They can request their own withdrawal, the same engine
described in §7, scoped so they can only ever draw against their own
balance. They can also record their own location expenses (rent,
placement fee, electricity) for their own bookkeeping — **this never
changes what they're paid**; Snack Quest's settlement math never
reads those numbers. If an owner asks "why did entering my rent not
change my payout," that's expected behavior, not a bug.

## 8a. Setting up a new machine

Each step needs its own permission; a step you can't do is shown read-only or not at all.

1. **Register it:** `/admin/vending` → **Register a machine**.
   - Enter the make, model and serial number. The machine code is optional; leave it blank to get the next `SQ-MCH` number.
   - Optionally choose an owner and a location.
   - The machine starts as **Registered** and can't take payments.
   - The last step shows its first **screen key once**, with a QR code.
2. **Pair the screen:** on the machine's tablet, open the camera, point it at the QR code and open the link. The screen saves the key and starts up.
   - The key is never shown again. If it's lost, issue a new one (step 7).
3. **Load its layout:** machine page → **Slots**.
   - Add each slot (code, product, capacity, price), or **copy the layout** of a machine of the same model.
   - Stock is never copied. Stock only arrives through a restock (§4).
4. **Choose what it sells:** machine page → **What it sells**.
   - Add products, or **copy the range** of a similar machine.
   - Link each product to its slot. A product sells only when it is on this list, visible, linked to a slot that is on, and in stock.
5. **Owner and agreement**, if someone else owns the machine:
   - Its setup page → **Owner**.
   - Then the owner's page → **Agreements**. Leave the owner's share blank until it is actually agreed; a blank share means settlements show no split.
6. **Switch it on:** setup page → **Status** → Testing → Selling.
7. **If a screen key leaks, or a tablet is replaced:** setup page → **Screen keys**.
   - Leak: **New key…** with "Revoke every other key now". The screen stops until it is paired with the new key.
   - Replaced tablet: issue a new key, pair the new tablet, then revoke the old key.

### Paused slots

After a **jam**, a vend with an **unknown result** or a **drop-sensor failure**, the slot pauses itself.

**Why:** nobody knows whether the product is stuck or fell late, so it stops being offered and charged for.

**How to deal with it:**
1. The slot page shows paused slots with a pause icon, and the machine page shows "Paused — check it".
2. Open the slot and follow **See the sale**. That customer may need a refund (§5a).
3. Check the machine and fix what you find.
4. Choose **Return to sale** and write down what you found.

The slot can't be switched back on any other way. A slot whose recent vends keep failing is worth checking before it pauses: the slot page shows the last results for each slot.

### Changing a machine's owner

1. End the current agreement first. The change is refused while one is active.
2. On the setup page, choose the new owner (or Snack Quest).

After the change:
- The new owner's portal shows nothing from before the change. The day of the change isn't shown in their daily figures.
- A settlement can't span the change. Settle the old owner up to the change and the new owner from it.

### Owners and the portal

When you add an owner with an email, their page shows a message to send them: they sign up at `/partner/login` with that email.

- Nothing is emailed automatically.
- Each email can belong to only one owner.
- **Suspend** signs them out and blocks sign-in. Their machines keep selling and their balance is untouched.

## 9. Audit log

`/admin/audit-logs` filters by area (machines, settlements, alerts, …),
person, machine code and a range of Nairobi days. Every financial write
in this runbook has an entry: who, when, and (for most) the before and
after values. `audit.export` downloads what you've filtered as CSV (up
to 5,000 rows; the download itself is logged). Machine setup, owner and
manufacturer pages each have a **History** card with their latest
entries. This is the first place to look when a number needs explaining
after the fact.

## 9a. Scheduled jobs, rebuilding analytics, search

**Operations** (`/admin/operations`) shows every scheduled job's health
and recent runs. With `ops.jobs.run`, **Run now** runs a job the same
way its schedule does; if it's already running, the second run is
refused rather than run twice. **Rebuild machine analytics** rebuilds
machine, owner and network daily figures for up to 92 finished days —
use it after correcting a sale, price or owner change older than three
days (the nightly job only covers the last three). Days are analytics
days (UTC); today can't be rebuilt until it's over.

**Online / offline** means the same thing on every page and alert: a
machine connected through a manufacturer integration uses that
integration's check-in interval, its own "I'm offline" report and staff
maintenance; one on direct telemetry is expected every 4 minutes. The
reason ("Says it is offline", "In maintenance") shows next to the
badge.

**Search** (the admin search box) finds machines by code, serial or
venue, a machine sale by its reference or M-Pesa receipt, owners,
locations and manufacturers. You only see results for pages you can
open.

**Sales intelligence** has tabs for location types, comparing
locations, a product by type of place, and **Plan a new machine**,
which ranks the products that sold best at places of the same kind in
the last 30 days. It is a ranking of past sales, not a forecast.

**Manufacturers**: a manufacturer's page can edit its details and each
model. Changing a certified model's capabilities or adapter revokes its
certification (the form warns first). **Integration keys**
(`/admin/vending/integrations/credentials`, super admin by default)
lists every manufacturer key with who issued it, when it expires and
when it was last used.

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
  alert beyond the alert itself.** Finalizing stays a deliberate
  action (`owner_finance.settlements.finalize`).
- **`expiry_risk` is an approximation** (§2) — it reads the most
  recent restock's `expiresAt`, not a real batch-level inventory draw.
  Treat it as "probably this batch," not a guarantee.
- **No route-planning across many machines' restock tasks.** The
  Restock Command Center tells you what's urgent fleet-wide; it
  doesn't sequence a technician's actual route.
- **A paused slot doesn't raise an alert yet** (§8a). It shows on the
  slot, machine and fleet pages, not in the Alert Center.
- **The new-machine planner and location comparisons rank past sales.**
  With few locations of a kind, one site's result is all there is.
- **The vending M-Pesa reversal has only been tested against a stubbed
  gateway**, not Safaricom's sandbox.
- **Bulk slot and product changes run one at a time** from your
  browser. If one fails part-way, the message says which ones were
  already done.
- **Ownership history starts at a machine's first change of owner.**
  Before that, the owner at registration is taken as the owner
  throughout.
- **No mutual TLS or a device-credential revocation push.** A
  revoked device credential stops working on its next request, not
  instantly — see `docs/VENDING_OS_ARCHITECTURE.md` §7.

For anything not covered by this runbook, the architecture docs listed
at the top are the next place to look — each one states plainly what
it built and what it deliberately didn't.
