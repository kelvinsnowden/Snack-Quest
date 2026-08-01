# Disaster Recovery (§ Production Readiness Closure Sprint, Phase 9)

Honest status as of this writing: **Firestore data has no automated
backup.** This document explains why, what's already protected, what
manual safety nets exist today, and exactly what a human operator needs
to do — no developer required — to recover from every realistic
failure mode. It also gives the one paid upgrade that unblocks *real*
automated backups, and why this platform hasn't already made that
decision for you.

## 1. What's already protected, with no action needed

| Asset | Protection | Recovery |
|---|---|---|
| Application code | Git history on GitHub | `git clone` + redeploy |
| Deployments | Vercel keeps every past deployment | Instant rollback in the Vercel dashboard — no rebuild, no code change needed |
| Accidental full-database deletion | Firestore **delete protection** (enabled — see §4) | N/A — the delete API call itself is refused by Firestore until protection is turned off again |

Vercel's rollback covers "we shipped a bug" instantly. It does **not**
cover "we lost the database" — that's the actual subject of this
document.

## 2. What is NOT protected today, and why

`snack-quest-os` is currently on Firestore's **free (Spark) plan**
(`freeTier: true`, confirmed via the Firestore Admin API). This is a
deliberate choice already documented elsewhere in this codebase (see
`.env.local.example`'s note on why Vercel Blob was chosen over Firebase
Storage — same reasoning applies here): every Firestore backup
mechanism Google offers — scheduled backups, point-in-time recovery,
and even a one-off manual export — writes to Cloud Storage, and Cloud
Storage requires the **Blaze (pay-as-you-go)** plan. There is no way
to back up Firestore data at all, automated or manual, without that
upgrade first. This is a Google Cloud billing decision, not a code
change — it isn't something this session's service-account credential
can or should make on the business owner's behalf.

**Until Blaze is enabled, a total loss of the `snack-quest-os`
Firestore database is unrecoverable beyond whatever manual exports
exist locally** (see §3). This is the single biggest production-risk
gap this platform has. Closing it is a business decision (add a
payment method to the GCP project), not an engineering one — see §6
for the exact steps.

## 3. Manual backup tooling (works today, zero extra cost)

Two scripts exist for exactly this gap — they talk to Firestore/Auth
directly through the Admin SDK this app already uses everywhere, so
they need no Cloud Storage bucket and incur no extra Google Cloud
cost:

```bash
# One tenant's Firestore data → a local JSON file
npm run backup:export -- --businessId=snack-quest

# Every Firebase Auth user (staff + creators) → a local JSON file
npm run backup:export-auth-users
```

Both write into `backups/` at the project root (git-ignored — **never
commit these**, they contain real customer PII, financial records, and
— for the Auth export — password hashes). Run them:

- **Before** anything risky: a bulk data migration, a provider
  cutover, a schema change.
- **Periodically** (weekly is reasonable at current scale) as a manual
  safety net until §6 is done.
- Store the resulting files somewhere encrypted (a password manager
  that supports file attachments, an encrypted drive) — not a plain
  folder on a laptop.

**What `backup:export` deliberately leaves out:** the business's
`integrationSecrets` (Daraja/Whatchimp/Jumia/Meta credentials). A
backup file is not an appropriate place for provider credentials,
encrypted or not. Restoring from a backup means re-entering those
through **Admin → Settings → Integrations**, same as any new tenant's
first-time setup — see §5, step 4.

**What it covers:** every tenant-scoped collection listed in
`firestore.rules` (orders, customers, wallets, conversations, staff,
inventory, suppliers, referrals, creators, financial ledgers — see
`scripts/exportBusinessData.mjs`'s `TENANT_COLLECTIONS` for the exact,
current list) plus each linked Firebase Auth identity for that
business's staff and creators.

## 4. Firestore delete protection (already enabled)

`deleteProtectionState` was set to `DELETE_PROTECTION_ENABLED` on the
`snack-quest-os` Firestore database as part of this phase — a free,
zero-downside safeguard against the single worst failure mode
(someone/something calling `gcloud firestore databases delete` or the
equivalent API call). This does **not** protect against data loss from
within the app (a bad migration script deleting documents, for
example) — only against deleting the database itself.

## 5. Full recovery runbook

Work through these in order — later steps depend on earlier ones being
done first.

1. **Code.** `git clone` the repository, `git checkout` the deployed
   branch. If GitHub itself is unavailable, any team member's local
   clone is a full copy of history.
2. **Redeploy.** Connect the repository to a new (or existing) Vercel
   project. Vercel builds and deploys from the `snack-quest-next/`
   directory automatically once linked.
3. **Environment variables.** Every platform-wide credential this app
   needs at runtime lives in Vercel's project environment variables,
   **not** in this repository (see `.env.local.example` for the full,
   current list with explanations). These must be restored from
   wherever the business owner keeps a secure copy — a password
   manager, a secrets vault — **before** the redeployed app can serve
   real traffic. At minimum: `FIREBASE_ADMIN_PROJECT_ID`,
   `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY`,
   `BLOB_READ_WRITE_TOKEN`, `SECRET_ENCRYPTION_KEY` (§ Phase 8 — losing
   this one specifically means every already-encrypted integration
   credential in Firestore becomes permanently undecryptable, so it
   deserves its own secure backup, separate from the rest),
   `SENDGRID_API_KEY`, `AFRICAS_TALKING_API_KEY`, `CRON_SECRET`, and
   the `WHATCHIMP_*`/`INTERNAL_AGENT_API_KEY` shared secrets. If any of
   these were never backed up outside of Vercel and Vercel's own
   project is what was lost, they are unrecoverable and must be
   re-generated/re-obtained from each provider's dashboard.
4. **Firestore data.** If Blaze + scheduled backups are enabled (§6),
   restore from the most recent automated backup via the Firestore
   console. Otherwise, restore whatever manual `backup:export` JSON
   files exist (§3) by writing each collection's documents back with
   the Admin SDK, preserving document IDs. There is currently no
   pre-built restore script — writing one is templated directly off
   `scripts/exportBusinessData.mjs`'s collection list, reading the
   export JSON, and calling `.doc(id).set(data)` per record; this was
   deliberately not pre-built (see §7) since restores are rare, high-
   stakes, and should be reviewed record-by-record rather than run
   blind. Once data is back: re-enter every integration's credentials
   via **Admin → Settings → Integrations** (deliberately excluded from
   the export, see §3).
5. **Firebase Auth users.** Restore from the most recent
   `backup:export-auth-users` JSON via
   [`auth.importUsers()`](https://firebase.google.com/docs/auth/admin/import-users)
   — it accepts the same password-hash format the export produces, so
   users keep their existing passwords rather than needing a mass
   reset. Without a backup, every user (including the super_admin who
   would otherwise re-provision everyone else) must be recreated via
   `npm run seed:staff` for the first admin, then that admin
   re-invites everyone else through the Admin Portal.
6. **Vercel Blob (uploaded images).** No backup mechanism exists for
   this today — see §7's open gap. Product/box images can be
   re-uploaded from source files if the business kept originals
   elsewhere; there is no way to recover a lost original that only
   ever existed as an upload.

## 6. Closing the biggest gap: enabling real Firestore backups

This requires the business owner (not a developer) to:

1. In the [Google Cloud Console](https://console.cloud.google.com),
   open the `snack-quest-os` project → Billing, and link a payment
   method (upgrades the project from Spark to Blaze). Blaze has a
   generous free-usage tier identical to Spark's limits — this
   platform's current traffic is very unlikely to incur real charges
   from Firestore usage itself; the cost that becomes possible is
   backup storage, which is small relative to the value of not losing
   the business's order/customer/financial history.
2. In the Firestore section of the console, open **Backups** and
   create a schedule (daily is reasonable; Firestore also supports
   weekly with longer retention). No code change is required — this
   is a database-level setting, and every Gateway/repository in this
   codebase keeps working unchanged.
3. Optionally, enable **Point-in-time recovery** for a finer recovery
   granularity than daily backups (recovers to any point within the
   last few hours, not just the last daily snapshot).

Once this is done, update the "What is NOT protected today" section
above.

## 7. Known, accepted gaps

- **Vercel Blob has no backup/versioning story in this platform.**
  Uploaded images are not covered by anything in this document. If
  this becomes a real business risk (e.g., product photography that
  can't be easily re-shot), the fix is a periodic script downloading
  every blob under `BLOB_READ_WRITE_TOKEN`'s store to local/cold
  storage — not built, since no such requirement has surfaced yet
  (§ "don't build for hypothetical requirements").
- **No pre-built Firestore restore script**, only export (§5, step 4).
  Deliberate: restores are rare and high-stakes enough that a human
  should review what's being written back rather than a script
  blindly replaying a JSON dump — especially across a gap where new
  orders/payments may have occurred between the backup and the
  incident.
- **RTO/RPO today:** code + config, roughly 30–60 minutes (redeploy +
  restoring environment variables from wherever they're securely
  kept). Firestore data: **RPO is however old your last manual
  `backup:export` run is — potentially infinite if none was ever run.**
  This is the honest number this document exists to change, via §6.
