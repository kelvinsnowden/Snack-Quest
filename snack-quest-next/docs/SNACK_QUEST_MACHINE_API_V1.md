# Snack Quest Machine API — Version 1

**Integration specification for vending machine manufacturers**

| | |
|---|---|
| API version | `1` (every response carries `SQ-API-Version: 1`) |
| Base URL | **Production:** `https://www.snackquests.shop`. **Sandbox:** a separate deployment; its base URL is given to you with your sandbox keys (§2.1) |
| Transport | HTTPS only, JSON bodies (`Content-Type: application/json`, UTF-8) |
| Authentication | HMAC-SHA256 signed requests (§3) |
| Machine-readable spec | [`docs/openapi/machine-api-v1.yaml`](openapi/machine-api-v1.yaml) (OpenAPI 3.0) |
| Reference clients | [`sdk/typescript/snackQuestMachine.ts`](../sdk/typescript/snackQuestMachine.ts), [`sdk/python/snack_quest_machine.py`](../sdk/python/snack_quest_machine.py) — dependency-free, copy them |
| Signing test vectors | [`docs/machine-api/signing-test-vectors.json`](machine-api/signing-test-vectors.json) |
| Integration guide | [`docs/MANUFACTURER_INTEGRATION_GUIDE.md`](MANUFACTURER_INTEGRATION_GUIDE.md) — step by step, with Node, Python and C examples |
| Certification | [`docs/MANUFACTURER_CERTIFICATION.md`](MANUFACTURER_CERTIFICATION.md) — what is verified and how |
| Status | Stable. Changes follow the versioning policy in §10 |

This document is the contract. If your implementation follows it,
your machines can sell through Snack Quest. We don't need any
information from you beyond what this document asks for.

---

## Contents

1. [How Snack Quest works with your machines](#1-how-snack-quest-works-with-your-machines)
2. [Identifiers and environments](#2-identifiers-and-environments)
3. [Authentication and request signing](#3-authentication-and-request-signing)
4. [Request and response conventions](#4-request-and-response-conventions)
5. [Machine endpoints](#5-machine-endpoints)
6. [Commands and the dispense lifecycle](#6-commands-and-the-dispense-lifecycle)
7. [Timestamps and clocks](#7-timestamps-and-clocks)
8. [Webhooks (manufacturer cloud → Snack Quest)](#8-webhooks-manufacturer-cloud--snack-quest)
9. [Event vocabulary](#9-event-vocabulary)
10. [Versioning and change policy](#10-versioning-and-change-policy)
11. [Error reference](#11-error-reference)
12. [Onboarding and certification](#12-onboarding-and-certification)
13. [Worked example: one sale, end to end](#13-worked-example-one-sale-end-to-end)
14. [Implementation checklist](#14-implementation-checklist)

---

## 1. How Snack Quest works with your machines

Snack Quest is a cashless vending platform. The customer pays Snack
Quest on their phone (M-Pesa). **Your machine never handles the
payment for a Snack Quest sale.** Once the payment is confirmed,
Snack Quest instructs your machine to dispense one product from one
slot. Your machine then reports exactly what physically happened.

There are two ways to connect. Both are first-class, and a manufacturer
may use either or both.

| | **Model B: you call Snack Quest** (this document) | **Model A: Snack Quest calls you** |
|---|---|---|
| Who initiates | Your machine or your cloud | Snack Quest's servers |
| How dispenses reach the machine | Your machine polls `GET …/commands` | We call your API |
| How outcomes reach us | `POST …/commands/{id}/status` | Your API response, or your webhook (§8) |
| What you build | A client for this API | An API that we build an adapter for |
| Firewall | Outbound HTTPS only | You expose an endpoint |

Model B needs no inbound connectivity to the machine. If you're
starting fresh, it's the one we recommend.

**Which parts of this document apply to you:**

- **Model B** (your machine or cloud calls Snack Quest): all of it
  except §8. Your machine implements §§3–7 and answers §6 commands.
- **Model A** (Snack Quest calls your API): §3 (you sign webhook
  deliveries), §8 (webhooks), §9 (event vocabulary), §10–12. The API
  Snack Quest calls on your side is described in the integration guide
  (§6 there). You do **not** poll §6.1 or acknowledge commands here —
  Snack Quest sends each vend to your API instead.

For Model A, Snack Quest writes an **adapter** for your API. Your
events still end up in the same vocabulary (§9), your dispenses in
the same lifecycle (§6.4), and your credentials in the same signing
scheme (§3) for anything you push to us.

### The rules that never bend

1. **One paid order dispenses at most once.** Every dispense has a
   unique `commandId`. Treat it as an idempotency key. A command you
   have already executed must never be executed again, whatever
   arrives later.
2. **Report what physically happened, not what you hoped.** If you
   cannot tell whether a product dropped, report `unknown`. Don't
   guess `dispensed`. A human will resolve it, and the customer is
   never charged for something they did not get.
3. **Payment success is not dispense success.** A paid order whose
   dispense fails is refunded. That is why the outcome report (§6.3)
   matters.
4. **Snack Quest owns machine identity.** You can connect only machines
   that Snack Quest staff have registered under your manufacturer. The
   API never creates machines.

---

## 2. Identifiers and environments

| Identifier | Owner | Example | Notes |
|---|---|---|---|
| **Machine code** | Snack Quest | `SQ-MCH-000001` | The machine's address in every URL. Returned by `connect` (§5.1). |
| **Manufacturer machine id** | You | `NV-0001` | Your own id for the unit. You send it to `connect`, and staff enter it when they register the machine. Unique within your manufacturer. |
| **Slot id** | You | `motor-07` | Your own name for a slot. Snack Quest maps it to its internal slot, so you never need to learn our slot codes. 1–64 characters of `[A-Za-z0-9_.:-]`. |
| **Command id** | Snack Quest | `DSP-3F9A1C22` (dispense), `CMD-7B20E4D1` (maintenance) | Unique per command. The idempotency key for executing it. |
| **Event id** | You | `hb-NV0001-000418` | Unique per machine per occurrence. The idempotency key for anything you report (§4.3). 1–128 characters of `[A-Za-z0-9_.:-]`. |

### 2.1 Environments

Every credential and every machine integration belongs to one
environment:

- **`sandbox`**: for building and certifying. Keys start with
  `sqk_test_`. Sandbox machines never sell to real customers.
- **`production`**: live machines. Keys start with `sqk_live_`. These
  are issued only after certification (§12).

**Sandbox and production are separate deployments with separate base
URLs and separate data.** Sandbox keys and sandbox machines exist only
on the sandbox deployment; your production keys and machines only on
production (`https://www.snackquests.shop`). Nothing you do with a
sandbox key can reach a production machine, a real customer or real
money. Point your firmware's base URL, keys and machine registrations
at one environment at a time: the production deployment never
activates, dispenses to or certifies a sandbox machine, so sandbox
testing against the production URL receives no dispense commands.

Within a deployment the key's environment must also match the
machine's: a sandbox key used on a production machine (or the reverse)
is refused with `403 environment_mismatch` before anything is read or
written. A machine that isn't yours at all is `404 machine_not_found`.

---

## 3. Authentication and request signing

Every request is signed with an **integration credential**. Snack Quest
issues it to you as a pair:

- **Key id**: `sqk_test_…` or `sqk_live_…`. Not secret, sent on every request.
- **Secret**: `sqs_…`. **Shown once, when issued.** Store it like a
  password. Never put it in a mobile app, a web page, a log line or a
  URL. Snack Quest stores it encrypted and can't show it again. If
  you lose it, rotate (§3.5).

There are two kinds of credential:

| Kind | Used for |
|---|---|
| `api` | Every `/api/v1/machines/…` endpoint |
| `webhook` | Only `/api/v1/webhooks/manufacturers/{slug}` (§8) |

A key of one kind is refused on the other's endpoints
(`401 wrong_key_kind`). Each can be revoked independently.

An `api` key speaks for **every machine of your manufacturer** in its
environment, or — if you ask for it — for **one machine only**. A
machine-scoped key is the right choice when each unit talks to Snack
Quest directly: a key extracted from one machine can't touch any
other. (§3.6)

### 3.1 Headers

| Header | Value |
|---|---|
| `X-SQ-Key-Id` | Your key id |
| `X-SQ-Timestamp` | Current Unix time in **seconds**, e.g. `1790500000` |
| `X-SQ-Nonce` | A fresh random string for **every** request, 16–64 characters of `[A-Za-z0-9_-]`. 16 random bytes, base64url-encoded, is ideal. |
| `X-SQ-Signature` | `v1=` followed by the lowercase hex HMAC-SHA256 described below |

### 3.2 What you sign

Build this string by joining six parts with a single `\n` (LF, 0x0A),
with no trailing newline:

```
v1
{X-SQ-Timestamp}
{X-SQ-Nonce}
{HTTP method, uppercase}
{path, including query string if any, exactly as sent}
{lowercase hex SHA-256 of the raw request body bytes}
```

- The path starts with `/api/v1/…`, not the host. Include `?query` if
  you send one. Paths have **no trailing slash**: a request to
  `…/heartbeat/` is redirected, and the redirected request no longer
  matches its signature.
- Hash the **exact bytes** you put on the wire. If you pretty-print or
  re-serialize JSON after signing, the signature fails.
- A request with no body (every `GET`, and `POST …/ack`) hashes the
  empty string:
  `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

Then:

```
signature = hex( HMAC-SHA256( key = secret (UTF-8), message = canonical string (UTF-8) ) )
X-SQ-Signature: v1={signature}
```

### 3.3 Test vector

Check your implementation against this vector before you call the
API. The secret is an example and is not a real credential.

```
secret     = sqs_example_secret_do_not_use_0000000000000000
method     = POST
path       = /api/v1/machines/SQ-MCH-000001/heartbeat
timestamp  = 1790500000
nonce      = Q2xhdWRlU2lnbmluZ05vbmNl
body       = {"eventId":"hb-20260927-0001","uptimeSeconds":86400}

sha256(body) = 084a5ffcb9cc2c468810ed359b15ded2b4f8c6a6c7d77ebbc2918cf2b33f55a3

canonical  = "v1\n1790500000\nQ2xhdWRlU2lnbmluZ05vbmNl\nPOST\n/api/v1/machines/SQ-MCH-000001/heartbeat\n084a5ffcb9cc2c468810ed359b15ded2b4f8c6a6c7d77ebbc2918cf2b33f55a3"

X-SQ-Signature: v1=ad94a5230dfeb4e4aeef9e6bf265f35cdb9397b0f2b9bcf91aa8eb92cafed4ca
```

Snack Quest's own test suite verifies this exact vector, so this
document and the server can't drift apart.

### 3.4 Reference implementations

Don't write the signing code from scratch. Copy one of the reference
clients — each is a single file with no dependencies beyond its
language's standard library:

| Language | File | Proven by |
|---|---|---|
| TypeScript / Node 18+ | `sdk/typescript/snackQuestMachine.ts` | every signing vector; full sales against the real server |
| Python 3.8+ | `sdk/python/snack_quest_machine.py` (+ `example_machine.py`) | every signing vector; a full sale over real HTTP |

Both sign every request, retry transient failures with the **same body
bytes** (so the same `eventId`) and a fresh nonce, correct their clock
from the server's `stale_timestamp` answer, and include a correct poll
cycle (`runPollCycle` / `run_poll_cycle`): acknowledge before
dispensing, never dispense after a refused acknowledgement, and keep
outcome reports in an outbox until they are accepted.

**C (embedded controllers).** Any HMAC-SHA256 implementation works,
for example mbedTLS `mbedtls_md_hmac` or wolfSSL `wc_HmacSetKey`. Build
the canonical string in a buffer and sign it. Test against every vector
in `signing-test-vectors.json` before anything else — they cover empty
bodies, query strings, non-ASCII bytes and uppercase hex.

### 3.5 Replay protection, clocks, rotation and revocation

- **Timestamp window.** A request whose `X-SQ-Timestamp` is more than
  **300 seconds** from Snack Quest's clock is refused
  (`401 stale_timestamp`). The error's `details.serverTimestamp` is
  Snack Quest's current time: compute your offset from it, apply it to
  every later request, and retry. The reference clients do this
  automatically. Keep clocks NTP-synchronised anyway (§7).
- **Nonces are single-use.** A nonce is accepted once per key. Sending
  the same signed request twice gets `401 replayed_request`. To
  **retry**, sign again with a new nonce and timestamp. Idempotency
  (§4.3) is carried by the body's `eventId`, not the nonce, so a
  re-signed retry is still safe.
- **Rotation keeps your fleet online.** When Snack Quest rotates a key
  it issues the replacement immediately and the old key **keeps working
  for a grace period** (7 days by default, at most 30). Every response
  to a request signed with the old key carries
  `SQ-Credential-Status: rotating` and `SQ-Credential-Grace-Ends:
  <ISO time>` — alert on those headers and roll the new key out before
  the grace ends (`401 key_expired` afterwards). The new secret is shown
  once, at rotation.
- **Revocation** takes effect within **30 seconds** on every Snack Quest
  server (`401 key_revoked`). Revoke immediately if a secret may have
  leaked.
- **Failed signatures are counted.** More than 120 failed
  authentications a minute from one address is `429
  too_many_auth_failures` for that address. Fix signing against the
  test vectors before retrying.
- Snack Quest never logs secrets or signatures, and never shows a
  secret after it was issued.

### 3.6 One unit, one key

Earlier drafts of this specification allowed a per-machine bearer
credential (`Authorization: Bearer …`). **That scheme is withdrawn**: a
bearer token is replayable by anyone who sees it. A request that carries
only a bearer token is refused with `401 missing_signature`.

When each machine talks to Snack Quest directly and you don't want a
manufacturer-wide secret on every unit, ask for **machine-scoped keys**:
an ordinary signed `api` key that can reach only the one machine it was
issued for (`connect` included — it can announce only that unit). It
uses exactly the signing scheme above, and can be rotated and revoked
per unit.

---

## 4. Request and response conventions

### 4.1 Envelope

Success:

```json
{ "data": { … }, "meta": { "apiVersion": "1", "requestId": "5f0c2a9e-…" } }
```

Error:

```json
{
  "error": { "code": "validation_failed", "message": "Request body does not match the schema", "details": [ { "path": "slots.0.quantity", "message": "Too small: expected number to be >=0" } ] },
  "meta": { "apiVersion": "1" }
}
```

- `error.code` is stable. Branch on it. `error.message` is for humans
  and may change.
- `details` appears on `validation_failed` and lists **every**
  problem, not just the first one.
- Responses carry `Cache-Control: no-store`, `SQ-API-Version: 1` and
  `SQ-Request-Id` (also in `meta.requestId`). **Log the request id** with
  your own records; it is what Snack Quest support needs to find a
  request. You may send your own id for an attempt as
  `X-SQ-Client-Request-Id`; it is echoed back as `SQ-Client-Request-Id`.
- The body is read as raw bytes and must be UTF-8 JSON. The
  `Content-Type` header is not enforced — but send `application/json`.

### 4.2 Status codes and what to do

| Status | Meaning | Retry? |
|---|---|---|
| `200` / `202` | Done / accepted | No |
| `400 invalid_json` | Body isn't UTF-8 JSON | No: fix the client |
| `401` | Authentication failed (§11) | Only after fixing the cause. `stale_timestamp`: correct the offset from `details.serverTimestamp`, re-sign, retry |
| `403` | Authenticated but not allowed (`environment_mismatch`, `manufacturer_suspended`) | No |
| `404` | Machine, command or manufacturer not found *for these credentials* | No |
| `409` | State conflict (expired command, reused `eventId`) | No: see the code. For a command: **do not execute it** |
| `413 payload_too_large` | Body over 256 KB | No: split it |
| `422` | Well-formed but breaks the contract | No: fix the payload |
| `429` | Rate limit (§4.5) | **Yes**, after `Retry-After` seconds, re-signed with a fresh nonce, same `eventId` |
| `5xx` / network error | Snack Quest failed or was unreachable | **Yes**, with backoff, re-signed, same `eventId`. `503` carries `Retry-After` |

Recommended backoff: 1 s, 2 s, 4 s, 8 s … capped at 60 s, with jitter.
Keep unsent reports in durable storage on the machine so they survive
a reboot and are sent when connectivity returns. §11 lists every
`error.code` with its retry rule.

### 4.3 Idempotency and delivery guarantees

Everything you **report** carries an id you choose: `eventId`, or
`reportId` for inventory. It's unique per machine per occurrence.

- **The same id with the same content is a duplicate**: accepted and
  ignored (`accepted: false`, `applied: false`, `result: "duplicate"`,
  or counted in `duplicates`). Treat it as success. So after a timeout
  you **can always resend** — you can't cause a double count, a double
  refund or a double sale.
- **The same id with different content is refused**: an outcome report
  gets `409 idempotency_key_reused`; an event is listed in
  `conflictingEventIds` and not recorded. The first report stands. Ids
  are per occurrence — never reuse one for a different fact.

A good pattern is `{kind}-{manufacturerMachineId}-{monotonic counter}`,
where the counter is persisted across reboots.

Everything Snack Quest **sends you** carries a `commandId`. Execute a
command at most once, whatever you receive later (§6).

**What is guaranteed, precisely.** Networks lose messages, so no
distributed system delivers anything "exactly once", and this one
doesn't claim to. What it does guarantee:

| | Guarantee |
|---|---|
| Your reports → Snack Quest | **At-least-once delivery** (you retry until a 2xx) **+ idempotent processing** (by `eventId`) = each report takes **effect** once. |
| Dispense instruction → your machine | **At most one** dispense command per paid sale — enforced by a transactional claim before any machine is contacted, whatever retries, crashes or concurrent servers do. |
| Dispense execution | Guaranteed at most once **only if you follow §6**: acknowledge first, execute only after a `200`, never execute a `commandId` twice. |
| Money | A sale is refunded only when the dispense **provably** did not happen (never sent, refused, never collected, or reported `failed`). Anything that *may* have dispensed goes to a human, never an automatic refund or retry. |
| Stock | Exactly one stock movement per completed sale (keyed by the sale), checked daily by a ledger reconciliation. |

### 4.4 Forward compatibility

- **Snack Quest ignores unknown request fields.** You may send fields a
  newer version defines, and older servers won't fail.
- **You must ignore unknown response fields.** We add fields without a
  version change (§10).
- Unknown `type` values in `GET …/commands` must be **acknowledged and
  reported `failed`** with `failureReason: "unsupported command"`,
  never silently dropped.

### 4.5 Rate limits

Limits are per machine, per endpoint, per minute (fixed windows), so
one busy endpoint never starves another — a flood of heartbeats can't
block your dispense reports.

| Endpoint class | Requests per machine per minute |
|---|---|
| `connect` | 10 |
| `describe` | 30 |
| `heartbeat` | 12 |
| `status` | 30 |
| `inventory` | 12 |
| `events` | 60 requests |
| `event_items` | 600 events (a batch of 100 counts as 100) |
| `command_poll` | 60 |
| `command_ack` | 120 |
| `command_status` | 120 |

Also, per minute:

| Scope | Limit |
|---|---|
| One key, across your fleet | 30,000 requests |
| One manufacturer, across all its keys | 60,000 requests |
| One webhook key | 1,200 deliveries |
| One source address | 120 **failed** authentications (valid traffic is never limited by address) |
| One machine | 60 refused (4xx) requests, after which that machine's requests are refused for the rest of the minute |

Snack Quest may agree higher limits for a key.

How limits are counted:

- Only requests that are correctly signed and carry an unused nonce
  count against a machine's or key's limits. Forged or replayed requests
  in your name can't use up your budget; they count against the sender's
  address instead.
- A request refused with `429` has **used its nonce**. Retry it re-signed
  with a new nonce (the same body and `eventId`), as for any retry.
- Limits are enforced across all Snack Quest servers together, so
  spreading requests across servers or connections doesn't raise them.

Every response carries `SQ-RateLimit-Limit`, `SQ-RateLimit-Remaining`
and `SQ-RateLimit-Reset` (seconds). Over a limit: `429 rate_limited`
with `Retry-After`. Normal operation (a heartbeat a minute, a poll every
10 s, a status every few minutes) uses a small fraction of each.

### 4.6 Tracing a sale

Every request gets an `SQ-Request-Id`. Snack Quest support can follow a
single sale from the customer's M-Pesa receipt through the payment,
the dispense command and its acknowledgement, your outcome report, the
stock movement and any alert, on one timeline. Keep your own logs keyed
by `commandId`, `eventId` and `SQ-Request-Id` and we can always meet in
the middle.

---

## 5. Machine endpoints

All paths are relative to the base URL. `{machineCode}` is the Snack
Quest machine code, e.g. `SQ-MCH-000001`.

| § | Method and path | Purpose |
|---|---|---|
| 5.1 | `POST /api/v1/machines/connect` | Announce a unit and learn its machine code |
| 5.2 | `GET /api/v1/machines/{machineCode}` | Machine description: state, capabilities, slots, intervals |
| 5.3 | `POST /api/v1/machines/{machineCode}/heartbeat` | Proof of life |
| 5.4 | `POST /api/v1/machines/{machineCode}/status` | Full status snapshot |
| 5.5 | `POST /api/v1/machines/{machineCode}/inventory` | Per-slot stock counts |
| 5.6 | `POST /api/v1/machines/{machineCode}/events` | Operational events (door, faults, temperature …) |
| 6.1 | `GET /api/v1/machines/{machineCode}/commands` | Commands to execute now |
| 6.2 | `POST /api/v1/machines/{machineCode}/commands/{commandId}/ack` | "I have it and will execute it" |
| 6.3 | `POST /api/v1/machines/{machineCode}/commands/{commandId}/status` | What happened |
| 8 | `POST /api/v1/webhooks/manufacturers/{slug}` | Webhook deliveries (Model A) |

### 5.1 Connect: `POST /api/v1/machines/connect`

Call this when a unit boots or first comes online. It maps your
manufacturer machine id to the Snack Quest machine that staff
registered for it, records firmware facts, and returns the machine
description (§5.2).

**Request**

```json
{
  "manufacturerMachineId": "NV-0001",
  "serialNumber": "NV40-8841",
  "firmwareVersion": "4.2.1",
  "controllerType": "NVC",
  "controllerVersion": "3.2",
  "integrationVersion": "1"
}
```

| Field | Required | Notes |
|---|---|---|
| `manufacturerMachineId` | yes | 1–128 chars. Must match what staff registered |
| `serialNumber` | no | Compared against the registered serial. A mismatch is flagged for staff but not refused |
| `firmwareVersion`, `controllerType`, `controllerVersion` | no | ≤ 64 chars each |
| `integrationVersion` | no | Your client's version of this contract, e.g. `"1"` |

**Response `200`**: the machine description (§5.2).

**Errors**

- `404 machine_not_provisioned`: no machine is registered under this
  id for your manufacturer in this key's environment. Ask Snack Quest
  to register it. Retrying won't help.

Connect is safe to call on every boot.

### 5.2 Describe: `GET /api/v1/machines/{machineCode}`

```json
{
  "data": {
    "machineCode": "SQ-MCH-000001",
    "integrationState": "active",
    "environment": "production",
    "apiVersion": "1",
    "capabilities": ["vend", "dispense_confirmation", "heartbeat", "telemetry", "faults", "temperature", "door_status", "inventory_read"],
    "slots": [
      { "slotId": "motor-01", "priceKes": 250, "enabled": true, "capacity": 10 },
      { "slotId": "motor-02", "priceKes": 300, "enabled": false, "capacity": 10 }
    ],
    "pollIntervalSeconds": 10,
    "heartbeatIntervalSeconds": 60
  },
  "meta": { "apiVersion": "1" }
}
```

- `integrationState` is one of `configured`, `tested`, `active`,
  `suspended` or `unregistered`. **Only `active` machines take orders
  and receive dispense commands.** Customers are not asked to pay on
  a machine in any other state. You should keep sending heartbeats in
  every state, since that's how the machine gets tested and activated.
- `capabilities` are what Snack Quest will actually use for this
  machine. That's the intersection of what your model was certified
  for and what the integration supports. Current values: `vend`,
  `slot_read`, `inventory_read`, `inventory_write`,
  `dispense_confirmation`, `heartbeat`, `telemetry`, `faults`,
  `temperature`, `door_status`, `remote_price_update`,
  `remote_enable_disable`, `remote_restart`, `audit_export`, `camera`,
  `payment_device`, `remote_configuration`. New ones may be added
  (§10).
- `slots` use **your** slot ids. `priceKes` is informational, because
  the customer pays Snack Quest and the machine never charges. A
  disabled slot won't be sold.
- **Poll and heartbeat at the intervals given here**, not at hard-coded
  values. Snack Quest may change them without a firmware update.
  Re-read this description every few minutes, or after any `connect`,
  to pick up slot and price changes.

### 5.3 Heartbeat: `POST /api/v1/machines/{machineCode}/heartbeat`

```json
{ "eventId": "hb-NV0001-000418", "occurredAt": "2026-09-27T09:14:05+03:00", "uptimeSeconds": 86400 }
```

**Response `202`**

```json
{ "data": { "accepted": true, "reportOutcomes": [ { "commandId": "DSP-3F9A1C22", "reason": "no_outcome_received" } ] } }
```

`reportOutcomes` lists dispenses **you acknowledged** whose outcome
Snack Quest is still waiting for (`reason`: `in_progress_too_long` —
acknowledged more than 3 minutes ago with no outcome yet; or
`no_outcome_received` — it has since timed out; more reasons may be
added, answer them all the same way). A command you never acknowledged
is never listed: Snack Quest already knows it didn't run. The list is
usually empty. Answer each listed command **once**, with
`POST …/commands/{commandId}/status`; once answered, it is no longer
listed (if your answer fails with a network error, the next heartbeat
lists it again — just answer again with the same `eventId`):

| What your persistent store says about the command | Report |
|---|---|
| You have its outcome stored | Re-send that report unchanged (same `eventId`) |
| You executed it, but the outcome was never determined (e.g. power lost mid-vend) | `unknown`, with the reason |
| You never executed it (its acknowledgement never returned `200`) | `failed`, `failureReason: "not executed"` |
| You have no record of it (storage lost or reset) | `unknown`, `failureReason: "no record"` — never `failed`: you can't prove it didn't run |

Only a machine whose store survived can assert "not executed": that
report sends the customer's money down the refund path.

Send one every `heartbeatIntervalSeconds` (60 s by default). Snack
Quest derives the machine's **liveness** from the last contact of any
kind (heartbeat, status, any signed request), with E = the heartbeat
interval and a grace G = max(30 s, E/2):

| State | When | Effect |
|---|---|---|
| `ONLINE` | last contact within E + G | Takes orders (if also heard within the last 90 s) |
| `DEGRADED` | within 3E + G | **No new orders** — a customer is not charged for a machine that may not collect the dispense |
| `OFFLINE` | longer, or the last status said `online: false`, or staff declared maintenance | No orders; operations staff are alerted |
| `UNKNOWN` | never heard since configuration, or most of your fleet went silent at once (likely an outage between us, not your machines) | No orders |

A machine coming back is recorded once (`MACHINE_ONLINE`) and its
offline alert closes itself.

### 5.4 Status: `POST /api/v1/machines/{machineCode}/status`

A complete snapshot. Send it on boot, whenever something changes, and
at least every few minutes.

```json
{
  "eventId": "st-NV0001-000093",
  "occurredAt": "2026-09-27T09:14:05+03:00",
  "online": true,
  "doorOpen": false,
  "temperatureCelsius": 6.5,
  "faults": ["E07"],
  "paymentDeviceOk": true
}
```

| Field | Required | Notes |
|---|---|---|
| `online` | yes | `false` means "I am up but can't vend", for example during maintenance. Snack Quest won't send dispenses while the last status says offline |
| `doorOpen` | no | `true`, `false` or `null` (no sensor) |
| `temperatureCelsius` | no | −50 to 100 |
| `faults` | no | Up to 50 **currently active** fault codes, each 1–64 chars of `[A-Za-z0-9_.:-]`. Each one is recorded as a `MACHINE_ERROR` event with your code preserved. Send `[]` when faults clear |
| `paymentDeviceOk` | no | If your unit has its own payment hardware. `false` raises `PAYMENT_DEVICE_ERROR` |

**Response `202`**: `{"data": {"accepted": true, "applied": true}}`

`applied: false` means Snack Quest already holds a snapshot whose
`occurredAt` is **newer** — a late, out-of-order delivery (an offline
queue flushing) never overwrites fresher state. Events (door, faults,
payment device) are emitted only for **changes**.

### 5.5 Inventory: `POST /api/v1/machines/{machineCode}/inventory`

What the machine *physically* counts, if it can (capability
`inventory_read`).

```json
{
  "reportId": "inv-NV0001-000031",
  "occurredAt": "2026-09-27T09:14:05+03:00",
  "slots": [
    { "slotId": "motor-01", "quantity": 6 },
    { "slotId": "motor-02", "quantity": 3 },
    { "slotId": "motor-03", "quantity": 0 }
  ]
}
```

1–500 slots and quantities of 0–10,000. Each `slotId` appears **at most once** per report; a report listing a slot twice is refused with `422 validation_failed`. A count above the slot's capacity is recorded as a sensor or mapping fault, never as stock.

**Response `200`**

```json
{
  "data": {
    "slotsReported": 3,
    "stale": false,
    "mismatches": [ { "slotId": "motor-02", "expected": 4, "reported": 3 } ],
    "unmappedSlots": []
  }
}
```

Snack Quest keeps its own stock ledger, built from restocks and sales.
Your report is **compared against it and never overwrites it**. A
difference is recorded as `INVENTORY_MISMATCH` for operations staff to
investigate. `unmappedSlots` lists slot ids Snack Quest has no mapping
for, which means staff need to finish the slot mapping.

Send `occurredAt` (when the count was taken). A report older than one
already applied — delivered late, or out of order from an offline
queue — is recorded but not compared (`stale: true`), and a slot whose
stock Snack Quest changed after your count was taken (a sale, a restock)
is not flagged. Without `occurredAt`, the time we received the report
is used.

### 5.6 Events: `POST /api/v1/machines/{machineCode}/events`

Up to 100 operational events per request.

```json
{
  "events": [
    { "eventId": "door-NV0001-000210", "type": "DOOR_OPENED", "occurredAt": "2026-09-27T09:20:00+03:00" },
    { "eventId": "tmp-NV0001-000977", "type": "TEMPERATURE_ALERT", "data": { "temperatureCelsius": 14.2 } },
    { "eventId": "slt-NV0001-000045", "type": "SLOT_EMPTY", "slotId": "motor-03" },
    { "eventId": "x-NV0001-000001", "type": "COIN_MECH_JAM", "data": { "code": "CM-3" } }
  ]
}
```

| Field | Required | Notes |
|---|---|---|
| `eventId` | yes | §4.3 |
| `type` | yes | Preferably a name from §9. Case-insensitive |
| `occurredAt` | no | §7 |
| `slotId` | no | Your slot id |
| `data` | no | Flat object of strings, numbers, booleans or nulls. Up to 25 keys; strings are truncated at 500 chars; nested values are dropped |

**Response `202`**

```json
{ "data": { "recorded": 3, "duplicates": 0, "conflictingEventIds": [], "unknownTypes": ["COIN_MECH_JAM"], "unmappedSlots": [] } }
```

- `conflictingEventIds`: ids already received with **different**
  content. They are not recorded; the first report stands (§4.3).

- A `type` outside §9 is **not rejected**. It is kept as
  `UNKNOWN_EVENT` with your original name preserved, and listed in
  `unknownTypes` so you know to map it.
- **Dispense outcomes are refused here.** The types `DISPENSE_REQUESTED`,
  `DISPENSE_STARTED`, `DISPENSE_SUCCESS` and `DISPENSE_FAILED` return
  `422 dispense_events_not_accepted_here`. Outcomes move money and
  must go through §6.3. This also means nothing can report a sale
  without a real command behind it.

---

## 6. Commands and the dispense lifecycle

### 6.1 Poll: `GET /api/v1/machines/{machineCode}/commands`

```json
{
  "data": {
    "commands": [
      {
        "commandId": "DSP-3F9A1C22",
        "type": "dispense",
        "slotId": "motor-07",
        "quantity": 1,
        "issuedAt": "2026-09-27T06:21:44.120Z",
        "expiresAt": "2026-09-27T06:23:44.120Z"
      },
      {
        "commandId": "CMD-7B20E4D1",
        "type": "restart",
        "payload": null,
        "issuedAt": "2026-09-27T06:10:02.000Z",
        "expiresAt": "2026-09-27T06:25:02.000Z"
      }
    ],
    "nextPollSeconds": 2,
    "serverTime": "2026-09-27T06:21:45.004Z"
  }
}
```

- Poll again after the response's `nextPollSeconds`: **2** while a
  customer is paying at this machine, otherwise **10**. A customer is
  standing at the machine, waiting — the fast interval is what makes
  the product drop within seconds of payment. An idle poll is cheap for
  both sides.
- Dispenses come first. `slotId` is **your** slot id.
- The same command is returned on every poll until you acknowledge
  it. That's why execution must be keyed on `commandId`.
- `serverTime` is Snack Quest's clock. Judge `expiresAt` against it (or
  against your NTP-corrected clock), never against an unsynchronised
  RTC. Whatever your clock says, the acknowledgement (§6.2) decides: a
  command that has expired on our side is refused there.
- `type` values in v1 are `dispense` and `restart`. More may be added
  (§4.4).

### 6.2 Acknowledge: `POST /api/v1/machines/{machineCode}/commands/{commandId}/ack`

No body. Call it **before** you actuate anything.

**Response `200`**: `{"data": {"commandId": "DSP-3F9A1C22", "status": "acknowledged"}}`

**Anything other than `200` means do not execute** — in particular
`409 command_expired` and `409 invalid_command_state`. A network error
on the ack means you don't know: retry the ack (it is idempotent), and
if you still can't get a `200` before `expiresAt`, don't dispense. A
dispense command is valid for **2 minutes** after `issuedAt`. If you acknowledge it later, Snack Quest has already
treated it as timed out and the customer may have walked away or
been refunded. Discard it without dispensing.

Repeating an acknowledgement (for example after a network timeout)
is harmless and returns `acknowledged` again. Once you have reported
`dispensing` or an outcome, a further ack returns `409
invalid_command_state`. Your persisted record says the command has
already run, so don't run it again.

### 6.3 Report outcome: `POST /api/v1/machines/{machineCode}/commands/{commandId}/status`

**For a dispense command** (`DSP-…`):

```json
{ "status": "dispensing", "eventId": "dsp-NV0001-005512-start", "occurredAt": "2026-09-27T09:21:47+03:00" }
```

```json
{ "status": "dispensed", "eventId": "dsp-NV0001-005512-end", "occurredAt": "2026-09-27T09:21:52+03:00" }
```

```json
{ "status": "failed", "eventId": "dsp-NV0001-005512-end", "failureCode": "jam", "failureReason": "motor-07 stall current exceeded" }
```

```json
{ "status": "unknown", "eventId": "dsp-NV0001-005512-end", "failureReason": "drop sensor offline; motor completed rotation" }
```

| `status` | When | What Snack Quest does |
|---|---|---|
| `dispensing` | Optional: motor started | Records progress |
| `dispensed` | Drop sensor (or equivalent) **confirmed** the product was delivered | Completes the sale and decrements stock |
| `failed` | **Certain** nothing was delivered | Refunds the customer |
| `unknown` | You cannot tell | Sends it to a human for review. The customer isn't refunded automatically, and no sale is recorded yet |

`failureCode` (for `failed`) is one of the codes below — or **your
own** code (1–64 chars of `[A-Za-z0-9_.:-]`), which is recorded as
`failed` with your code kept in the reason, so adding a code to your
firmware never breaks outcome reporting. `unknown`, `success`,
`dispensed` and `ok` are refused (`422`): they contradict `failed` —
report `status: "unknown"` instead.

| Code | Meaning |
|---|---|
| `jam` | Product stuck or motor stalled |
| `no_product` | Slot empty |
| `sensor_failure` | Sensor fault, but certain nothing dropped |
| `timeout` | Mechanism didn't finish in time and nothing dropped |
| `machine_offline` | Machine couldn't act (e.g. lost power before starting) |
| `failed` | Any other certain failure (default) |

**Response `200`**: `{"data": {"commandId": "DSP-3F9A1C22", "applied": true, "result": "applied"}}`

**Every `200` means "stop re-sending this report".** `result` says what
it did:

| `result` | Meaning |
|---|---|
| `applied` | It changed the sale (completed it, or started the refund) |
| `duplicate` | This `eventId` was already applied — your retry was a no-op |
| `already_recorded` | Another report already recorded this outcome |
| `conflict` | It contradicts a decision already acted on (e.g. `dispensed` after the refund started). Money is not moved; it is escalated to a human |
| `progress_recorded` / `stale_progress` | For `dispensing` |

New values may be added; treat any `200` as success.

**For a maintenance command** (`CMD-…`): report `completed` or
`failed` (with an optional `failureReason`). Anything else returns
`422 invalid_status_for_command`.

**Report every dispense outcome, even a late one.** If a command
timed out on our side but the product did drop, report `dispensed`
anyway. Snack Quest reconciles it, and the record will be correct.

### 6.4 The dispense lifecycle (for reference)

Snack Quest tracks every dispense through these states. You drive
the steps marked ◆.

```
REQUESTED ──▶ AUTHORIZED ──▶ SENT ──◆ ACKNOWLEDGED ──◆ DISPENSING ──◆ DISPENSED
    │              │           │            │               │
    ▼              ▼           ├──▶ TIMEOUT ◀┴───────────────┤      (machine never finished)
 REJECTED       REJECTED       │                            ◆
 (never paid /                 └──────◆─────────────────▶ FAILED      (certain: nothing dropped)
  machine not active)                                   ◆ UNKNOWN     (uncertain → human review)

TIMEOUT and UNKNOWN can still resolve to DISPENSED or FAILED when a late report arrives.
```

- **REQUESTED** is created only after the customer's payment is
  confirmed, and only once per paid order. There is no path from an
  unpaid order to your machine.
- **SENT** means it's in your command queue (§6.1).
- **SENT but never collected** before `expiresAt`: provably not
  dispensed — the command becomes `TIMEOUT` and the customer is
  refunded. A late ack is refused (`409`).
- **ACKNOWLEDGED / DISPENSING with no outcome for 5 minutes**: may have
  dispensed — `TIMEOUT`, and the sale goes to a human; nothing is
  refunded or retried automatically. The machine is asked for the
  outcome in every heartbeat response (`reportOutcomes`).
- **Payment status and dispense status are separate records.** A paid
  order with a failed dispense is a refund, not a sale.

---

## 7. Timestamps and clocks

- `occurredAt` is ISO-8601 **with an offset**, for example
  `2026-09-27T09:14:05+03:00` or `…Z`. It's optional; when you omit
  it, Snack Quest uses the time it received the report. A time
  **without** an offset (`2026-09-27T09:14:05`) is ambiguous, so it is
  treated as omitted — never guessed as UTC or as any local time.
- All times Snack Quest sends are UTC (`…Z`).
- Snack Quest uses your `occurredAt` only when it's plausible. It
  can't be more than 1 minute in the future, or more than 24 hours in
  the past. Otherwise the receive time is used, and your timestamp is
  kept for diagnostics. A machine with a broken RTC therefore
  can't corrupt the event history.
- **Request signing is stricter.** `X-SQ-Timestamp` must be within
  **5 minutes** (§3.5). A refused request's `details.serverTimestamp`
  is Snack Quest's time: correct your offset from it and retry — the
  reference clients do this — so a drifting clock costs one extra
  request, not a silent machine.

---

## 8. Webhooks (manufacturer cloud → Snack Quest)

Webhooks are for **Model A** manufacturers, whose own cloud pushes
events such as vend completed, door open or fault. Snack Quest writes
an adapter that translates your native payload. You **don't** need to
change your event format for us.

Model B manufacturers don't need webhooks, because §5.6 and §6.3
cover the same ground.

**Endpoint:** `POST /api/v1/webhooks/manufacturers/{slug}`, where
`{slug}` is your manufacturer slug, given to you during onboarding.

**Authentication:** a `webhook`-kind credential, signed exactly as in
§3 (same headers, same canonical string, same 5-minute window, and a
single-use nonce). Unsigned or mis-signed deliveries are rejected
before the body is read.

**What we need from your payload.** Your adapter is written against
your format, but these facts must be present in it:

| Fact | Why |
|---|---|
| A unique **delivery id** | Deduplicates whole deliveries |
| A unique **event id** per event | Deduplicates individual events |
| Your **machine id** per event | Routes it to the right Snack Quest machine |
| An **event kind** | Translated to §9 |
| For vend outcomes, the **Snack Quest `commandId`** we gave you when we requested the vend | Correlates the outcome to the paid order. Without it, an outcome can't be applied |
| For failed vends, a **reason code** | Mapped to §6.3's failure codes |

**Responses (designed for your retry logic)**

| Status | Meaning | Your sender should |
|---|---|---|
| `202` | Processed | Stop |
| `200` with `"duplicate": true` | Already processed | Stop |
| `401` | Signature, timestamp, nonce or key problem | Fix and re-sign; don't blindly retry |
| `403 manufacturer_suspended` | Integration suspended | Stop; contact Snack Quest |
| `404 manufacturer_not_found` | Slug doesn't match your credential | Stop; fix the URL |
| `422 unrecognised_payload` / `webhooks_not_supported` | Payload not in the agreed format | Stop; fix the payload |
| `5xx` / timeout | Not (fully) processed | **Retry** with backoff, re-signed. Safe: partial deliveries are reprocessed idempotently |

A `202` body reports what happened, including any machine ids we
didn't recognise:

```json
{
  "data": {
    "deliveryId": "whk_01J8Z6Q4M2",
    "duplicate": false,
    "eventsRecorded": 4,
    "eventsDuplicate": 0,
    "dispenseOutcomesApplied": 1,
    "unmatchedMachines": ["NV-9999"],
    "unknownEventTypes": [],
    "conflictingEventIds": []
  }
}
```

Redeliver as often as your platform likes: a delivery or event seen
before is acknowledged and not applied again, and a dispense outcome
takes effect once however many times it arrives.

---

## 9. Event vocabulary

Snack Quest's own names. Use them in §5.6. A Model A adapter maps
your native names to them.

| Type | Meaning | Severity |
|---|---|---|
| `MACHINE_ONLINE` / `MACHINE_OFFLINE` | Connectivity or service state changed | info / critical |
| `HEARTBEAT_RECEIVED` | Proof of life (normally sent via §5.3) | info |
| `STATUS_REPORTED` | Status snapshot (normally sent via §5.4) | info |
| `SLOT_EMPTY` / `SLOT_LOW` | Slot sensor says empty / low | warning |
| `INVENTORY_REPORTED` | Counts reported (normally via §5.5) | info |
| `MACHINE_ERROR` | Hardware fault. Put your code in `data.code` | critical |
| `TEMPERATURE_REPORTED` | Periodic reading. Use `data.temperatureCelsius` | info |
| `TEMPERATURE_ALERT` | Out of safe range | critical |
| `DOOR_OPENED` / `DOOR_CLOSED` | Service door | warning / info |
| `CAMERA_OFFLINE` | On-machine camera unavailable | warning |
| `PAYMENT_DEVICE_ERROR` | The unit's own payment hardware failed | warning |

Snack Quest itself records `DISPENSE_REQUESTED`, `DISPENSE_STARTED`,
`DISPENSE_SUCCESS`, `DISPENSE_FAILED`, `INVENTORY_MISMATCH`,
`DISPENSE_OUTCOME_CONFLICT`, `DISPENSE_UNRECOGNISED` and
`FIRMWARE_CHANGED`. You don't send them: the `DISPENSE_*` outcomes are
refused on `/events` (§5.6), and any other Snack Quest-only name you
send is kept as `UNKNOWN_EVENT`. Anything unrecognised becomes
`UNKNOWN_EVENT` with the native name kept — never an error.

---

## 10. Versioning and change policy

The version is in the path (`/api/v1/`) and in the `SQ-API-Version`
response header.

**Non-breaking. These can happen at any time within v1, and your
client must tolerate them:**

- new endpoints;
- new **optional** request fields;
- new response fields;
- new event types in §9, new maintenance command `type`s (§4.4) and
  new `error.code`s within an existing HTTP status class;
- changed advisory values such as `pollIntervalSeconds`.

**Breaking. These happen only in a new version (`/api/v2/`):**

- removing or renaming a field, endpoint or event type;
- making an optional field required, or tightening validation on an
  existing field;
- changing the signing scheme (a new scheme would be `v2=` in
  `X-SQ-Signature`, accepted alongside `v1=` during migration);
- changing the meaning of a status or failure code.

**How each kind of change is handled**

| Change | Rule |
|---|---|
| New optional request field | Ignored by servers that don't know it; you may send it early |
| New response field | You must ignore fields you don't know |
| Deprecated field | Still accepted and still returned for the rest of v1; marked deprecated here and in OpenAPI with the version that removes it |
| Enum values (`result`, `reason`, `integrationState`, capabilities, command `type`) | **Open**: new values may appear. Treat an unknown value as the safe default (unknown command → ack, report `failed` "unsupported command"; unknown capability → ignore) |
| Your enum values (`failureCode`, event `type`) | **Tolerant**: a code or type we don't know is kept, never refused (§5.6, §6.3) |
| New capability | Advertised in `capabilities` (§5.2); never required of existing models |
| New event type | Added to §9; older clients never need to send it |
| New command type | Only sent to models certified for it |
| New authentication method | Added alongside `v1=` signing; `v1=` keeps working for all of v1 |
| Anything breaking | `/api/v2/`, with v1 running in parallel |

**Retiring a version.** A breaking change never happens inside v1.
When a v2 is published, v1 keeps running alongside it; v1 is retired
only after every manufacturer with an active integration has been told
in writing, with a changelog, a migration guide and the retirement
date. The notice period is the one stated in your integration agreement
with Snack Quest. This document doesn't set one, and nothing here
should be read as a fixed support period.

**Security exception.** If a flaw in v1 puts customers' money or your
machines at risk, Snack Quest may change v1's behaviour with shorter
notice, for example by refusing a weak client pattern. We'll contact
you directly and explain the change.

---

## 11. Error reference

Every code the API can return. `code` is stable within v1; branch on it,
not on `message`. The same catalogue is in the OpenAPI document
(`x-sq-error-codes`); Snack Quest's contract tests fail the build if
the server, the OpenAPI document and this table ever disagree.

| Status | Code | Meaning | Retry? |
|---|---|---|---|
| 400 | `invalid_json` | The body is not valid UTF-8 JSON. | No — fix the request |
| 413 | `payload_too_large` | The body exceeds the size limit. | No — fix the request |
| 401 | `missing_signature` | One of the four X-SQ-* signing headers is missing. | No — fix the request |
| 401 | `unknown_key` | No credential has this key id. | No — fix the request |
| 401 | `key_revoked` | The key was revoked. Obtain a new one. | After the cause is fixed on our side or yours |
| 401 | `key_expired` | The key expired (or its rotation grace period ended). Use the new key. | After the cause is fixed on our side or yours |
| 401 | `wrong_key_kind` | An API key was used for a webhook or vice versa. | No — fix the request |
| 401 | `stale_timestamp` | X-SQ-Timestamp is outside ±300 s. details.serverTimestamp gives the server time: correct your offset and retry. | Yes — backoff, same `eventId`, fresh nonce |
| 401 | `invalid_nonce` | X-SQ-Nonce is not 16–64 characters of [A-Za-z0-9_-]. | No — fix the request |
| 401 | `invalid_signature` | The signature does not match. Check the canonical string against the test vectors. | No — fix the request |
| 401 | `replayed_request` | This nonce was already used. Every attempt needs a fresh nonce. | Not as-is — re-sign with a fresh nonce and timestamp, same body and `eventId` |
| 403 | `environment_mismatch` | A sandbox key addressed a production machine, or vice versa. | No — fix the request |
| 403 | `manufacturer_suspended` | This manufacturer is suspended. | After the cause is fixed on our side or yours |
| 404 | `machine_not_found` | No machine with this code is available to these credentials. | No — fix the request |
| 404 | `machine_not_provisioned` | No machine is registered for this manufacturerMachineId under these credentials. | After the cause is fixed on our side or yours |
| 404 | `command_not_found` | No such command for this machine. | No. On an ack: **do not execute**. On a report: stop re-sending it and check the machine code and `commandId` |
| 404 | `manufacturer_not_found` | The webhook slug does not belong to these credentials. | No — fix the request |
| 409 | `command_expired` | The command expired before it was acknowledged. DO NOT EXECUTE IT. | No — **do not execute**; discard the command. Nothing to report: the customer is already refunded |
| 409 | `invalid_command_state` | The command can no longer move to that state (e.g. already finished). DO NOT EXECUTE IT. | No. On an ack: **do not execute** (it already ran or was resolved). On a report: stop re-sending it; keep it and its `SQ-Request-Id` for support |
| 409 | `idempotency_key_reused` | This eventId was already used for a different report. Event ids are per occurrence. | No — the first report stands. Fix your `eventId` generation; contact support if a real outcome is now unreported |
| 422 | `validation_failed` | The body does not match the schema; details lists each problem. | No — fix the request |
| 422 | `dispense_events_not_accepted_here` | DISPENSE_* outcomes go to /commands/{commandId}/status, not /events. | No — fix the request |
| 422 | `invalid_status_for_command` | That status is not valid for this kind of command. | No — fix the request |
| 422 | `unrecognised_payload` | The webhook payload is not in the agreed format. | No — fix the request |
| 422 | `webhooks_not_supported` | This manufacturer integration does not accept webhooks. | No — fix the request |
| 429 | `rate_limited` | A rate limit was exceeded. Retry after Retry-After seconds; see SQ-RateLimit-* headers. | Yes — backoff, same `eventId`, fresh nonce |
| 429 | `too_many_auth_failures` | Too many failed authentications from this address. Fix signing before retrying. | Yes — backoff, same `eventId`, fresh nonce |
| 500 | `internal_error` | An unexpected error. Retry with the same eventId; quote SQ-Request-Id to support. | Yes — backoff, same `eventId`, fresh nonce |
| 503 | `temporarily_unavailable` | A dependency is unavailable. Retry with backoff. | Yes — backoff, same `eventId`, fresh nonce |

---

## 12. Onboarding and certification

| Stage | What happens | You receive |
|---|---|---|
| 1. Application | You send company, contact, model list and integration preference (Model A or B) | This document |
| 2. Technical review | We review your protocol or this contract's fit, slot naming and failure modes | Your manufacturer slug |
| 3. Credentials | We issue **sandbox** credentials | `sqk_test_…` key pair(s) |
| 4. Test environment | You build and test against sandbox machines we register for you | Sandbox machine codes |
| 5. Certification | We verify each model against the checklist below, with evidence | Certified model |
| 6. Production | We issue **production** credentials and activate live machines | `sqk_live_…` key pair(s) |

Production credentials can't be issued, and a production machine
can't be activated, until the model is certified. Certification is
per model. If a model's capabilities later change, it has to be
re-certified.

**Certification checklist.** These are the checks recorded against your
model. Each one needs evidence, such as a harness run id, a sandbox
transaction reference, logs or a video of the physical test.
[`MANUFACTURER_CERTIFICATION.md`](MANUFACTURER_CERTIFICATION.md) says
exactly how each is verified.

| Check | What we verify |
|---|---|
| Authentication | Signed requests accepted; bad signature, stale timestamp and replay are rejected and handled by your client; no nonce reused |
| Machine registration | `connect` maps your id to the right machine; serial matches |
| Heartbeat | Heartbeats at the advertised interval |
| Status reporting | Door, temperature and faults reported accurately and promptly |
| Inventory | Reported counts match physical counts (*not applicable* without `inventory_read`) |
| Product / slot mapping | Your slot ids map to the right physical slots |
| Dispense command | Commands collected, acknowledged **before** dispensing, never executed after a refused acknowledgement |
| Dispense confirmation | `dispensed` only when the product physically dropped |
| Failed dispense | A jammed or empty slot reports `failed` with the right code |
| Idempotency | A re-sent report is recognised as the same report; a command delivered twice (fetched, held, then delivered again) is executed and reported once |
| Error handling | 4xx vs 5xx behaviour per §4.2 |
| Webhooks | Signed deliveries, retries, deduplication (*not applicable* without webhooks) |
| Payment flow | A paid sandbox sale dispenses and is confirmed end to end |
| Reconciliation | An expired command is never executed; an outcome report that couldn't be sent (network down) is kept and delivered later; unknown outcomes are reported, not guessed |
| Automated contract suite | A complete, passing run of the certification harness against your model |

Everything not marked *not applicable* is required. The last check can
only be recorded by the harness itself, never ticked by hand.

**The automated certification harness.** Most of the checklist is
verified by a harness Snack Quest runs against your machine in the
sandbox. It drives a fixed script — connect, heartbeat, status,
inventory, door events, a real sandbox sale, a retransmitted outcome
report, a command delivered twice, a sale whose outcome report is held
back as if the network dropped, a sale from a slot you've emptied, and
a command that expires while your machine holds it — and judges each
step from what Snack Quest recorded, not from what the machine claims:

```
CONNECT ✓  AUTHENTICATION ✓  HEARTBEAT ✓  STATUS ✓  INVENTORY ✓  EVENTS ✓
COMMAND POLLING ✓  ACKNOWLEDGEMENT ✓  DISPENSE ✓  FAILURE HANDLING ✓
IDEMPOTENCY ✓  REPLAY PROTECTION ✓  TIMEOUT HANDLING ✓
DUPLICATE DELIVERY ✓  OFFLINE RECOVERY ✓                      → CERTIFIED
```

Any failed check means **NOT CERTIFIED**, with the failure spelled out
(for example "ACKNOWLEDGEMENT: history sent → dispensing → dispensed" —
the machine dispensed without acknowledging). The harness drives your
sandbox machine through **sandbox control endpoints** you build
([`MANUFACTURER_CERTIFICATION.md`](MANUFACTURER_CERTIFICATION.md)). A
step your machine can't be driven through is *not verified*, and a run
with any step not verified is NOT CERTIFIED, so all of the control
endpoints are required for certification. Passing results are
recorded against your model as evidence; the harness never certifies a
model on its own — a person signs it off. The Snack Quest simulator
passes the same harness, so you can compare your machine's request log
with a known-good one.

The harness covers Model B (your machine calls Snack Quest). A Model A
API is checked in the sandbox with the API probe described in the
certification guide. Certifying a Model A model for production also
needs a production adapter for your API and a harness run through it,
which Snack Quest builds with you.

---

## 13. Worked example: one sale, end to end

Machine `SQ-MCH-000001` (your `NV-0001`), slot `motor-07`, product
priced KES 250.

```
 Customer's phone          Snack Quest                          Your machine
       │                        │                                     │
       │  scan, choose, pay ──▶ │                                     │
       │                        │  M-Pesa confirms payment            │
       │                        │  creates DSP-3F9A1C22 (once)        │
       │                        │                                     │
       │                        │ ◀── GET …/commands ─────────────────│  (every 10 s)
       │                        │ ── [{DSP-3F9A1C22, motor-07}] ─────▶│
       │                        │                                     │  seen DSP-3F9A1C22 before? no
       │                        │ ◀── POST …/DSP-3F9A1C22/ack ────────│
       │                        │ ── 200 acknowledged ───────────────▶│  persist "DSP-3F9A1C22: executing"
       │                        │ ◀── POST …/status {dispensing} ─────│  run motor-07
       │                        │                                     │  drop sensor: product delivered
       │                        │ ◀── POST …/status {dispensed} ──────│  persist "DSP-3F9A1C22: done"
       │  "Enjoy your snack" ◀─ │ ── 200 applied ────────────────────▶│
```

**Machine-side loop (pseudocode)**

```
every nextPollSeconds (from the last poll; 10 if unknown):
  for cmd in GET /commands:
    if store.has(cmd.commandId): continue                 # executed before: never twice
    if cmd.type not in SUPPORTED:
      ack(cmd); report(cmd, failed, reason="unsupported command"); continue
    r = ack(cmd)
    if r.status != 200: store.put(cmd.commandId, "refused"); continue   # not acknowledged: do not dispense
    store.put(cmd.commandId, "executing")                 # persist BEFORE actuating
    report(cmd, dispensing)
    outcome = hardware.vend(cmd.slotId)                   # dispensed | failed(code) | unknown
    store.put(cmd.commandId, outcome)
    report(cmd, outcome)                                  # queued + retried until 2xx; same eventId every retry

on boot:
  for id, state in store where state == "executing":      # power lost mid-vend
    report(id, unknown, reason="power lost during dispense")
```

The persisted `store` is what makes duplicate protection and offline
recovery work. A machine that loses power mid-vend must never
re-run the command after reboot. It reports `unknown` instead.

---

## 14. Implementation checklist

- [ ] Signing matches every vector in `docs/machine-api/signing-test-vectors.json` (or you use a reference client, §3.4)
- [ ] New nonce and timestamp on every request, including retries
- [ ] Secret stored securely; never logged or shipped in a client app
- [ ] Clock NTP-synchronised (±5 min at worst)
- [ ] `connect` on boot; description re-read periodically
- [ ] Heartbeats and polling at the intervals from §5.2
- [ ] Every report has a unique, persisted `eventId`; the same id on retry
- [ ] Unsent reports survive a reboot and are sent on reconnection
- [ ] `commandId` persisted before actuation; a command never runs twice
- [ ] Anything but `200` on ack means **do not dispense**
- [ ] `stale_timestamp` handled by correcting the clock offset from `details.serverTimestamp`
- [ ] `429` handled by waiting `Retry-After`; `SQ-Credential-Status: rotating` alerts you to deploy the new key
- [ ] `SQ-Request-Id` logged with every report
- [ ] `reportOutcomes` in heartbeat responses answered from stored outcomes
- [ ] `dispensed` only on physical confirmation; `unknown` when unsure
- [ ] Late outcomes still reported
- [ ] 5xx and network errors retried with backoff; 4xx not blindly retried
- [ ] Unknown response fields and command types handled per §4.4

---

*Questions about this specification: contact your Snack Quest
integration engineer.*
