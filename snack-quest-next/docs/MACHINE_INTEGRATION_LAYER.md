# Machine Integration Layer

How Snack Quest connects to vending machines from any manufacturer,
and the rules that keep that safe. This is the internal architecture
document. The contract we hand to manufacturers is
[`SNACK_QUEST_MACHINE_API_V1.md`](SNACK_QUEST_MACHINE_API_V1.md)
(with [`openapi/machine-api-v1.yaml`](openapi/machine-api-v1.yaml)).

Related: [`MANUFACTURER_INTEGRATION_CONTRACT.md`](MANUFACTURER_INTEGRATION_CONTRACT.md)
covers the rules for writing an adapter, which still hold.
[`GATEWAY_INTEGRATION_API.md`](GATEWAY_INTEGRATION_API.md) covers the
legacy per-machine gateway API, which still works (§12).

> **Status, stated plainly.** No real manufacturer's API or SDK has
> been integrated or tested. What exists and is tested: the layer
> itself, the Snack Quest Machine API v1 (exercised end to end by a
> simulated machine over real HTTP), and a *reference* outbound
> adapter tested against a fake server. `shengma` remains a stub. A
> manufacturer integration is "working" only after it has passed
> certification (§9.3) against that manufacturer's real API or
> hardware.

---

## 1. The boundary

```
                        ┌──────────────── Snack Quest core ────────────────┐
 Customer phone ──────▶ │ payments · transactions · dispense ledger ·      │
 Owner portal   ──────▶ │ inventory · events · alerts · analytics · admin  │
 Admin console  ──────▶ │                                                  │
                        │      talks ONLY to: VendingHardwareAdapter       │
                        └───────────────┬──────────────────▲───────────────┘
                                        │ adapterRegistry  │ normalized events,
                                        ▼                  │ VendResultReport
                ┌───────────────────────┴──────────────────┴───────────────────┐
                │ adapters/  mock · shengma · snack_quest_gateway · reference_http │
                └───────┬───────────────────────────────┬──────────────────────┘
          Model A (outbound)                      Model B (inbound)
     we call their API/SDK ─────▶ Manufacturer    /api/v1/* ◀───── manufacturer
     their webhooks ──────────▶ /api/v1/webhooks  (signed)         firmware / cloud
```

Core code never imports a manufacturer-specific module and never
branches on a manufacturer name. `tests/lib/integrationBoundary.test.ts`
enforces both, by resolving every import in `services/`,
`repositories/`, `app/` and `components/`, and by searching for
manufacturer string literals.

Identity is Snack Quest's: every machine has a generated
`SQ-MCH-000001`-style code, allocated transactionally per business in
`businesses/{id}/counters/machines`. The manufacturer's own machine
id, serial, controller and firmware are metadata on the integration
record, never the identity.

---

## 2. Data model

All collections are written only through the Admin SDK. Their rules
are `allow write: if false`, readable by tenant admins, except where
noted.

| Collection | Doc id | Purpose |
|---|---|---|
| `manufacturers` | auto | A manufacturer: slug, integration type, default adapter key, onboarding stage + history, status |
| `machineModels` | auto | A model: declared capabilities, slot format, per-check certification results, certification status |
| `machineIntegrations` | machineId | Machine ↔ manufacturer binding: manufacturer machine id, adapter, environment, state, signals, error counts, last error, last reported status, last connection test |
| `machineIntegrationIdentities` | `{biz}:{mfr}:{encoded mfr machine id}` | Uniqueness claim: one manufacturer machine id maps to one machine |
| `integrationCredentials` | keyId (`sqk_{live,test}_…`) | HMAC credentials. Secret stored encrypted (`secretEncrypted`) |
| `integrationRequestNonces` | sha256(keyId, nonce) | Single-use nonces. **No client read or write**. Has an `expiresAt` for a TTL policy |
| `machineDispenseCommands` | `dsp_{transactionId}` | The dispense ledger (§7) |
| `machineEvents` | sha256(dedupe key) | The normalized event stream (§8) |

Additions to existing types: `Machine.manufacturerId?` and
`Machine.modelId?` (mirrored from the integration);
`MachineSlot.manufacturerSlotId?`. `Machine.manufacturer` keeps its
persisted name and now holds a registered **adapter key**.

Indexes: five composite indexes in `firestore.indexes.json`
(`machineDispenseCommands` ×3, `machineEvents` ×2).

---

## 3. The adapter interface

`lib/vending/hardwareAdapter.ts` defines `VendingHardwareAdapter`. On
top of the original methods (status, slots, inventory, price,
enable/disable, `authorizeVend`, `receiveVendResult`,
`receiveTelemetry`, temperature, faults), this layer adds:

| Method | Purpose |
|---|---|
| `testConnection(machineId)` | Non-destructive reachability check → `ConnectionTestResult { ok, detail, latencyMs, errorKind }` |
| `getMachineInfo(machineId)` | Manufacturer id, serial, model, firmware, controller |
| `getDispenseStatus(machineId, vendRef)` | Pull the outcome of a vend: `pending | dispensing | success | failed | … | unknown` |
| `getDoorStatus`, `getPaymentDeviceStatus` | Health facts |
| `parseWebhook?(body)` | Optional. Native webhook → `{ deliveryId, events: AdapterMachineEvent[] }` |

`authorizeVend(machineId, slotCode, { commandRef, manufacturerSlotId })`
receives Snack Quest's command reference, so an adapter can make the
vend idempotent on the manufacturer's side, and it receives the
manufacturer's slot name. It returns `delivery: 'synchronous' | 'queued'`.

**Errors an adapter throws decide the customer's outcome.** Classify
honestly:

| Throw | Meaning | Ledger outcome |
|---|---|---|
| `HardwareUnreachableError` | Provably never delivered (DNS, refused, 4xx on read) | `rejected` → refund |
| `HardwareTimeoutError` | May have been delivered (timeout, reset, 5xx on a vend) | `unknown` → manual review; pull reconciliation |
| `HardwareAuthenticationError` | 401/403 from the manufacturer | Counted as an authentication error |
| `ProtocolNotConfiguredError` | Adapter can't do this | Capability is unsupported |

Getting this wrong is how customers get double-charged or refunded for
products they received. When in doubt, it's `HardwareTimeoutError`.

---

## 4. Adapter registry

`lib/vending/adapterRegistry.ts` is a declarative map. It is the only
place that knows adapters exist.

| Key | Direction | Environment | Maturity | What it is |
|---|---|---|---|---|
| `mock` | outbound | sandbox_only | implemented | In-memory simulated hardware |
| `shengma` | outbound | production_capable | **stub** | Every capability false, every call refuses |
| `snack_quest_gateway` | inbound | production_capable | implemented | Model B: manufacturers integrate with `/api/v1` |
| `reference_http` | outbound | sandbox_only | **reference** | Template HTTP adapter against §6. Not a real manufacturer |

- `environment: sandbox_only` adapters can't be configured for a
  production integration.
- A production integration can be activated only on a
  `maturity: implemented` adapter.

### 4.1 Adding a manufacturer (Model A)

1. Write `lib/vending/adapters/{name}Adapter.ts` implementing
   `VendingHardwareAdapter`. Start from `referenceHttpAdapter.ts`: copy
   its `ManufacturerHttpClient` use, its id translation and its error
   classification.
2. Declare only capabilities you have **tested**. `capabilities()`
   never throws.
3. Translate native events in `parseWebhook` to §8's vocabulary.
   Unknown kinds pass through and land as `UNKNOWN_EVENT`.
4. Register it with `environment: 'sandbox_only'` and
   `maturity: 'reference'` until it has been tested against the real
   API. Tests go in `tests/lib/{name}Adapter.test.ts`, with a fake
   server for the failure paths (see `referenceHttpAdapter.test.ts`).
5. Only after certification (§9.3): `production_capable` +
   `implemented`.

Nothing outside `lib/vending/adapters/` and the registry changes.

---

## 5. Capability model

`lib/vending/protocol/capabilities.ts`:
`effectiveCapabilities(adapterCaps, modelDeclared)` is the
**intersection** of what the adapter can do and what the model is
declared (and certified) to do. `machineIntegrationService.capabilitiesFor`
classifies each capability four ways for the UI (supported,
unsupported, not configured, unregistered).

UI rule: camera, door, temperature and price controls render only
when the effective capability is supported. They are never faked.

---

## 6. Reference Manufacturer API

The example contract `reference_http` is written against. It's the
smallest API a manufacturer could expose for Snack Quest to drive
their machines safely. It's also the list of things to look for in a
real manufacturer's documentation.

Auth: `Authorization: Bearer {REFERENCE_MANUFACTURER_API_KEY}` against
`REFERENCE_MANUFACTURER_API_URL`. Without both, the adapter reports no
capabilities and refuses every call.

| Call | Semantics |
|---|---|
| `GET /v1/machines/{mfrMachineId}` | `{ online, doorOpen?, temperatureC?, faults?, paymentDeviceOk?, serial?, model?, firmware? }`. 404 → unknown machine |
| `PUT /v1/machines/{mfrMachineId}/vends/{commandRef}` body `{ slot }`, header `Idempotency-Key: {commandRef}` | Create-or-return the vend. `2xx { accepted: true }` means it's accepted; `{ accepted: false, reason }` or 4xx means refused. **PUT on our reference is what makes a retry safe** |
| `GET /v1/machines/{mfrMachineId}/vends/{commandRef}` | `{ state: pending \| dispensing \| dispensed \| failed, failureCode?, reason? }`. 404 → the vend never arrived |
| Webhook (signed per API v1 §3, to `/api/v1/webhooks/manufacturers/{slug}`) | `{ id, events: [{ id, kind, machine, at?, slot?, detail? }] }`. Kinds: `heartbeat`, `machine.online`/`offline`, `door.open`/`closed`, `fault`, `temperature.alarm`, `slot.empty`/`low`, `payment.error`, `camera.offline`, `vend.completed`/`vend.failed` (with `detail.requestId` = our commandRef, `detail.failureCode` ∈ jam/empty/sensor/timeout/offline) |

How the adapter classifies failures:

| Situation | Classification |
|---|---|
| Vend 5xx | Timeout → unknown |
| Vend connection refused | Unreachable → refund |
| Vend timeout | Timeout → unknown |
| Vend 401/403 | Authentication error |
| Status read 5xx or 4xx | Unreachable |
| Status 404 on a vend lookup | Failed ("manufacturer has no record") |

`ManufacturerHttpClient` retries only GETs, and keyed writes only when
provably undelivered.

When evaluating a real manufacturer, the must-haves are: an
**idempotent vend keyed by our reference**, a **way to look up a
vend's outcome afterwards**, and a **definite success signal from a
drop sensor**. Without the first two, every timeout is a manual
review. Without the third, `dispense_confirmation` can't be
certified.

---

## 7. Dispense safety

`services/dispenseCommandService.ts` + `machineDispenseCommands`.

```
dispatchForTransaction(transactionId):
  1. existing command?            → return it (never dispatch twice)
  2. transaction paid?            → else TransactionNotPaidError, adapter untouched
  3. claim dsp_{transactionId}    → Firestore create(): exactly one caller wins
  4. integration gate             → active, env matches deployment, manufacturer active
  5. capability 'vend'
  6. → authorized → adapter.authorizeVend(…, { commandRef, manufacturerSlotId })
  7. → sent (queued) | acknowledged (synchronous) | rejected | unknown
```

- **Payment ≠ dispense.** The transaction (`machineTransactions`)
  holds money state and the command holds physical state. A rejected
  dispense on a paid transaction becomes `paid_vend_failed`, which is
  the refund path. An unknown one becomes `manual_review`.
- **Pre-payment gate.** `initiateCartPayment` applies the same
  integration gate *before* the STK push, so no customer pays on a
  machine that isn't active.
- **Outcomes** (`applyVendReport`) are idempotent per report key and
  check that the reporting machine owns the vend. They're the only
  path that consumes inventory or completes a sale, whether the
  outcome came from the v1 API, a webhook or legacy telemetry.
- **Queued commands expire after 2 minutes.** A late ack moves the
  command to `timeout` and the machine is told not to execute.
- **Sweeps** (daily cron `reconcile-vending-commands`):
  - commands in flight for more than 15 minutes → `timeout`;
  - active outbound integrations are probed.
- **Pull reconciliation** (`reconcile-vending-transactions`): for
  outbound adapters, unknown dispenses are resolved by
  `getDispenseStatus`.
- **Timeout/unknown → dispensed/failed** remains possible, so a late
  truth always lands.

---

## 8. Events, health, slots, inventory

- **Events.** `machineEventService.record` / `recordExternal` write
  `machineEvents`, deduplicated by a namespaced key (`v1:{eventId}`,
  `webhook:{mfr}:{id}`, `dispense:{ref}:…`). Types come from
  `MACHINE_EVENT_TYPES`, and unknown native names are kept as
  `UNKNOWN_EVENT` + `nativeType`. Device timestamps are believed only
  within +1 min / −24 h. `data` is sanitised to flat primitives.
  Alerts (`alertService.evaluateIntegrationEvents`) and reliability
  analytics read this stream only.
- **Health** is derived at read time by `deriveIntegrationHealth` and
  is never stored. "Contact" means the latest heartbeat, API request
  or webhook signal. The rules apply in order:
  - `ERROR` when the last error is newer than the last contact and
    less than 15 minutes old (authentication errors say so explicitly);
  - `DISCONNECTED` when there has never been contact, or none for 15
    minutes;
  - `DEGRADED` when there's been no contact for 5 minutes, or an error
    in the last 60 minutes;
  - `CONNECTED` otherwise.
- **Slot mapping.** `MachineSlot.manufacturerSlotId` ↔ `slotCode`.
  `setSlotMappings` validates and refuses conflicts. An unmapped slot
  falls back to its own code; a mapped one is never matched by its
  old name.
- **Inventory sync** compares the machine's counts with the ledger and
  records `INVENTORY_MISMATCH` / `SLOT_EMPTY` / `SLOT_LOW`. It **never
  overwrites** Snack Quest's stock.

---

## 9. Lifecycle: onboarding, configure → test → activate, certification

### 9.1 Manufacturer onboarding

The stages are `application → technical_review → credentials →
sandbox → certification → production`:

- Stages move forward one at a time, and can move back to any earlier
  stage.
- `production` requires at least one certified model.
- A suspended manufacturer can't advance, can't be issued credentials,
  can't receive webhooks, and none of its machines dispense.

Credentials:

- Sandbox keys are issued from the `credentials` stage onward.
- Production keys are issued only at `production`.
- Production keys, and any key minted on the production deployment,
  also require `SECRET_ENCRYPTION_KEY`, so a live secret is never
  stored unencrypted.
- A secret is shown exactly once.

### 9.2 Machine integration: configure → test → activate

`machineIntegrationService`:

- **configure**: validates the manufacturer, model and adapter, and
  that the integration type fits the adapter. A sandbox-only adapter
  can't be used for production. The manufacturer machine id is
  claimed uniquely. State becomes `configured`, and any
  reconfiguration resets it there.
- **test**: `adapter.testConnection`, recorded. A pass moves the
  state to `tested`; a failure moves it back to `configured`.
- **activate**: refused unless every blocker clears:
  - a passing test within 24 hours;
  - the adapter is still registered;
  - the manufacturer is active;
  - not a sandbox integration on the production deployment;
  - for production integrations, also: model certified, manufacturer
    at the `production` stage, and adapter `implemented`.
- **suspend**: requires a reason.

**Configuration existing never means active.** Only `active`
integrations pass the dispense gate. Machines with *no* integration
record (pre-registry) keep working as before until they're
configured.

### 9.3 Certification

Per model. There are 14 checks (`CERTIFICATION_CHECKS`):
authentication, machine identity, heartbeat, status, dispense,
dispense confirmation, failed dispense, timeout handling, duplicate
protection, offline recovery, inventory, webhooks, error handling and
security.

- Each check needs **evidence** text.
- Only inventory and webhooks may be marked not applicable.
- `certifyModel` refuses while anything is outstanding.
- A later failed check, or a change to capabilities or adapter,
  revokes certification.

---

## 10. Security model

| Threat | Control |
|---|---|
| Forged/replayed manufacturer requests | HMAC-SHA256 over method, path, body hash, timestamp and nonce. ±300 s window. Nonce claimed only after the signature verifies. Constant-time compare |
| One manufacturer touching another's machines | Credential → manufacturer + environment. Integration must match both. Every mismatch is an indistinguishable 404. Webhook slug must equal the credential's manufacturer |
| Sandbox reaching production | Keys carry an environment. Sandbox integrations are refused activation and dispensing on the production deployment. `mock`/`reference_http` are sandbox-only. The simulator refuses `sqk_live_` keys |
| Uncertified integration going live | Activation blockers (§9.2) and production-credential stage gating |
| Secrets exposure | Secrets are generated server-side, shown once, and stored AES-256-GCM encrypted. The list API returns an explicit field list without them. Repositories, services and `integrationAuth` are `server-only` (`requestSigning` is deliberately pure, but it holds no secret of its own), so a client component importing one fails the build |
| Customer invoking machine commands | No customer-facing route can create a dispense command. Only a verified payment (`markPaymentVerified`) leads to `dispatchForTransaction` |
| Owners seeing others' machines | The owner portal is partner-scoped (existing `ownerPortalService`). Integration details (manufacturer ids, adapters, credentials) are admin-only routes (`ADMIN_OR_WAREHOUSE` read, `ADMIN_ONLY` mutate) and never appear in owner responses. Owner health uses normalized labels only |
| Untrusted payloads | zod schemas (422 lists every issue), a 256 KB cap, adapter parsers as the only entry for native payloads, sanitised event data |
| Firestore direct access | All new collections `allow write: if false`. Nonces have no read either |

Every admin mutation is audit-logged.

---

## 11. Sandbox and simulator

- `scripts/vendingSimulator/v1Machine.ts` (`V1SimulatedMachine`) is a
  virtual Model B machine.
  - It does: connect, heartbeat, status, inventory, events, command
    polling and outcomes.
  - Scriptable failures: `dispensed`, `failed(code)`, `unknown`,
    `no_report` (goes silent), duplicate resend.
  - `FetchV1Transport` targets a running dev/staging deployment.
    `InProcessV1Transport` runs in tests.
  - It refuses production keys (`SandboxOnlyError`).
- `MockVendingAdapter` is a scriptable Model A stand-in:
  `setOnline`, `setDoorOpen`, `setAuthorizeBehaviour('timeout' |
  'unreachable')`, `completeVend` and `dispenseInstructionCount`.
- End-to-end: `tests/scripts/v1Simulator.test.ts` and
  `tests/integration/multiManufacturerFleet.test.ts` (2 owners,
  4 machines, 3 manufacturers).

---

## 12. Operations

| Item | Detail |
|---|---|
| Env | `SECRET_ENCRYPTION_KEY` (64 hex chars, required for production credentials), `REFERENCE_MANUFACTURER_API_URL` / `_KEY` (sandbox reference adapter only) |
| Crons | `reconcile-vending-transactions` 06:00 UTC, `reconcile-vending-commands` 07:00 UTC (daily, per `vercel.json`) |
| Firestore TTL | Configure a TTL policy on `integrationRequestNonces.expiresAt` (console/gcloud). Without it, nonce docs accumulate. Correctness doesn't depend on deletion |
| Admin UI | `/admin/vending/integrations` (fleet connections, manufacturers, reliability, adapters), `/admin/vending/integrations/{manufacturerId}` (stage, models, certification, credentials), Integration card on `/admin/vending/{machineId}` |
| Legacy API | `/api/vending/*` (per-machine bearer gateway API) is unchanged and still accepted. Its outcomes flow through the same `applyVendReport`, and its telemetry is also written as normalized events |

## 13. Known limits

- No real manufacturer integration exists yet (see the status note at
  the top).
- No request rate limiting on `/api/v1` yet. Rely on platform-level
  protection until added.
- Outbound manufacturer credentials (Model A) come from environment
  variables. Per-manufacturer encrypted storage in `integrationSecrets`
  is the next step once a second outbound manufacturer exists.
- Crons are daily, so timeout sweeps and probes are coarse. Inbound
  health is real-time because it's derived at read time.
- Price and slot changes for inbound (Model B) machines take effect
  when the machine re-reads its description. There's no push.
