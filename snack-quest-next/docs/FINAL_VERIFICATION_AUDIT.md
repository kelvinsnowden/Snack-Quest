# Final verification audit

An independent check of the claims in three documents:
- `docs/FINAL_OS_FUNCTIONALITY_AUDIT.md` (below, "FA");
- `docs/ADMIN_CAPABILITY_MATRIX.md` ("the matrix");
- `docs/RBAC_PERMISSION_CATALOG.md` ("the catalogue").

The method was to try to prove each claim wrong. This was a first pass, so **nothing was fixed**. Every issue below is still in the code at commit `d3ffaa7`.

## Evidence labels

| Label | Meaning |
|---|---|
| **VERIFIED IN CODE** | I read the code path end to end, and it does what the claim says. |
| **VERIFIED BY TEST** | A test that ran in this pass exercises the claim. Section 13 lists the runs. |
| **VERIFIED IN BROWSER** | Observed in a real browser against a production build in this pass (section 2). |
| **NOT VERIFIED** | No evidence either way, or the evidence can't exist without something outside this environment. |
| **CONTRADICTED BY CODE** / **CONTRADICTED IN BROWSER** | The claim is false. |

Passing tests are not taken as proof that a workflow is operational. A test proves only what it asserts, and several claims in the earlier docs were backed by tests that don't exist (section 3.4).

---

## 1. Summary of what was found

**The most serious finding (P0):** a user manager can turn a removed super admin back into a super admin by re-inviting them as "Support". This was **confirmed in the browser.** The re-invited account read the staff list and the super-admin-only integrations settings. The audit log records the invite as "role: agent".

**Three P1 correctness problems:**
- **V-18: settlement can be blocked for good.** A machine report that contradicts a finished sale records a conflict that no review action can clear. Settlement refuses to finalise while an unresolved conflict exists, so the owner can never be paid for that machine and period. Found in code, and each half is covered by an existing test.
- **V-12: stock counts can double-apply.** Two staff entering the same physical count at the same time double-apply the correction. **Reproduced:** a slot at 8, counted as 5 twice, ended at **2**.
- **V-02: conversations are open to non-support staff.** The `/agent` workspace pages are gated by role, not permission. A Product Manager, or a technician on the Admin role, can read every customer conversation, with names and phone numbers. **Confirmed in the browser.**

Also confirmed in the browser:
- **V-03:** the Admin dashboard shows customer names and phone numbers to staff who don't hold `orders.view`.
- **Stale doc:** the matrix's page table no longer matches the code.

**What held up under attack:**
- the new escalation rules, on every path except the re-invite;
- revocation and disable taking effect on the next request;
- forged view-as cookies being refused;
- the machine-status gate on payment;
- settlement finalisation being atomic;
- the refund in-flight guard.

---

## 2. How the browser checks were run

**Environment:**
- `next build` + `next start` (production build) on port 3100, against the Firebase Auth and Firestore emulators.
- Headless Chromium driven by Playwright.
- **Not a deployment:** no real Safaricom, no real Vercel cron, and no hardware.

**Seeded data:** one active machine (`verify-machine-1`), one customer order and one customer conversation, created through the app's own services. Nine staff accounts:

| Account | Stands for | Role | Template / grants |
|---|---|---|---|
| `super` | Super admin | `super_admin` | — |
| `admin` | Normal admin | `admin` | role default |
| `pm` | Product manager | `admin` | `product_manager` |
| `warehouse` | Warehouse | `warehouse` | role default |
| `finance` | Finance | `finance` | role default |
| `support` | Support | `agent` | role default |
| `tech` | Hardware technician | `admin` | `machine_operations` + `integrations.certify` |
| `usermgr` | Delegated user manager | `admin` | role default + `users.manage` |
| `formerboss` | A **removed** super admin | `super_admin` (soft-deleted) | — |

**What each account did:**
- signed in through the login form;
- recorded its landing page and navigation links;
- opened 24 pages by direct URL, recording where it ended up and whether customer data or a revenue card showed;
- made up to 10 direct API calls with `fetch` from inside its own signed-in page, so the real session cookie was sent;
- ran the attacks relevant to it.

**Runs that were discarded or corrected (disclosed so nobody reuses them):**
- The first run is not used as evidence:
  - Its API calls went out without the session cookie (every call returned 401).
  - It read redirects before they finished.
  - Its 500s came from order and conversation documents I had seeded wrongly. **Those 500s are not product bugs.**
- In the second run, the "grant access" attacks used `PUT`, but the route only accepts `PATCH`. The 405s tested nothing, so I re-ran those attacks with `PATCH` (section 3.2).
- `GET /api/admin/analytics/marketing-spend` returned 405 because I probed with the wrong method, and `GET /api/vending/restock` returned 400 because I sent no parameters. Neither says anything about access.

### 2.1 Where each person lands and what they can open

"Open" means the page rendered for that person. "→ X" means they were redirected to X. **PII** means the page showed the seeded customer's name or phone number.

| Page (direct URL) | Super | Admin | PM | Warehouse | Finance | Support | Tech |
|---|---|---|---|---|---|---|---|
| Landing after login | /admin | /admin | /admin | /warehouse | /finance | /agent | /admin |
| Navigation links | 47 | 42 | 9 | 5 | 7 | 2 | 20 |
| `/admin` | open, PII, revenue | open, PII, revenue | **open, PII** | → /warehouse | → /finance | → /agent | **open, PII** |
| `/admin/analytics` | open | open | denied (`finance`) | → /warehouse | → /finance | → /agent | denied |
| `/admin/staff` | open | denied (`users.manage`) | denied | → /warehouse | → /finance | → /agent | denied |
| `/admin/orders` | open, PII | open, PII | open, PII (holds `orders.view`) | → /warehouse | → /finance | → /agent | denied |
| `/admin/customers` | open, PII | open, PII | denied (`customers.view`) | → /warehouse | → /finance | → /agent | denied |
| `/admin/vending` | open, revenue | open, revenue | denied (`vending`) | → /warehouse | → /finance | → /agent | open, revenue |
| `/admin/vending/[id]/setup` | open | open | denied | → /warehouse | → /finance | → /agent | open |
| `/admin/vending/settlements` | open | open | denied | → /warehouse | → /finance | → /agent | denied (`owner_finance.view`) |
| `/admin/vending/integrations/credentials` | open | denied | denied | → /warehouse | → /finance | → /agent | denied |
| `/admin/settings/integrations` | open | open | denied | → /warehouse | → /finance | → /agent | denied |
| `/admin/audit-logs` | open | open | denied | → /warehouse | → /finance | → /agent | denied |
| `/finance`, `/finance/refunds` | open | open | /no-access | → /warehouse | open | → /agent | /no-access |
| `/finance/revenue` | open, revenue | open, revenue | /no-access | → /warehouse | open, revenue | → /agent | /no-access |
| `/warehouse` | open, PII | open, PII | /no-access | open, PII | → /finance | → /agent | /no-access |
| `/warehouse/machines` | open | open | /no-access | open | → /finance | → /agent | open |
| `/warehouse/inventory` | open | open | open (holds `products.view`) | open | → /finance | → /agent | open |
| `/agent` | open, PII | open, PII | **open, PII** | → /warehouse | → /finance | open, PII | **open, PII** |
| `/agent/conversations/[id]` | open, PII | open, PII | **open, PII** | → /warehouse | → /finance | open, PII | **open, PII** |
| `/agent/machine-sales` | open | open | → /agent (no `sales.view`) | → /warehouse | → /finance | open | open |

**Direct API calls with the person's own session:**

| API | Super | Admin | PM | Warehouse | Finance | Support | Tech |
|---|---|---|---|---|---|---|---|
| `GET /api/admin/staff` | 200 | 403 | 403 | 403 | 403 | 403 | 403 |
| `GET /api/admin/audit-logs` | 200 | 200 | 403 | 403 | 403 | 403 | 403 |
| `GET /api/vending/transactions` | 200 | 200 | 403 | 200 | 200 | 200 | 200 |
| `GET /api/vending/partners` | 200 | 200 | 403 | 403 | 200 | 403 | 200 |
| `GET /api/vending/alerts` | 200 | 200 | 403 | 200 | 200 | 403 | 200 |
| `POST /api/admin/jobs/rebuild-vending-rollups/run` | — | — | 403 | 403 | 403 | 403 | 403 |
| `PATCH /api/vending/machines/[id]` `{status: decommissioned}` | — | — | 403 | 403 | 403 | 403 | 403 |
| `POST /api/admin/staff` (invite an admin) | — | — | 403 | 403 | 403 | 403 | 403 |

Every row matches the templates, except the ones in bold in the page table. Those are V-02 and V-03.

`sales.view` is in every template except Product manager and Marketing. That is why Warehouse, Support and Tech list machine sales, which is by design. Whether Warehouse and Support *should* see machine sales is a business decision (G-6).

---

## 3. RBAC attack results

### 3.1 Delegated user manager (`admin` + `users.manage`)

| Attack | Request | Result | Label |
|---|---|---|---|
| Make self super admin | `PATCH /api/admin/staff/{self}` `{role: super_admin}` | 400 "You can't change your own role…" | VERIFIED IN BROWSER |
| Grant self a super-admin-only permission | `PATCH …/{self}/access` `{granted: [integrations.credentials.manage]}` | 400 (self) | VERIFIED IN BROWSER |
| Give self the super admin template | `PATCH …/{self}/access` `{template: super_admin}` | 400 (self) | VERIFIED IN BROWSER |
| Make another user super admin | `PATCH …/{support}` `{role: super_admin}` | 403 | VERIFIED IN BROWSER |
| Grant another user a permission I don't hold | `PATCH …/{support}/access` `{granted: [integrations.credentials.manage]}` | 403 "You can only give access you have yourself" | VERIFIED IN BROWSER |
| Give another user the super admin template | `PATCH …/{support}/access` `{template: super_admin}` | 403 (lists the 12 missing permissions) | VERIFIED IN BROWSER |
| Narrow a super admin | `PATCH …/{super}/access` `{revoked: [users.manage]}` | 400 "A super admin always has every permission" | VERIFIED IN BROWSER |
| Demote a super admin | `PATCH …/{super}` `{role: agent}` | 403 | VERIFIED IN BROWSER |
| Disable a super admin | `PATCH …/{super}` `{disabled: true}` | 403 | VERIFIED IN BROWSER |
| Remove a super admin | `DELETE …/{super}` | 403 | VERIFIED IN BROWSER |
| Get a password-reset link for a super admin | `POST …/{super}/reset-password` | 403 | VERIFIED IN BROWSER |
| Invite a new super admin | `POST /api/admin/staff` `{role: super_admin}` | 403 | VERIFIED IN BROWSER |
| **Re-invite a removed super admin as "agent"** | `POST /api/admin/staff` `{email: formerboss, role: agent}` | **201, then the account signs in to /admin, and `GET /api/admin/staff` and `GET /api/admin/integrations` (super-admin-only) both return 200** | **CONTRADICTED IN BROWSER (V-01, P0)** |
| Pass `users.manage` on to a Support agent | `PATCH …/{support}/access` `{granted: [users.manage]}` | 200 | Works as designed. That Support agent can now manage staff within their own 4 permissions. Whether delegation should chain is a business decision (G-5) |

### 3.2 Warehouse, Finance, Support and Product manager

| Attack | Warehouse | Finance | Support | PM |
|---|---|---|---|---|
| Grant self `users.manage` (`PATCH …/{self}/access`) | 403 | 403 | 400 (self)* | 403 |
| Take the Admin template (`PATCH …/{self}/access` `{template: admin}`) | 403 | 403 | 400 (self)* | 403 |
| Make self super admin (`PATCH …/{self}` `{role: super_admin}`) | 403 | 403 | 403 | 403 |
| Same, with extra `roles` and `permissions` fields in the body | 403 | 403 | 400 (self)* | 403 |
| Forged `sq_view_as=admin` cookie, then `GET /api/admin/audit-logs` | 403 `audit.view` | 403 | 403 | 403 |

\* Support had just been given `users.manage` by the user manager (section 3.1). So it reached the self-change rule, which refused it. Before that grant, the route's `users.manage` check refused it, like the others.

**Label:** VERIFIED IN BROWSER. No role could raise its own access by any route, body manipulation or cookie.

### 3.3 Is an old session cut off when access changes?

| Step | Result |
|---|---|
| Finance signs in; `GET /api/vending/partners` | 200 |
| In another browser, the super admin removes `finance.view` and `owners.view` from Finance | 200 |
| **Same Finance session:** `GET /api/vending/partners` | **403 `owners.view`** |
| Same session: open `/finance/revenue` | → `/no-access?permission=finance.view` |
| The super admin disables Finance | 200 |
| Same session: `GET /api/vending/alerts` | **401** |
| Same session: open `/finance` | → `/` (signed out) |

**Label:** VERIFIED IN BROWSER. Permissions are re-read on every request (`staffAuthService.verifySessionCookie` checks for revocation and re-reads Firestore), so a change takes effect on the next request.

### 3.4 Test claims in the earlier docs that are false

The FA §21 table said some items were covered by tests that don't exist:

| Claim in FA §21 | Reality | Label |
|---|---|---|
| FA-10: "Discount codes: covered by the route tests" | No test calls the discount-code route and asserts an audit entry. | **CONTRADICTED BY CODE** (untested) |
| FA-10: "role-change 'before' by the staff route tests" | `tests/api/adminStaffRoutes.test.ts` mocks `changeRole` to return `{before:'agent'}`, but never asserts the audit entry. `recordAuditLog` is mocked and never inspected. | **CONTRADICTED BY CODE** (untested) |
| FA-03: "Covered by type-checking and the existing permission tests" | No test covers `requireWorkspacePage` or `/no-access`. The browser run in this pass is now the only evidence. | Now **VERIFIED IN BROWSER** (never by test) |

---

## 4. Claim-by-claim: FINAL_OS_FUNCTIONALITY_AUDIT.md

| ID | Claim | Label | Evidence and notes |
|---|---|---|---|
| FA-01 | A customer payment is refused unless the machine's status is `active`; the gateway is never called | **VERIFIED BY TEST**, VERIFIED IN CODE | `machineTransactionService.startCartPayment` checks `machine.status !== 'active'` before `dispenseGate` and before any push. The new tests assert no push and no sale for paused, offline and retired machines. **Gap (V-09):** a payment already pushed when the machine is paused still dispenses. `authorizeVend` → dispatch doesn't re-check machine status. |
| FA-02 | One escalation rule for every staff change; refusals are 403s | **CONTRADICTED IN BROWSER** | Holds for role change, access change, disable, remove, reset link and fresh invite (section 3.1). **Fails on re-invite of a removed staff member** (V-01). Self-changes return 400, not 403 (cosmetic). |
| FA-03 | Money and staff data behind permissions | **PARTIAL: VERIFIED IN BROWSER, with gaps** | The dashboard revenue card is hidden without `finance.view` (PM and Tech don't see it), `/admin/analytics` is denied, and `/finance/*` and `/warehouse/*` go to `/no-access`. **But:** the dashboard still shows recent orders with customer name, phone and totals to anyone in `/admin` (V-03). The fleet page shows "Revenue (30d)" to anyone with the `vending` section (Tech). The `/agent` pages aren't gated by permission (V-02). |
| FA-04 | Invite takes a template; escalation applies to it | **VERIFIED BY TEST** | `staffManagementService` tests. The template path is fine; the flaw is V-01, which concerns *existing* roles, not the template. |
| FA-05 | `machines.decommission` is separate; Warehouse gets 403 | **VERIFIED IN BROWSER**, VERIFIED BY TEST | `PATCH /api/vending/machines/[id] {status: decommissioned}` returned 403 for PM, Warehouse, Finance, Support and Tech. |
| FA-06 | A daily arrears job runs under a lease, records its run, and has Run now | **VERIFIED BY TEST** (job logic); **NOT VERIFIED** (that the cron fires in production) | `vercel.json` has `30 5 * * *`. Whether the Vercel plan runs 9 daily crons is not verified (section 11). |
| FA-07 | Withdrawn: the Daraja secret is generated before the first push | VERIFIED IN CODE (earlier pass; not re-examined) | — |
| FA-08 | Typed machine stock removal | Open (not built) | The only way to take stock out today is a discrepancy count, which has V-12. |
| FA-09 | Warehouse draw-down on restock | Open, business decision | See section 8. |
| FA-10 | Discount codes audited; role change records "before" | **VERIFIED IN CODE**, **not tested** | `recordAuditLog` is called on create and update; the role route writes `before: {role}`. See section 3.4. |
| FA-11 | Decommission checklist | Open | — |
| FA-12 | Machine details not editable | Open | — |
| FA-13 | Replacement workflow | Open | — |
| FA-14 | Withdrawn: "the job watchdog already reports a never-run job as overdue" | **CONTRADICTED BY CODE** (partly) | `scheduledJobService.health` promotes `never_run` to `overdue` **only for jobs that run hourly or more often** (`everyMs <= 60*60*1000`). Of the 10 jobs, only `vending-fast-recovery` qualifies. A daily job whose cron was never deployed shows `never_run` forever, with a neutral "outline" badge on Operations. The withdrawal should be re-opened for daily jobs. |
| FA-15 | Dispensed-sale dispute: who bears the loss | Business decision | Unchanged. |
| FA-16 | Product master data | Business decision | Unchanged. |
| FA-17 | View-as by template or person | Open | Forged view-as cookies are refused (section 3.2). |
| FA-18 | Fleet-wide reads: "P2 at 1k, P1 at 10k" | **CONTRADICTED BY CODE** (understated) | See section 12. The fleet page, alert evaluation, search, and the slots, catalogue and product pages all read the whole fleet. §13's claim that the fleet page is fine at 10k is contradicted (V-20). |
| FA-19 | Payouts, orders, conversations and recommendations not in the central audit log | **VERIFIED IN CODE** (narrowed) | Withdrawal approve, reject, resolve and pay-manually **are** audited. `POST /api/vending/partners/[partnerId]/withdrawals` (staff requesting a payout for an owner) is **not**. |
| FA-20 to FA-22 | Granularity, job enable/disable, bulk setup | Open | — |
| FA-23 | Real-hardware certification | **NOT VERIFIED** (needs hardware) | Section 14. |
| §20 | "Operations: fully operational (software fleet)", "Owner management: fully operational" | **CONTRADICTED BY CODE** | V-18 can leave an owner's settlement unfinalisable, and V-12 can corrupt slot counts. Neither is "fully operational". |

## 5. Claim-by-claim: RBAC_PERMISSION_CATALOG.md

| Claim | Label | Evidence |
|---|---|---|
| "Every staff API route method checks exactly one permission" | **CONTRADICTED BY CODE** | `POST /api/storage/upload` checks for a staff or creator session only; any staff member can upload into any staff directory (V-05, P3). The conversation `turn` route is a system interface. Everything else sampled does check one. |
| "Each page's layout checks the one the page is about" | **CONTRADICTED BY CODE**, **CONTRADICTED IN BROWSER** | Four pages fall short:<br>• `app/agent/(protected)/page.tsx` has no permission check (V-02).<br>• `app/agent/(protected)/conversations/[conversationId]/page.tsx` has no permission check (V-02).<br>• `/admin/vending/products` is gated by section only (V-06).<br>• The `/admin` dashboard shows orders without `orders.view` (V-03). |
| "Effective access = template ∪ grants − removals; a removal beats a grant" | VERIFIED BY TEST | Permission unit tests. |
| "A super admin holds every permission, can't be narrowed" | **VERIFIED IN BROWSER** | Section 3.1, "Narrow a super admin". |
| "Roles only choose the workspace" | **CONTRADICTED BY CODE** | On `/agent`, the role *is* the access control. |
| "Nobody changes their own access, role, or account state" | **VERIFIED IN BROWSER** | Section 3. |
| "Only a super admin can invite a super admin…" | **CONTRADICTED IN BROWSER** | V-01: re-inviting a removed super admin under any role restores the super admin role. |
| "Anyone else … can only produce access that is a subset of their own. This applies to invites" | **CONTRADICTED IN BROWSER** | V-01. The check covers `input.role` only, not the roles the account ends up with. |
| "The last super admin can't be demoted, disabled or removed" | VERIFIED BY TEST | `LastSuperAdminError` tests. |
| "Every change is in the audit log with before and after" | **CONTRADICTED BY CODE** | Three gaps:<br>• `staff.change_permissions` (legacy sections) and `staff.disable` record only `after`.<br>• `staff.invite` records the *requested* role, so in V-01 the log says `role: agent` while the account became `super_admin`.<br>• The "before" values that are recorded are untested (section 3.4). |
| "View-as … the narrowing is real (routes refuse too)" | **VERIFIED IN BROWSER** (forged cookie by non-super); VERIFIED BY TEST (narrowing) | Section 3.2. |
| Template sizes (94 / 82 / 32 / 28 / 14 / 3 / 10 / 7) | VERIFIED IN CODE | Extracted from `lib/auth/permissions.ts`. |
| The 12 super-admin-only permissions | **VERIFIED IN BROWSER** | The template-escalation 403 listed exactly those 12. |

## 6. Claim-by-claim: ADMIN_CAPABILITY_MATRIX.md

| Claim | Label | Evidence |
|---|---|---|
| "Generated from the code … regenerate after route changes" | **CONTRADICTED BY CODE** (stale) | The page table was not regenerated after `d3ffaa7`. It lists `/admin/analytics`, all 8 `/finance/*` pages and 6 of 8 `/warehouse/*` pages as "workspace role". The code now gates them with `requireAdminPage('finance','finance.view')` and `requireWorkspacePage(…)`, and the browser confirms those gates. |
| Status counts: 197 complete / 81 system / 41 unaudited / 21 read | NOT VERIFIED | Produced by a heuristic script, not re-derived. |
| The "Backend" column | **CONTRADICTED BY CODE** (heuristic errors) | For example:<br>• `POST /api/admin/staff` shows `staffManagementService.listStaff` (it calls `inviteStaff`).<br>• `POST /api/storage/upload` shows `ProductService.updateProduct`, and its permission shows as `public/other` (it needs a staff or creator session). |
| `/agent/*` pages: "workspace role" | VERIFIED IN CODE | Accurate, but not flagged anywhere as a gap (V-02). |
| Permission column for API routes (sampled: staff, vending machines, transactions, partners, alerts, jobs, audit logs) | **VERIFIED IN BROWSER** | Section 2.1: every status matched the listed permission. |

**Treat the matrix as a route index, not evidence.** It is heuristic, and part of it is out of date.

---

## 7. Serious issues in detail

### V-01 (P0): re-inviting a removed staff member restores their old roles, including super admin

- **File:** `services/staffManagementService.ts`
- **Function:** `inviteStaff` (the existing-user branch, around lines 296–333)

**Current behaviour:**
1. When the email already has an Auth account and no live staff profile, `existingRoles = (await userRepository.findById(uid))?.roles`.
2. `userRepository.findById` returns soft-deleted users, and `removeStaff` → `userRepository.softDelete` sets only `deletedAt`, so the roles are kept.
3. The new roles are `existingRoles ∪ {input.role}`. They are written to the custom claims and to `users.roles` (`updateRoles` also clears `deletedAt`), and the account is re-enabled.
4. The escalation check (`assertWithinActor` and the `SuperAdminOnlyError` guard) looks only at `input.role`.
5. Sessions trust `users.roles`.

**Expected behaviour:** a re-invite grants exactly the role and template chosen now. A removed person's old staff roles are gone. The escalation check runs on the roles the account will actually end up with.

**Consequence:**
- Anyone holding `users.manage` can restore any removed staff member's former power by re-inviting them as "Support". That includes a delegated manager, who may be a Support agent after chained delegation (section 3.1).
- The restored power includes super admin: the account gets credentials, integration secrets and staff management.
- A super admin who innocently re-invites a former admin "as Warehouse" silently re-creates an admin.
- The audit log and staff list show the requested role, so nobody sees it happen.

**Reproduction (done in the browser):**
1. A super admin removes a super admin, X.
2. The user manager (Admin + `users.manage`) posts to `POST /api/admin/staff` with `{email: X, displayName, role: "agent", department}` and gets 201 with a reset link.
3. X sets a password and signs in; they land on `/admin`.
4. `GET /api/admin/staff` returns 200, and `GET /api/admin/integrations` returns 200.

**Recommended fix:**
- When re-provisioning, drop every *staff* role (`super_admin`, `admin`, `agent`, `warehouse`, `finance`) from `existingRoles`, keeping only non-staff roles such as `customer` and `creator`.
- Run the super-admin and subset checks against the final role set and template.
- Also reset `grantedPermissions`, `revokedPermissions` and `template` on the new profile.
- Record the actual resulting roles in the `staff.invite` audit entry.
- Add a regression test: remove a super admin, re-invite as agent, assert roles = `['agent']`.

### V-18 (P1, stuck money): some outcome conflicts can never be resolved, which blocks settlement

**Files and functions:**
- `lib/vending/vendOutcomeDecision.ts` → `decideVendOutcome`
- `services/machineTransactionService.ts` → the `case 'conflict'` branch
- `services/vendingSaleReviewService.ts` → the list of available actions
- `services/machineSettlementService.ts` → `finalize`

**Current behaviour:** three conflicts use `moveToReview: false`:
- the machine reports failure after a sale was `dispensed`;
- it reports success after the customer was `refunded`;
- it reports success for a `pending` or `payment_failed` sale.

These call `recordOutcomeConflict` with `resolved: false` and leave the sale's status unchanged. Only two actions set `resolved: true`:
- `confirmDeliveredAfterReview`, which needs `manual_review`;
- `requestRefund`, which needs `paid_vend_failed` or `manual_review`.

The review UI offers `confirm_delivered` only for `manual_review` and `start_refund` only for `manual_review` or `paid_vend_failed`. `machineSettlementService.finalize` refuses while `outcomeConflictCount > 0` and tells staff to "Resolve them under Sales to review". There is nothing there to resolve.

**Expected behaviour:** every recorded conflict has a way to close. A person acknowledges or decides it, with a reason, and it is audited. Alternatively, informational conflicts don't block settlement.

**Consequence:** a single late or contradictory machine report, such as a jam report after a success, makes that machine's settlement for that period impossible to finalise. The owner can't be paid for the period except through a direct database edit by a developer. This will happen with real hardware: the M109E result-clearing question (section 14) is exactly this case.

**Reproduction:** each half is proved by an existing test that ran in this pass:
1. `tests/services/vendOutcomeSafety.test.ts` › "failure after a completed sale…" leaves `status: 'dispensed'` with a conflict.
2. `tests/services/settlementWorkflow.test.ts` › "won't finalize while a sale in the period has conflicting outcomes" shows the refusal.
3. There is no code path that sets `resolved: true` for a `dispensed` or `refunded` sale (grep for `resolved: true`: only `machineTransactionService.ts` lines 1128 and 1144).

No end-to-end test was written.

**Recommended fix:** add a review action, "Acknowledge machine conflict", for conflicts on `dispensed`, `refunded`, `pending` and `payment_failed` sales. It needs a required note, an audit entry and the right permission (`sales.review.resolve`). Also decide whether a `warning`-severity conflict (failure after success) should block settlement at all (G-4).

### V-12 (P1, inventory): concurrent stock counts double-apply

- **File:** `services/machineInventoryMovementService.ts`
- **Function:** `recordDiscrepancyAdjustment`

**Current behaviour:** it reads `slot.currentQuantity` with a plain read *outside* any transaction, computes `delta = count − expected`, then calls `recordMovement`, which applies `delta` inside its own transaction.

**Expected behaviour:** a count *sets* the slot to the counted number. The delta is computed inside the same transaction that writes it.

**Consequence:** two people (or one double-click, or a retry) submitting the same count both subtract. Any sale between the read and the write is also counted twice. The slot shows less stock than the shelf holds, which can trigger false low-stock alerts, unneeded restocks and false "empty" slots.

**Reproduction:** a scratch test was run in this pass and then deleted, not committed.
1. Restock a slot to 8.
2. Call `recordDiscrepancyAdjustment({physicalCountQuantity: 5})` twice concurrently.
3. Both returned `expectedQuantity: 8, discrepancy: −3`. The afters were 5 and **2**, and the final slot quantity was **2** (the shelf holds 5).

The existing tests call it only sequentially.

**Recommended fix:** do the read and the write in one Firestore transaction (read the slot with `getInTransaction`, compute the delta, write the movement and the slot). Optionally accept an `expectedQuantity` from the client and refuse on mismatch, so a stale form is re-counted.

### V-02 (P1, privacy): the /agent workspace is gated by role, not permission

- **Files:**
  - `app/agent/(protected)/layout.tsx` (role check: agent, admin, super_admin)
  - `app/agent/(protected)/page.tsx`
  - `app/agent/(protected)/conversations/[conversationId]/page.tsx`

**Current behaviour:** anyone on the `admin` role, whatever their template, can open the conversation queue and every conversation, including the customer's name, phone number and message history. That covers Product manager, Machine operations, Marketing, and any narrowed admin. The Admin-side `/admin/conversations` checks `support.conversations.handle`, and the reply, assign, return and price APIs check it too, so writes are protected and reads are not.

**Expected behaviour:** the `/agent` conversation pages require `support.conversations.handle`, like the Admin equivalents.

**Consequence:** customer personal data is exposed to staff whose templates deliberately exclude it. This undermines the claim that templates narrow access.

**Reproduction (browser):** sign in as `pm@…` and open `/agent/conversations/<id>`. It renders with the customer's name and phone number. Tech gets the same result.

**Recommended fix:** add `requireWorkspacePage('support.conversations.handle')` to both pages, and filter the `/agent` navigation the same way.

### V-03 (P1, privacy): the Admin dashboard shows orders and customers without `orders.view`

- **File:** `app/admin/(protected)/page.tsx`

**Current behaviour:** revenue and staff count are now gated, but recent orders (customer name, phone, totals), total orders, the agent queue, and the delivery and traffic panels show for anyone who reaches `/admin`.

**Expected behaviour:** each panel is shown only with its permission: orders with `orders.view`, conversations with `support.conversations.handle`, traffic with `analytics.view` or the equivalent.

**Reproduction (browser):** Tech (no `orders.view`) and PM (no `customers.view`) both see the seeded customer's name and phone on `/admin`. Tech is refused `/admin/orders` in the same session.

**Recommended fix:** gate each dashboard query and card on its permission, as `finance.view` already gates revenue.

### V-11 (P2, money): crash window that can refund a customer twice

**Files and functions:**
- `services/vendingSaleReviewService.ts` → `reverse_payment` path
- `darajaGateway.initiateReversal`

**Current behaviour:**
1. The reversal is accepted by Safaricom.
2. If the process dies before the refund record moves to `processing` with its `originatorConversationId`, the pending refund goes stale after `PENDING_REVERSAL_STALE_MS`.
3. A person can then use `record_refund` (a manual refund).
4. The later Safaricom reversal result can't be matched to a record.

**Consequence:** the customer is refunded twice, and nothing flags the unmatched reversal result.

**Label:** found in code, not reproduced. It needs a real or sandbox Daraja reversal to observe.

**Recommended fix:**
- Persist a local correlation id before calling Daraja.
- Match reversal results by it, or by amount + receipt + time window.
- Surface unmatched reversal results as a reconciliation exception.
- Before `record_refund` on a sale whose reversal went stale, require a check against the M-Pesa statement.

### V-09 (P2): a machine paused after the customer paid still dispenses

**Current behaviour:** the machine's status is checked when the payment starts (FA-01), not when the Daraja callback authorises the vend. The payment callback → `authorizeVend` → dispatch path uses `dispenseGate`, which checks the integration, not `machine.status`.

**Consequence:** staff pause a machine for maintenance while a customer's STK prompt is open. The customer pays, and a dispense command is sent to a machine someone may have open.

**Recommended fix:** at authorisation, if the machine isn't `active`, move the sale to `paid_vend_failed`, which leads to a refund. Don't dispatch.

### V-05 (P3): upload endpoint is not permission-gated

`POST /api/storage/upload` accepts any staff session for any staff directory.

**Fix:** require the permission for the target area (`products.manage`, `content.manage`, and so on).

### V-06 (P3): `/admin/vending/products` is gated by section only

The page doesn't check `machine_catalog.*` or `machines.view` beyond the `vending` section. It is read-only, so the risk is low.

### Other issues (P3)

- The self-change error message reads "You can't change your own role your own account" (a doubled phrase). Cosmetic.
- Self-changes return 400, while the catalogue says refusals are 403.

---

## 8. Inventory: does warehouse + machine + slot = physical?

**No, and in the current design it can't.**

**Which records exist:**

| Location | Record | Ledger? |
|---|---|---|
| Machine slot | `machineSlots.currentQuantity` plus the `machineInventoryMovements` ledger (restock, sale, waste, manual adjustment) | **Yes.** `reconcile` compares the cached count with the ledger sum; `alignSlotToLedger` is transactional |
| Warehouse snacks | `snackItem.stockCount`, a free-form field edited in a form (`recipeService.validateSnackItem`) | **No.** No movements, no history |
| Warehouse packages | `purchaseOrderService.receive` increments package stock | Package-level only |
| Stock in transit | Restock tasks record what was loaded (`restockTaskId` on movements) | **Not deducted** from warehouse stock (FA-09) |

**Scenarios:**

| Scenario | What the system does | Stays true to the shelf? |
|---|---|---|
| Sale confirmed by the machine | One `sale` movement per sale (idempotent per sale) | **Yes** (VERIFIED BY TEST, vendOutcomeSafety) |
| Same success reported twice (API + webhook) | Stock moves once | **Yes** (VERIFIED BY TEST) |
| Machine reports success from a slot the ledger says is empty | Sale completes; inventory-mismatch flag | Flags it (VERIFIED BY TEST) |
| Restock of a machine | `restock` movement on the slot | Slot yes; **the warehouse isn't reduced** |
| Two concurrent counts, or a sale during a count | Delta double-applied | **No** (V-12, reproduced) |
| Expired or damaged removal | Only via a discrepancy count with a note (no typed reason) | Count yes; the reason is lost (FA-08) |
| Snack stock in the warehouse | Hand-edited number | **Not auditable** (V-21) |
| M109E machine | The board can't count stock (acceptance report: `inventory` NOT CERTIFIED) | The slot count is inferred from sales and drop confirmations only |

**Business decisions needed:** G-1 (where the warehouse is deducted) and G-2 (whether snacks get a ledger).

## 9. Money: from payment to reconciliation

The sale flow:

```
Customer taps "Pay" on the kiosk
  → startCartPayment: machine must be 'active' [FA-01 ✓] + dispenseGate(pre_payment)
  → Daraja STK push → transaction 'pending'
  → Daraja callback (webhook secret) → 'paid'   [amount mismatch → manual_review]
  → authorizeVend → dispense command (idempotent ledger)   [machine status NOT re-checked: V-09]
  → machine outcome (API / webhook / pull)
       success → 'dispensed' + one sale movement
       failure → 'paid_vend_failed' → refund_requested → reversal or manual refund → 'refunded'
       unknown → 'manual_review' → person decides
       contradiction → conflict (sometimes unresolvable: V-18)
  → daily rollups → settlement draft per machine per period → finalize (atomic owner credit)
  → owner payout request → approval → B2C → b2c-result webhook / stuck-withdrawal sweep
```

**Checks:**

| Question | Answer | Label |
|---|---|---|
| Can a sale be settled twice? | No. `finalize` moves draft → finalized and credits the owner in one transaction. Overlapping periods are refused atomically (`createIfNoOverlap`) | VERIFIED IN CODE, VERIFIED BY TEST |
| Can a sale be refunded twice? | Not concurrently: `createIfNoneInFlight` is a transactional guard. **Yes** after a crash in the reversal window, followed by a manual refund | VERIFIED IN CODE; **V-11 open** |
| Can money get stuck? | **Yes.** An unresolvable conflict blocks a machine's settlement for the period (V-18). An STK payment with no callback is swept by the fast recovery job (every 5 min, if the GitHub secrets are set) and by the daily `reconcile-stk-payments` | V-18 CONTRADICTED; sweeps VERIFIED BY TEST |
| Does a late confirmation vanish? | No. `confirmDeliveredAfterReview` stamps `dispensedAt = now`, so it lands in the next open period | VERIFIED IN CODE |
| Is every money action audited? | Refunds, settlement finalize, subscriptions and withdrawal decisions: yes. A staff-initiated owner payout request (`POST /api/vending/partners/[partnerId]/withdrawals`): **no** | VERIFIED IN CODE |
| Does it work against real Safaricom? | **NOT VERIFIED.** All payment evidence is from mocked gateways. No sandbox or production Daraja call was made in this pass | NOT VERIFIED |

## 10. Machine lifecycle

**Allowed transitions** (`types/machine.ts` `MACHINE_STATUS_TRANSITIONS`):
- provisioning → installing → testing → active
- active ↔ maintenance ↔ offline
- any status → decommissioned (terminal)

| Check | Label |
|---|---|
| Illegal transitions refused (`IllegalMachineStatusTransitionError`) | VERIFIED BY TEST (`tests/services/machineService.test.ts`) |
| One write path for status (`PATCH /api/vending/machines/[id]` → `machineService.updateStatus`) | VERIFIED IN CODE (V-07) |
| Decommission needs `machines.decommission` | VERIFIED IN BROWSER (403 for five roles) |
| A machine that isn't active takes no new payment | VERIFIED BY TEST |
| A machine paused mid-payment doesn't dispense | **CONTRADICTED BY CODE** (V-09) |
| "offline" is set by staff, not by missed heartbeats (liveness is shown separately) | VERIFIED IN CODE. A machine that stops heart-beating keeps `status: active`, so pre-payment protection depends on `dispenseGate` |
| Decommission cleans up keys, integration, subscription and tasks | **Not built** (FA-11). Retiring a machine leaves its credentials active until revoked by hand |

## 11. Scheduled jobs

| Job | Expected cadence | Trigger | Lease | Never-run shown as overdue? | Notes |
|---|---|---|---|---|---|
| `vending-fast-recovery` | 5 min | GitHub Actions `*/5 * * * *` | 4 min | Yes | **Does nothing without the repository secrets.** It is the only job that evaluates alerts and texts critical alerts |
| `reconcile-vending-transactions` | daily 06:00 UTC | vercel.json | 10 min | **No** | — |
| `reconcile-vending-commands` | daily 07:00 | vercel.json | 10 min | **No** | — |
| `reconcile-stk-payments` | daily 02:00 | vercel.json | 10 min | **No** | — |
| `reconcile-stuck-withdrawals` | daily 03:00 | vercel.json | 10 min | **No** | — |
| `retry-notifications` | daily 01:00 | vercel.json | 10 min | **No** | — |
| `rebuild-analytics-rollups` | daily 04:00 | vercel.json | 10 min | **No** | — |
| `rebuild-vending-rollups` | daily 05:00 | vercel.json | 10 min | **No** | — |
| `reconcile-subscription-arrears` | daily 05:30 | vercel.json | 10 min | **No** | New in `d3ffaa7` |
| `generate-recommendations` | daily 08:00 | vercel.json, or "Generate now" | 10 min | **No** | — |

**Checks:**

| Check | Label |
|---|---|
| Each job records its runs, takes a lease, and has Run now | VERIFIED BY TEST |
| Health promotes a never-run job to overdue | Only for jobs that run hourly or faster, so the "No" rows above stay neutral (FA-14 **contradicted**) |
| The Vercel plan accepts 9 daily crons | **NOT VERIFIED.** The workflow comment says Hobby allows daily crons only; the number allowed wasn't checked against the account |
| The GitHub workflow has its secrets | **NOT VERIFIED.** It exits quietly without them, and only the overdue flag shows it (which does work for this job) |

## 12. Scale: 100, 1,000 and 10,000 machines

The read counts are my estimates from the query shape, assuming about 60 slots per machine. They were **not measured**.

| File | Function / call | Query | Complexity | 100 | 1,000 | 10,000 | Failure mode | Recommended architecture |
|---|---|---|---|---|---|---|---|---|
| `app/admin/(protected)/vending/page.tsx` + `services/networkOverviewService.ts` `getOverview` | `machineRepository.listAllForBusiness` + `listAllStatuses` + locations, partners, integrations, open restock tasks, pending withdrawals | whole fleet about twice per view | O(fleet) per page view | fine | ~2–3k reads per view; slow | ~25–40k reads per view; render can time out (V-20) | Read one summary document (`machineFleetSummary` / network rollup) plus a paginated, indexed machine query |
| `services/alertService.ts` `evaluateInventory` (every 5 min via fast recovery) | `machineSlotRepository.listByBusiness` | every slot | O(slots) × 288/day | ~1.7M reads/day | **~17M reads/day** | **~170M reads/day**; a run can exceed the function time limit, so alerts stop | Evaluate on slot change (movement-triggered) or on slots updated since the last cursor |
| `services/globalSearchService.ts` | machines, owners, locations, manufacturers, suppliers (all), plus 3 capped scans | whole fleet per search | O(fleet) per search | fine | slow per keystroke | unusable | A search index, or prefix queries on normalised fields |
| `app/admin/(protected)/vending/products/[productCatalogue]/[productId]/page.tsx` | all machines + **all slots** | every slot per product view | O(slots) | fine | ~60k reads per view | ~600k reads per view | Query slots `where productId ==` (indexed) |
| `…/vending/[machineId]/slots/page.tsx`, `…/[machineId]/catalogue/page.tsx` | `listAllForBusiness` for a one-machine page | whole fleet | O(fleet) | fine | wasteful | slow | Load only what the page needs (for example a picker that searches on demand) |
| Settlements, partners, locations, alerts, kiosk-screen and reconciliation pages | `listAllForBusiness` | whole fleet | O(fleet) | fine | acceptable | slow | Paginate |
| Heartbeat (`/api/v1` heartbeat) | nonce + rate-limit writes per request; `listNeedingOutcome` query; signal and last-seen writes ≤ 1/min | per machine per minute | O(fleet) per minute | fine | ~1.4M requests/day | ~14M requests/day, ~30M+ writes/day | Longer default interval for healthy machines; TTL on nonces; a combined write |
| `rebuild-vending-rollups` (daily) | the day's transactions | O(sales per day) | — | fine | fine | check the function timeout | Incremental rollups on sale |
| Settlement draft | streams one machine's period | O(sales) | — | fine | fine | fine | — |

**Verdict:** at 100 machines, everything works. At 1,000, cost and page latency become noticeable, and alert evaluation is the biggest single cost. At 10,000, the fleet page, search, product pages and 5-minute alert evaluation will fail or time out. FA-18's rating ("P2 at 1k, P1 at 10k") is fair for cost, but **P1 at 1k for alert evaluation**, because alerts stopping is an operational failure.

---

## 13. Test status

All runs below were made **in this verification pass**, on commit `d3ffaa7`, with no code changes since.

| Check | Status | Evidence |
|---|---|---|
| Full test suite (`vitest run`, Firebase emulators) | **CURRENT PASS** | 380 files, 4,075 passed, 1 skipped, exit 0, 1,155 s. The skip is probably the C-toolchain signing vector (`it.skipIf(!cToolchain)`, the only conditional skip found); not confirmed |
| Type check (`tsc --noEmit`) | **CURRENT PASS** | Exit 0, no output |
| Lint (`eslint`) | **CURRENT PASS** | Exit 0; 0 errors, 2 warnings (unused `_args`) |
| Production build (`next build`) | **CURRENT PASS** | Exit 0, 239 static pages |
| Contract suites (`tests/contract/machineApiContract`, `tests/manufacturerContract`) | **CURRENT PASS** | Part of the full run |
| Security suites (`tests/api/webhookSecurity`, `tests/api/nonceConcurrency`, tenant and owner-portal adversarial tests) | **CURRENT PASS** | Part of the full run |
| Concurrency (`tests/perf/concurrency`, vendOutcomeSafety concurrent cases) | **CURRENT PASS** | Part of the full run. **They did not catch V-12**, which is a concurrency bug |
| Chaos and horrible day (`tests/integration/chaos`, `horribleDay`) | **CURRENT PASS** | Part of the full run |
| Certification harness and M109E agent certification (fake board) | **CURRENT PASS** | Verdict NOT CERTIFIED as designed (inventory; plus failure handling under the conservative policy). This proves the logic against the protocol document, not the machine |
| Browser role walk-through and RBAC attacks | **CURRENT PASS as a record** | Sections 2–3. Scripts are in the session scratchpad, not in the repo. **There is no automated browser test in the repository** |
| Scratch reproduction of V-12 | Ran; **reproduced the bug** | Deleted after running; not committed |
| Safaricom Daraja (sandbox or live) | **NOT RUN** | — |
| Real Vercel cron and GitHub Actions scheduling | **NOT RUN** | — |
| Real M109E or any real machine | **NOT RUN** | — |
| Load test at 1k or 10k machines | **NOT RUN** | Section 12 is an estimate |

## 14. The real-hardware boundary (M109E)

Everything below is **REQUIRES REAL HARDWARE**. The agent was built against the protocol document and a fake board. The certification harness refuses to record a fake-board run as model evidence (VERIFIED BY TEST, `m109eAgentCertification`: `CertificationNotAllowedError`).

| Area | What the software assumes | What only the machine can prove | Test needed |
|---|---|---|---|
| Protocol framing | Frames as documented; CRC16-MODBUS | That the board uses the documented frames. **Three CRCs in the document are misprinted** (letter Q16) | Capture real 01H, 03H, 05H, 2AH and 2BH frames and compare them with the golden tests |
| Checksum | CRC16-MODBUS everywhere | The 2AH and 2BH checksums on the real board | Same capture |
| Motor run (05H) | Index 0–59 = row × 10 + column (Q3) | The index → physical lane map | Run each lane once, empty, and record which one turns |
| Result clearing (03H) | Unknown (Q1). The driver is built with `resultsPersistUntilRead: false`, and the conservative policy treats a doubtful result as `unknown` → review | When a result clears. **If a stale result is re-read, a new sale may be told the old outcome** | Run, read twice, power-cycle and read; run lane A, then read before and after running lane B |
| Power loss mid-vend | The journal records intent before the run; on restart it asks the board and falls back to review | What 03H returns after power loss (Q2), and whether the motor completes | Cut power during a run at several points; confirm no double vend and a correct review |
| Drop sensor (light curtain) | May be absent (Q4). Curtain negatives are not trusted until acceptance test S5 | Whether a curtain is fitted, the smallest item it detects, and whether 0BH must power it | Drop the smallest and thinnest products 50× each; count misses |
| Stock count | **The board can't count stock.** Harness verdict: `inventory` NOT CERTIFIED | — | A business process (counts at restock) instead of hardware |
| Host OS | Unknown (Q7): model, OS, root, whether the vendor app can be removed | Whether our agent can run at all | Inspect the host; install the agent; confirm the vendor app doesn't also drive the bus (Q15) |
| Serial access | Device path and permissions unknown; TTL, RS-485 or RS-232 (Q6) | That the port opens and nothing else holds it | `bench` CLI read-only session (01H, 2AH) |
| Motor safety | Unknown whether the motor stops if the host goes silent (Q17), or whether a product can drop on over-current or timeout (Q18) | Stall behaviour | Jam a lane on purpose; kill the host during a run |
| Refrigeration | Unknown whether the board runs it by itself (Q10) | What happens when the host stops | Stop the agent for an hour; log the temperature |
| Door switch | DI1–DI4 unknown (Q9) | Which input is the door | Open and close the door while reading inputs |

**Recommended order:** get written answers to Q1, Q4, Q7 and Q10 before purchase (the letter is ready and **not sent**), then the bench read-only session, then acceptance tests S1–S10 on one machine. Until S5 and S7 pass, the agent must stay on the conservative policy, which sends every doubtful vend to human review. Combined with V-18, that makes review load and unresolvable conflicts the first operational risk on real hardware.

---

## 15. Findings by category

### A. VERIFIED (in code)
- A single machine-status write path with a transition table (V-07).
- Both STK payment paths check `machine.status === 'active'` (V-08).
- Refund in-flight guard is transactional (V-10).
- Settlement finalize is atomic; overlap check is atomic (V-14).
- Late confirmations land in the next open period (V-15).
- Production activation needs a certified model, a recent passing test, a credential and a production onboarding stage; `contract_suite` evidence is harness-only (V-16).
- Sessions are re-verified on every request (V-04).
- Withdrawal decisions are in the central audit log.
- Heartbeat signal writes are sampled at ≤ 1/min (V-19).

### B. VERIFIED BY AUTOMATED TEST (run in this pass)
- FA-01 (status gate at payment), FA-04 (invite templates), FA-05 (decommission permission), FA-06 (arrears job logic).
- Illegal machine transitions are refused.
- Idempotent sale movements; the same outcome through two channels applies once.
- Settlement refuses to finalise with unresolved conflicts.
- Last super admin can't be removed.
- Effective-permission algebra.
- Fake-board M109E certification verdicts; fake-board evidence can't be recorded to a model.
- Webhook security, nonce concurrency, chaos and horrible-day suites.

### C. VERIFIED IN BROWSER (this pass)
- Every role's landing page, navigation count and page access (section 2.1).
- Direct API access matches the permission catalogue for the seven sampled routes.
- Every self-escalation attempt refused for Warehouse, Finance, Support, PM and the delegated user manager.
- Super-admin protection: can't be narrowed, demoted, disabled, removed or reset by a non-super admin.
- Forged view-as cookie refused.
- Revoking a permission takes effect in an open session on the next request; disabling signs the session out.
- `/no-access` and `requireWorkspacePage` work for `/finance` and `/warehouse`.
- The dashboard revenue card is hidden without `finance.view`.
- Decommission refused for five roles.

### D. NOT VERIFIED
- Real Safaricom Daraja: STK, callbacks, reversals, B2C.
- That Vercel runs all 9 daily crons on the current plan; that the GitHub fast-recovery secrets are set.
- The matrix's status counts.
- Performance at 1k and 10k machines (estimates only).
- V-11 (double refund after a crash): code reading only.
- V-09 (dispense after pause): code reading only.
- Which test the one skipped test is.

### E. CONTRADICTED
- **V-01 (P0):** re-invite restores old roles, including super admin (browser).
- **V-18 (P1):** unresolvable outcome conflicts block settlement (code plus two existing tests).
- **V-12 (P1):** concurrent counts double-apply (reproduced).
- **V-02 (P1):** the `/agent` conversations are open to any admin-role template (browser).
- **V-03 (P1):** the dashboard shows customer data without `orders.view` (browser).
- **FA-14 withdrawal:** never-run daily jobs are not flagged.
- **FA-18 / FA §13:** the fleet page and alert evaluation don't scale as claimed (V-20).
- **FA §20:** "fully operational" for operations and owner management.
- **Catalogue:**
  - "every route checks exactly one permission" (upload route);
  - "each page checks its permission" (`/agent`, `/admin`, `/admin/vending/products`);
  - "roles only choose the workspace" (`/agent`);
  - "every change audited with before and after" (invite, legacy sections, disable).
- **Matrix:** the page table is stale after `d3ffaa7`; the Backend column has heuristic errors.
- **FA §21:** the test-coverage claims for FA-10 and FA-03.

### F. REQUIRES REAL HARDWARE
All of section 14: framing and CRC on the real board, the lane map, result clearing, power loss mid-vend, curtain reliability, host OS and serial access, motor stall behaviour, refrigeration, door input. Also any manufacturer integration other than the reference simulator.

### G. REQUIRES BUSINESS DECISION
- **G-1:** where warehouse stock is deducted for a machine restock (at dispatch or at pick), and what a count discrepancy returns to (FA-09).
- **G-2:** whether warehouse snacks get a real ledger (movements and history), or stay a hand-edited number.
- **G-3:** who bears the loss when a customer disputes a sale the machine reported dispensed: the owner or Snack Quest (FA-15).
- **G-4:** whether an informational outcome conflict (failure reported after success) should block an owner's settlement.
- **G-5:** whether `users.manage` may be passed on by someone who isn't a super admin (delegation chains).
- **G-6:** whether Warehouse, Support and Machine operations should see machine sales (`sales.view`) and network revenue on the fleet page.
- **G-7:** whether warehouse staff need customer names and phone numbers on `/warehouse` (fulfilment addresses), or a reduced view.
- **G-8:** product master data fields (FA-16).
- **G-9:** Vercel plan: whether to upgrade for more frequent crons or keep relying on the GitHub workflow.

---

## 16. Closing lists

### 1. Remaining P0
- **V-01:** re-inviting a removed staff member restores their former roles, including super admin. The escalation check and the audit log ignore the resulting roles.

### 2. Remaining P1
- **V-18:** outcome conflicts on `dispensed`, `refunded`, `pending` or `payment_failed` sales can't be resolved, and they block that machine's settlement.
- **V-12:** a stock count reads outside the transaction, so concurrent counts or a sale during a count double-apply.
- **V-02:** the `/agent` conversation pages are gated by role, not permission, which exposes customer PII.
- **V-03:** the dashboard shows orders and customer PII without `orders.view`.
- **Scale:** alert evaluation reads every slot every 5 minutes. That is expensive at 1k machines, and it fails at 10k.
- **FA-08:** there is no typed stock removal (expired, damaged, returned). It is still open.

### 3. Remaining P2
- **V-09:** a machine paused after the customer paid still dispenses.
- **V-11:** a crash in the reversal window, followed by a manual refund, can refund twice.
- **FA-14:** re-open it. A daily job that never ran isn't flagged.
- **Scale:** the fleet page (V-20), search, and the product, slots and catalogue pages read the whole fleet.
- **Audit gaps:** the invite records the requested role, not the resulting one; there is no "before" on legacy-section and disable changes; a staff-initiated owner payout request is unaudited.
- **Untested audit claims:** discount-code audit and role-change "before".
- There is no automated browser test for page gates.
- FA-11 (decommission checklist), FA-12 (machine details editable), FA-13 (replacement workflow), FA-17 (view-as by template).
- The matrix page table is stale and should be regenerated.

### 4. Business decisions
G-1 to G-9 (section 15 G).

### 5. Hardware tests
1. Send the manufacturer letter. Get Q1, Q4, Q7 and Q10 answered in writing.
2. Host inspection: OS, root, serial device, vendor app on the bus (Q7, Q15).
3. Bench read-only: 01H identity, 2AH and 2BH lanes; capture real frames and check the CRCs (Q16).
4. Lane map: run every lane once, empty (Q3).
5. Result clearing: read twice; read after power-cycling; read after another lane runs (Q1, Q2).
6. Power cut mid-run at several points: no double vend, correct review (Q2, Q17).
7. Curtain: 50 drops each of the smallest and thinnest products; count misses (Q4 → S5).
8. Jam and over-current: can a product still drop (Q18)?
9. Host silence: motor stop (Q17), refrigeration behaviour (Q10).
10. Door input (Q9).
11. Then a certification run with the control URL fronting the real machine, recorded to the model. Note V-17: the harness can't tell a real machine from a simulator behind the URL, so a person must attest to it.

### 6. Developer-only tasks
- Fix V-01, V-18, V-12, V-02, V-03, V-09 and V-11 (code changes with regression tests).
- Rework alert evaluation and the fleet-wide page reads.
- Resolve a V-18-stuck settlement that already exists: today this needs a database edit.
- Regenerate the matrix; add browser tests for page gates.
- Set the GitHub Actions secrets, and confirm the Vercel cron plan and deployment.
- Revoke credentials by hand after retiring a machine (until FA-11 is built).
- Any real-hardware integration work, and the Daraja sandbox run.

### 7. Employee-operable workflows (no developer needed, verified at the level stated)
- Invite, re-role, narrow, disable, remove and reset staff within one's own access. **Except re-inviting a former staff member, which is unsafe until V-01 is fixed.**
- Register, commission, pause, resume and retire a machine (with the right permission).
- Slot configuration, prices, machine catalogue and kiosk screen.
- Restock tasks through their lifecycle; single-person stock counts (safe when one person counts at a time).
- Sale review: confirm delivered, start refund, M-Pesa reversal, record a manual refund (for sales in `manual_review` or `paid_vend_failed`).
- Settlement draft, preview and finalize (while no V-18 conflict exists); subscriptions and arrears; owner payout approval.
- Alerts view and resolve; job Run now; audit-log search and export.
- The finance, warehouse and support workspaces within each role's permissions.

### 8. Workflows that need a developer today
- Clearing an outcome conflict on a `dispensed`, `refunded`, `pending` or `payment_failed` sale, and so finalising that machine's settlement (V-18).
- Correcting a slot count corrupted by concurrent counts beyond a fresh recount. A recount fixes the number but leaves the ledger with the extra adjustment.
- Safely re-onboarding a former staff member. Until V-01 is fixed, the old roles have to be stripped in Firestore and in the custom claims first.
- Investigating an unmatched Daraja reversal result (V-11).
- Machine replacement (controller or host swap) and machine detail edits (FA-12, FA-13).
- Anything on real hardware, and any new manufacturer integration.
- Changing cron schedules or enabling jobs (`vercel.json` and GitHub workflow edits).
- Bulk machine or product setup (FA-22).
