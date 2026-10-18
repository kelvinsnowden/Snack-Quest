# Snack Quest Cloud — performance engagement, October 2026

Branch `claude/youthful-thompson-gjkppc`. Everything below was measured, not estimated, unless it says "estimate".

## A. Executive summary

**Why it was slow.** Three things, in order of size:

1. **Every signed-in page and every API call waited ~350 ms for Firebase Auth** before doing anything else. The session check asked Firebase Auth "is this session still live?" (`verifySessionCookie(cookie, true)`), and from Vercel's Cape Town region that call takes ~350 ms (1.4 s on a fresh server). Measured from `cpt1` on 2026-10-18.
2. **Pages made database calls one after another.** A Firestore round trip from `cpt1` takes ~47 ms. The owner portal chained 16–20 of them per page, the machine list 26, the admin home 33. That alone is 0.75–1.5 s per page, before Auth.
3. **Pages read thousands of records to show a handful of numbers.** The admin home read ~5,200 records (it ran every record check on every visit); each owner page read 1,800–2,700 (it loaded the whole product catalogue and the business's 200 pending recommendations once per machine, and four times over on the machine page).

Firestore and the regions are **not** the problem: 47 ms per round trip is what a same-continent database should cost. No migration is needed.

**What changed.** The Auth answer is remembered for up to a minute on page views (changes still check every time; app revocations are immediate), the waiting chains are mostly parallel now, and the heavy pages read a fraction of what they did. On a realistic dataset, estimated server time in production falls from 1.1–1.9 s to 0.2–0.4 s for the worst pages (table in C). The sign-in pages also download a third less JavaScript (347 KB → 234 KB compressed).

**Also fixed:** the build. Branch builds were being killed for running out of memory on Vercel's 8 GB build machines whenever a stale webpack cache was restored, which would also have blocked a production deploy of any large change.

**Ready for the next stage?** Yes for performance. Before charging owners, two items in F need a decision from you: confirming the M-Pesa callback secret is set in production (F1), and timeouts on payment-provider calls (F2). Neither was changed here, because both touch payments.

## B. Architecture assessment (verified)

| Part | What it is |
|---|---|
| Hosting | One Next.js 16 app (`snack-quest-next/`), webpack build, on Vercel Hobby, functions in `cpt1` (Cape Town). `proxy.ts` maps `admin.`, `creators.`, `api.`, `status.` subdomains onto route trees; it does no I/O. |
| Database | Firestore through the Admin SDK only; the browser never reads Firestore (its Firebase setup now creates Auth only). No realtime listeners. ~111 collections, 98 repositories, 156 composite indexes, rules deny by default. |
| Portals | Shop (23 pages), admin (110), owner/partner (16), warehouse (8), finance (11), agent/support (4), creator (11), machine kiosk screen. |
| API | 355 route files: vending 193, admin 87, cron 13, machine API v1 10, webhooks 10 (Daraja ×7), others. Every staff route checks a permission (`tests/security/routeGuard.test.ts`). |
| Sessions | Firebase session cookies per portal (`sq_staff_session`, `sq_partner_session`, `sq_creator_session`), verified in `lib/auth/verifySession.ts`, plus a Firestore read of the account. |
| Payments | STK push → `/api/webhooks/daraja/[businessId]` → idempotent ledger (`webhookEventRepository.recordIfNew`, deterministic ids) → reconciliation crons (`reconcile-stk-payments`, `reconcile-vending-transactions`) and a 5-minute GitHub Actions fast recovery. |
| Integrations | Daraja, SendGrid/SMTP, TextSMS, Whatchimp (WhatsApp), Meta/TikTok events, Vercel Blob, Google Sheets, Upstash (1.5 s timeout), manufacturer HTTP (10 s timeout). |
| Scheduled work | 11 daily Vercel crons (Hobby allows daily only) and a GitHub Actions workflow every 5 minutes. |

**Risks found:** M-Pesa callbacks are accepted unverified when a business has no webhook secret configured (F1); most provider calls have no timeout (F2); production diagnostics are thin on Hobby (1-hour log retention, no per-route timings) (F7).

**Duplication:** little dead code (one unused component, an unused `@tanstack/react-query` dependency). The real duplication was repeated reads within one page — the same machine read up to 15 times, the same catalogue read once per machine — now largely removed on the pages measured.

## C. Before and after

**How it was measured.** `scripts/perf/` (see its README): a dataset of 20 machines (two owners with 5 each), 30 slots each, 150 products, 20,000 sales over 90 days, 90 days of rollups, 60 days of traffic, 200 recommendations, 40 alerts, 300 restocks and technician jobs; production builds of the code before (`f60a9dc`) and after, against the Firestore emulator, every Firestore round trip traced. Five loads per page; medians of the warm loads.

**Production estimate** = waiting steps × 47 ms (measured from `cpt1`) + 350 ms for the Auth check before, + 0 after on a remembered session (≈300 ms on the first view each minute). It leaves out time Firestore spends returning large result sets, so pages that read a lot gain more than shown.

| Page | Records read | Waiting steps | Est. server time in production |
|---|---|---|---|
| Admin home | 5,176 → 126 | 33 → 5 | ~1.9 s → ~0.24 s |
| Machine list | 992 → 992 | 26 → 7 | ~1.6 s → ~0.33 s |
| Machine detail (admin) | 471 → 471 | 9 → 6 | ~0.77 s → ~0.28 s |
| Machine sales | 225 → 225 | 5 → 5 | ~0.59 s → ~0.24 s |
| Restock planning | 1,543 → 1,523 | 5 → 4 | ~0.59 s → ~0.19 s |
| Maintenance | 23 → 23 | 2 → 2 | ~0.44 s → ~0.09 s |
| Technicians | 367 → 87 | 4 → 4 | ~0.54 s → ~0.19 s |
| Alerts | 64 → 64 | 3 → 3 | ~0.49 s → ~0.14 s |
| Warehouse machines | 1,694 → 1,674 | 6 → 5 | ~0.63 s → ~0.24 s |
| Technician: my jobs | 403 → 123 | 6 → 6 | ~0.63 s → ~0.28 s |
| Support: conversations | 3 → 3 | 2 → 2 | ~0.44 s → ~0.09 s |
| Owner: dashboard | 2,462 → 997 | 20 → 4 | ~1.29 s → ~0.19 s |
| Owner: machines | 2,252 → 482 | 19 → 4 | ~1.24 s → ~0.19 s |
| Owner: machine detail | 1,832 → 642 | 16 → 8 | ~1.1 s → ~0.38 s |
| Owner: sales | 2,730 → 1,265 | 20 → 6 | ~1.29 s → ~0.28 s |
| Owner: inventory | 2,252 → 482 | 19 → 4 | ~1.24 s → ~0.19 s |
| Owner: cameras | 2,252 → 482 | 18 → 4 | ~1.2 s → ~0.19 s |
| Owner: locations | 2,252 → 482 | 18 → 4 | ~1.2 s → ~0.19 s |
| Owner: payouts | 2 → 2 | 3 → 3 | ~0.49 s → ~0.14 s |

The owner rows come from a second run on the final code: both builds measured again, one after the other, on a fresh copy of the same dataset (the old build's record counts matched the first run exactly). Each owner list page was also checked to show exactly that owner's five machines and no one else's.

**JavaScript downloaded by the browser** (all `<script>` files a page's HTML loads, summed, gzip-compressed; `scripts/perf/jsWeight.mjs`; same two builds):

| Page | Before | After |
|---|---|---|
| Staff sign-in (`/admin/login`) | 347 KB (1,134 KB uncompressed) | 234 KB (752 KB) |
| Owner sign-in (`/partner/login`) | 348 KB (1,136 KB) | 234 KB (754 KB) |
| Shop home (`/`, control) | 226 KB | 225 KB |

**Network costs measured from `cpt1`** (preview deployment, `/api/internal/latency-probe`, 2026-10-18 21:42 UTC): Firestore document read ~47 ms warm (5 sequential reads 232–235 ms), small query 52–72 ms, 5 reads in parallel 58 ms; first Firestore call on a fresh server 805 ms; Firebase Auth user lookup 344–370 ms warm, 1,366 ms first.

**Limitations.** Production page timings and Web Vitals (LCP) could not be read: the Hobby plan keeps runtime logs for 1 hour and per-route timings and Speed Insights queries need Observability Plus; this environment's network policy also blocks direct requests to snackquests.shop. On the browser side only JavaScript size was measured, and only the sign-in forms were changed; rendering and hydration time were not measured. The emulator answers in about a millisecond, so absolute local times are not production times; the comparison relies on round-trip counts and the measured latency.

## D. What changed

| Area | Change | Files |
|---|---|---|
| Sessions | Signature checked locally; Firebase Auth's "still live" answer remembered per session for `SESSION_REVOCATION_CHECK_SECONDS` (default 60, `0` = every request) on page views and reads; every non-GET API call asks every time; the Auth call runs alongside the account read. Disabling a staff member stamps `users/{uid}.sessionsRevokedAt` so it is immediate. | `lib/auth/verifySession.ts`, `lib/auth/{session,partnerSession,creatorSession}.ts`, `services/{staff,partner,creator}AuthService.ts`, `services/staffManagementService.ts`, `repositories/userRepository.ts`, `types/user.ts` |
| Owner portal | Stock health from the machine's own slots and assortment (`getStockHealth`, sharing one availability rule with the customer catalogue); recommendations read once per page, and not at all for machine cards (cards never showed them); one rollup read for all four windows (`summarizeOwnedMachine`); per-machine rollups read in parallel. The overview loads in two parallel rounds instead of four. The machines, inventory, cameras and locations pages load just the cards (`getMachineCards`) instead of the whole overview with its money totals. | `services/ownerIntelligenceService.ts`, `services/ownerPortalService.ts`, `services/machineAssortmentService.ts`, `app/partner/(protected)/{machines,inventory,cameras,locations}/page.tsx` |
| Sign-in forms | The browser's Firebase setup creates only Auth. It also created a Firestore client that nothing used, which put the Firestore SDK into every sign-in form. | `lib/firebase/client.ts` |
| Admin home | Record-check summary kept 5 minutes (labelled "as of"); panel streams behind Suspense; traffic visitor files read in parallel. | `components/admin/MachineNetworkPanel.tsx`, `app/admin/(protected)/page.tsx`, `services/businessAnalyticsService.ts` |
| Machine list | Deployed-stock value reads machines' slots in parallel (was 20 in a row). | `services/networkIntelligenceService.ts` |
| Machine page | One loading round instead of three; agent manifest fetch alongside, with a 5 s timeout. | `app/admin/(protected)/vending/[machineId]/page.tsx`, `services/machineAgentUpdateService.ts` |
| Technicians | My jobs reads only assigned jobs; the assignment page reads the open tasks' jobs by id. | `services/technicianJobService.ts`, `app/admin/(protected)/vending/technicians/page.tsx` |
| Intelligence | Location and product intelligence read machines in parallel. | `services/{location,product}IntelligenceService.ts` |
| Restock | Fleet read once. | `services/restockCommandCenterService.ts` |
| Build | Vercel builds skip webpack's persistent cache; `webpackMemoryOptimizations`. | `next.config.ts` |
| Observability | Firestore tracer: in production logs one `firestore.slow` line (collection, size, ms) for a read over 1.5 s or 1,000 documents; in measurement runs records every round trip. Preview-only latency probe. | `lib/observability/firestoreTrace.ts`, `lib/firebase/admin.ts`, `app/api/internal/latency-probe/route.ts` |
| Measurement | Seed, page timer, latency proxy, README. | `scripts/perf/` |

No Firestore indexes, data migrations, API contracts or payment code changed. The one new field (`users.sessionsRevokedAt`) is optional and only written when staff are disabled.

## E. Testing

- New tests: the owner summary for four windows equals one call per window, and stock health equals the full catalogue classification (`tests/services/ownerIntelligenceService.test.ts`); the list pages' machine cards equal the overview's cards, and an unknown owner is refused (`ownerPortalService.test.ts`); disabled and revoked sessions are refused, app revocation is immediate even with a remembered answer (`tests/services/staffAuthService.test.ts`); disabling stamps the account (`staffManagementService.test.ts`); jobs found by task id, open jobs only (`technicianJobService.test.ts`); the tracer counts each round trip once and passes failures through (`tests/lib/firestoreTrace.test.ts`).
- Full suite on the final code, against the Firestore and Auth emulators: 435 test files passed; 4,502 tests passed, 1 skipped (the skip is already on `main`). An earlier full run had one failure, in a test added here that set up a restock without its slot; the test was fixed and the run repeated.
- Typecheck (`tsc --noEmit`) passes. Lint (`npm run lint`) has 0 errors; its 2 warnings are in files this work doesn't touch. The production build (`next build --webpack`) passes, with peak memory 3,969 MB on a 2-core machine (Vercel's build machines have 8 GB).
- Browser check against the emulators: signing in through the staff form refuses a wrong password with the form's message, accepts the right one, sets the session cookie and opens the admin home, which renders with the cached "Record checks (as of …)" line.
- Cross-owner isolation: unchanged code paths still go through `assertPartnerOwnsMachine`; the new `summarizeOwnedMachine` is only called with machines already proven to be the owner's (`partnerService.listMachines` or `assertPartnerOwnsMachine`), and the existing "another owner's machine is refused" test passes.

## F. Outstanding issues, by business impact

**Blockers before charging owners**

1. **M-Pesa callbacks without a secret are accepted unverified** (`lib/webhooks/verifyDarajaWebhookRequest.ts`). Customers never see the payment request id, so forging one needs a guess, but the protection should not depend on that. Action: confirm `npm run secure:daraja-webhook` has been run for the production business and the STK callback URL registered with Safaricom carries the secret. Then consider refusing unverified callbacks in production (a payment-behaviour change: needs your approval).
2. **Payment and messaging providers have no timeouts** (Daraja STK push/query, B2C, SendGrid, TextSMS, Whatchimp). A stuck provider holds the request until the function's maximum duration. Proposed: 10–15 s timeouts on Daraja calls, relying on the existing reconciliation for anything left unknown. Needs your approval (payment behaviour).

**Improvements, in order**

3. **Cold starts.** A fresh server pays ~0.8 s on its first Firestore call and ~1.4 s on its first Auth call; with little traffic, many visits land on a fresh server. Options: have the existing 5-minute GitHub Actions job also request one lightweight portal route; or Vercel Pro.
4. **Owner machine cards** still add up 30 days of daily totals per machine to show revenue (~480 records for five machines). Fine at this size; a running 30-day total per machine would make it constant.
5. **Restock planning and warehouse machines** still read ~1,500–1,700 records per view (each machine's 14 days of sales, slots and assortment). Precompute at-risk slots when stock or sales change, or on a frequent schedule.
6. **Fleet summaries** older than 15 minutes are rebuilt during the machine-list request (~1,000 reads). They need a frequent refresh job, which Hobby's daily-only crons cannot run (GitHub Actions or Pro can).
7. **Production visibility.** Hobby keeps 1 hour of logs and no per-route timings. Pro (1 day of logs, Observability) or a log drain would let you see which page or query slows down; the new `firestore.slow` lines are ready for it.
8. **Unbounded reads that will grow:** open alerts are read business-wide and filtered in memory (`alertRepository.listOpen`); a machine's settlements and a conversation's messages have no limit.
9. **Client side:** the checkout form (2,275 lines) and kiosk screen (1,639 lines) are the largest client components and were not measured; rendering time (LCP) needs Speed Insights data from production.

## G. Next-stage roadmap

| Order | Workspace | What | Depends on |
|---|---|---|---|
| 1 | All | F1 and F2 decisions; deploy this branch | — |
| 2 | Owners | Subscription invoices and payment status on the owner portal; notifications for low stock and offline machines | 1 |
| 3 | Customer service | A case record (complaint, refund, escalation) linked to transaction and machine, with owner, status, priority and history — today support works only through conversations | 1 |
| 4 | Warehouse | Precomputed at-risk slots (F5); batch/expiry capture at restock; physical count reconciliation | 1 |
| 5 | Technicians | Parts used and repeat-fault tracking on maintenance jobs | 3 for escalations |
| 6 | Management | Frequent refresh job (F6), log drain or Pro (F7), keep-warm (F3), report exports off the request path | — |

## H. Deploying and rolling back

1. Merge the pull request. Vercel builds production from `main` (no build cache now; ~4 minutes).
2. Check: sign in to admin, open the admin home, a machine page and the machine list; sign in as an owner and open the dashboard and a machine. Watch the Vercel logs for errors and `firestore.slow` lines.
3. Optional setting: `SESSION_REVOCATION_CHECK_SECONDS` (default 60). Set `0` to ask Firebase Auth on every request, as before.
4. **Rollback:** in Vercel, promote the previous production deployment (instant), or revert the merge commit. Nothing to undo in the database: `users.sessionsRevokedAt` is optional and ignored by the old code.
