# Final OS functionality, admin control, RBAC and operations audit

**Question:** can a trained Snack Quest team run the vending business from the product, without a developer, safely, auditably, and at fleet scale?

**Method.** The code was the source of truth, not earlier documents.
- Every one of the 289 `app/api/**/route.ts` files was parsed, and each HTTP method's guard was extracted *per method*. A file-level read gave false alarms: for example, `POST /api/vending/transactions` is device-authenticated, and only its `GET` uses `sales.view`.
- Every `fetch('/api/…')` in `app/`, `components/` and `lib/` was matched to a route. Matching handled template literals, including suffix variables such as `` `/api/vending/restock/${id}${path}` ``.
- Every page, and the layout above it, was read for its gate.
- Every public service method was checked for a caller outside its own file.
- Field-level editability, scheduled jobs, audit-log calls and whole-collection reads were checked.
- The generated tables are in `docs/ADMIN_CAPABILITY_MATRIX.md` and `docs/RBAC_PERMISSION_CATALOG.md`.
- Earlier audits (`docs/ADMIN_AND_HARDWARE_CONTROL_AUDIT.md` and others) were treated as claims and re-checked. **One of their numbers was wrong:** the permission catalogue has **93** permissions, not 98. The file has 98 `key:` entries, and five of them are role templates.

**Nothing in the product was changed to produce sections 1–20.** §21 records what was then built, and §19 is the plan it followed.

---

## 1. Executive findings

**The good news is real.**
- Every staff API route has a UI caller. The route→UI blind spots the earlier audit found are closed.
- Every staff route checks a permission, and the checks match the page gates in `/admin`.
- The money paths are well defended:
  - one paid order leads to at most one dispense command;
  - a vending refund ledger allows money back at most once;
  - "unknown" outcomes go to human review, with review and refund screens;
  - settlements are idempotent and re-checked.
- Owners, locations, slots, catalogues, prices, restocks, alerts, jobs, audit history and exports all have screens.

**It is still not a system a team can run without a developer.** The gaps are no longer "missing API screens". They are rules the product doesn't enforce, work nobody schedules, and data nobody can edit:

1. **P0: a machine marked "maintenance" or "decommissioned" keeps taking money.** The pre-payment gate checks the machine's *integration* state, never the machine's own status (`machineTransactionService.startCartPayment` → `machineIntegrationService.dispenseGate`). An operator who pauses a machine on its setup page believes it has stopped selling; it hasn't.
2. **P0: "nobody hands out more than they have" has holes.** The Users page enforces it for templates and individual grants (`staffManagementService.setAccess`). It does **not** enforce it when:
   - inviting;
   - changing a role (promoting to `admin`, or even to `super_admin`);
   - clearing a legacy section limit;
   - generating a password-reset link for a more powerful account, including a super admin.

   `users.manage` is super-admin-only by default, but it is designed to be grantable. The first person it is granted to can make themselves, or anyone, a super admin.
3. **P1: money is visible to people without money permissions.**
   - The admin dashboard shows 30-day revenue and the full staff list to anyone who reaches `/admin`.
   - `/admin/analytics` (revenue, CAC, creator ROI) has no permission gate.
   - The `/finance` pages (revenue, refunds, commissions, reconciliation, fulfilment costs) and `/warehouse` pages are gated by *role* only. Every admin-role account passes, including a "Product manager" or "Marketing" template.
4. **P1: new staff start with full role access.** An invite can't choose a template. A new product manager is a full admin until someone narrows them afterwards.
5. **P1: decommissioning is irreversible, and the Warehouse template can do it.** It sits under `machines.status.manage`.
6. **P1: owner subscription arrears are never detected.** `machineSubscriptionService.reconcileArrears` is written and tested, but no job or screen calls it. No subscription ever enters grace or `in_arrears`.
7. ~~**P1: unverified M-Pesa callbacks are accepted silently.**~~ **Corrected during implementation: not a gap.** The route does accept a callback unverified when no Daraja webhook secret is stored. But `lib/integrations/daraja/config.ts` generates and stores the secret (`ensureWebhookSecret`) before the first STK push, so every push carries it, and no pending sale exists that an unverified callback could credit.
8. **P1: stock pulled out of a machine can't be recorded as what it is.** Expired, damaged or returned-to-warehouse items can only be removed as an anonymous count correction. Machine waste is only ever written for test vends, so waste can't be reported.
9. **P1 (decision): machine restocks never draw down warehouse stock.** This is documented as deferred (`INVENTORY_ARCHITECTURE.md` §5), but the effect is that warehouse snack counts overstate after every restock.
10. **P1 (money audit):** discount codes can be created and edited with no audit entry. Role changes are audited without the previous role.

Two more facts shape the developer-dependency answer (§20):
- **Hardware:** no manufacturer integration has been tested against real hardware. The M109E agent runs only against a fake board.
- **Product master data is thin:** no brand, SKU, barcode, category, allergens, ingredients, nutrition or package size.

---

## 2. Capability inventory

**Code surface:**
- 289 route files, 339 route methods.
- 167 pages, 94 service modules, 87 repositories.
- 10 scheduled jobs (8 Vercel crons, 1 GitHub Actions job every 5 minutes, and the health watchdog).
- 93 permissions and 8 role templates.

**Route methods by status**, from the generated matrix:

| Status | Count | Meaning |
|---|---:|---|
| Complete | 195 | Staff route with a permission check, a UI caller and, for writes, an audit entry |
| System interface | 80 | Cron, device, machine API (HMAC), owner portal, webhooks, public |
| Works, unaudited | 43 | A write with no central audit entry. Most are public or telemetry, where that is right. **The staff ones are listed in §12** |
| Read API | 21 | A read route whose page reads the same service directly (server components). Not a blind spot |
| API only, no UI | 0 | Every one found by the first pass was a template-literal call |

**Capabilities by domain** (details in the matrix):

| Domain | What exists (UI + API + permission) | What is missing |
|---|---|---|
| Machines | Register (wizard), status, relocate, owner change, device keys (issue, rotate, replace, revoke), integration (configure, test, activate, suspend, maintenance), commands (restart, sync), test vend, cameras, catalogue preview | Edit serial, model, firmware, hardware version; confirmation strategy; reserve target; replace machine/controller/host; decommission checklist; bulk or CSV setup |
| Slots & catalogue | Slot editor, slot mapping, copy slots and catalogue from another machine, per-machine assortment, price overrides with history, slot quarantine, stock check against the ledger | Per-slot par or minimum level; seasonal availability; kiosk promo badge |
| Products | Boxes and snacks (create, edit, image, description, recipes), kiosk artwork and product text | Brand, SKU, barcode, category, allergens, ingredients, nutrition, size, supplier link; bulk edit or import |
| Warehouse | Purchase orders (create, order, receive, cancel), batches with expiry, write-off, stock adjustment, shopping runs, packing | Draw-down on machine restock; transfers; cycle-count workflow |
| Machine stock | Restock tasks (draft → approve → pick → dispatch → in transit → receive, with discrepancies), stock adjustment to a count, ledger reconcile, movements CSV | Typed removal (expired, damaged, returned) |
| Sales & money | Sales list with filters and CSV, review queue (confirm delivered, refund, reverse, record refund), refund ledger, reconciliation, trace, deep ledger findings | Dispute or goodwill refund on a *dispensed* sale (the business rule isn't decided) |
| Owners | Create, edit, suspend; agreements; machine reassignment; wallet; settlements (preview, draft, adjust, discard, finalize, CSV); subscriptions (create, pay, waive, pause, resume, cancel); payouts; owner portal | Arrears sweep never runs; payout audit is on the record only |
| Staff & access | Invite, role, templates, grants and removals with a before/after summary, disable, remove, reset link, view-as (by role) | Template at invite; escalation checks on invite, role and reset; view-as by template or person |
| Operations | Job status, Run now, rollup rebuild, alert centre, audit log with filters, CSV and history tabs, search, storage | Job enable/disable; a watchdog that knows a job has *never* run |
| Integrations | Manufacturers, models, certification harness, API probe, inbound and outbound keys, credentials page | Real-hardware certification (by design, needs hardware) |

**Service methods with no caller anywhere in the product** (not in a route, page, job or other service):

| Method | Effect of it being uncalled |
|---|---|
| `machineSubscriptionService.reconcileArrears` | **Arrears never computed** (finding 6) |
| `machineInventoryMovementService.reconcile` | Superseded by `reconcileMachine`, which is wired |
| `productService.deactivateProduct` | Deactivation happens through `updateProduct(isActive)` |
| `storageService.replaceFile`, `storageService.generatePublicUrl` | Uploads use other paths |
| `supplierService.listSuppliers`, `walletService.listWallets` | Pages read repositories directly |
| `shoppingRunService.updateNotes` | Notes on a shopping run can't be edited (minor) |
| `businessAnalyticsService.getTopCreators`, `locationIntelligenceService.getPriceBehavior` | Analytics built and never shown (minor) |
| `machineService.fleetStatusSummary` | Superseded by fleet summaries |

**Fields the code can write but nobody can edit from the product:**
- `Machine.dispenseConfirmationStrategy` (documented as "set by staff"; there is no route);
- `Machine.inventoryReserveTargetKes`;
- `Machine.serialNumber`, `hardwareVersion` and `firmwareVersion` after registration.

---

## 3. Admin blind spots (backend can, product can't)

Each gap has a class: A critical-ops · B security · C financial · D fleet · E UX · F reporting · G admin · H nice-to-have.

| # | Gap | Class | What an employee is forced to do instead |
|---|---|---|---|
| B-1 | Machine status doesn't stop sales | A, C | Ops puts a broken machine into "maintenance" and customers keep paying. They must *also* know to put the **integration** into maintenance, on a different card, with a different permission. Otherwise they field refund requests for a machine they thought was off |
| B-2 | Escalation through invite, role change and reset link | B | Nothing stops it. The only defence is that nobody has been given `users.manage` yet |
| B-3 | Revenue on role-gated pages | B | A product manager or marketer sees company revenue, refunds and commissions by opening `/finance` or the dashboard. The only way to prevent it today is to not give them an admin-role account, which leaves them no workspace at all |
| B-4 | No template at invite | B, E | An admin invites a product manager, then must remember to open their access and narrow it. Until they do, that person is a full admin |
| B-5 | Arrears never computed | C | Finance must work out by hand, from the subscription card, which owners haven't paid. `in_arrears` never appears anywhere |
| B-6 | ~~Webhook secret missing is invisible~~ | — | **Corrected: not a gap.** The secret is generated before the first STK push (see finding 7) |
| B-7 | Typed stock removal | A, F | A restocker who pulls 6 expired sodas records "count is now 2 — expired". Waste reports, write-off costing and owner disputes can't tell expired from miscounted |
| B-8 | Warehouse not drawn down by restocks | A, F | Warehouse must re-count and correct stock after every restock day, or live with overstated counts |
| B-9 | Confirmation strategy, reserve target, serial, firmware | G, D | A developer edits Firestore. The documented "staff record what the physical machine uses" has no screen |
| B-10 | Replace a machine, controller or host | D | No workflow. Staff improvise: re-point the integration's manufacturer machine id (allowed only with no dispense in flight), issue a new screen key, and leave the serial number wrong |
| B-11 | Decommission checklist | D, A | Decommissioning writes only the status. Screen keys stay valid, the integration stays active, the subscription keeps billing, and open restock tasks stay open. (B-1's fix stops the sales; the rest still has to be done by hand) |
| B-12 | ~~Watchdog ignores never-run jobs~~ | — | **Corrected: mostly covered.** `scheduledJobService.health` reports a never-run job as **overdue** once other scheduled jobs have been running, naming its trigger (for example the GitHub Actions workflow). The only blind case is a brand-new deployment where nothing has run yet |
| B-13 | Dispensed-sale dispute | C | A customer who got a stale product has no refund path. Finance refunds outside the system, and settlements never see it (`revenueReversalsForPeriod` returns 0 by design until the owner-loss rule is decided) |
| B-14 | Product master data | E, F | Allergens, nutrition and barcode live in spreadsheets. The kiosk can't show them, and restock picking can't scan |
| B-15 | View-as only by role | E | An admin can't check what "Product manager" or a specific person sees before handing access out |
| B-16 | Job enable/disable | H | Pausing a misbehaving job needs a deploy |
| B-17 | Bulk and CSV setup | H | 100 machines means 100 wizard runs. Copy slots and copy catalogue help |

---

## 4. Machine lifecycle audit

Each step: **Y** = self-service, **P** = partly, **N** = developer or manual.

| # | Step | Status | Where / what's missing |
|---:|---|---|---|
| 1 | Create/register machine | Y | `/admin/vending/new` wizard (`machines.create`) |
| 2 | Create/select location | Y | Wizard, `/admin/vending/locations` |
| 3 | Assign to location | Y | Wizard; relocate on setup (`machines.relocate`) with history |
| 4 | Assign owner | Y | Wizard; reassign on setup (`owners.manage`) with ownership history |
| 5 | Configure model | Y | Integration card: manufacturer + model |
| 6 | Configure capabilities | P | Model-level only, and certification-gated. There is no per-machine override, which is correct |
| 7 | Configure slots | Y | Slot editor (`machines.slots.configure`); copy from another machine |
| 8 | Assign products | Y | Slot editor, catalogue editor |
| 9 | Set prices | Y | `pricing.manage`, with price history |
| 10 | Set capacity | Y | Slot editor |
| 11 | Set initial stock | P | Through a restock task (create → approve → pick → dispatch → receive). Correct for the ledger, but heavy for a first load |
| 12 | Payment settings | P | Business-level Daraja only; no per-machine till. Fine for one till |
| 13 | Hardware integration | Y | Integration card (`integrations.machines.configure`) |
| 14 | Credentials | Y | Device keys on setup; manufacturer keys on the credentials page |
| 15 | Test connectivity | Y | Integration test, API probe |
| 16 | Run certification | Y | Certification tools panel (`integrations.certify`); sandbox only |
| 17 | Activate | Y | Integration activate (production needs a certified model) plus machine status → active |
| 18 | Pause | **N (B-1)** | Machine status "maintenance" doesn't stop sales; integration maintenance does |
| 19 | Disable | **N (B-1)** | As 18 |
| 20 | Move | Y | Relocate, with history |
| 21 | Change owner | Y | Reassign, with history; settlement ownership re-checked |
| 22 | Replace machine | **N (B-10)** | — |
| 23 | Replace controller | P | Re-point the manufacturer machine id when no dispense is in flight; no serial or controller record |
| 24 | Replace host computer | P | Issue a new screen key, revoke the old one. Nothing records the host |
| 25 | Rotate credentials | Y | Screen keys and manufacturer keys, with grace |
| 26 | Health | Y | Single liveness truth; machine and fleet pages |
| 27 | Events | Y | Integration events, telemetry on the machine page |
| 28 | Command history | Y | Machine page |
| 29 | Sales | Y | Machine page, sales list |
| 30 | Inventory | Y | Slots page, ledger check, movements CSV |
| 31 | Restock | Y | Restock tasks, warehouse machines page |
| 32 | Reconcile | Y | Stock check against the ledger; reconciliation page |
| 33 | Resolve faults | P | Alerts with deep links, quarantine release. Hardware faults need a technician (right) |
| 34 | Resolve failed sales | Y | Review queue and refunds |
| 35 | Retire | **P (B-11)** | Status only; keys, integration, subscription and tasks untouched |
| 36 | Keep history | Y | Nothing is deleted; histories stay |

**Setup at scale:** individually, yes. From another machine, partly (copy slots, copy catalogue). There are no templates and no bulk or CSV import.

---

## 5. Product and catalogue audit

| Field or capability | Boxes (`packages`) | Snacks (`snackItems`) | Per machine |
|---|---|---|---|
| Create / edit / image / replace image | Y | Y | — |
| Description | Y | Y | Kiosk text override (`machine_screen.manage`) |
| Brand, SKU, barcode, category, allergens, ingredients, nutrition, size, dimensions | **N** | **N** (only `origin`, `sourcingNote`, `unitLabel`) | `category` exists only on the machine assortment |
| Cost | — | `expectedUnitCostKes` | COGS from ledger lots |
| Supplier | — | Only via purchase orders | — |
| Active/inactive | Y | Y | Assorted / visible / quarantine |
| Machine price | — | — | Y, with history |
| Machine assortment | — | — | Y (`machine_catalog.manage`) |
| Seasonal availability, promo badge | Box `highlightLabel` (web only) | — | **N** |
| Minimum stock / reorder | Box `lowStockThreshold` | **N** | Restock fills to capacity; no par |
| Bulk operations | **N** | **N** | Copy catalogue from another machine |

**Can a product manager do the whole job without being an admin?**
- For boxes and snacks: yes, with the "Product manager" template.
- They **cannot** choose what machines sell or at what price. That is `machine_catalog.manage` and `pricing.manage`, deliberately outside that template.
- Before this pass, a product manager on an admin-role account could also *see* revenue (B-3).

---

## 6. Inventory and restocking audit

| Area | Status |
|---|---|
| Warehouse counts, adjust, write-off, damaged, expired | Y (`warehouse_inventory.adjust`; typed movements; batches with expiry) |
| Receiving (purchase orders) | Y |
| Shopping runs | Y |
| Machine restock, end to end | Y: draft → approve → pick → dispatch → in transit → receive with discrepancies, by role (`restock.plan` / `restock.execute`) |
| Physical confirmation | P: receive records the counted quantity per slot, with discrepancies. There is no photo or second person |
| Machine stock correction | Y: to a count, with a reason, audited; alignment to the ledger |
| Machine waste, expired, damaged, return | **N (B-7)** |
| Transfers (warehouse ↔ machine return, machine ↔ machine) | **N** |
| Warehouse draw-down on restock | **N (B-8, decision)** |
| Cycle counts | P: the stock check compares count to ledger per machine; no scheduled cycle-count workflow |
| Low stock, out of stock | Y: auto-drafted restock tasks, alerts |
| Velocity, sell-through, days of stock, stockout duration | Y in intelligence (rollups); stockout duration from `stockChangedAt` |
| Restock history | Y |

**Can warehouse staff run the network?** Mostly: restock end to end, yes. They can't record what they remove from machines (B-7), and warehouse counts drift (B-8). **Do they see only what they need?** Before this pass, no: warehouse workspace pages were gated by role only (B-3). They also held the permanent decommission action (finding 5).

---

## 7. Vending sales and money audit

| State | Who sees | Who acts | Actions | Stuck? |
|---|---|---|---|---|
| `pending` | `sales.view` | System | STK callback, or the stuck-payment sweep → `payment_failed` or `paid` | No: daily and 5-minute sweeps |
| `payment_failed` | `sales.view` | — | Terminal, no money | No |
| `paid` / `vend_authorized` | `sales.view` | System | Dispense → `dispensed` / `paid_vend_failed`; sweep → `manual_review` | No |
| `dispensed` | `sales.view` | — | Terminal. **No dispute path (B-13)** | By design |
| `paid_vend_failed` | Review queue | `sales.review.resolve` / `sales.refund` | Refund (reversal) or record refund | No |
| `manual_review` | Review queue | `sales.review.resolve` | Confirm delivered, refund, reverse, record refund | No |
| `refund_requested` | Review queue | `sales.refund` | Reversal result webhook (success/failure), or record refund sent another way | No: a failed reversal returns it to the queue |
| `refunded` | `sales.view` | — | Terminal | No |

**Paying twice.** The `vendingRefunds` ledger (one per sale, created in a transaction) plus compare-and-set status moves prevent a double refund. The same button clicked twice gets a conflict.

**M-Pesa callback twice.** `webhookEventRepository.recordIfNew` plus the "any still pending" check return `duplicate`.

**Owner revenue:** settlements (gross, refunds of failed vends, COGS, subscription netting, adjustments) are finalized once and credited to the wallet by ledger.

**Commissions and platform revenue:** the settlement split follows the agreement. Commissions are the web-shop creators' and aren't touched by vending.

**Disputes and manual corrections:** settlement adjustments with a reason (audited). Sale-level disputes, B-13.

---

## 8. Owner audit

Create, edit, suspend (the portal login is refused for a suspended owner); assign and remove machines with ownership history; fleet, sales, revenue and refunds per owner (admin owner page, owner portal); settlements (preview, draft, adjust, discard, finalize, CSV); subscriptions (create, pay, waive, pause, resume, cancel; status and history); payouts (request, approve, pay through the withdrawals flow).

**Ownership transfer is careful:**
- History entries are written.
- `ownerSince` hides the previous owner's sales from the new owner.
- A settlement is refused if ownership changed within its period (`assertOwnedThroughout`).

**Gaps:**
- Arrears are never computed (B-5).
- Payout decisions are recorded on the withdrawal record's own trail, not in the searchable audit log (P3).

---

## 9. RBAC audit

**Model:** resource.action permissions (93), 8 templates, and individual grants and removals.
- **Precedence:** template ∪ grants − removals, so **a removal beats a grant**.
- A super admin always holds everything and can't be narrowed.
- Legacy admin section limits are still honoured for accounts not moved to a template.

**Enforcement:**
- **API:** every staff route method checks exactly one permission (`hasPermission` / `forbiddenForPermission`). Verified mechanically, per method.
- **Pages:** `/admin` pages are gated by `requireAdminPage(section, permission)` in their layouts, or in-page. **Exceptions before this pass:** the dashboard's revenue and staff cards, `/admin/analytics`, and every `/finance`, `/warehouse` and `/agent` page except the machine-sales ones, which were role-gated only (B-3).
- **UI:** navigation items and buttons follow permissions (`adminNav`, per-component checks).

**Checks:**

| Check | Result |
|---|---|
| Grant / remove / override | Y (Users page, before/after summary) |
| Removal beats grant | Y |
| Self-change blocked | Y (access, role, disable, remove) |
| Escalation: templates and grants | Y (`PermissionEscalationError`) |
| Escalation: invite, role change, legacy sections, reset links | **N (B-2)** |
| Super admin protection | Only "not the last super admin". A delegated user manager could demote, disable or remove any other super admin, and reset their password (B-2) |
| View-as | By role only (admin, agent, warehouse, finance). It narrows for real (routes too). Not by template or person (B-15) |
| API = UI = server | Y for routes. Pages: see B-3 |
| Audit of permission changes | Y for access (with before/after). Role changes lacked "before" |

**Granularity problems:**
- `machines.status.manage` covers both "pause" and the permanent "decommission" (finding 5).
- `products.manage` covers every box field, so there is no separate image-only or text-only permission (P3).
- There is no permission for business-wide analytics. Revenue pages used `finance.view` or nothing.

---

## 10. User-management audit

| Can an admin… | Status |
|---|---|
| Create / invite | Y; **no template at invite (B-4)** |
| Deactivate, reactivate, remove | Y (not self; not the last super admin) |
| Reset access | Y (a reset link). **Allowed against more powerful accounts (B-2)** |
| Assign a template, add or remove permissions | Y |
| See effective permissions, and why | Y: the editor shows template, additions and removals, and the resulting set, with labels, not ids |
| Revoke access | Y (remove, or disable) |
| View audit history | Y (audit log filtered by person; staff entries) |
| Prevent escalation | **Partly (B-2)** |

---

## 11. Background-job audit

| Job | Schedule | Trigger | Run now | Last run / health | Alerts | Enable/disable |
|---|---|---|---|---|---|---|
| retry-notifications | 01:00 daily | Vercel | Y | Y | Failure alert | N |
| reconcile-stk-payments | 02:00 | Vercel | Y | Y | Y | N |
| reconcile-stuck-withdrawals | 03:00 | Vercel | Y | Y | Y | N |
| rebuild-analytics-rollups | 04:00 | Vercel | Y | Y | Y | N |
| rebuild-vending-rollups | 05:00 | Vercel | Y (plus a rebuild form) | Y | Y | N |
| reconcile-vending-transactions | 06:00 | Vercel | Y | Y | Y | N |
| reconcile-vending-commands (+ alert backstop) | 07:00 | Vercel | Y | Y | Y | N |
| generate-recommendations | 08:00 | Vercel, "Generate now" | Y | Y | Y | N |
| vending-fast-recovery (+ alerts) | every 5 min | **GitHub Actions** | Y | Y; **"never run" isn't unhealthy (B-12)** | Y | N |
| *(none)* subscription arrears | — | — | — | — | — | **Missing (B-5)** |

Every job runs under a lease (no overlap), records a run (duration, counts, errors) and shows on Operations. `/api/cron/health` gives an external monitor a 503 on failing, overdue or abandoned jobs.

---

## 12. Auditability audit

Consequential staff writes and their central audit entry (who, what, when, before, after, why):

| Area | Audited |
|---|---|
| Permissions and access | Y (before/after) |
| Staff role change | Y, **without "before"** |
| Machine config, status, relocation, owner, keys, integration, slots, prices, catalogue | Y |
| Refunds, reversals, sale decisions | Y (plus the refund ledger) |
| Settlements (draft, adjust, discard, finalize) | Y. Preview is a read |
| Machine stock adjustments | Y |
| Warehouse stock adjustments | Record trail (`InventoryMovement` with actor), not the central log |
| Owner payouts, withdrawals | Record trail (`auditTrail` on the withdrawal) |
| **Discount codes (create, edit)** | **None** |
| Orders (status, collect payment, bulk costs) | Order record history; not the central log |
| Conversations (assign, reply, return to bot) | None (P3) |
| Recommendations (approve, dismiss, outcome) | The recommendation record's state; not the central log (P3) |
| Jobs (run now), rebuilds | Y |

---

## 13. Scale audit

| Where | What it reads | 10 | 100 | 1,000 | 10,000 machines |
|---|---|---|---|---|---|
| `admin/vending/products/[catalogue]/[id]` | **every slot in the fleet** (`machineSlotRepository.listByBusiness`) plus every machine | ok | ok | 60k slot docs per view: slow and costly | unusable |
| `alertService` evaluation (line ~372) | every slot, per run | ok | ok | 60k reads every 5 minutes (fast recovery): **~17M reads/day** | untenable |
| Single-machine slots and catalogue pages | every machine (for the copy-from list) | ok | ok | 1k docs per view | 10k docs per view |
| Alerts, locations, kiosk screen, settlements, reconciliation, owners pages | every machine | ok | ok | heavy | too heavy |
| `globalSearchService` | every machine, owner and location per query | ok | ok | slow | unusable |
| Fleet page | `machineFleetSummary`, 50 per page | ok | ok | ok | ok |
| Sales list, review queue | paged queries | ok | ok | ok | ok |
| Rollup rebuild | per machine, per day | ok | ok | minutes | needs sharding |
| Owners CSV export | all owners and machines in memory | ok | ok | ok | heavy |
| Heartbeats and polling | per machine per 2–10 s; rate-limited | ok | ok | Firestore writes per heartbeat need batching at 10k | needs aggregation |
| Audit log | append-only, indexed filters, paged | ok | ok | ok | ok (archival needed eventually) |

---

## 14. Failure and recovery audit

| Scenario | What happens |
|---|---|
| Browser closed mid-workflow | Every write is one request and one transaction. Restock and settlement are staged, so half-done work stays in its stage |
| API timeout | Idempotent keys on payments; compare-and-set on status moves; a retry is safe |
| Firestore failure | A transaction aborts as a whole |
| M-Pesa responds twice | Deduplicated (§7) |
| Machine loses power | The ledger holds the command; the result comes late or the sweep sends it to `manual_review`. The M109E agent journal never re-runs a motor (Phase 6) |
| Machine reports unknown | `manual_review` with slot quarantine; the review queue |
| Button clicked twice | Conflict or no-op (status compare-and-set) |
| Two employees at once | Transactions and compare-and-set; the second gets a conflict |
| Permission lost mid-workflow | The next request is refused (checked every request) |
| Job dies | Its lease expires; the run is recorded as abandoned; the health endpoint returns 503; the next run picks up. **A job that never started is invisible (B-12)** |
| Machine paused but still selling | **Before this pass: yes (B-1)** |

**Permanent stuck states found:**
- None in sales.
- Subscriptions can never reach `in_arrears` (B-5).
- A decommissioned machine's integration and subscription stay live (B-11).

---

## 15. End-to-end journeys

| Journey | Where a developer (or unsafe workaround) is needed |
|---|---|
| **1. New machine → selling** | Without real hardware: none; the whole path is in the product. **With hardware:** the M109E agent isn't deployable (no serial transport; the host question is open), and production activation needs a model certified against the real machine. Confirmation strategy and serial corrections need Firestore (B-9) |
| **2. New snack → published** | Create → image → description → machine price → assortment → visible on the kiosk: self-service. Allergens, barcode and category can't be recorded (B-14) |
| **3. Restock** | Alert → task → pick → dispatch → receive → audit: self-service. Removing expired stock is an untyped correction (B-7). Warehouse counts drift (B-8) |
| **4. Paid but failed** | Find (sales list, review queue) → investigate (trace, dispense history) → resolve or refund (reversal) → reconcile: self-service. The reversal is tested only against a stub, not Safaricom's sandbox |
| **5. New employee** | Invite → role → template → custom permissions → verify → audit. **Before this pass: starts as a full role admin (B-4); verifying needs view-as by template (B-15)** |
| **6. New owner** | Create → assign → agreement → subscription → sales → settlement: self-service. **Arrears never computed (B-5)** |
| **7. Hardware failure** | Detect (alerts, liveness) → diagnose (events, commands, test vend) → pause (**use integration maintenance, not machine status (B-1)**) → replace (**no workflow (B-10)**) → reconfigure → certify → reactivate |

---

## 16. Permission catalogue

The full catalogue is generated in `docs/RBAC_PERMISSION_CATALOG.md`: 93 permissions (plus those added by this pass, §21), grouped, with the templates that hold each, the routes that enforce it and the super-admin-only flag.

## 17. Role templates

Also in the catalogue. Counts are after this pass.

| Template | Permissions | For |
|---|---:|---|
| Super admin | 94 | Everything, including staff access and credentials |
| Admin | 82 | Everything except the 12 super-admin-only permissions |
| Machine operations | 32 | Fleet setup, catalogue, prices, stock, alerts |
| Warehouse | 28 | Packing, shopping runs, machine restocking |
| Finance | 14 | Machine sales, refunds, owner money, and the Finance workspace (`finance.view`, added in this pass) |
| Support | 3 | Conversations, couriers, looking up machine sales |
| Marketing | 10 | Campaigns, creators, content, machine screen |
| Product manager | 7 | Boxes, snacks, recipes |

**The requested examples map onto these as follows:**
- "Kelvin: Operations + Finance + Hardware" = Admin, or Machine operations plus Finance grants.
- "Hardware technician" = Machine operations minus catalogue and price, plus `integrations.certify`.

A template is a starting point, and individual grants and removals make the rest.

---

## 18. Gap register

Priority: **P0** blocks safe operation · **P1** blocks an important workflow · **P2** significant control or usability gap · **P3** optimisation · **P4** future.

| ID | Gap | Class | Priority | Plan |
|---|---|---|---|---|
| FA-01 | Machine status doesn't stop sales (B-1) | A, C | **P0** | Build (§21) |
| FA-02 | Escalation through invite, role, legacy sections, reset links; super-admin protection (B-2) | B | **P0** | Build |
| FA-03 | Revenue and staff data on role-gated pages (B-3) | B | **P1** | Build |
| FA-04 | No template at invite (B-4) | B | **P1** | Build |
| FA-05 | Decommission is permanent and held by Warehouse | B, D | **P1** | Build: a separate permission |
| FA-06 | Arrears sweep never runs (B-5) | C | **P1** | Build: a daily job |
| FA-07 | ~~Unverified-callback risk invisible (B-6)~~ | — | — | **Withdrawn:** the secret is generated before the first push. Optional hardening: fail closed in production once a secret exists |
| FA-08 | Typed machine stock removal (B-7) | A, F | **P1** | Build |
| FA-09 | Warehouse draw-down on restock (B-8) | A, F | **P1** | **Decision needed:** where it deducts (dispatch vs pick), what a discrepancy returns, and which ledger boxes and snacks use |
| FA-10 | Discount codes unaudited; role change without "before" | C | **P1** | Build |
| FA-11 | Decommission checklist (keys, integration, subscription, tasks) (B-11) | D | P2 | Next |
| FA-12 | Machine details not editable (B-9) | G | P2 | Next |
| FA-13 | Machine, controller and host replacement workflow (B-10) | D | P2 | Next (design) |
| FA-14 | ~~Watchdog ignores never-run jobs (B-12)~~ | — | — | **Withdrawn:** already reported as overdue |
| FA-15 | Dispensed-sale dispute and refund (B-13) | C | P2 | **Decision:** who bears the loss (owner vs Snack Quest) |
| FA-16 | Product master data fields (B-14) | E, F | P2 | **Decision:** which fields, and where the kiosk shows them |
| FA-17 | View-as by template or person (B-15) | E | P2 | Next |
| FA-18 | Fleet-wide reads (§13) | — | P2 at 1k, P1 at 10k | Next: slot query by product, alert evaluation by changed slots, search index |
| FA-19 | Payouts, orders, conversations, recommendations not in the central audit log | F | P3 | Later |
| FA-20 | Permission granularity (box fields, images vs text) | B | P3 | Later |
| FA-21 | Job enable/disable | H | P3 | Later |
| FA-22 | Bulk and CSV machine or product setup | H | P3 | Later |
| FA-23 | Real-hardware certification of any manufacturer | A | P4 (gated on hardware) | Phase 6 plan |

---

## 19. Recommended implementation sequence

**Now.** Unambiguous and safe; every new action checks UI permission → page permission → API permission → service rule → transaction → audit:
1. FA-01: refuse a customer payment unless the machine's own status is `active`.
2. FA-02 + FA-04: one escalation rule for every staff change. Only a super admin can give, take or touch `super_admin` (role, disable, remove, reset link). Anyone else may only produce access that is a subset of their own (invite, role change, legacy sections, reset link for someone with more). Invites take a template.
3. FA-05: `machines.decommission`, a separate permission (Admin template; not Warehouse or Machine operations).
4. FA-03: permission gates on the dashboard's revenue and staff cards, `/admin/analytics`, and every `/finance` and `/warehouse` page. Revenue and analytics need `finance.view`.
5. FA-06: a daily `reconcile-subscription-arrears` job with Run now.
6. FA-07: a warning on Settings and Operations when the Daraja webhook secret isn't set.
7. FA-08: remove stock from a machine as expired, damaged or returned, with a typed ledger movement, audited.
8. FA-10: audit discount codes; add "before" to role changes.

**Next (P2):** FA-11, FA-12, FA-14, FA-17, FA-18, then FA-13 with a design.

**Decisions for the business:** FA-07 (fail closed), FA-09 (warehouse draw-down), FA-15 (dispute loss rule), FA-16 (product fields).

---

## 20. Developer-dependency assessment

*If Kelvin stopped writing code tomorrow, how much of the daily vending business could trained employees run?* (After this pass.)

| Area | Status | Why |
|---|---|---|
| Product | **Partially operational** | Boxes, snacks, images, text and machine pricing are self-service. Allergens, barcode and category can't be recorded; no bulk edit |
| Warehouse | **Partially operational** | Buying, receiving, packing and machine restocks are self-service. Warehouse counts drift after machine restocks until the draw-down decision is built |
| Operations | **Fully operational** (software fleet) | Register, configure, price, pause (after FA-01), move, reassign, alerts, jobs, reconciliation. Machine replacement is improvised |
| Hardware | **Developer required** | No manufacturer integration tested on real hardware; the M109E agent is not deployable; detail fields need Firestore |
| Support | **Fully operational** | Conversations, courier bookings, machine-sale lookup |
| Finance | **Partially operational** | Review queue, refunds, reversals, settlements, subscriptions and payouts are self-service. No dispute path for dispensed sales; the reversal is untested against Safaricom's sandbox |
| Management | **Fully operational** | Dashboards, intelligence, audit log, exports, search |
| Owner management | **Fully operational** (after FA-06) | Create, assign, agreements, settlements, subscriptions with arrears, payouts, portal |
| Manufacturer integrations | **Developer required** | The software side (registry, keys, certification harness) is self-service; the machine side needs an agent or a manufacturer build, and real-hardware certification |

**Tests passing prove the behaviour that exists. They don't prove the rows above:**
- These pages have no browser tests.
- The reversal hasn't met Safaricom's sandbox.
- No machine has met a real motor.

---

## 21. What this pass built

Every change keeps the chain intact: UI permission → page permission → API permission → service rule → transaction → audit.

| Item | What changed | Where | Tests |
|---|---|---|---|
| **FA-01** (P0) | A customer payment is refused unless the machine's own status is `active`. A paused, offline, retired or not-yet-commissioned machine takes no money, whatever its integration says; the gateway is never called | `machineTransactionService.startCartPayment` | New: a paused, offline and retired machine each refused, with no push and no sale written. Fixtures that sold from a freshly provisioned machine now commission it first (installing → testing → active), as the v1 harness already did |
| **FA-02** (P0) | One escalation rule for every staff change, enforced in the service with the actor's session: <br>• only a super admin can invite a super admin, promote to or demote from it, or disable, remove or reset the password of one;<br>• anyone else can only produce access that is a subset of their own, on invite (template or role), role change, and clearing legacy section limits;<br>• a reset link is only given for someone whose access is a subset of the actor's. <br>Refusals are 403s | `staffManagementService` (`StaffActor`, `SuperAdminOnlyError`), staff routes | New: a delegated user manager is refused on every path; a narrow manager can't invite an admin, promote to admin, clear section limits or take over a stronger account; within their own access it works |
| **FA-04** (P1) | An invite can start from a template ("Starting access"). The escalation rule applies to the template | Invite dialog, `POST /api/admin/staff`, service | New: a product manager invited with the template holds `products.manage`, not `finance.view`; an unknown template is refused |
| **FA-05** (P1) | **New permission `machines.decommission`** ("Retire a machine for good"). In Admin (and Super admin); not in Warehouse or Machine operations. The route checks it for `status: decommissioned`, and the setup page only offers "Retired" to people holding it | `permissions.ts`, `PATCH /api/vending/machines/[id]`, setup page | New: Warehouse gets 403 `machines.decommission` and nothing is written |
| **FA-03** (P1) | Money and staff data behind permissions: <br>• `/admin/analytics` needs `finance.view` (page gate and navigation); <br>• the dashboard reads and shows revenue only with `finance.view`, and the staff count only with `users.manage`; <br>• every `/finance` page needs `finance.view`, and every `/warehouse` page its permission (`warehouse_fulfilment.manage` or `products.view`), through `requireWorkspacePage`. Someone without it lands on `/no-access`, which names the missing permission. <br>**The Finance template now includes `finance.view`**, so finance staff keep the workspace they already had | `lib/auth/requireWorkspacePage.ts`, `app/no-access`, workspace pages, dashboard, nav map | Covered by type-checking and the existing permission tests; there are no browser tests for these pages |
| **FA-06** (P1) | A daily `reconcile-subscription-arrears` job (05:30 UTC, `vercel.json`) runs the existing arrears rule under a lease, records its run, and has Run now on Operations | `services/jobs/reconcileSubscriptionArrears.ts`, cron route, schedule table, registry | New: the job, run through the scheduler, opens grace on a past-due subscription and records its summary |
| **FA-10** (P1) | Discount codes: create and edit are in the audit log (before/after; new "Discount codes" filter area). Staff role changes record the previous role | Discount-code route, staff route | Covered by the route tests; the role-change "before" by the staff route tests |

**Not built in this pass**, in the order to do them:
1. **FA-08:** typed stock removal from a machine (expired, damaged, returned). It needs a movement reason for each and a slot-page action. Unambiguous; next.
2. **FA-11, FA-12, FA-17, FA-18:** P2.
3. **Decisions for you:** FA-09 (warehouse draw-down), FA-15 (who bears a dispensed-sale refund), FA-16 (product fields).

### Corrections to this audit found while building

These are recorded above and struck through where they were wrong:
- **FA-07 withdrawn.** The Daraja webhook secret is generated before the first STK push.
- **FA-14 withdrawn.** The job watchdog already reports a never-run job as overdue once others run.
- **The permission count** was 93 at the time of the audit and is **94** after this pass (`machines.decommission`).
