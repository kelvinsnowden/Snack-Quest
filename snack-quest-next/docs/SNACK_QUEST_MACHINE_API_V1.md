# Snack Quest Machine API — Version 1

**Integration specification for vending machine manufacturers**

| | |
|---|---|
| API version | `1` (every response carries `SQ-API-Version: 1`) |
| Base URL | `https://www.snackquests.shop` |
| Transport | HTTPS only, JSON bodies (`Content-Type: application/json`, UTF-8) |
| Authentication | HMAC-SHA256 signed requests (§3) |
| Machine-readable spec | [`docs/openapi/machine-api-v1.yaml`](openapi/machine-api-v1.yaml) (OpenAPI 3.0) |
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

The environment is set by the key, not by the URL. A sandbox key
can see only sandbox machines, and a production key only production
machines. Using the wrong key for a machine returns the same
`404 machine_not_found` as a machine that doesn't exist.

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
  you send one.
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

**Node.js**

```js
import { createHash, createHmac, randomBytes } from 'node:crypto';

function signedHeaders({ keyId, secret, method, pathWithQuery, body }) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(16).toString('base64url');
  const bodyHash = createHash('sha256').update(body, 'utf8').digest('hex');
  const canonical = ['v1', timestamp, nonce, method.toUpperCase(), pathWithQuery, bodyHash].join('\n');
  const signature = createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
  return {
    'Content-Type': 'application/json',
    'X-SQ-Key-Id': keyId,
    'X-SQ-Timestamp': timestamp,
    'X-SQ-Nonce': nonce,
    'X-SQ-Signature': `v1=${signature}`,
  };
}

const body = JSON.stringify({ eventId: 'hb-NV0001-000418', uptimeSeconds: 86400 });
const path = '/api/v1/machines/SQ-MCH-000001/heartbeat';
await fetch(`https://www.snackquests.shop${path}`, {
  method: 'POST',
  headers: signedHeaders({ keyId, secret, method: 'POST', pathWithQuery: path, body }),
  body, // the same string that was hashed
});
```

**Python**

```python
import hashlib, hmac, json, secrets, time, requests

def signed_headers(key_id, secret, method, path_with_query, body: bytes):
    timestamp = str(int(time.time()))
    nonce = secrets.token_urlsafe(16)
    body_hash = hashlib.sha256(body).hexdigest()
    canonical = "\n".join(["v1", timestamp, nonce, method.upper(), path_with_query, body_hash])
    signature = hmac.new(secret.encode(), canonical.encode(), hashlib.sha256).hexdigest()
    return {
        "Content-Type": "application/json",
        "X-SQ-Key-Id": key_id,
        "X-SQ-Timestamp": timestamp,
        "X-SQ-Nonce": nonce,
        "X-SQ-Signature": f"v1={signature}",
    }

body = json.dumps({"eventId": "hb-NV0001-000418", "uptimeSeconds": 86400}, separators=(",", ":")).encode()
path = "/api/v1/machines/SQ-MCH-000001/heartbeat"
requests.post("https://www.snackquests.shop" + path, data=body,
              headers=signed_headers(KEY_ID, SECRET, "POST", path, body))
```

**C (embedded controllers).** Any HMAC-SHA256 implementation works,
for example mbedTLS `mbedtls_md_hmac` or wolfSSL `wc_HmacSetKey`. Build
the canonical string in a buffer and sign it. Test against §3.3 before
anything else.

### 3.5 Replay protection, clocks and rotation

- **Timestamp window.** A request whose `X-SQ-Timestamp` is more than
  **300 seconds** from Snack Quest's clock is refused
  (`401 stale_timestamp`). Keep machine clocks NTP-synchronised. If you
  can't, see §7.
- **Nonces are single-use.** A nonce is accepted once per key. Sending
  the same signed request twice gets `401 replayed_request`. To
  **retry**, sign the request again with a new nonce and timestamp.
  Idempotency (§4.3) is carried by the body's `eventId`, not the
  nonce, so a re-signed retry is still safe.
- **Rotation.** Ask Snack Quest for a second key while the first is
  still active, and deploy it. When all traffic uses the new key, the
  old one is revoked. Both work during the overlap. Keys can also be
  issued with an expiry date (`401 key_expired` afterwards).
- **Compromise.** If a secret may have leaked, tell us. Revocation
  takes effect on the next request (`401 key_revoked`).

### 3.6 Device credentials (alternative for firmware)

A machine may also authenticate as itself, with the per-machine
credential Snack Quest issues when it registers the unit:

```
Authorization: Bearer {deviceCredentialId}:{deviceSecret}
```

A device credential can reach **only its own machine**, and only the
`/api/v1/machines/{machineCode}/…` endpoints. It can't call
`connect` or webhooks. Use it when each machine talks to Snack Quest
directly and you would rather not distribute a manufacturer-wide
secret to every unit. Integration credentials (§3.1–3.5) are the
right choice when your cloud speaks for your fleet.

---

## 4. Request and response conventions

### 4.1 Envelope

Success:

```json
{ "data": { … }, "meta": { "apiVersion": "1" } }
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
- Responses carry `Cache-Control: no-store`.

### 4.2 Status codes and what to do

| Status | Meaning | Retry? |
|---|---|---|
| `200` / `202` | Done / accepted | No |
| `400 invalid_json` | Body isn't JSON | No: fix the client |
| `401` | Authentication failed (§11) | Only after fixing the cause. `stale_timestamp`: fix the clock, then re-sign |
| `404` | Machine, command or manufacturer not found *for these credentials* | No |
| `409` | State conflict (e.g. expired command) | No: see the code |
| `413 payload_too_large` | Body over 256 KB | No: split it |
| `422` | Well-formed but breaks the contract | No: fix the payload |
| `5xx` / network error | Snack Quest failed or was unreachable | **Yes**, with backoff, re-signed, same `eventId` |

Recommended backoff: 1 s, 2 s, 4 s, 8 s … capped at 60 s, with jitter.
Keep unsent reports in durable storage on the machine so they survive
a reboot and are sent when connectivity returns.

### 4.3 Idempotency

Everything you **report** carries an id you choose: `eventId`, or
`reportId` for inventory. It's unique per machine per occurrence.
Snack Quest applies each id **once**:

- A repeated report is accepted and ignored (`{"accepted": false}` or
  `{"applied": false}`). It isn't an error, so treat it as success.
- So after a timeout you **can always resend**. You can't cause a
  double count, a double refund or a double sale.
- Never reuse an id for a *different* occurrence. The second report
  would be silently ignored.

A good pattern is `{kind}-{manufacturerMachineId}-{monotonic counter}`,
where the counter is persisted across reboots.

Everything Snack Quest **sends you** carries a `commandId`. Execute a
command at most once, whatever you receive later (§6).

### 4.4 Forward compatibility

- **Snack Quest ignores unknown request fields.** You may send fields a
  newer version defines, and older servers won't fail.
- **You must ignore unknown response fields.** We add fields without a
  version change (§10).
- Unknown `type` values in `GET …/commands` must be **acknowledged and
  reported `failed`** with `failureReason: "unsupported command"`,
  never silently dropped.

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

**Response `202`**: `{"data": {"accepted": true}}`. `accepted: false`
means this `eventId` was already received.

Send one every `heartbeatIntervalSeconds`. A machine silent for more
than 5 minutes shows as **degraded** to operations staff, and after
15 minutes as **disconnected**. A disconnected machine is not sent
dispenses. An order placed on it is refused and refunded instead of
waiting for a machine that isn't there.

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

**Response `202`**: `{"data": {"accepted": true}}`

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

1–500 slots and quantities of 0–10,000.

**Response `200`**

```json
{
  "data": {
    "slotsReported": 3,
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
{ "data": { "recorded": 3, "duplicates": 0, "unknownTypes": ["COIN_MECH_JAM"], "unmappedSlots": [] } }
```

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
    ]
  }
}
```

- Poll every `pollIntervalSeconds` (§5.2) while the machine is
  idle. A customer is standing at the machine, waiting.
- Dispenses come first. `slotId` is **your** slot id.
- The same command is returned on every poll until you acknowledge
  it. That's why execution must be keyed on `commandId`.
- `type` values in v1 are `dispense` and `restart`. More may be added
  (§4.4).

### 6.2 Acknowledge: `POST /api/v1/machines/{machineCode}/commands/{commandId}/ack`

No body. Call it **before** you actuate anything.

**Response `200`**: `{"data": {"commandId": "DSP-3F9A1C22", "status": "acknowledged"}}`

**`409 command_expired` or `409 invalid_command_state` means do not
execute.** A dispense command is valid for **2 minutes** after
`issuedAt`. If you acknowledge it later, Snack Quest has already
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

`failureCode` (for `failed`) is one of:

| Code | Meaning |
|---|---|
| `jam` | Product stuck or motor stalled |
| `no_product` | Slot empty |
| `sensor_failure` | Sensor fault, but certain nothing dropped |
| `timeout` | Mechanism didn't finish in time and nothing dropped |
| `machine_offline` | Machine couldn't act (e.g. lost power before starting) |
| `failed` | Any other certain failure (default) |

**Response `200`**: `{"data": {"commandId": "DSP-3F9A1C22", "applied": true}}`

`applied: false` means this `eventId` was already applied, so your
retry was a no-op. Treat it as success.

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
- **TIMEOUT**: in flight for 15 minutes with no outcome. A human
  reviews it.
- **Payment status and dispense status are separate records.** A paid
  order with a failed dispense is a refund, not a sale.

---

## 7. Timestamps and clocks

- `occurredAt` is ISO-8601 **with an offset**, for example
  `2026-09-27T09:14:05+03:00` or `…Z`. It's optional; when you omit
  it, Snack Quest uses the time it received the report.
- Snack Quest uses your `occurredAt` only when it's plausible. It
  can't be more than 1 minute in the future, or more than 24 hours in
  the past. Otherwise the receive time is used, and your timestamp is
  kept for diagnostics. A machine with a broken RTC therefore
  can't corrupt the event history.
- **Request signing is stricter.** `X-SQ-Timestamp` must be within
  **5 minutes** (§3.5). A machine that can't keep time should sign
  from a time source it trusts. The `Date` header on any Snack Quest
  response is accurate to the second.

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
    "deliveryId": "whk_01J8…",
    "duplicate": false,
    "eventsRecorded": 4,
    "eventsDuplicate": 0,
    "dispenseOutcomesApplied": 1,
    "unmatchedMachines": ["NV-9999"],
    "unknownEventTypes": []
  }
}
```

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
`DISPENSE_SUCCESS`, `DISPENSE_FAILED` and `INVENTORY_MISMATCH`. You
don't send them. Anything unrecognised becomes `UNKNOWN_EVENT` with
the native name kept.

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

When a v2 is published, **v1 keeps working for at least 12 months**.
Every manufacturer with an active integration is told in writing, with
a changelog and the retirement date, before it happens.

---

## 11. Error reference

**Authentication (`401`)**

| Code | Cause | Fix |
|---|---|---|
| `missing_signature` | One of the four `X-SQ-*` headers is absent | Send all four |
| `unknown_key` | Key id not recognised | Check the key; mind sandbox vs production |
| `key_revoked` | Key revoked | Use your current key |
| `key_expired` | Past the key's expiry | Rotate |
| `wrong_key_kind` | `webhook` key on an API endpoint, or vice versa | Use the right credential |
| `stale_timestamp` | Clock more than 300 s off | Sync the clock (NTP) and re-sign |
| `invalid_nonce` | Nonce not 16–64 chars of `[A-Za-z0-9_-]` | Fix the generator |
| `invalid_signature` | Signature doesn't match | Check against §3.3: exact body bytes, path including query, uppercase method |
| `replayed_request` | Nonce already used | New nonce per request; re-sign retries |
| `unauthenticated` | Device bearer credential rejected (§3.6) | Check the device credential |

**Everything else**

| Status | Code | Meaning |
|---|---|---|
| 400 | `invalid_json` | Body isn't valid JSON |
| 404 | `machine_not_found` | No such machine *for these credentials* (also: wrong environment, another manufacturer's machine) |
| 404 | `machine_not_provisioned` | `connect` for a manufacturer machine id nobody registered |
| 404 | `command_not_found` | No such command for this machine |
| 404 | `manufacturer_not_found` | Webhook slug doesn't match the credential |
| 403 | `manufacturer_suspended` | Integration suspended by Snack Quest |
| 409 | `command_expired` | Acknowledged after expiry. **Do not execute** |
| 409 | `invalid_command_state` | Command can't move to that state (e.g. already final). **Do not execute** |
| 413 | `payload_too_large` | Over 256 KB |
| 422 | `validation_failed` | Schema violation; see `details` |
| 422 | `dispense_events_not_accepted_here` | Dispense outcome sent to `/events`; use §6.3 |
| 422 | `invalid_status_for_command` | Wrong status for the command type |
| 422 | `unrecognised_payload` | Webhook body not in the agreed format |
| 422 | `webhooks_not_supported` | No webhook adapter configured for you yet |

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

**Certification checklist.** Each item needs evidence, such as a
sandbox run id, logs or a video of the physical test.

| Check | What we verify |
|---|---|
| Authentication | Signed requests accepted; bad signature, stale timestamp and replay are rejected and handled by your client |
| Machine identity | `connect` maps your id to the right machine; serial matches |
| Heartbeat | Heartbeats at the advertised interval for 24 h |
| Status | Door, temperature and faults reported accurately and promptly |
| Dispense | A real product dispensed from every slot type via §6 |
| Dispense confirmation | `dispensed` only when the product physically dropped |
| Failed dispense | A jammed or empty slot reports `failed` with the right code |
| Timeout handling | An expired command is never executed (§6.2) |
| Duplicate protection | A command re-polled or re-delivered is executed once |
| Offline recovery | Reports made while offline are delivered after reconnection, deduplicated |
| Inventory | Reported counts match physical counts (if `inventory_read`) |
| Webhooks | Signed deliveries, retries, deduplication (Model A only) |
| Error handling | 4xx vs 5xx behaviour per §4.2 |
| Security | Secrets stored securely, never logged, never in a mobile or web client |

Inventory and webhooks may be marked *not applicable* for models or
integrations that don't have them. Everything else is required.

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
every pollIntervalSeconds:
  for cmd in GET /commands:
    if store.has(cmd.commandId): continue                 # executed before: never twice
    if cmd.type not in SUPPORTED:
      ack(cmd); report(cmd, failed, reason="unsupported command"); continue
    r = ack(cmd)
    if r.status == 409: store.put(cmd.commandId, "refused"); continue   # expired: do not dispense
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

- [ ] Signing matches the test vector in §3.3
- [ ] New nonce and timestamp on every request, including retries
- [ ] Secret stored securely; never logged or shipped in a client app
- [ ] Clock NTP-synchronised (±5 min at worst)
- [ ] `connect` on boot; description re-read periodically
- [ ] Heartbeats and polling at the intervals from §5.2
- [ ] Every report has a unique, persisted `eventId`; the same id on retry
- [ ] Unsent reports survive a reboot and are sent on reconnection
- [ ] `commandId` persisted before actuation; a command never runs twice
- [ ] `409` on ack means **do not dispense**
- [ ] `dispensed` only on physical confirmation; `unknown` when unsure
- [ ] Late outcomes still reported
- [ ] 5xx and network errors retried with backoff; 4xx not blindly retried
- [ ] Unknown response fields and command types handled per §4.4

---

*Questions about this specification: contact your Snack Quest
integration engineer. Internal architecture notes live in
`docs/MACHINE_INTEGRATION_LAYER.md`.*
