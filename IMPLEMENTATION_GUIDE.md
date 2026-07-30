# Snack Quest — Implementation Guide

**Source of truth:** `TECHNICAL_DESIGN_DOCUMENT.md` (27 sections, complete
and frozen). This guide does not re-argue any architectural decision —
where you need the *why*, the section reference (e.g. "TDD §4") points at
it. This guide is the *how*: file creation order, exact commands,
per-phase task lists, validation steps, rollback procedures, and a
Definition of Done for each of the TDD §23 migration phases.

**How to use this guide:** work top to bottom, one phase at a time. Do not
start a phase whose "Blocked on" line lists an unresolved TDD §26 open
question. Each phase's task list is meant to be turned directly into
tickets — copy the checklist items as-is.

---

## 0. One-time setup (before Phase 0)

Do this once, not per phase.

**Accounts/access needed:**
- Firebase console access with project-creation permission (for the
  staging + production projects, TDD §17)
- Vercel project access (or permission to create one)
- DNS access for `snackquests.shop` (to eventually attach Vercel domains)
- `gh` CLI or repo access for PRs against `claude/snack-quest-portal-rebuild-dtxsql`
  or whatever branch this work lands on

**Local tooling:**
```bash
node --version   # confirm Node 20+ (matches current server.ts engine target)
npm install -g firebase-tools
firebase --version
npm install -g vercel
vercel --version
```

**Create the Firebase projects** (TDD §17, staging + production):
```bash
firebase login
firebase projects:create snack-quest-staging --display-name "Snack Quest (Staging)"
firebase projects:create snack-quest-prod --display-name "Snack Quest (Production)"
```
In the Firebase console for each project: enable **Authentication**
(Email/Password provider, and Google if pursuing that option per TDD
§6), enable **Firestore** (production mode, not test mode — rules are
deny-by-default per TDD §9 from day one), enable **Storage**.

**Do not** touch `firebase-applet-config.json` / `firebase-blueprint.json`
in the current repo — those are unused scaffolding (confirmed in
`ARCHITECTURE_REPORT.md`); the new project's config is generated fresh in
Phase 0.

---

## Phase 0 — Groundwork

**Objective (TDD §23):** Next.js/Firebase skeleton, zero user-facing
change. **Blocked on:** nothing — start immediately.

### File creation order

1. Scaffold the app:
   ```bash
   npx create-next-app@latest snack-quest-next \
     --typescript --app --tailwind --eslint --src-dir=false --import-alias "@/*"
   cd snack-quest-next
   ```
2. Install dependencies:
   ```bash
   npm install firebase firebase-admin @tanstack/react-query zod
   npm install -D vitest @vitejs/plugin-react firebase-tools \
     @firebase/rules-unit-testing @playwright/test
   ```
3. `firebase init` — select **Firestore**, **Emulators** (Auth, Firestore,
   Functions, Storage), **Storage**. This creates `firebase.json`,
   `.firebaserc`, `firestore.rules` (stub), `firestore.indexes.json`
   (stub), `storage.rules` (stub).
4. Create, in this order (each depends on the previous existing):
   - `lib/firebase/admin.ts` — Admin SDK init, reads
     `FIREBASE_ADMIN_*` env vars, **never** imported outside
     `services/`, `repositories/`, `app/api/`, `proxy.ts` (TDD §17
     rule — treat this as a lint-enforced boundary, not just convention;
     see step 8 below).
   - `lib/firebase/client.ts` — client SDK init, `NEXT_PUBLIC_FIREBASE_*`
     vars only.
   - `types/` — one file per collection in TDD §8's schema table
     (`types/user.ts`, `types/creatorProfile.ts`, `types/campaign.ts`,
     `types/campaignSubmission.ts`, `types/withdrawal.ts`,
     `types/walletTransaction.ts`, `types/order.ts`,
     `types/questSubmission.ts`, `types/notification.ts`,
     `types/auditLog.ts`, `types/customerProfile.ts`,
     `types/staffProfile.ts`). Each type mirrors the "Key fields" column
     in TDD §8 exactly.
   - `repositories/creatorRepository.ts` — the **reference
     implementation** every later repository is reviewed against (TDD
     §4). Methods: `findById(uid)`, `create(data)`,
     `update(uid, partial)`. Uses `lib/firebase/admin.ts` only.
   - `services/creatorDashboardService.ts` — the **reference Service**.
     Calls `creatorRepository` only, contains the first real business
     rule (e.g. "dashboard shows the 3 most recent submissions").
   - `firestore.rules` — write the **full** ruleset from TDD §9 now,
     against the full schema, even though only `creatorProfiles` has real
     data yet (TDD §9's explicit reasoning for not deferring this).
   - `firestore.indexes.json` — leave empty; populated in Phase 1 as real
     queries surface missing-index errors from the emulator.
   - `components/ui/*` — port verbatim from
     `src/components/common/*` in the current repo (`StatCard.tsx`,
     `FormField.tsx`, `PillTabs.tsx`, `Modal.tsx`, `StatusBadge.tsx`,
     `EmptyState.tsx`, `ErrorState.tsx`, `DataTable.tsx`,
     `ChartWrapper.tsx`, `Toast.tsx`, `CommandPalette.tsx`). Add
     `'use client'` to each (all use hooks). Fix import paths only — no
     logic changes.
   - `lib/format.ts`, `lib/attributionTracker.ts`,
     `lib/affiliateService.ts` — port verbatim from
     `src/lib/attributionTracker.ts`, `src/services/affiliateService.ts`,
     `src/components/creator/format.ts` in the current repo.
5. Copy design tokens: append the `@theme` block from the current
   `src/index.css` (the `creator-*` tokens) into the new project's
   `app/globals.css`, plus the `@custom-variant dark (&:where(.dark, .dark *));`
   line (the dark-mode fix from this session's Creator Portal
   stabilization work) — without this line, `dark:` variants silently do
   nothing, exactly the bug found and fixed earlier this session.
6. Start the emulator suite and confirm it boots:
   ```bash
   firebase emulators:start
   ```
7. Write the first rules unit tests (TDD §21):
   ```bash
   npm install -D mocha
   # tests/rules/creatorProfiles.test.ts — a creator can read their own
   # profile, cannot read another's, an unauthenticated request is denied
   npx firebase emulators:exec --only firestore "npx mocha tests/rules/**/*.test.ts"
   ```
8. Enforce the Admin-SDK-never-in-client-bundle rule (TDD §17)
   mechanically, not just by convention: add an ESLint rule
   (`no-restricted-imports` targeting `firebase-admin` and
   `@/lib/firebase/admin` from any file containing `'use client'`, or a
   dedicated plugin like `eslint-plugin-boundaries`) so a violation fails
   CI instead of being caught in review.

### Validation checklist
- [ ] `firebase emulators:start` boots with no errors (Auth, Firestore,
      Storage, Functions all report ready)
- [ ] `npx firebase emulators:exec --only firestore "npx mocha tests/rules/**/*.test.ts"` — all rules tests pass
- [ ] `npm test` — `creatorDashboardService`/`creatorRepository` unit
      tests pass (Repository mocked in the Service test, per TDD §4)
- [ ] A bare Next.js page rendering `components/ui/StatCard` looks
      pixel-identical to the current Vite build's `StatCard` (manual
      screenshot diff)
- [ ] `npm run build` succeeds with zero type errors
- [ ] ESLint import-boundary rule fires (test it: temporarily import
      `firebase-admin` in a `'use client'` file, confirm lint fails, then
      revert)

### Rollback
Trivial — no production traffic touched. Delete the branch/local project
if abandoned.

### Definition of Done
- [ ] Emulator suite runs locally for every engineer on the team
- [ ] `firestore.rules` covers every collection in TDD §8, with passing
      unit tests for each
- [ ] Reference Service/Repository pair (`CreatorDashboardService` /
      `CreatorRepository`) merged and documented as the pattern to copy
- [ ] Shared UI components ported with no visual regression
- [ ] CI runs typecheck + build + rules tests + unit tests on every PR

---

## Phase 1 — Creator Portal + creator-auth (pilot)

**Objective (TDD §23):** first real, user-facing slice; proves the whole
pattern end to end. **Blocked on:** TDD §26 open question 1 (WhatsApp OTP
vs. Firebase phone auth) — get a decision before starting the sign-up
flow specifically; everything else in this phase can start in parallel.

### File creation order

1. **Repositories** (extend the Phase 0 pattern):
   `repositories/campaignRepository.ts`,
   `repositories/withdrawalRepository.ts`.
2. **Services:**
   `services/campaignService.ts` (methods: `listActive()`,
   `submitDeliverable(creatorId, campaignId, payload)`,
   `review(submissionId, decision, adminId)`),
   `services/withdrawalService.ts` (methods: `request(creatorId, amountKes, phone)`,
   `decide(withdrawalId, decision, adminId)` — this is the single state
   machine that replaces the current three competing implementations,
   TDD §8's stated reason for the unified collection).
3. **Auth plumbing:**
   - `app/api/auth/session/route.ts` — `POST` (ID token → session cookie
     via `createSessionCookie`), `DELETE` (clear + `revokeRefreshTokens`).
   - `proxy.ts` — hostname rewrite for `creators.snackquests.shop`
     only in this phase (other hostnames pass through unmodified);
     `verifySessionCookie` check; redirect to `/sign-in` if missing,
     `/unauthorized` if present but wrong role.
   - Auth-triggered creation of `creatorProfiles/{uid}`: either a Cloud
     Function on `functions/onCreatorSignUp.ts` (Auth `onCreate` trigger)
     or a write inside the sign-up Route Handler — pick one (TDD doesn't
     mandate; the Cloud Function is slightly more robust against a client
     that signs up but never completes a client-side "create profile"
     call). Document the choice in `docs/adr/0003-authentication.md`
     (TDD §25).
4. **Route Handlers:**
   `app/api/campaigns/[id]/submissions/[subId]/review/route.ts`,
   `app/api/withdrawals/[id]/decision/route.ts` — both call their
   Service, both admin-session-gated (verify role claim, not just
   session presence).
5. **UI, ported from the current repo's `src/components/creator/`:**
   copy `views/*.tsx` (`DashboardView`, `EarningsView`, `PaymentsView`,
   `CampaignsView`, `ContentView`, `AnalyticsView`, `ReferralsView`,
   `AchievementsView`, `ProfileView`, `ResourcesView`, `SupportView`),
   `CreatorShell.tsx`, `WithdrawModal.tsx`, `SubmitDeliverableModal.tsx`,
   `nav.ts`, `format.ts` verbatim — these already read from a typed API
   client and render correctly; only `creatorApi.ts`'s implementation
   changes (below).
6. **Rewrite `creatorApi.ts` → thin client wrappers:** reads call the
   Firebase client SDK directly against `creatorProfiles`,
   `campaignSubmissions`, `withdrawals` (the TDD §2 principle 8
   exception, rules-enforced); writes call the Route Handlers from step
   4, or — for `campaigns`/submission creation, which don't need a
   transaction — a direct rules-governed client create.
7. **Rewrite `CreatorAuthGate.tsx`:** replace every call currently
   hitting `/api/v1/creator-auth/*` with Firebase client SDK calls
   (`createUserWithEmailAndPassword`, `signInWithEmailAndPassword`,
   `sendEmailVerification`, `sendPasswordResetEmail`) followed by the
   session-cookie exchange (step 3). Keep the existing screen flow
   (register → verify → onboarding → dashboard) — only the calls
   underneath change, per this guide's "don't repeat the UI work" scope.
8. **Events (TDD §11):** `events/withdrawalApproved.ts`,
   `events/campaignSubmissionReviewed.ts` — Cloud Function handlers
   triggered on `withdrawals`/`campaignSubmissions` writes, calling
   `NotificationService` (stub is fine for this phase — real
   WhatsApp/email wiring can lag behind the core flow).
9. **Feature flag (TDD §20):** wrap the new sign-in/dashboard entry point
   behind `creator-v2`; default off in production, on in
   staging/preview.

### Commands
```bash
# local dev against emulators
firebase emulators:start --import=./emulator-data --export-on-exit &
npm run dev

# seed one test creator for manual QA (script, not a UI action):
node scripts/seed-test-creator.ts   # writes to the Auth + Firestore emulators only
```

### Validation checklist
- [ ] Sign up a real test creator through the UI → confirm
      `creatorProfiles/{uid}` exists in the emulator/Firestore console
      with the expected default fields
- [ ] `sendEmailVerification` fires (check the emulator's Auth UI inbox)
- [ ] Sign out, sign back in with the same credentials → session cookie
      set, dashboard loads with real data (not the previous hardcoded
      `45000`-style stub numbers — confirm the numbers match what's on
      the `creatorProfiles` document)
- [ ] Browse campaigns → submit a deliverable → confirm a
      `campaignSubmissions` doc appears with `creatorId` matching the
      signed-in uid
- [ ] As a **different** signed-in creator, attempt to read the first
      creator's `creatorProfiles` doc directly via the client SDK →
      confirm Firestore denies it (rules test, not just UI absence)
- [ ] Request a withdrawal → call `GET` on the dashboard again → confirm
      it appears in **that same creator's** withdrawal history (the
      specific bug this phase fixes — verify by checking the
      `withdrawals` document's `ownerId` field matches, not just that
      *something* returned)
- [ ] Hit `POST /api/withdrawals/[id]/decision` unauthenticated → expect
      `401`; hit it as a `creator`-role session → expect `403`
- [ ] `WithdrawalApproved` event fires a notification (check emulator
      Functions logs) within a few seconds of approval, and the approval
      API response itself returned well before that (confirms async
      decoupling, TDD §11)
- [ ] Playwright suite (port the existing `chromium`-driven smoke test
      pattern from this session) passes: sign-up → dashboard → withdraw
      → see it in history

### Rollback
- `creator-v2` flag → off. Instant, no deploy.
- If the flag alone isn't sufficient (e.g. a data-integrity issue),
  revert `creators.snackquests.shop`'s DNS to the current Express
  deployment — the two systems run on separate infrastructure until this
  step, so this is safe at any point before DNS is actually switched.

### Definition of Done
- [ ] Every item in the validation checklist passes in staging
- [ ] `WithdrawalService` and `CampaignService` have unit test coverage
- [ ] `creators.snackquests.shop` DNS switched to the new deployment
- [ ] `creator-v2` flag at 100% in production for 1 week with no
      elevated error rate before removing the flag and the old Express
      creator-auth routes' traffic
- [ ] Old Express creator-auth routes (`server.ts:12365-12630` and the
      `/api/v1/affiliate/*`, `/api/v1/creator/*` routes this portal used)
      confirmed receiving zero traffic (access logs) before deleting them

---

## Phase 2 — Marketing site

**Objective:** validate multi-hostname routing with a second, no-auth
portal. **Blocked on:** nothing; can run in parallel with Phase 1.

### File creation order
1. `services/orderService.ts`, `repositories/orderRepository.ts`.
2. `app/api/orders/route.ts` — `POST`, validates pricing/credit
   redemption server-side (never trusts a client-supplied total).
3. `app/(marketing)/layout.tsx`, `page.tsx`, `products/`, `checkout/`.
4. Port `components/marketing/*` from the current
   `src/components/marketing/*` (public-facing pieces only — the admin
   campaign/marketing tools belong to Phase 5, not this phase).
5. Extend `proxy.ts`'s hostname map to include the apex domain
   `snackquests.shop` → `(marketing)`.
6. Feature flag: `new-checkout`.

### Validation checklist
- [ ] Every marketing page renders with no visual regression vs. the
      current `PublicWebsitePortal.tsx`
- [ ] Guest checkout (no session) completes and creates a real `orders`
      document via `OrderService`, not a direct Firestore write from the
      client (verify: attempt a direct client-SDK write to `orders`,
      confirm rules deny it per TDD §9)
- [ ] `snackquests.shop` and `creators.snackquests.shop` both resolve
      correctly from the same deployment (confirms the hostname-rewrite
      middleware handles more than one host correctly, not just the one
      hardcoded in Phase 1)

### Rollback
DNS-level; `new-checkout` flag as an additional, faster lever
specifically for the checkout write path.

### Definition of Done
- [ ] `snackquests.shop` DNS switched to the new deployment
- [ ] `new-checkout` flag at 100% for 1 week, no elevated error rate

---

## Phase 3 — Admin portal + RBAC

**Objective:** close the current zero-route-protection gap
(`ARCHITECTURE_REPORT.md` §4.1). **Blocked on:** TDD §26 open question 3
(Google Workspace SSO?) — decide before building the staff sign-in
screen; the permission-matrix work below can proceed either way.

### File creation order
1. `types/staffProfile.ts` (already created in Phase 0 — confirm it
   matches the final permission-matrix shape before building on it).
2. `lib/auth/roles.ts` — the permission-matrix helper, ported conceptually
   from `RoleManager.tsx`'s existing logic in the current repo.
3. `app/api/admin/staff/route.ts` — `POST`, **super_admin session only**,
   sets custom claims via Admin SDK. This is the *only* place a staff
   account or role is ever created — confirm there is no other code path
   that can set the `admin`/`super_admin` claim.
4. Per-domain Service/Repository pairs, **in traffic-priority order**
   (instrument current admin usage first if possible, per TDD §26
   question 4, rather than guessing): start with whichever of
   orders/CRM is highest-traffic today.
5. `app/admin-portal/layout.tsx` (Sidebar/TopBar shell, ported from
   `src/components/layout/Sidebar.tsx` / `TopBar.tsx`), then one
   `page.tsx` per screen as its Service/Repository pair lands.
6. Extend `proxy.ts`: `admin.snackquests.shop` → `(admin)`, with a
   **stricter** check than other portals — role must be
   `admin`/`super_admin`, not just "any session."
7. Feature flag: `new-auth`, scoped **per staff account** (not global) to
   support the gradual cutover below.

### Commands
```bash
# create the first super_admin manually (one-time, not via the API — the
# API requires an existing super_admin to create the next one, so the
# very first one is set directly via the Admin SDK in a one-off script)
node scripts/bootstrap-first-super-admin.ts --email=you@snackquests.shop
```

### Validation checklist
- [ ] Unauthenticated request to any `/api/admin/*` or admin-portal
      Server Component route → 401 / redirect to sign-in
- [ ] A `customer`- or `creator`-role session hitting an admin API →
      403
- [ ] A `staffProfile` with `role: 'admin'` (not `super_admin`) attempts
      `POST /api/admin/staff` → 403 (only super_admin can create staff)
- [ ] Every admin mutation (order status change, wallet adjustment,
      campaign approval) produces a corresponding `auditLogs` entry —
      spot-check 3 different mutation types, not just one
- [ ] Migrate 2-3 real staff accounts first (via `new-auth` flag scoped
      to their `uid`s), confirm their daily workflow (whatever it is —
      order processing, CRM) works end to end before widening the flag

### Rollback
DNS-level for the whole portal; `new-auth` flag scoped per-account for a
single staff member's cutover if only one person hits a problem, without
reverting everyone.

### Definition of Done
- [ ] Every finding in `ARCHITECTURE_REPORT.md` §4 re-verified closed via
      the rules/integration tests from TDD §21
- [ ] All staff accounts migrated to `new-auth`, flag removed
- [ ] `admin.snackquests.shop` DNS switched
- [ ] Old Express admin routes confirmed zero traffic before deletion

---

## Phase 4 — Customer Quest Center

**Objective:** first real customer authentication (none exists today).
**Blocked on:** TDD §26 open questions 1 and 2 (WhatsApp OTP decision,
customer identity method) — **do not start file creation until both are
answered.** The task list below assumes email/password was chosen; revise
if the decision differs.

### File creation order (once unblocked)
1. `repositories/walletRepository.ts` (extends `customerProfiles` +
   `walletTransactions`).
2. `services/walletService.ts` (the sole writer of `walletBalanceKes`,
   always paired with a `walletTransactions` write in one transaction —
   TDD §4's specific example of why this separation exists).
3. `services/rewardsService.ts`, `services/referralService.ts`.
4. Auth-triggered `customerProfiles/{uid}` creation, same pattern as
   Phase 1's `creatorProfiles`.
5. `app/quest-portal/layout.tsx` + screens, porting
   `src/components/quest-center/*`'s UI (note: converge its
   currently-duplicated empty-state/status-pill patterns onto
   `components/ui/*` while porting, per TDD §14 — don't port the
   duplication along with the component).
6. Extend `proxy.ts`: `quest.snackquests.shop` → `(quest)`.
7. Feature flag: `wallet-engine-v2`.

### Validation checklist
- [ ] A direct client-SDK write attempting to change
      `customerProfiles.walletBalanceKes` is rejected by rules (this is
      the concrete test for TDD §9's field-level `diff().affectedKeys()`
      rule — write the test before writing the feature, not after)
- [ ] Every `WalletService` credit/debit call produces exactly one
      paired `walletTransactions` entry — write a Service-level unit test
      asserting this invariant, not just a manual check
- [ ] Quest submission → review → credit flow works end to end, with the
      `QuestCompleted` event (TDD §11) firing the credit asynchronously

### Rollback
DNS-level; `wallet-engine-v2` flag specifically for the wallet-write path.

### Definition of Done
- [ ] `quest.snackquests.shop` DNS switched
- [ ] `wallet-engine-v2` flag at 100% for 1 week, no elevated error rate,
      no wallet/ledger discrepancies found in a manual reconciliation
      spot-check

---

## Phase 5 — Remaining admin domains

**Objective:** migrate whatever wasn't already covered incrementally in
Phase 3 — inventory, accounting, marketing tools, monitoring, reporting,
integrations, audit log viewer. **Blocked on:** TDD §26 question 4 (is
every domain still needed?) — confirm scope before starting each domain,
not just once at the start of the phase.

This phase is many repetitions of the same template rather than one
linear task list — copy this per domain:

### Per-domain template
1. Confirm the domain is still in scope (TDD §26 Q4) before starting.
2. `types/<domain>.ts`, `repositories/<domain>Repository.ts`,
   `services/<domain>Service.ts` — following the Phase 0 reference
   implementation's shape exactly.
3. `app/admin-portal/<domain>/page.tsx` + components, ported from the
   current repo's corresponding folder (`src/components/inventory/`,
   `src/components/accounting/`, etc.).
4. Route Handlers only for what TDD §10 says needs one (transactions,
   secrets, derived data) — default to direct client-SDK reads governed
   by rules for everything else (TDD §2 principle 8).
5. Rules for the domain's collection(s), with unit tests, added to the
   existing `firestore.rules` (don't create a second rules file).
6. Validation: the domain's core workflow (e.g. inventory: receive a
   purchase order and confirm stock updates) works end to end against the
   emulator, then against staging.
7. Definition of Done for this domain: staff using it in production for
   1 week with no regressions reported, old Express route(s) for this
   domain confirmed zero traffic, then deleted.

### Overall Phase 5 Definition of Done
- [ ] Every domain confirmed in-scope has been migrated per the template
      above
- [ ] `server.ts` has zero remaining active routes (grep access logs to
      confirm, don't assume)

---

## Phase 6 — Cutover

**Objective:** decommission Express entirely. **Blocked on:** Phases 1-5
all at Definition-of-Done.

### Task list
1. Confirm zero traffic to any `server.ts` route for at least 7
   consecutive days (access logs, not a point-in-time check).
2. Remove `server.ts`, `express`, `cors`, `helmet`,
   `swagger-ui-express`, and other Express-only dependencies from
   `package.json`.
3. Remove `.data/` and its `.gitignore` entry.
4. Remove every feature flag (TDD §20) that existed only to gate this
   migration's cutover (`creator-v2`, `wallet-engine-v2`, `new-checkout`,
   `new-auth`) — leave `rewards-engine` or any flag still actively used
   for ongoing rollout control.
5. Update `package.json` scripts to the Next.js/Vercel defaults (`next
   dev`, `next build`, `next start`), removing the `tsx server.ts` /
   `esbuild server.ts` build step entirely.
6. Delete the four now-fully-superseded planning documents' TODO status —
   `ARCHITECTURE_REPORT.md`, `MIGRATION_PLAN.md`,
   `TECHNICAL_DESIGN_DOCUMENT.md`, this guide — do **not** delete the
   files themselves; mark them historical (e.g. an added "Status:
   Migration complete as of [date]" line) since TDD §25 treats this kind
   of document as a durable record, not a checklist to discard once done.

### Validation checklist
- [ ] `npm run build` produces only Next.js output, no `dist/server.cjs`
- [ ] `package.json` has no Express/Vite-SSR dependencies
- [ ] Every ADR (TDD §25) referenced by this migration is written and
      committed to `docs/adr/`

### Rollback
None needed if every prior phase's Definition of Done was met — this
phase is cleanup, not a risk point.

### Definition of Done
- [ ] All checklist items above complete
- [ ] Team sign-off that no further Express-era code paths remain

---

## Appendix A: Definition of Done template (for any new domain/feature not covered above)

- [ ] Types defined, matching TDD §8's schema conventions (audit fields,
      soft delete, schema version where applicable)
- [ ] Repository implemented, no business logic in it
- [ ] Service implemented, unit-tested with a mocked Repository
- [ ] Firestore rules written and unit-tested (owner-or-admin read,
      shape-validated create, server-only status transitions)
- [ ] Route Handler(s) added only where TDD §10's criteria are met, each
      thin (auth check → Service call → response)
- [ ] UI ported/built using `components/ui/*` primitives, no new
      one-off component where an existing one fits
- [ ] Feature flag added if this is a cutover from an existing Express
      path (TDD §20)
- [ ] Playwright smoke test covering the primary user flow
- [ ] Deployed to staging, manually verified, then to production behind
      the flag at a low rollout percentage before 100%

## Appendix B: Environment variables checklist

Public (`NEXT_PUBLIC_*`, safe in client bundle):
```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_APP_ID
```
Private (server-only, Vercel environment variable store, never
committed):
```
FIREBASE_ADMIN_PROJECT_ID
FIREBASE_ADMIN_CLIENT_EMAIL
FIREBASE_ADMIN_PRIVATE_KEY
DARAJA_CONSUMER_KEY
DARAJA_CONSUMER_SECRET
DARAJA_PASSKEY
SENDGRID_API_KEY
WHATCHIMP_API_KEY   # or successor if TDD §26 Q1 changes the WhatsApp path
```
Set per-environment in Vercel (Development/Preview/Production), pointing
Preview at the staging Firebase project and Production at the production
one (TDD §17).

## Appendix C: Common pitfalls (add to as they're actually hit)

- Forgetting `@custom-variant dark (&:where(.dark, .dark *));` in the new
  project's global CSS — every `dark:` utility silently does nothing
  without it (found and fixed this session in the current codebase; the
  new project starts from a fresh Tailwind config, so this is easy to
  drop by accident).
- Importing `firebase-admin` (even transitively, via a shared util file)
  into anything reachable from a `'use client'` component — caught by the
  Phase 0 ESLint rule if it's actually wired in; verify it fires before
  relying on it.
- Writing a Firestore query in a Server Component "just this once" instead
  of adding a Repository method — always add the method, even for a
  one-off read; the discipline only holds if it holds every time (TDD
  §2, principle 8).
- Cloud Storage for Firebase cannot be provisioned on a Spark (free)
  plan project — confirmed against `snack-quest-8c354` during Phase 0.
  This is a billing-account upgrade decision for a human to make, not
  something to work around. Any feature needing file upload must go
  through `repositories/storageRepository.ts`'s `StorageRepository`
  interface (TDD §16), which currently resolves to
  `UnavailableStorageRepository` and throws a typed
  `StorageUnavailableError` — never reach for `adminStorage`/
  `clientStorage` directly in a Service or component.
- Standing up a new withdrawal-like flow that doesn't go through
  `WithdrawalService` — this is exactly how the current codebase ended up
  with three competing implementations; there should never be a second
  place that writes to the `withdrawals` collection.
