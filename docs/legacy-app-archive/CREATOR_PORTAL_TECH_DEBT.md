# Creator Portal — Backend Technical Debt

Found while rebuilding the `creators.snackquests.shop` frontend against the real
backend in `server.ts`. Documented here rather than worked around in the
frontend, since fixing these requires backend decisions this rebuild is not
scoped to make. See the Architecture Review in this branch's PR discussion for
the full `server.ts` vs `src/modules/*` analysis this stems from.

## 1. Three inconsistent withdrawal implementations, none fully correct for `creator_accounts`

The creator identity system (`creator_accounts`, established via
`/api/v1/creator-auth/register|login|magic-login`) has no withdrawal endpoint
that both accepts its identity correctly **and** persists somewhere retrievable:

| Endpoint | Accepts `creator_id` correctly? | Persists & retrievable? |
|---|---|---|
| `POST /api/v1/creators/withdraw` (`src/modules/creators`) | **No** — reads `req.user?.id`, which is never populated for creator-auth sessions (no JWT is issued by that flow); silently falls back to the literal string `'creator-1'` | Yes, to `affiliate_withdrawals`, readable back via `GET /api/v1/creators/dashboard`'s `withdrawal_history` |
| `POST /api/v1/creator/withdraw` (server.ts, singular) | Yes, reads `creator_id` from the request body | **No** — returns a mock `processing` payout object with no persistence; nothing can list it back later |
| `POST /api/v1/affiliate/withdraw` (server.ts) | **No** — expects `customer_id` against the `customers` collection, not `creator_accounts`; a real creator id like `cr_101` won't match, so it silently falls back to `db.customers[0]` (an unrelated person) | Yes, to `affiliate_withdrawals`, readable via `GET /api/v1/affiliate/withdrawals?customer_id=` |

**Frontend decision (current):** the Creator Portal uses
`POST /api/v1/creators/withdraw` + `GET /api/v1/creators/dashboard`'s
`withdrawal_history`, because it's the only pairing where a submitted
withdrawal is retrievable at all. **Known consequence:** every withdrawal
submitted through the real Creator Portal is silently attributed to the
identity `'creator-1'` server-side, regardless of which creator is actually
logged in. A real creator (e.g. `cr_101` / Kimberly Wanjiru) can submit a
withdrawal and it will not appear in *her* history — it accumulates under
`'creator-1'` instead. This is not fixable from the frontend; it needs one of:
- `/api/v1/creators/withdraw` reading `creator_id` from the request body
  (matching `/api/v1/creator/withdraw`'s pattern), or
- issuing a real bearer token from `creator-auth` login/magic-login and wiring
  the existing JWT middleware to it, or
- consolidating onto a single withdrawal implementation tied to
  `creator_accounts`.

## 2. `src/modules/creators` is a stub, not a real implementation

`creatorService.ts`'s `getCreatorDashboard()` looks up the real creator (via
`creator_accounts` or `creators`) but then returns **hardcoded** `wallet` and
`analytics` values (`total_earnings_kes: 45000`, etc.) regardless of which
creator was found — those two fields are demo placeholders, not computed from
the matched record. Only `withdrawal_history` and `campaign_submissions` on
that endpoint are real. Introduced in the "security stack" commit
(`8b589e3`) as an apparent middleware pilot; nothing in the pre-existing
frontend ever called it before this rebuild. Recommend either completing it
properly or removing it — right now it's a second, incomplete creator data
path sitting alongside the complete one in `server.ts`, which is exactly the
kind of duplication this rebuild is otherwise trying to eliminate.

## 3. No scoped notifications endpoint

`GET /api/v1/notifications` returns the entire unscoped `notifications_log`
with no `recipient_id` filter — unusable for a per-creator notification feed
without leaking every other user's notifications. The Creator Portal's
Notifications tab is left as an honest "coming soon" placeholder rather than
querying this endpoint and filtering unsafely client-side (filtering
client-side would still transmit every user's notifications to the browser).
