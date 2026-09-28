# Snack Quest Manufacturer Certification

**How a machine model is certified before it can sell through Snack Quest**

Certification is **per model**, happens in the **sandbox**, and ends
with a Snack Quest engineer signing off on the evidence. Snack Quest
won't issue production keys, or activate a production machine, for a
model that isn't certified. A model whose capabilities or behaviour
change has to be certified again.

Read this with the specification
([`SNACK_QUEST_MACHINE_API_V1.md`](SNACK_QUEST_MACHINE_API_V1.md) §12)
and the [integration guide](MANUFACTURER_INTEGRATION_GUIDE.md).

---

## 1. The checklist

These are the checks recorded against your model. Each needs **evidence**
(a harness run id, a sandbox transaction reference, a log, a video), and
a check without evidence can't be recorded. *Source* says who can record
it:

- **harness**: the automated harness, from a run against your machine;
- **engineer**: a Snack Quest engineer, from evidence you and they
  collect together;
- **harness only**: nobody can record it by hand.

| Check | What is verified | Source |
|---|---|---|
| Authentication | Signed requests accepted; no nonce reused; timestamps within ±300 s; no failed authentications during the run | harness (AUTHENTICATION + REPLAY PROTECTION) or engineer |
| Machine registration | `connect` maps your machine id to the right Snack Quest machine | harness (CONNECT) or engineer |
| Heartbeat | Heartbeats arrive and Snack Quest considers the machine online | harness (HEARTBEAT) or engineer |
| Status reporting | Status snapshots arrive with door, temperature and faults | harness (STATUS) or engineer |
| Inventory | An inventory report arrives and is compared against the ledger; that the counts match the physical slots is checked by an engineer. *Not applicable* for a model without `inventory_read` | harness (INVENTORY) or engineer |
| Product / slot mapping | Each of your slot ids drives the physical slot it is mapped to | engineer |
| Dispense command | Commands collected, **acknowledged before** any outcome, never executed after a refused acknowledgement | harness (COMMAND POLLING + ACKNOWLEDGEMENT) or engineer |
| Dispense confirmation | A paid sale ends `dispensed`, with one stock movement | harness (DISPENSE) or engineer |
| Failed dispense | A sale from an empty slot ends `failed`: the customer is refunded and no stock moves | harness (FAILURE HANDLING) or engineer |
| Idempotency | A re-sent outcome report is recognised as the same report and counted once; a command delivered twice is executed and reported once | harness (IDEMPOTENCY + DUPLICATE DELIVERY) or engineer |
| Error handling | 4xx vs 5xx behaviour per spec §4.2 | engineer |
| Webhooks | Signed deliveries, redelivery, deduplication. *Not applicable* without webhooks | engineer |
| Payment flow | A paid sandbox sale is dispensed and confirmed end to end | harness (DISPENSE) or engineer |
| Reconciliation | A command that expired while the machine held it is never executed; an outcome report that couldn't be sent is kept and delivered on a later cycle | harness (TIMEOUT HANDLING + OFFLINE RECOVERY) or engineer |
| Automated contract suite | A complete harness run against your model, verdict CERTIFIED | **harness only** |

The last check is why the harness matters. A model can't be certified
on hand-recorded evidence alone. Two more rules:

- *Not applicable* is refused for **Inventory** when the model declares
  inventory reporting, and for **Webhooks** when you deliver by webhook.
- After a certification is **revoked**, re-certifying needs a new
  harness run: a pass recorded before the revocation no longer counts.

---

## 2. The automated harness (Model B)

Snack Quest runs the harness from its admin console against one of your
**sandbox** machines. It never runs against production, and it refuses
to run on Snack Quest's production deployment.

**Before a run**

- Your sandbox machine is registered and its sandbox integration is
  active.
- One enabled slot holds at least 4 items on Snack Quest's ledger, and is physically loaded with at least 3 (three sales dispense before the slot is emptied).
- Your sandbox control endpoints (§3) are deployed and reachable over
  HTTPS.

**The script.** The harness runs these steps in order, advancing your
machine with `POST /cycle` whenever the machine needs to act:

1. **Come up.** One cycle (connect if needed, heartbeat, status,
   inventory, poll), then a door opened / door closed pair.
2. **A sale.** A paid sandbox sale from the test slot. The machine must
   collect the command, acknowledge it, dispense, and report `dispensed`.
   The harness then asks the machine to **retransmit** its last outcome
   report unchanged.
3. **A command delivered twice.** The harness sells again and asks the
   machine to **hold** the next command (fetch it, don't act yet); the
   next cycle's poll delivers the same command again. The machine must
   execute and report it **once**: two outcome reports for one command
   mean it ran twice.
4. **Offline recovery.** The harness sells again and asks the machine to
   **defer** the next outcome report, as if the network dropped just as
   it would be sent. The machine dispenses and keeps the report; after
   that cycle Snack Quest must not yet have the outcome, and the next
   cycle must deliver it.
5. **A sale it can't fulfil.** The harness asks the machine to make the
   test slot **empty**, then sells from it. The machine must acknowledge,
   try, and report `failed` (`no_product`).
6. **A command that expires in the machine's hands.** The harness sells
   again and asks the machine to **hold** the next command: fetch it,
   don't act on it yet. The harness expires the command on the server,
   then runs a cycle. The machine must try to acknowledge, receive
   `409 command_expired`, and **not** dispense.

**How it judges.** Every check is judged from what Snack Quest itself
recorded: the dispense ledger, the money ledger, stock movements,
events and signals. What the machine claims is never taken as evidence;
a machine that reports `dispensed` for an empty slot fails. The checks
are:

```
CONNECT  AUTHENTICATION  HEARTBEAT  STATUS  INVENTORY  EVENTS
COMMAND POLLING  ACKNOWLEDGEMENT  DISPENSE  FAILURE HANDLING
IDEMPOTENCY  REPLAY PROTECTION  TIMEOUT HANDLING
DUPLICATE DELIVERY  OFFLINE RECOVERY
```

**The verdict** is CERTIFIED only if every check passed. Each check that
doesn't pass is listed with what was observed, for example:

```
ACKNOWLEDGEMENT: history: sent → dispensing → dispensed
```

In that case the machine reported an outcome without acknowledging first.

A check the machine can't be driven through (because a control endpoint
is missing) is **not verified**, never passed, so that run is NOT
CERTIFIED. When Snack Quest records a run against your model, each
checklist item gets the run as evidence. The *Automated contract suite*
item is recorded as passed only for a CERTIFIED run. Checklist items
whose harness checks weren't verified are left for an engineer.

Snack Quest's own simulated machine passes the same harness. Its runs
are never recorded as evidence for any manufacturer.

---

## 3. Sandbox control endpoints

This is the one extra thing a Model B manufacturer builds for
certification: a small HTTPS API, on your side, that lets the harness
drive your sandbox machine (real or emulated) through the script above.

- **Base URL**: yours, public HTTPS (for example
  `https://sandbox.example.com/sq-control/NV-0001`). Private and loopback
  addresses are refused.
- **Authentication**: `Authorization: Bearer {control token}`. You give
  the token to your Snack Quest engineer for the run. Use a token that
  controls only sandbox machines.
- **Behaviour**: every call runs synchronously and answers when the
  action is complete. Each call must finish within **30 seconds**. Any
  non-2xx answer fails that step.

| Endpoint | Does | Answers |
|---|---|---|
| `GET /capabilities` | Lists the optional controls this machine supports | `{ "supports": ["hold", "retransmit", "request-log", "defer-report"] }` |
| `POST /cycle` | One normal cycle: connect if needed, heartbeat, status, inventory, then poll → acknowledge → dispense → report for every command, exactly as the machine does on its own | `2xx` when the cycle is finished |
| `POST /door-events` | Open and close the service door (or emit `DOOR_OPENED` then `DOOR_CLOSED` exactly as the door would) | `2xx` |
| `POST /empty-slot` with body `{ "slotId": "motor-07" }` | Make that slot empty, so the next dispense from it fails with `no_product` | `2xx` |
| `POST /hold-next-commands` | Poll now and keep the commands without acknowledging or executing them; the next `/cycle` handles them normally (acknowledge first, and don't execute if refused) | `2xx` |
| `POST /retransmit-last-report` | Re-send the last outcome report unchanged (same body, same `eventId`, freshly signed) | `{ "status": <HTTP status Snack Quest answered>, "result": <data.result from that answer> }` |
| `GET /request-log` | Every signed request the machine has sent to Snack Quest | `[ { "nonce": "…", "timestamp": 1790500000 }, … ]` |
| `POST /defer-next-report` | The next dispense completes normally, but its outcome report is not sent — kept in the machine's store as if the network dropped — and sent on a later cycle | `2xx` |

**All four optional controls (`hold`, `retransmit`, `request-log`,
`defer-report`) are required for a CERTIFIED run.** They're optional only in that the
harness still runs without them, reporting what it could verify, which
is useful while you build.

An emulated machine is fine for the control endpoints, provided it runs
your real firmware logic (store, outbox, signing, acknowledgement
rules). The physical checks that emulation can't prove are verified on
a real unit with your engineer:

- product / slot mapping;
- dispense confirmation;
- the drop sensor.

---

## 4. Model A: the API probe

For Model A (Snack Quest calls your API), Snack Quest first checks your
sandbox API with the **API probe**. The probe uses the sandbox key you
issued to Snack Quest and runs these checks:

| Check | Passes when |
|---|---|
| A wrong API key is refused | A deliberately wrong key gets `401`/`403` |
| Machine status is readable | `GET /v1/machines/{id}` answers `200` with a boolean `online` |
| An unknown vend is `404` | `GET …/vends/{unknown reference}` answers `404`, so "never arrived" can be proven |
| Vend accepted *(sandbox vend only)* | `PUT …/vends/{reference}` answers `2xx { accepted: true }` |
| Same reference twice: one vend *(sandbox vend only)* | The repeated `PUT` answers `2xx { accepted: true }` for the same vend. Whether the machine dispensed once is confirmed by someone watching it |
| The vend can be looked up *(sandbox vend only)* | `GET …/vends/{reference}` answers `200` with a known `state` |

Without a sandbox vend, the three vend checks are reported as skipped,
not passed. A probe that dispenses is refused against production.

**Model A certification status.** The harness in §2 drives Model B
machines. A Model A model needs two things that Snack Quest must build
for it, and neither exists yet for any manufacturer:

- a production adapter written for your API. Snack Quest's reference
  adapter is a sandbox-only template;
- a harness run through that adapter, which is what records the
  *Automated contract suite* check.

Until both exist, a Model A integration can be built and tested in the
sandbox with the probe, but can't be certified for production. Plan the
adapter work with your integration engineer.

---

## 5. After certification

- Snack Quest issues production keys and activates your production
  machines.
- The model's checklist, with every piece of evidence and who recorded
  it, stays on record.
- Revoking certification (for example after a serious field defect)
  stops new production activations for that model.

*Questions: contact your Snack Quest integration engineer.*
