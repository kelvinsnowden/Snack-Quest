# Migration Plan: Vite/Express → Next.js App Router + Firebase Auth + Firestore

Answers the question directly: **yes, this is feasible**, and a substantial
share of the UI layer survives close to unchanged. The backend does not —
its entire data-access pattern (in-memory object + `.find()`/`.push()`/
`saveDb()`) is incompatible with Firestore by construction, so every route
handler's *body* needs rewriting even where its *behavior* is preserved.
This document identifies what moves as-is, what's rewritten, and a proposed
order. **No migration work has started — this is planning only, per your
instruction to wait for approval.**

Numbers below are measured, not estimated: 99 component files, 74 of them
using React hooks (`useState`/`useEffect`), 53 with `fetch('/api/...')`
calls inline in the component rather than through a shared client, and 358
total API endpoints (323 registered directly in `server.ts`, 35 across the
`src/modules/*` layer).

---

## 1. What migrates with little to no change

**Presentational/UI components — the majority of the 99 files.** Buttons,
cards, layout primitives, `common/*` (Modal, StatusBadge, EmptyState,
ErrorState, DataTable, ChartWrapper, StatCard, FormField, PillTabs, Toast),
and the view components built this session under `creator/views/*` are
plain React function components. Next.js App Router still renders React —
these port with two mechanical changes: add `'use client'` (74 of 99 files
use hooks or browser APIs, so most need it) and update relative import
paths if the folder structure changes. No logic rewrite.

**Design system.** `src/index.css`'s `@theme` block (the `creator-*` tokens
added this session), the Tailwind v4 setup, and the overall visual language
transfer directly — Next.js supports Tailwind v4 the same way, just via
`@tailwindcss/postcss` instead of `@tailwindcss/vite` (a one-line config
swap, not a rewrite).

**Framework-agnostic business logic.** `src/services/affiliateService.ts`
(`calculateCreatorTier`, fraud scoring), `src/lib/export.ts`,
`src/lib/attributionTracker.ts`, currency/date formatters — pure TypeScript
functions with no Express/DOM coupling. Copy verbatim.

**Type definitions** (`src/types/*`) — portable as-is, and should become
the seed for Firestore document typing.

**Product/UX decisions already made this session** — the Creator Portal's
information architecture, the real-vs-"coming soon" section split, the
design tokens, the honest empty states — none of that work is lost; it's
the target UI a migrated data layer would sit behind.

---

## 2. What must be rewritten (not ported)

**Routing/portal detection.** `domainResolver.ts`'s client-side
`window.location.hostname` sniffing becomes real Next.js `middleware.ts`
performing hostname-based rewrites into route groups (e.g.
`app/(creators)`, `app/(admin)`, `app/(quest)`, `app/(marketing)`). This is
a structural replacement, not a port — the *decision logic* (which hostname
maps to which portal) carries over conceptually, the *mechanism* doesn't.

**The 358-endpoint API surface.** Every Express handler needs to become a
Next.js Route Handler (`app/api/.../route.ts`) or a Server Action, using
Web-standard `Request`/`Response` instead of Express's `req`/`res`. Handler
*bodies* that only do validation/response-shaping can often be adapted
quickly; handlers that touch `db.*` (nearly all of them) need their data
access rewritten from array operations to Firestore reads/writes — see
next point. This is the single largest line-count item in the migration.

**The entire data layer.** `dbRepository.ts`'s in-memory object +
`saveDb()` → Firestore. Not a swap-in-place: every `db.customers.find(...)`,
`.filter(...)`, `.push(...)` becomes an async Firestore query
(`getDocs`/`getDoc`/`addDoc`/`updateDoc`), and anywhere multiple
collections are mutated together for consistency (e.g. approving a
submission credits a wallet *and* logs a transaction *and* writes a
notification — `server.ts:10448-10476`) needs a Firestore transaction or
batched write to keep the same atomicity guarantees. This touches
essentially every backend file, not just the creator domain.

**Authentication, all three schemes.** Firebase Authentication replaces
creator-auth, staff JWT, and customer localStorage alike — but each needs
its own design work, not a mechanical swap:
- *Creators:* email/password maps cleanly to Firebase's email/password
  provider. The current WhatsApp-OTP verification step has no Firebase
  equivalent — Firebase's phone auth uses SMS + reCAPTCHA, not WhatsApp.
  Decision needed: adopt Firebase phone auth (changes the UX), or keep a
  custom WhatsApp-OTP step as a Cloud Function that only *unlocks* a
  Firebase custom claim once verified (keeps current UX, more custom code).
- *Staff/Admin:* move to Firebase email/password + a `role` custom claim,
  set server-side only (via Admin SDK), checked in middleware — this
  directly fixes the "no password check" and "no route protection"
  findings from `ARCHITECTURE_REPORT.md`.
- *Customers:* today there is no real authentication to preserve (a
  fabricated object written to `localStorage`) — this is net-new design,
  not a migration. Needs a decision (email/password? phone? guest
  checkout preserved alongside optional accounts?) before it can be planned
  in detail.

**Data-fetching pattern across components.** The 53 components calling
`fetch('/api/...')` directly need to change what they call — either a
Firestore client SDK read (for anything covered by permissive security
rules) or a Route Handler/Server Action (for anything needing
server-side validation, like wallet credits). This is a per-component
edit, not a single shared shim, because the right choice (direct Firestore
read vs. server-mediated write) differs per call site.

**Session handling across subdomains.** Nothing today does this — the
"session" is a plain object in `localStorage` per portal, not shared, not
secure. Real work: Firebase session cookies (via Admin SDK
`createSessionCookie`), scoped to `.snackquests.shop` so they're visible to
every subdomain, validated in `middleware.ts` on each request. This is the
piece that actually answers "should creators stay logged in navigating
between `creators.snackquests.shop` and `snackquests.shop`" — yes, with
this mechanism, no with what exists today.

**Firestore Security Rules for the whole schema**, not just creators —
customers, orders, wallets, campaigns, submissions, staff/roles, audit
logs. Needs designing once, up front, not retrofitted collection-by-collection
after the fact (retrofitting rules after data and clients already assume
open access is how you end up shipping a real vulnerability).

---

## 3. Proposed migration order

**Phase 0 — Groundwork (no user-facing change).**
Scaffold the Next.js App Router project. Set up a real Firebase project
(the current `firebase-applet-config.json` is placeholder/unused — a real
project needs provisioning). Install Firebase Admin + client SDKs
correctly. Port design tokens, `common/*` primitives, and types. Design the
*complete* Firestore schema and security rules up front (informed by
`ARCHITECTURAL_BLUEPRINT.md`'s existing data model), even though only a
slice gets built first — this avoids the retrofit risk above.

**Phase 1 — Creator Portal + creator-auth (pilot slice).**
Rationale: smallest self-contained domain, the one most recently and
deeply audited this session (three competing withdrawal implementations,
identity-model inconsistencies — all documented in
`CREATOR_PORTAL_TECH_DEBT.md`), and a domain where a clean migration
*fixes* known bugs rather than just relocating them. Migrate
`creator_accounts` → `creators/{uid}` Firestore documents keyed by Firebase
Auth UID (this alone eliminates the three-competing-identity-system
problem for creators). Migrate campaigns + submissions. Reuse nearly all of
`src/components/creator/*` UI; rewrite only `creatorApi.ts`'s data-fetching
layer. Stand up `middleware.ts` hostname routing and session cookies for
this one subdomain first, as a proof of the pattern before committing to
all five.

**Phase 2 — Marketing/public site.**
Mostly static content, no auth. Low risk, validates that subdomain routing
and shared layout work for a second host before the harder portals.

**Phase 3 — Admin portal + RBAC.**
Highest security stakes given the current findings (zero real route
protection, no password check). Migrate staff/roles to Firebase custom
claims; this phase is where the middleware route-guard pattern needs to be
airtight, since it's protecting write access to everything else.

**Phase 4 — Customer Quest Center.**
Requires the customer-identity decision above before detailed planning is
possible. Reuses a fair amount of `quest-center/*` UI once that decision is
made, but the auth layer underneath is net-new, not ported.

**Phase 5 — Remaining admin domains** (CRM, orders, inventory, accounting,
marketing tools, monitoring, reporting, integrations, audit logs — the
bulk of the 358 endpoints, concentrated here). Largest remaining surface,
lowest urgency relative to auth; can proceed screen-by-screen since these
domains are largely independent of each other and of the auth work above.

**Phase 6 — Cutover.** DNS/hosting swap to the Next.js app, decommission
`server.ts`.

---

## 4. Risk notes

- Phases 1-3 each involve a real (if scoped) auth redesign — none of them
  are "swap the backend, keep everything else," despite the UI reuse.
- The WhatsApp-OTP-vs-Firebase-phone-auth decision (Phase 1) has product/UX
  consequences (SMS costs, reCAPTCHA friction) worth deciding deliberately,
  not defaulting into.
- Firestore's per-document read model changes some existing patterns that
  assume cheap in-memory full-table scans (e.g. admin list/filter/search
  views) — those may need composite indexes or restructured queries, not
  just a client swap.
- This plan does not include a time estimate — the honest answer depends on
  decisions not yet made (which auth methods per portal, how much of the
  Phase 5 admin surface is in scope for v1) more than on line counts.

Awaiting your approval before starting Phase 0.
