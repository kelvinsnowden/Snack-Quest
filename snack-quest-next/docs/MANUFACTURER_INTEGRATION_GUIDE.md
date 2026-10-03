# Snack Quest Manufacturer Integration Guide

**Building your machines' integration with Snack Quest, step by step**

This guide walks you through the work in order. The rules themselves
are in the specification, and where the two differ the specification
wins:

| Document | Purpose |
|---|---|
| [`SNACK_QUEST_MACHINE_API_V1.md`](SNACK_QUEST_MACHINE_API_V1.md) | The contract: signing, endpoints, the dispense lifecycle, guarantees, errors |
| [`openapi/machine-api-v1.yaml`](openapi/machine-api-v1.yaml) | The same API, machine-readable (Postman, code generators) |
| [`MANUFACTURER_CERTIFICATION.md`](MANUFACTURER_CERTIFICATION.md) | How your model is certified before it can sell |
| [`machine-api/signing-test-vectors.json`](machine-api/signing-test-vectors.json) | Official signing test vectors |
| `sdk/typescript`, `sdk/python`, `sdk/c` | Reference code you can copy |

---

## 1. What exists today, and what you build

Please read this section first. It says plainly what Snack Quest already
runs, what has to be built for your hardware, and what isn't available
yet.

### Implemented and tested in Snack Quest

- **Machine API v1**: the ten operations in the specification (connect,
  describe, heartbeat, status, inventory, events, command poll,
  acknowledge, outcome report, webhook delivery).
- **Request signing**: HMAC-SHA256 signing with single-use nonces and a
  ±300-second timestamp window. Keys can be rotated (the old key keeps
  working for a grace period) and revoked (effective within 30 seconds).
  You can ask for machine-scoped keys.
- **Environments**: sandbox and production are separate. A sandbox key
  can't reach a production machine, and a production machine can't be
  activated before its model is certified.
- **Dispense lifecycle**: one dispense command per paid sale. A command
  must be collected within 2 minutes, and it runs only after it has been
  acknowledged. Outcome reports are deduplicated by `eventId`. A heartbeat
  answer tells you which outcomes Snack Quest is still waiting for.
- **Refund rules**: a sale is refunded only when the dispense provably
  didn't happen. Anything uncertain goes to a person.
- **Rate limits**: per machine and per endpoint, enforced across all
  Snack Quest servers together.
- **Webhooks**: a signed, deduplicated endpoint for Model A manufacturers.
- **Reference code**:
  - a TypeScript client and a Python client, each proven by a complete
    sale against the real server;
  - a C signing function, proven against every signing vector.
- **Certification tools**: an automated harness for Model B machines and
  an API probe for Model A APIs, both described in the certification guide.

### What you build (manufacturer-specific)

| Your integration | You build | Snack Quest builds |
|---|---|---|
| **Model B**: your machine or cloud calls Snack Quest (recommended) | A client for the API: signing, reporting, the poll → acknowledge → dispense → report loop, and durable storage of executed commands and unsent reports. Plus the **sandbox control endpoints** the certification harness drives. | Nothing hardware-specific. Staff register your machines and map your slot ids. |
| **Model A**: Snack Quest calls your cloud | An HTTPS API (§6 describes what it must provide), and signed webhooks for outcomes and events | An **adapter** for your API, written and tested against your sandbox. Snack Quest's reference adapter is a sandbox-only template, so a production adapter is written for your API specifically. |

### Not available yet

- **Push delivery of commands** (MQTT, WebSocket). Machines poll; the
  answer to each poll says when to poll next (every 2 seconds while a
  customer is paying at that machine, otherwise every 10).
- **Production for Model A.** A Model A integration can be built and
  tested in the sandbox today, with the reference adapter and the API
  probe. To reach production it needs two things Snack Quest builds
  for your API, and neither exists yet for any manufacturer:
  - a production adapter;
  - a certification harness run through that adapter.

  See [`MANUFACTURER_CERTIFICATION.md`](MANUFACTURER_CERTIFICATION.md#4-model-a-the-api-probe).
- **Self-service credentials.** Keys are issued, rotated and revoked by
  Snack Quest staff on request.
- **Reading slots and prices from the machine.** Prices live in Snack
  Quest. Your machine learns them from `describe` (§5.2 of the spec) and
  never sets them.

One behaviour you should design for: Snack Quest doesn't reserve stock
while a customer is paying. If two customers pay for the last item in a
slot at the same moment, the second dispense reaches a slot that is
empty. Report `failed` with `failureCode: "no_product"` and the customer
is refunded. Never report `dispensed` unless a product physically dropped.

---

## 2. Choose your model

Choose **Model B** if your machine, or your own cloud, can make outbound
HTTPS requests. It needs no inbound connectivity, you control the whole
client, and it's the model the automated certification covers.

Choose **Model A** if your machines are already controlled through your
own cloud API and you would rather Snack Quest call it. Expect a joint
engineering phase while Snack Quest writes and tests the adapter against
your sandbox.

You can also mix them, for example Model A for dispenses with some
events pushed by webhook. Agree on this with your integration engineer.

---

## 3. Get sandbox access

From Snack Quest you receive:

1. the **sandbox base URL** — a separate deployment from production
   (`https://www.snackquests.shop`), with its own data;
2. your **manufacturer slug** (used in the webhook URL);
3. a **sandbox API key**: a key id `sqk_test_…` and a secret `sqs_…`. The
   secret is shown once. Store it like a password;
4. one or more **sandbox machines** registered against your own machine
   ids (`manufacturerMachineId`), with your slot ids mapped;
5. for Model A, a **sandbox webhook key**, and Snack Quest will ask for
   your sandbox API base URL and an API key for it.

Sandbox and production are **separate deployments**. Build and certify
against the sandbox base URL; production (`https://www.snackquests.shop`)
never dispenses to or certifies a sandbox machine, and sandbox keys don't
exist there. Keep the base URL and the key together in your
configuration, so a unit can't end up with one environment's URL and
the other's key.

Never put a secret in a mobile app, a web page, a log line, a URL or a
source repository. Machine-scoped keys (spec §3.6) limit the damage if a
unit is compromised.

---

## 4. Sign requests

Every request carries four headers. The signature is an HMAC-SHA256
over six lines (spec §3.2):

```
v1
{timestamp}
{nonce}
{METHOD}
{path with query, exactly as sent}
{hex SHA-256 of the exact body bytes}
```

Before sending anything, check your implementation against **every**
vector in `signing-test-vectors.json`. Each example below was run against
the heartbeat vector in spec §3.3 and reproduces it exactly.

### Node.js (18+, no dependencies)

```js
import { createHash, createHmac, randomBytes } from 'node:crypto';

export function signedHeaders({ keyId, secret, method, pathWithQuery, body = '', timestamp = Math.floor(Date.now() / 1000), nonce = randomBytes(16).toString('base64url') }) {
  const bodyHash = createHash('sha256').update(body).digest('hex'); // hash the exact bytes you send
  const canonical = ['v1', timestamp, nonce, method.toUpperCase(), pathWithQuery, bodyHash].join('\n');
  const signature = createHmac('sha256', secret).update(canonical).digest('hex');
  return {
    'X-SQ-Key-Id': keyId,
    'X-SQ-Timestamp': String(timestamp),
    'X-SQ-Nonce': nonce,
    'X-SQ-Signature': `v1=${signature}`,
    'Content-Type': 'application/json',
  };
}

// Serialise once, sign those bytes, send those bytes.
const body = JSON.stringify({ eventId: 'hb-NV0001-000418', uptimeSeconds: 86400 });
const path = '/api/v1/machines/SQ-MCH-000001/heartbeat';
const response = await fetch(`https://www.snackquests.shop${path}`, {
  method: 'POST',
  headers: signedHeaders({ keyId: process.env.SQ_KEY_ID, secret: process.env.SQ_SECRET, method: 'POST', pathWithQuery: path, body }),
  body,
});
```

### Python (3.8+, standard library only)

```python
import base64, hashlib, hmac, secrets, time

def signed_headers(key_id, secret, method, path_with_query, body=b"", timestamp=None, nonce=None):
    timestamp = int(time.time()) if timestamp is None else timestamp
    nonce = nonce or base64.urlsafe_b64encode(secrets.token_bytes(16)).rstrip(b"=").decode()
    body_hash = hashlib.sha256(body).hexdigest()  # hash the exact bytes you send
    canonical = "\n".join(["v1", str(timestamp), nonce, method.upper(), path_with_query, body_hash])
    signature = hmac.new(secret.encode(), canonical.encode(), hashlib.sha256).hexdigest()
    return {
        "X-SQ-Key-Id": key_id,
        "X-SQ-Timestamp": str(timestamp),
        "X-SQ-Nonce": nonce,
        "X-SQ-Signature": "v1=" + signature,
        "Content-Type": "application/json",
    }
```

### C (embedded controllers)

`sdk/c/sq_sign.c` and `sq_sign.h` implement the signature in C99, with
OpenSSL for SHA-256 and HMAC. On mbedTLS or wolfSSL, replace the two
functions marked *crypto backend* and keep the rest. `sdk/c/vector_check.c`
runs one vector, and Snack Quest's test suite compiles it and checks
every vector.

```c
#include "sq_sign.h"

const char *body = "{\"eventId\":\"hb-NV0001-000418\",\"uptimeSeconds\":86400}";
char timestamp[16], nonce[23], header[SQ_SIGNATURE_HEADER_LEN + 1];
snprintf(timestamp, sizeof timestamp, "%ld", (long)(time(NULL) + clock_offset));
make_nonce(nonce, sizeof nonce);   /* yours: 16 random bytes, base64url, from a hardware RNG */

if (sq_sign(secret, "POST", "/api/v1/machines/SQ-MCH-000001/heartbeat", timestamp, nonce,
            (const unsigned char *)body, strlen(body), header, sizeof header) != 0) {
  /* do not send an unsigned request */
}
/* send headers X-SQ-Key-Id, X-SQ-Timestamp: timestamp, X-SQ-Nonce: nonce, X-SQ-Signature: header */
```

On a controller:

- Take nonces from a hardware random number generator, never from `rand()`.
- Keep the clock NTP-synchronised. If you get `401 stale_timestamp`,
  set `clock_offset` from `error.details.serverTimestamp` and re-sign.

### Signing mistakes we see most often

| Symptom | Cause |
|---|---|
| `invalid_signature` on POST, GET works | You hashed a different serialisation of the body from the one you sent (pretty-printing, key order, re-encoding) |
| `invalid_signature` only with query strings | The query string was left out of the signed path, or re-ordered |
| `replayed_request` on retries | A retry re-sent the same nonce. Every attempt needs a new nonce and a new signature (and the same `eventId`) |
| `stale_timestamp` | Your clock is more than 300 seconds out. Correct it from `details.serverTimestamp` |
| `environment_mismatch` | A sandbox key used on a production machine, or the reverse |

---

## 5. Model B, step by step

The reference clients do all of this. Copy
`sdk/typescript/snackQuestMachine.ts` (Node 18+) or
`sdk/python/snack_quest_machine.py` (Python 3.8+) and read their header
comments. `sdk/python/example_machine.py` is a complete minimal machine.

### 5.1 Boot: connect and read your description

```ts
import { SnackQuestMachineClient, newEventId } from './snackQuestMachine';

const sq = new SnackQuestMachineClient({ baseUrl: 'https://www.snackquests.shop', keyId: process.env.SQ_KEY_ID!, secret: process.env.SQ_SECRET! });
const connected = await sq.connect({ manufacturerMachineId: 'NV-0001', firmwareVersion: '4.2.1' });
if (!connected.ok) throw new Error(`connect refused: ${connected.error?.code}`); // e.g. machine_not_provisioned
const machineCode = connected.data!.machineCode;   // SQ-MCH-000001, used in every later URL
```

The description gives you `pollIntervalSeconds`, `heartbeatIntervalSeconds`,
your capabilities, and every slot with its price and whether it's
enabled. Read it again periodically (spec §5.2).

### 5.2 Report: heartbeat, status, inventory, events

```ts
await sq.heartbeat(machineCode, { eventId: newEventId('hb'), uptimeSeconds: 86400 });
await sq.status(machineCode, { eventId: newEventId('st'), online: true, doorOpen: false, temperatureCelsius: 6.5, faults: [] });
await sq.inventory(machineCode, { reportId: newEventId('inv'), slots: [{ slotId: 'motor-01', quantity: 6 }] });
await sq.events(machineCode, { events: [{ eventId: newEventId('ev'), type: 'DOOR_OPENED' }] });
```

- Every report has an `eventId` (a `reportId` for inventory) that is
  unique per occurrence. Persist it with the unsent report, and send the
  **same** id on every retry. Snack Quest counts it once.
- Send `occurredAt` with an explicit offset (`2026-09-27T09:14:05+03:00`)
  or `Z`. A timestamp without one is ignored and the time Snack Quest
  received the report is used instead (spec §7).
- The heartbeat answer may list `reportOutcomes`: dispenses Snack Quest
  is still waiting to hear about. Answer each from your persistent store
  exactly as the table in spec §5.3 says. In short: re-send a stored
  outcome, and report `failed` ("not executed") only if your store
  proves the command never ran. If the record is lost, report `unknown`.
- Each inventory report lists a slot at most once.

### 5.3 The dispense loop

This is the part that moves money and product. Follow it exactly:

```
every nextPollSeconds:
  resend anything in the outbox (same eventId)
  for each command in GET …/commands:
    executed before (commandId in your store)?  → skip; never run it twice
    type you don't implement?                   → ack, report failed "unsupported command"
    ack → anything but 200?                     → do NOT dispense
    store "commandId: executing"                → BEFORE the motor turns
    dispense
    store the outcome, put the report in the outbox, send it
on boot:
  anything stored as "executing" and never finished → report unknown ("power lost during dispense")
```

With the TypeScript client:

```ts
import { runPollCycle, type OutboxStore } from './snackQuestMachine';

const hardware = {
  async dispense(slotId: string) {
    const result = await motor.vend(slotId);               // your firmware
    if (result.dropSensorConfirmed) return { outcome: 'dispensed' as const };
    if (result.jammed) return { outcome: 'failed' as const, failureCode: 'jam', reason: result.detail };
    if (result.slotEmpty) return { outcome: 'failed' as const, failureCode: 'no_product' };
    return { outcome: 'unknown' as const, reason: 'drop sensor did not confirm' }; // never guess "dispensed"
  },
};
const outbox: OutboxStore = persistentOutbox('/var/lib/sq/outbox.json');  // yours: must survive a reboot

let wait = 10;
for (;;) {
  const { nextPollSeconds } = await runPollCycle(sq, machineCode, hardware, outbox);
  wait = nextPollSeconds;
  await new Promise((resolve) => setTimeout(resolve, wait * 1000));
}
```

`runPollCycle` handles the outbox, the acknowledgement rule and unknown
command types. What it can't do for you is keep **your own** record of
executed `commandId`s across reboots. That record is what stops a
command running twice after a restart.

`failureCode` values: `jam`, `no_product`, `sensor_failure`, `timeout`,
`machine_offline`, `failed`. Use `unknown` whenever you can't tell
whether a product dropped. A person resolves it and the customer is
never charged for something they didn't get.

### 5.4 Errors and retries

| Answer | Do |
|---|---|
| `2xx` | Done. Remove the report from the outbox |
| `401 stale_timestamp` | Correct the clock offset, re-sign, retry |
| other `401`, `403`, `404`, `409`, `422` | Don't retry blindly; the request is wrong. `409` on a command means **do not execute it** |
| `429` | Wait `Retry-After`, re-sign with a new nonce, retry with the same `eventId` |
| `5xx`, timeout, network error | Retry with backoff (1 s, 2 s, 4 s … up to 60 s, with jitter), re-signed, same `eventId` |

Log `SQ-Request-Id` with every report. It's how Snack Quest support
finds your request.

### 5.5 Build the sandbox control endpoints

Certification drives your sandbox machine remotely through a small
control API that you host. It is described in
[`MANUFACTURER_CERTIFICATION.md`](MANUFACTURER_CERTIFICATION.md#3-sandbox-control-endpoints).
Build it alongside the client. The certification run fails without it,
and it's also the quickest way to test your own changes.

---

## 6. Model A, step by step

### 6.1 The API Snack Quest calls

The adapter Snack Quest writes for you needs your API to provide at
least the following. If your API already has equivalents under other
names, send us the documentation; the semantics matter more than the
paths. This is the contract Snack Quest's reference adapter and API
probe are written against:

| Call | Must do |
|---|---|
| `GET /v1/machines/{yourMachineId}` | `200 { online, doorOpen?, temperatureC?, faults?, paymentDeviceOk?, serial?, model?, firmware? }`. `404` for an unknown machine |
| `PUT /v1/machines/{yourMachineId}/vends/{commandRef}` with body `{ slot }` and header `Idempotency-Key: {commandRef}` | **Create or return** the vend for that reference. `2xx { accepted: true }` means accepted; `2xx`/`422 { accepted: false, reason }`, `400` or `404` means refused. The same reference sent again must return the same vend and never dispense a second time |
| `GET /v1/machines/{yourMachineId}/vends/{commandRef}` | `200 { state: pending \| dispensing \| dispensed \| failed, failureCode?, reason? }`. `404` means the vend never arrived |

Authentication: Snack Quest sends `Authorization: Bearer {key}`, where
the key is one you issue to Snack Quest for each environment. Snack
Quest stores it encrypted, can rotate it (with roll-back) or revoke it,
and never shows it to anyone after it's entered. Your base URL must be
public HTTPS; Snack Quest refuses private, loopback and cloud-metadata
addresses.

How Snack Quest reads your answers, so you can make them unambiguous:

| Your answer | Snack Quest treats the vend as |
|---|---|
| `2xx { accepted: true }` | Accepted. It waits for the outcome |
| `2xx`/`422 { accepted: false }`, `400`, `404` | Refused. The customer is refunded |
| Connection refused, DNS or TLS failure | Never sent. Retried with the same reference, then refunded |
| `408`, `429` | Not processed. Retried with the same reference (honouring `Retry-After` up to 5 s), then unknown |
| `5xx`, timeout, a dropped or partial response, a malformed body, `409`, a redirect | **Unknown.** The vend may exist. Snack Quest looks it up with the `GET` above and never re-sends it under a new reference |

That's why the `PUT` must be idempotent and the lookup must be accurate.
Together they are what lets a timeout end without a double dispense or a
wrongful refund.

### 6.2 Webhooks you send

Outcomes and events reach Snack Quest as signed webhooks (spec §8), at
`POST /api/v1/webhooks/manufacturers/{your slug}`. Sign them with your
**webhook** key, exactly as in §4 of this guide:

```js
const delivery = JSON.stringify({
  id: 'whk_01J8Z6Q4M2',                       // unique per delivery
  events: [
    { id: 'evt_77', kind: 'vend.completed', machine: 'NV-0001', at: '2026-09-27T09:21:52+03:00', detail: { requestId: 'DSP-3F9A1C22' } },
  ],
});
const path = '/api/v1/webhooks/manufacturers/nairobi-vending';
await fetch(`https://www.snackquests.shop${path}`, {
  method: 'POST',
  headers: signedHeaders({ keyId: WEBHOOK_KEY_ID, secret: WEBHOOK_SECRET, method: 'POST', pathWithQuery: path, body: delivery }),
  body: delivery,
});
```

The payload above is the reference format. Your own format works too,
because the adapter translates it, provided every delivery carries:

- a delivery id;
- an id for each event;
- your machine id;
- an event kind;
- for vend outcomes, the Snack Quest reference you were given in the
  `PUT`;
- for failures, a reason code.

Redeliver on anything but `2xx` (`200` with `duplicate: true` also means
stop).

### 6.3 Probe your API before certification

Once your sandbox API is up, Snack Quest runs the **API probe** against
it. The probe checks that a wrong key is refused, that machine status is
readable, that an unknown vend reference is `404`, and (with a sandbox
vend) that the same reference sent twice creates one vend that can be
looked up. See [`MANUFACTURER_CERTIFICATION.md`](MANUFACTURER_CERTIFICATION.md#4-model-a-the-api-probe).

---

## 7. Go to production

1. Your model passes certification ([`MANUFACTURER_CERTIFICATION.md`](MANUFACTURER_CERTIFICATION.md)).
2. Snack Quest issues **production** keys (`sqk_live_…`). Deploy them
   together with the production base URL (`https://www.snackquests.shop`),
   the way you deployed sandbox keys with the sandbox URL; never ship a
   sandbox key or the sandbox URL in production firmware.
3. Staff register and activate your production machines.
4. Watch for `SQ-Credential-Status: rotating` on responses. It means a
   new key has been issued and the old one stops working at
   `SQ-Credential-Grace-Ends`.

If a model's capabilities or firmware behaviour change in a way that
affects anything in the certification checklist, it has to be
re-certified.

---

## 8. Checklist before you ask for certification

- [ ] Signing reproduces every vector in `signing-test-vectors.json`
- [ ] A new nonce and signature on every attempt; the same `eventId` on every retry of the same report
- [ ] Secrets stored securely; never logged; never in a mobile or web client
- [ ] `commandId` stored **before** actuation; a command never runs twice, including after a reboot
- [ ] Anything but `200` on acknowledgement means the command doesn't run
- [ ] `dispensed` only on physical confirmation; `unknown` when unsure; `no_product` for an empty slot
- [ ] Unsent reports survive a reboot and are sent when the machine reconnects
- [ ] Unknown command types acknowledged and reported `failed` ("unsupported command")
- [ ] `stale_timestamp`, `429` and `5xx` handled per §5.4
- [ ] `reportOutcomes` answered per spec §5.3 (`unknown` when your record is lost, never `failed`)
- [ ] Sandbox control endpoints deployed, including `hold`, `retransmit`, `request-log` and `defer-report` (Model B), or API probe passing (Model A)

*Questions: contact your Snack Quest integration engineer.*
