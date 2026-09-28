# Snack Quest — Machine Gateway API Integration Guide

> **New integrations should use the Snack Quest Machine API v1**
> (`docs/SNACK_QUEST_MACHINE_API_V1.md`): signed manufacturer
> credentials, Snack Quest machine codes, per-manufacturer slot names,
> and an explicit dispense-command lifecycle. The per-machine API below
> remains supported for machines already built against it.

**Audience:** the engineering team building the gateway software that
runs on (or alongside) a physical Snack Quest Discovery Machine.

**Scope:** everything your gateway needs to call to sell a product,
report what happened, and keep the machine's status current in our
system. This document only covers calls **your gateway makes to us**.
Snack Quest's cloud never calls out to the machine — every interaction
is initiated by your gateway, which is why several flows below are
poll-based rather than push-based.

---

## 1. Architecture in one paragraph

Your gateway is the only software that talks to both sides: the
physical vending mechanism (motors, sensors, coin/bill hardware,
however your controller works internally) and our cloud API over
HTTPS. It authenticates as one specific machine and is responsible
for five things: reporting itself in (heartbeat/status/faults), fetching
its own product catalog, running the buy → wait-for-authorization →
dispense → report cycle for each sale, polling for and executing any
remote commands we issue, and doing all of the above in a way that
survives a flaky or intermittent internet connection without ever
double-charging a customer or double-dispensing a product.

```
┌─────────────────────┐        HTTPS, machine bearer token        ┌──────────────────────┐
│   Your Gateway        │ ─────────────────────────────────────▶ │   Snack Quest Cloud    │
│  (runs on/near the    │ ◀───────────────────────────────────── │  (this API)            │
│   physical machine)   │              JSON responses             │                        │
└──────────┬─────────────┘                                        └───────────┬────────────┘
           │                                                                   │
           │ MDB / DEX / your own                                             │ M-Pesa (Safaricom
           │ controller protocol                                              │ Daraja) — handled
           ▼                                                                   │ entirely server-side
┌─────────────────────┐                                                       ▼
│  Vending mechanism    │                                          Customer's phone gets
│  (motors, sensors,    │                                          the M-Pesa prompt
│   coin/bill hardware) │
└─────────────────────┘
```

Everything below this line is HTTPS, JSON, over the top arrow.

---

## 2. Base URL and environments

| Environment | Base URL |
|---|---|
| Production | `https://www.snackquests.shop` |

Every path below is relative to that base URL, e.g.
`POST /api/vending/telemetry` means
`POST https://www.snackquests.shop/api/vending/telemetry`.

There is currently one environment. We will provide a separate staging
base URL and a set of test credentials for integration testing before
any physical rollout — ask your Snack Quest contact for these when
you're ready to start testing against a running server rather than
reading this document.

---

## 3. Authentication

Your gateway is not a user — it has no login, no password, no session.
It authenticates as **one specific machine**, using a bearer credential
we issue at provisioning time:

```
Authorization: Bearer <machineId>:<secret>
```

- `machineId` and `secret` are both given to you once, at the time we
  provision the machine on our side (see §4). There is no self-registration
  endpoint — a machine's credential is only ever created by Snack Quest staff.
- **The secret is shown to us exactly once**, in the provisioning response.
  We do not store it in a retrievable form, and we cannot look it up or
  resend it later. Store it securely on the gateway (flash it into the
  device's own configuration/secure storage) the moment you receive it.
- Every device-facing endpoint in this document requires this header.
  Missing or malformed headers, an unrecognized `machineId`, or a
  `secret` that doesn't match return `401 Unauthorized`:

  ```json
  { "error": "missing_header" }
  { "error": "malformed_token" }
  { "error": "unknown_machine" }
  { "error": "invalid_secret" }
  ```

- A credential is scoped to exactly one machine. Your gateway can only
  ever act as, fetch data for, or report on **the machine it authenticated
  as** — never another one, even if you happen to know another machine's id.
- If a credential is compromised, we revoke it — the very next request
  using it is rejected, immediately, no grace period. If that happens,
  contact Snack Quest for a replacement credential.

---

## 4. Provisioning a machine (before your gateway can call anything)

This step happens on our side, not yours. When a physical machine is
ready to ship or install, Snack Quest staff provisions it in our system
and receives:

```json
{
  "machineId": "9f2b1c4e5a3d7f10",
  "credential": {
    "credentialId": "c_8a91f0",
    "machineId": "9f2b1c4e5a3d7f10",
    "secret": "b7e2...9c0a",
    "issuedAt": "2026-01-15T09:00:00.000Z"
  }
}
```

`machineId` and `credential.secret` are what get flashed onto that
specific physical unit before it ships or is installed. There is
nothing for your gateway to do to "register" — by the time it makes
its first call, the machine already exists in our system and the
credential is already active.

---

## 5. The full sale, end to end

This is the sequence your gateway runs every time a customer buys
something. Steps 1–2 happen on your machine's screen; steps 3–6 are the
API calls.

```
Customer picks a product on the screen
         │
         ▼
1. Gateway collects the customer's M-Pesa phone number
         │
         ▼
2. POST /api/vending/payments  →  { transactionId, checkoutRequestId, ... }
   Customer's phone receives an M-Pesa STK push prompt
         │
         ▼
3. Gateway polls  GET /api/vending/payments/{transactionId}
   until status is a terminal one:
     • "vend_authorized"   → proceed to dispense (step 4)
     • "payment_failed"    → tell the customer, stop here
     • "paid_vend_failed"  → payment succeeded but we could not
                              authorize the vend (e.g. slot went
                              out of stock) — refund is handled by
                              Snack Quest, tell the customer, stop
         │  (vend_authorized)
         ▼
4. Gateway physically dispenses the product from the slot.
   This is the one step Snack Quest's cloud has no visibility into —
   your gateway owns the actual motor/relay/sensor logic.
         │
         ▼
5. POST /api/vending/transactions  →  report what actually happened
   (success, jam, empty, sensor failure, timeout, or "unknown")
         │
         ▼
6. Done. The customer screen shows the outcome from step 5's result.
```

**Nothing in steps 3–4 is optional or skippable.** Payment is verified
by Snack Quest server-side (against Safaricom directly) — your gateway
never decides whether a payment succeeded, it only polls to find out.
Conversely, **only your gateway knows whether the product actually
came out** — we never assume "authorized" means "dispensed", which is
exactly why step 5 exists as its own explicit report.

**Timing:** if a transaction sits in `paid` or `vend_authorized` for
more than **15 minutes** with no report from your gateway, we move it
to `manual_review` and it's handled by Snack Quest staff. A late report
after that point is still accepted and still resolves it correctly —
but avoid letting that happen; report the real outcome as soon as you
know it, even if dispensing failed.

---

## 6. Endpoint reference

All request/response bodies are JSON. All timestamps are ISO 8601
strings. All endpoints below require the `Authorization` header from
§3 unless stated otherwise.

### 6.1 `POST /api/vending/telemetry` — heartbeat and status reporting

Send this on a schedule (we recommend every 60 seconds) and whenever
something notable happens (a fault, a door open/close, connectivity
change). This is how we know the machine is alive; it has no financial
effect.

**Request**

```json
{
  "machineId": "9f2b1c4e5a3d7f10",
  "eventType": "heartbeat",
  "idempotencyKey": "hb-9f2b1c4e5a3d7f10-1706000000000",
  "deviceTimestamp": "2026-01-23T09:00:00.000Z",
  "payload": {}
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `machineId` | string | yes | Should match the machine you authenticated as. |
| `eventType` | string | yes | One of the event types in the table below. |
| `idempotencyKey` | string | yes | **Must be unique per distinct event.** If you retry a send (e.g. after a dropped response while offline), reuse the *same* key — we recognize the duplicate and it has no second effect. A fresh key on every retry defeats this and is treated as a brand-new event. |
| `deviceTimestamp` | string (ISO 8601) | no | Your gateway's own clock at the time of the event. Never used for ordering on our side — only kept as a fact about when you say it happened. |
| `payload` | object | no | Event-specific detail. See below. Defaults to `{}`. |

**Event types**

| `eventType` | Meaning | `payload` |
|---|---|---|
| `heartbeat` | "I'm alive." Send on your regular schedule. | `{}` |
| `status` | General status snapshot. | Free-form; not currently parsed by us — send whatever you have (door state, temperature, fault list) for our audit log. |
| `fault` | Something is wrong. | `{ "code": "<your fault code as a string>" }` — this is the one field we currently read and surface to Snack Quest staff. |
| `temperature` | Temperature reading. | Free-form (e.g. `{ "celsius": 4.2 }`) — recorded for audit; not yet read by any live dashboard. |
| `door_open` / `door_close` | Door state changed. | `{}` — the event type itself carries the meaning. |
| `connectivity_online` / `connectivity_offline` | Your gateway's own network state changed. | `{}` |
| `stock_update` | You're reporting a stock count directly (rare — normally we derive stock from sale/restock events, not device reports). | Free-form (e.g. `{ "slotCode": "A01", "quantity": 6 }`) |

> Note: beyond `fault.code`, none of the other event types' `payload`
> contents are validated or parsed by us today — send whatever shapes
> above, and we'll store them verbatim for the audit trail. If you're
> unsure what to send for a given event, `{}` is always acceptable.

**Response — `200 OK`**

```json
{ "isNew": true, "eventId": "evt_a1b2c3", "eventType": "heartbeat" }
```

`isNew: false` means this exact `idempotencyKey` was already recorded
— your retry was recognized and safely ignored.

**Errors**

| Status | Body | Meaning |
|---|---|---|
| 400 | `{ "error": "invalid JSON body" }` | Body wasn't valid JSON. |
| 400 | `{ "error": "<detail>" }` | Payload didn't include a required field (`machineId`, `eventType`, or `idempotencyKey`). |
| 401 | see §3 | Auth failed. |
| 404 | `{ "error": "Machine <id> not found" }` | Shouldn't happen if your credential is valid — contact us if it does. |

---

### 6.2 `GET /api/vending/machines/{machineId}/catalog` — your product catalog

Fetch on startup and periodically after (we recommend every few
minutes, or whenever a customer starts a new session on the screen).
`{machineId}` in the path must be the same machine you authenticated
as — you cannot fetch another machine's catalog.

**Response — `200 OK`**

```json
{
  "catalogVersion": "2026-01-23T08:45:12.331Z",
  "items": [
    {
      "productId": "pkg_abc123",
      "productCatalogue": "package",
      "slotCode": "A01",
      "name": "Lay's Original Chips",
      "description": "Classic salted potato chips.",
      "imageUrl": "https://.../chips.jpg",
      "origin": null,
      "category": "chips",
      "priceKes": 150,
      "availabilityState": "available",
      "sellable": true,
      "displayOrder": 0,
      "promotionalState": "none"
    }
  ]
}
```

| Field | Notes |
|---|---|
| `catalogVersion` | Opaque string. Compare it against the last version you fetched — unchanged means nothing about the catalog changed, so you can skip re-rendering. It is **not** a timestamp of "now"; two consecutive fetches with nothing changed return the exact same string. |
| `slotCode` | The physical slot this product is loaded in — this is the identifier you'll use as `slotId` in §6.3 (yes, the field there is named `slotId` but its value is this `slotCode`, e.g. `"A01"` — not an internal database id). |
| `availabilityState` | One of `available`, `sold_out`, `unavailable`, `coming_soon`, `hidden`. Only render/allow purchase of items where this is `available` (equivalently, `sellable: true`). |
| `priceKes` | The price to charge, in Kenyan Shillings. Always trust this over anything cached — it already reflects any price change or promotion. |

**Errors**: `401` (see §3), `404` if the path's machine id doesn't match your credential.

---

### 6.3 `POST /api/vending/payments` — start a purchase

Called once the customer has picked one or more items and entered
their M-Pesa phone number.

**Request — single item**

```json
{ "slotId": "A01", "phoneNumber": "0712345678" }
```

**Request — a cart of multiple items (one STK push covers all of them)**

```json
{ "slotIds": ["A01", "B03"], "phoneNumber": "0712345678" }
```

| Field | Type | Notes |
|---|---|---|
| `slotId` / `slotIds` | string / string[] | The `slotCode`(s) from the catalog (§6.2) — **not** a database id. Use `slotId` for one item, `slotIds` for a cart of one or more. |
| `phoneNumber` | string | Kenyan format, with or without country code (`0712345678` or `+254712345678` both work). This is the only piece of customer information your gateway supplies — everything else about each item comes from the catalog server-side. |

**Response — `201 Created` (single item)**

```json
{
  "id": "txn_9f2b",
  "transactionRef": "TXN-9F2B1C4E",
  "checkoutRequestId": "ws_CO_23012026...",
  "customerMessage": "Check your phone to complete payment."
}
```

**Response — `201 Created` (cart)**

```json
{
  "checkoutRequestId": "ws_CO_23012026...",
  "merchantRequestId": "29115-...",
  "customerMessage": "Check your phone to complete payment.",
  "cartRef": "CART-3F91A2C0",
  "transactions": [
    { "id": "txn_9f2b", "transactionRef": "TXN-9F2B1C4E", "slotId": "A01", "amountKes": 150 },
    { "id": "txn_1a4d", "transactionRef": "TXN-1A4D8877", "slotId": "B03", "amountKes": 200 }
  ]
}
```

Poll each `id` individually with §6.4 — a cart shares one payment
prompt but each item has its own transaction status, since the
hardware still dispenses one slot at a time and one item's outcome
(e.g. jammed) never blocks the others.

**Errors**

| Status | Body | Meaning |
|---|---|---|
| 400 | `{ "error": "slotId or slotIds is required" }` | Missing item(s). |
| 400 | `{ "error": "phoneNumber is required" }` | Missing phone. |
| 400 | `{ "error": "<phone validation detail>" }` | Not a valid Kenyan number. |
| 401 | see §3 | Auth failed. |
| 404 | `{ "error": "Machine <id> not found" }` | Shouldn't happen with a valid credential. |
| 409 | `{ "error": "..." }` | The slot isn't sellable right now (disabled, no product assigned, or out of stock) — re-fetch the catalog, it's stale. |

---

### 6.4 `GET /api/vending/payments/{transactionId}` — poll for the outcome

Poll this after §6.3 until `status` is one of the terminal values
below. We suggest polling every 2–3 seconds; Safaricom's own prompt
typically resolves within 15–30 seconds, and you should give up and
show a timeout message to the customer if it hasn't resolved within
90 seconds (that doesn't cancel anything server-side — if a late
callback does arrive, the transaction still resolves correctly; you're
just choosing when to stop making your customer wait on-screen).

**Response — `200 OK`**

```json
{ "status": "vend_authorized", "vendRef": "vend_7c2e", "failureReason": null }
```

| `status` value | Terminal? | What it means |
|---|---|---|
| `pending` | no | Waiting on the customer to complete the M-Pesa prompt. |
| `payment_failed` | **yes** | Customer cancelled, entered wrong PIN, insufficient funds, etc. Nothing to dispense. |
| `paid` | no | Payment confirmed by Safaricom; we're about to authorize the vend (this state is normally very brief — you may not even observe it before it moves to `vend_authorized`). |
| `vend_authorized` | **yes — dispense now** | Payment confirmed and the vend is authorized. `vendRef` is now set — you'll need it for §6.5. Physically dispense the item, then report the result. |
| `paid_vend_failed` | **yes** | Payment succeeded but we could not authorize the vend (e.g. the slot became unavailable between catalog fetch and payment). Do not dispense. Refund is Snack Quest's responsibility. |
| `dispensed` | **yes** | Already reported as successfully dispensed (you'd only see this if you keep polling after already reporting §6.5 yourself). |
| `manual_review` | **yes** | Something needs a human — most commonly, your gateway never reported an outcome within 15 minutes of `vend_authorized`. |
| `refund_requested` / `refunded` | **yes** | A refund is in progress or complete. Not something your gateway causes or needs to act on. |

`failureReason` is set (a human-readable string) alongside `payment_failed` and `paid_vend_failed`, otherwise `null`.

**Errors**: `401` (see §3), `404` if the transaction id doesn't exist or doesn't belong to your machine.

---

### 6.5 `POST /api/vending/transactions` — report the dispense outcome

Call this exactly once you know the real outcome of physically
dispensing the item authorized in §6.4.

**Request**

```json
{
  "vendRef": "vend_7c2e",
  "dispensed": true,
  "status": "success",
  "failureReason": null,
  "deviceTimestamp": "2026-01-23T09:00:12.500Z",
  "idempotencyKey": "vend-result-txn_9f2b"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `vendRef` | string | yes | The value you got back from §6.4 when `status` became `vend_authorized`. This is how we know which transaction your report is about. |
| `dispensed` | boolean | yes | `true` only if the product actually came out. |
| `status` | string | no | One of: `success`, `failed`, `timeout`, `unknown`, `jam`, `no_product`, `sensor_failure`, `machine_offline`. If omitted, it's derived as `success` when `dispensed` is `true`, `failed` otherwise. **Always send the real status if you know it** — a jam and a sensor failure both mean "product didn't come out," but knowing which one happened matters to whoever restocks the machine. If you provide both `dispensed` and `status`, they must agree (`dispensed: true` requires `status: "success"` and vice versa) or we reject the report as malformed. |
| `failureReason` | string \| null | no | A free-text detail, shown to Snack Quest staff. |
| `deviceTimestamp` | string (ISO 8601) | no | When you say this happened. |
| `idempotencyKey` | string | no (but strongly recommended) | Same purpose as §6.1's — reuse it if you retry the same report. If omitted, we derive one from `vendRef`, which is safe for a single retry of the exact same result but not a substitute for supplying your own if you can. |

Use `status: "unknown"` — never guess `success` or a specific failure —
if your gateway genuinely cannot tell what happened (e.g. it lost
power mid-dispense and came back up with no memory of the outcome).
`unknown` routes the transaction to `manual_review` for a human to
sort out, which is exactly what should happen when nothing else can
know the truth.

**Response — `200 OK`**

```json
{ "applied": true, "transactionId": "txn_9f2b" }
```

`applied: false` (with `transactionId: null`) means one of: this exact
report was already applied (a safe, recognized retry), or no matching
transaction was found for that `vendRef` (double-check you're using
the value from §6.4, not something else).

**Errors**

| Status | Body | Meaning |
|---|---|---|
| 400 | `{ "error": "<manufacturer> adapter could not parse this payload: <detail>" }` | Body was missing a required field, or `dispensed`/`status` disagreed. |
| 401 | see §3 | Auth failed. |
| 404 | `{ "error": "Machine <id> not found" }` | Shouldn't happen with a valid credential. |

---

### 6.6 Remote commands — poll, acknowledge, complete

Run this poll on the same schedule as your heartbeat (§6.1). Today,
the only command type we issue is `restart` — think of this section as
"implement the full poll → ack → complete cycle now, so a future
second command type needs zero new plumbing on your end."

**`GET /api/vending/commands`** — fetch your machine's pending commands

```json
{
  "commands": [
    {
      "id": "cmd_5e11",
      "machineId": "9f2b1c4e5a3d7f10",
      "commandRef": "CMD-5E11F0A2",
      "commandType": "restart",
      "payload": null,
      "status": "pending",
      "requestedBy": "staff_uid_...",
      "expiresAt": "2026-01-23T10:00:00.000Z",
      "acknowledgedAt": null,
      "completedAt": null,
      "error": null,
      "createdAt": "2026-01-23T09:00:00.000Z"
    }
  ]
}
```

An empty `commands` array is the normal case — most polls will find
nothing. Don't treat that as an error.

**`POST /api/vending/commands/{id}/ack`** — acknowledge receipt, before you act on it

```json
{ "command": { "...": "same shape as above, status now \"acknowledged\"" } }
```

Errors: `404` if the command doesn't exist or isn't yours; `410 Gone`
if it expired before you acknowledged it (stop — don't execute it).

**`POST /api/vending/commands/{id}/complete`** — report what happened after you acted on it

Request:

```json
{ "success": true, "error": null }
```

or, if it failed:

```json
{ "success": false, "error": "restart script exited with code 1" }
```

Response: `{ "ok": true }`.

Errors: `400` if `success` isn't a boolean; `404` if the command doesn't exist or isn't yours; `409` if you try to complete a command that isn't currently `acknowledged` (e.g. completing one twice).

**The full cycle, every poll interval:**

```
GET /api/vending/commands
  for each command returned:
    POST /api/vending/commands/{id}/ack
    → execute it (today: restart your own process/OS)
    POST /api/vending/commands/{id}/complete  with the real outcome
```

---

## 7. Idempotency and retries — required reading

Your gateway will lose connectivity sometimes. When it reconnects and
retries something it's not sure succeeded, that retry must be safe.
This is why §6.1 and §6.5 both take an `idempotencyKey`:

- **Generate a fresh key per distinct event/report.** A heartbeat sent
  every 60 seconds gets 60 different keys over an hour, not the same one.
- **Reuse the exact same key when retrying the same event/report** — a
  heartbeat you weren't sure was received, a vend result you weren't
  sure was applied. We recognize the duplicate by that key and produce
  no second effect (the response tells you: `isNew: false` for
  telemetry, `applied: false` for vend results).
- A reasonable key scheme: `<eventType>-<machineId>-<your-own-monotonic-counter-or-uuid>`.
  For vend results specifically, keying off the transaction id you
  already have (e.g. `vend-result-<transactionId>`) is simplest, since
  you only ever report one outcome per transaction.

**What retrying safely does *not* mean:** you should still avoid
re-sending the same payment initiation (§6.3) blindly — that endpoint
has no idempotency key and calling it twice for the same customer
intent starts two separate M-Pesa prompts. Only initiate a payment
once per customer checkout action.

**HTTP-level retries:** on a `5xx` response or a network timeout,
retry with backoff (we suggest starting at 1–2 seconds, doubling, capping
around 30 seconds). On a `4xx` response, don't retry blindly — read the
error and decide (e.g. a `409` on §6.3 means re-fetch the catalog, not
"try the exact same request again").

---

## 8. What's explicitly out of scope for your gateway

To avoid duplicated effort on your side, these are **not** required
from you:

- **You do not need to expose any inbound API of your own.** Snack
  Quest's cloud never calls your gateway or machine directly — every
  interaction in this document is your gateway calling us.
- **You do not need to implement remote price changes, remote
  enable/disable, or live status queries initiated by us.** Those are
  internal, staff-facing tools on our side for a possible future phase
  and have no bearing on the integration in this document.
- **You do not need a push/real-time channel.** Polling, as described
  in §5 and §6.6, is the complete, correct mechanism today.

---

## 9. Quick reference — every endpoint

| Method & Path | Purpose | Typical frequency |
|---|---|---|
| `POST /api/vending/telemetry` | Heartbeat, faults, status | Every ~60s, plus on events |
| `GET /api/vending/machines/{machineId}/catalog` | Fetch your product catalog | On startup, then periodically |
| `POST /api/vending/payments` | Start a purchase | Once per checkout |
| `GET /api/vending/payments/{transactionId}` | Poll for payment/vend outcome | Every 2–3s until terminal |
| `POST /api/vending/transactions` | Report the dispense outcome | Once per authorized vend |
| `GET /api/vending/commands` | Poll for remote commands | Same schedule as heartbeat |
| `POST /api/vending/commands/{id}/ack` | Acknowledge a command | On receipt |
| `POST /api/vending/commands/{id}/complete` | Report a command's outcome | After executing it |

All require `Authorization: Bearer <machineId>:<secret>` (§3).

---

## 10. Questions

Send integration questions to your Snack Quest contact, along with:
your `machineId`, the endpoint and request you sent (redact the
`secret` if sharing a full request), the response you got, and roughly
when it happened — that's enough for us to find the exact request in
our logs.
