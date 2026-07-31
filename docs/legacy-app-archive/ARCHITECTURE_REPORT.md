# Snack Quest — Architecture Report

Prepared in response to an audit brief describing a Next.js + Vercel +
Firebase Authentication multi-portal architecture. This report establishes,
with cited evidence, what is actually running today, what appears to have
been intended or scaffolded toward, the gap between them, and the concrete
findings that matter regardless of which direction is chosen next. No code
was changed to produce this report.

---

## 1. What's actually running today

**Runtime.** A single Node process. `package.json`:
```json
"dev": "tsx server.ts",
"build": "vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs",
"start": "node dist/server.cjs"
```
`server.ts` (~12,650 lines) is a hand-rolled Express app. In dev it creates a
Vite dev server and mounts it as middleware (`server.ts:12639-12643`,
`app.use(vite.middlewares)`); in production it serves the built static
assets (`express.static(distPath)`) and calls `app.listen(PORT, '0.0.0.0', ...)`
(`server.ts:12652`). There is no Next.js (`next` is not a dependency, no
`next.config.*`, no `app/`/`pages/` directory, no `middleware.ts`) and no
Vercel config (no `vercel.json`).

**Frontend.** A Vite + React 19 SPA. `src/main.tsx` mounts a single React
tree with `createRoot(...).render(<App />)`. All five "portals" are one
JavaScript bundle; which portal renders is decided client-side by
`src/lib/domainResolver.ts` reading `window.location.hostname` (plus a
`?portal=` query-param / `localStorage` override for local development) —
not server-side/edge middleware.

**Backend structure.** Two layers coexist:
- The original monolith: all business logic (CRM, orders, inventory,
  accounting, the entire creator-auth + affiliate-campaign system) lives
  directly in `server.ts`, present since the very first commit
  (`80ef67c`, "initialize Snack Quest platform foundation").
- A partial extraction: `src/api/*` (middleware, docs, webhooks, config) and
  `src/modules/*` (auth, payments, orders, customers, wallet, referrals,
  **creators**, notifications, inventory, analytics) were added together in
  one later commit (`8b589e3`, "feat: implement security stack and update
  domain") whose own message scopes it as adding *"helmet, cors, and
  rate-limiting middleware"* and Swagger docs — not a business-logic
  migration. That commit changed `server.ts` by only 116 lines (just enough
  to mount the new router) and left the ~12,000-line monolith otherwise
  untouched. `src/modules/creators/creatorService.ts` returns hardcoded
  stub wallet numbers regardless of which creator is looked up, and (before
  this session) had zero callers anywhere in the pre-existing frontend.

**Data layer.** Not Firestore, not any SQL database. `src/api/repositories/dbRepository.ts`
manages a single in-memory JS object, persisted to `.data/db.json` on disk
via `saveDb()`. Collections like `creator_accounts`, `customers`, `orders`,
`affiliate_withdrawals` are plain arrays in that object, mutated with
`Array.find`/`.push`/`.filter`.

**Authentication — three separate, uncoordinated schemes:**

| Portal | Mechanism | Where |
|---|---|---|
| Creator | Register → WhatsApp OTP → login (password or magic-link) against a `creator_accounts` array | `server.ts:12365-12630`, prefix `/api/v1/creator-auth/*` |
| Customer | Guest/ID-based session (`selectedCustomerId` in React state), no password at all | `src/context/AppContext.tsx`, `src/components/portals/CustomerQuestPortal.tsx` |
| Staff/Admin | Email-only lookup issuing a real JWT | `src/api/routes/authRoutes.ts`, called via `AppContext.login()` |

None of these are Firebase Authentication.

---

## 2. Firebase's actual footprint: present, not wired in

- `firebase` is a listed dependency (`package.json`) and `src/lib/firebase.ts`
  calls `initializeApp`/`getAuth`/`getFirestore` — but I grepped every
  `.ts`/`.tsx` under `src/` for `from '.*lib/firebase'`: **zero importers**.
  The file's module-load side effect (`testConnection()`, an ad hoc
  Firestore ping) never runs because nothing pulls the module in.
- No Firebase Auth SDK function is called anywhere in the codebase —
  `signInWithEmailAndPassword`, `createUserWithEmailAndPassword`,
  `onAuthStateChanged`, `signInWithPopup`: zero matches, client or server.
- `firestore.rules`, `firebase-applet-config.json`, `firebase-blueprint.json`
  exist at the repo root but aren't referenced by any running code path.
- The one place `firebase-adminsdk@...` appears (`server.ts:576-587`) is
  **hardcoded seed data for an admin dashboard widget**
  (`IntegrationCenter.tsx`'s "Firebase Storage & Auth: connected" status
  card) — decorative demo content, not a real integration.

**Conclusion:** Firebase was scaffolded (likely from whatever template this
project originated from — the `assets/.aistudio/` directory suggests an AI
Studio starting point) but never adopted. It is dead weight in the
dependency tree, not an active or partially-migrated system.

---

## 3. What the codebase's own history suggests was intended

Reading the commit sequence as a narrative:
1. **`80ef67c`** — a complete, working monolith ships: server.ts owns
   everything, custom auth, in-memory DB.
2. **`0b45c73`, `dcc5d4b`** — incremental fixes and a frontend engineering
   handbook (`CLAUDE.md`, later deleted) whose stated scope explicitly
   excludes backend/API architecture from a frontend engineer's remit and
   says to *"assume these systems already exist... never replace working
   code unnecessarily."*
3. **`8b589e3`** — a security-hardening pass adds `helmet`/`cors`/rate
   limiting/idempotency/structured logging/a JWT middleware module
   (`src/api/middleware/auth.ts`), and, apparently as a demonstration of the
   new pattern, scaffolds a `src/modules/*` layer with a few new routes
   (including the sparse, stub `creators` module). Nothing was migrated off
   the monolith; the new JWT middleware was never actually wired onto any
   route (see §4).

Read this way, `src/modules/*` looks like an **in-progress security/tooling
initiative that stalled before covering the real business logic**, not
evidence of an intended Next.js/Firebase rewrite. I found nothing in the
repository itself — no design doc, no Next.js scaffolding, no Firebase Auth
call anywhere — that corroborates the Next.js + Vercel + Firebase
architecture described in the audit brief. It's possible that brief
describes a genuinely desired *future* direction that simply hasn't been
started, or that it was written against a different project. I can't
determine which from repository evidence alone — that's a call only you can
make, which is why I stopped and asked rather than guessing.

---

## 4. Concrete findings that matter regardless of that decision

These are real, verified problems in the *current* system — worth knowing
whether the path forward is "harden what exists" or "migrate to Firebase":

1. **The JWT auth middleware is built but wired to nothing.**
   `authenticateJwt` and `requireRole` (`src/api/middleware/auth.ts:11,61`)
   are proper, reasonable implementations — but I grepped for their usage
   as route middleware across the entire codebase and found only their own
   definitions. **Zero API routes are protected by them.** Every admin
   endpoint (`/api/v1/creator-auth/admin/creators`, `/admin/status`, all of
   `/api/v1/admin/creator-campaigns/*`, `/api/v1/admin/affiliate/withdrawals/*`
   — create/approve/reject/pay out), every creator/customer endpoint, is
   reachable by anyone who can reach the server, with no token, no role
   check, no session validation at all.

2. **Staff/admin login has no password check.** `LoginForm.tsx:58-63`'s
   password field is an uncontrolled input with a decorative
   `defaultValue="••••••••••••"` — its value is never read.
   `LoginForm.tsx:13` calls `login(email)` with **only the email**.
   `AppContext.tsx:121-127` POSTs `{ email }` to `/api/v1/auth/login`.
   Server-side (`authRoutes.ts`), that handler matches the email against
   `staff_users` (→ role `admin`) or `customers` (→ role `customer`), and
   if it matches *neither*, **still succeeds** by minting a token for a
   synthesized "demo user" with role `customer`. There is no password,
   OTP, or credential of any kind checked anywhere in this path. The
   login screen's own footer claims *"Secured by PostgreSQL RLS & Service
   Token Auth"* — there is no PostgreSQL anywhere in this stack.

3. **Creator login doesn't check the password either.**
   `server.ts:12491-12524`'s `/api/v1/creator-auth/login` requires a
   non-empty `password` field but only ever compares `login_identifier`
   against `email`/`whatsapp_number` — the password value itself is never
   compared to anything stored. (Confirmed empirically in Milestone 2/3
   work this session: logging in as `kimberly@snackquest.co` succeeded
   with an arbitrary password.)

4. **OTP has a universal bypass code.** `server.ts:12467`:
   `if (otp_code !== record.otp && otp_code !== '123456')` — `123456`
   always verifies, on top of the real per-session demo code the endpoint
   already returns directly in its own response body (`otp_code_demo`,
   `server.ts:12451`).

5. **`session_token` values are opaque, unverifiable strings**
   (`` `token_cr_${creator.id}_${Date.now()}` ``, e.g. `server.ts:12521`) —
   not JWTs, not checked against anything server-side on subsequent
   requests. Nothing currently even sends them back as an `Authorization`
   header; the frontend I built this session persists the `creator` object
   itself to `localStorage` and re-derives identity from `creator.id` in
   query params, which is consistent with how the pre-existing frontend
   behaved but is not a real session mechanism.

6. **Inconsistent identity models cause real data misattribution** — already
   documented in `CREATOR_PORTAL_TECH_DEBT.md` from this branch: three
   different withdrawal endpoints key off `creator_accounts`, `customers`,
   or an unrelated `db.creators` array inconsistently, causing withdrawals
   to silently attribute to the wrong (or a hardcoded fallback) identity.

7. **Customers have no authentication at all** — `CustomerQuestPortal.tsx`
   simulates a session by writing a fabricated customer object straight to
   `localStorage` on any phone number + any 6-digit code entry, no server
   round-trip to establish identity.

None of this was introduced by my work this session — it predates my
involvement and is present on `main`. I'm surfacing it now because a
security/auth audit is exactly the context where it needs to be visible.

---

## 5. Options going forward (not a recommendation — your call)

**A. Harden the current architecture in place.** Wire the existing
`authenticateJwt`/`requireRole` middleware onto every route that needs it,
fix the password/OTP bypass issues, unify the three creator/customer/staff
identity models, replace ad hoc session tokens with real signed JWTs
checked on every request. Stays on Vite + Express + in-memory/JSON DB.
Smallest blast radius, fastest to ship, but doesn't get you Firebase's
managed auth, Firestore's real persistence/security rules, or a Vercel
edge-hosted multi-tenant routing model.

**B. Migrate to Next.js + Vercel + Firebase Auth + Firestore**, matching the
audit brief exactly. This is a full rewrite: replace the SPA+Express
runtime with Next.js App Router, replace the in-memory DB with Firestore
(and design real security rules, per Task 10 of that brief), replace all
three custom auth schemes with Firebase Authentication, replace
`domainResolver.ts`'s client-side hostname check with real Next.js
middleware, and re-point every one of the ~150 API calls across the
frontend at whatever the new data layer looks like. Multi-week scope, not
something to fold into "the next milestone."

**C. Hybrid** — introduce Firebase Auth specifically for creator identity
(replacing the weakest, most bypass-prone piece) while leaving orders,
inventory, CRM, and the Express runtime as-is. Narrower than B, still a
real, multi-step migration with its own data-modeling and session-bridging
work (Task 7 of the brief — cross-subdomain cookies, session sharing — would
need real design work here specifically).

I've made no changes and am holding here for direction.
