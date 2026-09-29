# M109E control card × Snack Quest OS — hardware compatibility audit

**Status:** audit only. No production code, adapter or API contract was changed to produce this.

> **Build status (Phase 6):** the category A pieces of §8.1 are built in `machine-agent/`, from this document and against a fake board. See `machine-agent/README.md`. None of it has touched an M109E. The §9 questions are ready to send (`M109E_MANUFACTURER_LETTER.md`), but not sent. The acceptance record for §10 is `M109E_ACCEPTANCE_RECORD.template.json`, with every test "not run".
>
> **Until those tests pass, the capability list in §7.4 is a proposal, not a declaration.** The gate in `machine-agent/acceptance/acceptanceRecord.ts` declares each capability only when every test behind it has passed.
**Sources:**
- **Manufacturer (authoritative for hardware):** `M109E型售货机控制卡` protocol document (.docx, 15 pages per its own metadata, 981 words, last modified 2024‑10‑19, revision 2). The copy supplied starts at **§4**; sections 1–3 are not in it. It has no printed page numbers, so citations below use the document's own section numbers (§4.1 … §6), command codes (e.g. `05H`) and its four embedded tables (Workbook1–4, shown as images under §5.9, §5.11, §5.12, §5.13).
- **Snack Quest (authoritative for our requirements):** this repository at commit `4c18af7`.

Conventions: **[DOC]** = stated in the manufacturer document. **[INFERENCE]** = my reading, not stated. **[REPO]** = this repository.

---

## 1. Executive summary

- **M109E is an I/O controller, not a vending computer.** It is a slave board on a serial line (TTL / RS‑485 / RS‑232 levels, 9600 bps, fixed 20‑byte frames, CRC16‑MODBUS). It runs one motor at a time, reads a light curtain, one temperature probe, one humidity/temperature sensor, 4 digital inputs and a few switched outputs. It never speaks first (§4.1). It has no network, no payment, no prices, no inventory, no product catalogue and no knowledge of "sales".
- **It cannot talk to Snack Quest by itself.** Something on the machine (the "host" — the doc says "Android or PC etc.", §4.1) must drive the serial line. Our cloud (Next.js on Vercel) can never open a serial port. So the M109E does **not** become a server-side `VendingHardwareAdapter`. It becomes the hardware underneath a **Snack Quest Machine Agent** running on the host. The agent uses the existing **Model B** machine API (`/api/v1`) through the existing `snack_quest_gateway` adapter. **The server needs no changes to integrate it.**
- **What the protocol gives us for dispensing is good.** There is a motor-run command (`05H`) with an explicit "started / refused" answer, and a result poll (`03H`) with motor number, a result code (success, over-current/jam, under-current, timeout, light-curtain self-test failed, door not open), currents, run time and — critically — **light-curtain drop time (`Z10`)**. With a light curtain fitted, we can confirm that a product physically fell. The controller also has a **built-in single-flight interlock**: a new run is refused while a motor runs (`Z1=2`) or while the last result is uncleared (`Z1=3`).
- **What it does not give us:** a command/transaction ID, controller-level idempotency, any documented rule for *when* a result is cleared, persistence across power loss, a firmware-version command, a door sensor, product counts, or anything for payment.
- **Financially safe dispensing is achievable, but only by combining things:**
  - Snack Quest's existing ledger (one paid order → one command, acknowledge-before-execute, 2‑minute expiry, `unknown` → human review).
  - A write-ahead journal in the agent (record "about to run motor N for command X" *before* sending `05H`).
  - The controller's single-flight interlock.
  - A light curtain on every channel.

  Two things decide how often we land in `unknown` (human review) rather than a clean answer: the undocumented result-clearing rule and the light curtain's real detection reliability. Both must be confirmed.
- **Verdict:**
  - **On the controller side, yes.** The protocol is documented at byte level for everything needed to dispense and confirm, and I verified the checksum algorithm against 31 of its 34 example frames. We do not need the manufacturer's software to talk to the board.
  - **The open question is the host.** The document says nothing about the host computer: its OS, whether we can install our agent, whether we get raw serial access, whether their app can be removed.
  - **Refrigeration may land on us.** No command sets a target temperature, so refrigeration may be the host's job.
  - **Clarification needed before building on it:** the document has checksum errors and numbering conflicts. It should be treated as a draft.

---

## 2. Manufacturer capability matrix (from the document only)

### 2.1 Link layer

| Item | What the document says | Evidence |
|---|---|---|
| Board | "M109E型售货机控制卡" (M109E vending machine control card) | Title |
| Electrical interface | "TTL串口…485电平，232等" — TTL serial, RS‑485 levels, RS‑232 "etc." Which one a given board has is **not stated** | §4.1 |
| Baud / parity / stop / flow | 9600 bps, 1 stop bit, no parity, no flow control | §4.1 |
| Data bits | **Not stated** (8 is the usual assumption — **[INFERENCE]**, must confirm) | §4.1 (absent) |
| Topology | One master (host) and several slaves on one network; strict request/response; host initiates everything | §4.1 |
| Concurrency | Host may send a new request only after the previous reply or a timeout | §4.1 |
| Addressing | Host = 0; boards = 1–8; 255 = broadcast, used **only** for changing a board's address ("use with care") | §4.1, §4.3.1 |
| Address discovery | The board's LED blinks its address (number of blinks) | §4.1, §5.13 |
| Timing | Send → wait 50 ms → receive reply, reply timeout 1 s | §4.2 |
| Retries | **Not documented** | — |
| Frame | Fixed 20 bytes: `[addr 1][cmd 1][data 16][CRC 2]`; data zero-padded to 16 | §4.3 |
| Integers | 1- and 2-byte; 16-bit values big-endian (high byte first) | §4.3.3 |
| Checksum | CRC16‑MODBUS, poly 0x8005, init 0xFFFF, **low byte first** | §4.3.4 |
| Reply address | Replies carry the host address (0) in byte 1 and echo the command code | §4.3 tables; all §6 examples |

**Checksum verification (done for this audit):** I recomputed CRC16‑MODBUS over the first 18 bytes of every one of the 34 example frames in the document.
- **31 match.**
- **3 are wrong:**
  - The §5.11 `2AH` response: printed `11 89`, correct `8F 1C`. §6 prints the same response with the correct `8F 1C`.
  - The §5.12 `2BH` request: printed `1F 70`, which is the `2AH` request's CRC; correct `4E E0`.
  - The §5.12 `2BH` response: printed `12 89`, correct `69 AA`.

The algorithm is confirmed. The `2BH` (read a row of switches) examples were almost certainly not captured from a real board.

### 2.2 Commands

| Code | Name | Request | Response | Evidence |
|---|---|---|---|---|
| `01H` | Get ID | — | `Z1–Z12` "control card ID". **Format not specified**; the §6 example returns `00 64 00 3B 04 47 36 32 33 38 36 39` (last 7 bytes read as ASCII "G623869") | §5.1, §6 |
| `03H` | Motor poll | — | `Z1` state: 0 idle, 1 running, 2 finished. `Z2` motor number (0–99). `Z3` result: 0x00 success; 0x01 over-current / overload / **jammed goods**; 0x02 under-current (wire off or load missing); 0x03 timeout (no in-position signal within 7 s — "usually heavy load, jam or PSU interference"); 0x04 **light-curtain self-test failed, motor not started**; 0x05 feedback solenoid door did not open; 0x0A three-wire motor energised 1.5 s but microswitch not pressed. `Z4–Z5` peak current (mA). `Z6–Z7` average current (mA). `Z8–Z9` run time (ms). `Z10` light curtain: **0 = nothing fell; 1–200 = ms the goods took to pass the curtain** | §5.2, §6 |
| `05H` | Motor run | `Y1` motor index **0–59**. `Y2` motor type (0x00–0x0E, 15 types: solenoids, 2-/3-wire motors, 12 s electric lock, belt lanes, hook lanes, timed locks…). `Y3` light-curtain mode: 0 ignore curtain; 1 self-test before start, stop at in-position; 2 self-test before start, **stop as soon as a drop is seen**, otherwise run until timeout (7 s). `Y4` microswitch check delay 0.2–5 s (default 1.5 s). `Y5` reserved. `Y6` in-position timeout 0.1–25 s (0 = default 7 s). `Y7` timed-lock hold 0.1–10 s (default 0.2 s) | `Z1`: **0 started; 1 invalid motor index; 2 another motor is running; 3 previous result not cleared** | §5.3, §6 |
| `07H` | Read temperature | — | `Z1–Z2` signed 16-bit ×0.1 °C, −50.0…80.0 °C; **−50.0 means "no sensor fitted"** | §5.4 |
| `08H` | Write digital output | `Y1` index, `Y2` 1 on / 0 off | `Z1` index, `Z2` = `Y2 + 0xF0` (F1 on, F0 off) | §5.8, §6 |
| `09H` | Read digital inputs | — | `Z1–Z4` = DI1–DI4, 1 = connected, 0 = open. **What each input is wired to is not stated** | §5.9, §6 |
| `0BH` | Light curtain power | `Y1` 1 on / 0 off | (not specified) | §5.5 |
| `0CH` | Read light curtain now | — | `Z1` 1 blocked / 0 clear | §5.6 |
| `0DH` | Read curtain block timer | — | `Z1` "blocked for N ms" (1 byte?); reset when the curtain is powered on/off | §5.7 |
| `10H` | Read humidity/temperature | — | `Z1` RH 20–90 %; `Z2` temp 0–50 °C; `Z3` "if not 1, this is not the latest sample". DHT11 sensor, for ambient or cabinet humidity | §5.10 |
| `2AH` | Read one motor's switch | `Y1` index 0–99 | `Z1` 0 open, 1 closed, 2 read failed (retry) | §5.11, Workbook2 |
| `2BH` | Read one row's switches | `Y1` row 0–9 | `Z1–Z11` same codes | §5.12, Workbook3 |
| `FFH` | Set board address | `Y1` new address 1–8 (broadcast, one board on the bus only; confirm by LED) | `Z1` new address | §5.13, Workbook4 |

**Refrigeration text (§5.8, "制冷逻辑"):**
- Start cooling: fan first, compressor 5 minutes later.
- Stop both at the target temperature.
- Restart after a 4 °C rise.
- If the target isn't reached within 2 hours, force the compressor off for 15 minutes with the fan still running.

**No command sets a target temperature or turns this logic on.** Whether the board runs it by itself or the host must, is **not stated**.

### 2.3 Capability matrix

| Capability | Manufacturer supports? | Evidence | Snack Quest requires? | Compatibility |
|---|---|---|---|---|
| Dispense an individual slot | **Yes** — one motor per command | `05H` §5.3 | Yes | Direct (through agent) |
| Know the motor started | **Yes** | `05H Z1=0`; `03H Z1=1` | Yes (`dispensing` is optional) | Direct |
| Know the motor was refused and never started | **Yes** | `05H Z1=1/2/3`; `03H Z3=0x04` | Yes — to report `failed` with certainty | Direct |
| Motor completion | **Yes** | `03H Z1=2`, `Z3`, `Z8–Z9` | Yes | Direct |
| Optical drop detection | **Yes, if a light curtain is fitted and `Y3=1/2`** | `03H Z10`; `05H Y3` | Yes — `dispensed` needs confirmation (spec §6.3) | Direct, **conditional on hardware** |
| Jam detection | **Partly** — over-current (0x01) and timeout (0x03); the document itself says these can also come from heavy load or PSU interference | `03H Z3` | Yes (`jam`) | Adapter logic |
| Empty-slot detection | **Not directly**. Only inferable: motor ran, curtain saw nothing | `03H Z3/Z10` | Yes (`no_product`) | Adapter logic + hardware validation |
| Unique ID per physical dispense | **No** — no sequence or transaction ID in `05H` or `03H` | §5.2, §5.3 | Yes (one command = at most one dispense) | Must be done by agent |
| Controller idempotency | **No** (only a single-flight interlock) | `05H Z1=2/3` | Yes | Must be done by agent |
| When a result is cleared | **Not documented** (`Z1=3` implies results must be cleared) | §5.3 | Critical for recovery | **Unknown** |
| State after controller power loss | **Not documented** | — | Critical | **Unknown** |
| Door status | **Not documented**. Possibly through a DI input — **[INFERENCE]** | §5.9 lists DI but no assignments | Status report expects door when available | **Unknown** |
| Cabinet temperature | **Yes** (one probe, −50 sentinel) | `07H` | Status report | Direct |
| Ambient humidity/temperature | **Yes** (DHT11, 0–50 °C) | `10H` | Optional telemetry | Direct |
| Refrigeration control | **Partial** — raw on/off outputs (fan, compressor, glass heater, light strip, heater); no set-point command | `08H` §5.8 | Not a Snack Quest server function today | **Unknown whose job the thermostat is** |
| Lighting | **Yes** (light strip is a DO) | §5.8 | No | Direct (agent) |
| Motor/slot switch state | **Yes** (per motor, per row) | `2AH`, `2BH` | Not required | Direct (diagnostics) |
| Product counts / inventory | **No** | — | Optional (`inventory_read`) | Not supported — Snack Quest's ledger covers it |
| Prices on the controller | **No** | — | No (Snack Quest owns prices) | Not needed |
| Payment hardware (MDB, coin, bill, cashless) | **No — not mentioned at all** | — | No (M-Pesa on the customer's phone) | Not needed |
| Machine identity | **Partial** — a 12-byte card ID of undocumented format | `01H` | Yes (connect) | Adapter logic |
| Firmware version | **No command** | — | Reported at connect if known | Not supported |
| Fault log / fault query | **No** — faults only as the result of a motor run | `03H Z3` | Status `faults` | Adapter logic |
| Unsolicited events | **No** — the slave never initiates | §4.1 | Events come from agent polling | Adapter logic |
| Remote restart | **No** controller reset command | — | Optional (`restart` command) | Host only, unknown |
| Network, host OS, host hardware | **Not in this document** | — | Yes | **Unknown** |
| Remote firmware update | **Not documented** | — | No | — |
| Board addressing / multiple boards | **Yes**, 1–8 per bus | §4.1, `FFH` | Useful for large machines | Direct |

### 2.4 Contradictions and gaps inside the manufacturer document

| # | Conflict | Where |
|---|---|---|
| D1 | Motor index range: `05H Y1` is **0–59**, but `03H Z2`, `2AH Y1` and `2BH` (10 rows × 10) are **0–99** | §5.2, §5.3, §5.11, §5.12 |
| D2 | Digital outputs: text says **4** outputs numbered 0–3; the name list has **5** (0 fan, 1 compressor, 2 heated glass, 3 light strip, 4 heating module); the table says index **0–6** | §5.8 |
| D3 | `05H` table puts timed-lock hold in **Y7**, but the §6 timed-lock example sets the 100 ms value in **Y6** (`01 05 00 08 01 00 00 01 …`) | §5.3 vs §6 |
| D4 | `FFH` table says command `FF` with the new address in `Y1`. The §6 examples are `FF 01 00…` to `FF 08 00…`: address byte `FF`, and the new address where the *command* byte should be | §5.13 vs §6 |
| D5 | Workbook1 (the image under §5.9) shows the reply's "host address" as `01~08` and command `8` for Read DI (`09H`) | §5.9 image vs §4.3.1 |
| D6 | `10H` says "if `Z3` ≠ 1 the reading is stale", but its own example reply has `Z3 = 00` | §5.10 |
| D7 | Three example frames have wrong CRCs (listed in §2.1 above) | §5.11, §5.12 |
| D8 | `2BH` returns `Z1–Z11` (11 values) for a row, but rows appear to hold 10 motors | §5.12 |
| D9 | §6 labels `03H Z2` "current operation id", but the table defines it as the motor number | §5.2 vs §6 |
| D10 | Sections 1–3 (hardware overview, connectors, wiring) are not in the copy supplied | Document starts at §4 |

---

## 3. Snack Quest requirements matrix (from the repository)

### 3.1 Where the M109E sits in our architecture

- `lib/vending/hardwareAdapter.ts` → `VendingHardwareAdapter` is **server-side**. It runs inside the Next.js app and reaches machines over HTTP. It cannot reach a serial line.
- `docs/HARDWARE_COMPATIBILITY_ARCHITECTURE.md` already records: "Gateway (physical device software) — MISSING, out of this repo's scope."
- `lib/vending/protocol/registry.ts` lists `generic_serial` as `planned`.
- So the integration boundary is **Model B**: the machine's own software implements the Machine API v1 (`docs/SNACK_QUEST_MACHINE_API_V1.md` §§3–7).
  - The server treats it through the existing adapter `snack_quest_gateway` (`lib/vending/adapters/snackQuestGatewayAdapter.ts`), which queues dispenses (`delivery: 'queued'`).
  - No new server adapter is needed.

### 3.2 Matrix

| Snack Quest capability / interface | Required? | Where in the repo | Physical hardware needed | M109E supports it? |
|---|---|---|---|---|
| Machine connect (identity) | Yes | `POST /api/v1/machines/connect`, `connectSchema` in `lib/vending/v1/schemas.ts` | None (agent config) + controller ID | Partial — `01H` card ID; agent supplies unit id |
| Request signing (HMAC, nonce, clock ±300 s) | Yes | spec §3; `sdk/*`; `lib/vending/requestSigning.ts` | Host with a clock | Host concern — M109E not involved |
| Heartbeat ≤ 60 s; orders refused if silent > 90 s | Yes | `heartbeatSchema`; `ORDER_FRESHNESS_SECONDS = 90` in `lib/vending/machineLiveness.ts` | Host + network | Host concern |
| Status: `online`, `doorOpen`, `temperatureCelsius`, `faults`, `paymentDeviceOk` | Yes (door/temp/payment nullable) | `statusSchema`; `deriveMachineLiveness` (`reportedOnline=false` → OFFLINE, no orders) | Temp probe, door switch | Temp: **yes** (`07H`). Door: **unknown**. Faults: partial. Payment: n/a |
| Inventory report | Optional (`mayBeNotApplicable`) | `inventorySchema`; `CERTIFICATION_CHECKS` in `types/manufacturer.ts` | Product counting | **No** → declare no `inventory_read`; the ledger (`machineInventoryMovements`) holds stock |
| Events (door, faults, …) | Optional | `eventsSchema` (`DISPENSE_*` refused as events) | Sensors | Partial (fault codes, DI changes if door wired) |
| Poll commands (`dispense`, `restart`); 2 s while paying, else 10 s | Yes | spec §6.1; `dispenseCommandService.listQueuedForMachine` | Host | Host concern |
| Acknowledge **before** actuating; don't run if ack ≠ 200 | Yes | spec §6.2; `QUEUED_COMMAND_TTL_MS = 2 min` in `services/dispenseCommandService.ts` | — | Agent concern |
| Report `dispensing` / `dispensed` / `failed{code}` / `unknown` | Yes | `commandStatusSchema`; `dispenseCommandService.recordOutcome`; `decideVendOutcome` (`lib/vending/vendOutcomeDecision.ts`) | Motor + drop sensor | **Yes with a light curtain**; `unknown` otherwise |
| Answer `reportOutcomes` in the heartbeat reply | Yes | `machineApiService.heartbeat`; `dispenseCommandService.listNeedingOutcome` | Persistent storage on host | Agent concern (journal) |
| Never execute a command twice; keep a persistent record of executed commands | Yes | spec §1 "rules that never bend"; reference behaviour in `scripts/vendingSimulator/v1Machine.ts` (`MachinePersistentStore.executed`) | Non-volatile storage | Agent concern. The controller has no idempotency |
| Outbox: undelivered outcome reports survive restarts | Yes | spec §6.3; certification "OFFLINE RECOVERY"; `sdk/python/snack_quest_machine.py` `Outbox` is **in-memory** in the reference ("persist this") | Non-volatile storage | Agent concern |
| Slot mapping: manufacturer `slotId` ↔ Snack Quest `slotCode` | Yes | `MachineSlot.manufacturerSlotId`; `manufacturerSlotIdFor` / `resolveSlotCode` in `lib/vending/slotMapping.ts` | Wiring map | Partial — motor index plus per-motor type/mode (§5 below) |
| Prices, enable/disable, sellability | Server-side | `snackQuestGatewayAdapter.setPrice/enableSlot` are no-ops; `machineAssortmentService.getSellableCatalog` | None | Not needed on the controller |
| Payment | Server + phone | `machineTransactionService.initiateCartPayment` (M-Pesa STK) | None | Not needed |
| Customer screen | Browser on the machine | `components/kiosk/KioskScreen.tsx`, device auth `lib/vending/deviceAuth.ts` | Touchscreen host that runs a modern browser | **Unknown** (host not documented) |
| Restart command | Optional | spec §6.1 `restart` | Host OS permission to reboot | Host concern; no controller reset |
| Certification (15 checks; harness needs the machine's sandbox control endpoints) | Yes, before production | `integrationCertificationService.run`, `HARNESS_CHECKS`; `lib/vending/contract/httpControlledSubject.ts`; `docs/MANUFACTURER_CERTIFICATION.md` §3 | — | Agent must expose control endpoints in sandbox |
| Recovery of paid sales with no outcome | Server-side | `dispenseRecoveryService.sweep`, `dispenseCommandService.sweepTimedOut` | — | No change needed |
| Capability declaration per model | Yes | `effectiveCapabilities` in `lib/vending/protocol/capabilities.ts`; `MachineModel.declaredCapabilities` | — | Declare only what is proven (§7.4) |
| Dispense confirmation strategy (descriptive) | Informational | `DispenseConfirmationStrategy` in `lib/vending/hardwareAdapter.ts` | — | `drop_sensor` (with curtain) |

---

## 4. Protocol → Snack Quest mapping

Legend: **DIRECT** = directly supported · **ADAPTER** = supported with adapter logic · **PARTIAL** · **NO** = not supported · **UNKNOWN** = needs hardware test or clarification.

| # | Operation | Snack Quest side | M109E side | Class |
|---|---|---|---|---|
| 1 | Machine registration | Staff register the machine; the agent calls `connect` with `manufacturerMachineId` | `01H` returns a card ID (format undocumented) | **ADAPTER.** Use a configured unit id, and send the card ID hex as `controllerVersion`/`serialNumber`. A replaced board mustn't change the machine's identity |
| 2 | Machine identity | `machineIntegrationIdentities` claim | `01H` | **PARTIAL** — the ID format needs confirming |
| 3 | Slot mapping | `manufacturerSlotId` string | Motor index 0–59 (or 0–99) + board address 1–8 | **ADAPTER** — proposed id `b<addr>-m<NN>`; the agent holds per-motor settings (§5) |
| 4 | Product selection | Kiosk → `POST /api/vending/payments` (slotIds) | none | **DIRECT** — no controller involvement |
| 5 | Price configuration | Server (`MachineSlot.priceKes`, overrides) | none | **DIRECT** (server only); the controller has no prices |
| 6 | Dispense initiation | Command `DSP-…` queued after payment; agent polls | — | **DIRECT** (existing Model B) |
| 7 | Dispense acknowledgement | Agent `POST …/ack` → 200 **before** any serial write | — | **DIRECT** (agent rule) |
| 8 | Motor execution | Agent journal `RUN_SENT` → `05H` | `05H Z1=0` started; `03H Z1=1` running | **DIRECT** |
| 9 | Product-drop confirmation | Report `dispensed` | `03H Z10 ∈ 1…200` with `Y3 = 1/2` | **DIRECT with a light curtain; NO without** |
| 10 | Motor failure | Report `failed` + code | `05H Z1=1` (invalid index), `03H Z3=0x02` (under-current), `0x04` (curtain self-test failed, not started), `0x05` (door not open) | **ADAPTER** |
| 11 | Jam | `failed:jam` or `dispensed` + fault event | `03H Z3=0x01` / `0x03` / `0x0A`, read together with `Z10` | **ADAPTER** — trust depends on curtain reliability |
| 12 | Timeout | `failed:timeout` or `unknown` | `03H Z3=0x03` (in-position not reached within `Y6`) | **ADAPTER** |
| 13 | Unknown physical outcome | Report `unknown` → human review | Lost `05H`/`03H` reply; host or board reset mid-run; `Z1=0` after a run we started | **ADAPTER** — the journal decides, never a re-run |
| 14 | Door open | `doorOpen` + `DOOR_OPENED`/`CLOSED` events | Not documented; maybe DI1–4 (`09H`) | **UNKNOWN** |
| 15 | Temperature | `temperatureCelsius` | `07H` (−50.0 = no sensor → report `null`) | **DIRECT** |
| 16 | Refrigeration | Not modelled on the server | `08H` DO on/off; logic text in §5.8 | **UNKNOWN** — board-autonomous or host-driven? |
| 17 | Machine offline | Liveness from heartbeats; `online:false` → no orders | Serial timeouts, curtain self-test failures | **ADAPTER** — the agent reports `online:false` when it cannot dispense safely |
| 18 | Inventory | Ledger of movements (sales, restocks, adjustments) | None | **NO** on hardware; Snack Quest keeps inventory itself |
| 19 | Faults | Status `faults[]`, events | `03H Z3` per run; `2AH` read-fail; temp sentinel | **PARTIAL** |
| 20 | Telemetry | Events with `data` | Peak/avg current, run time, drop time, temp, RH, DI | **ADAPTER** |
| 21 | Heartbeat | Agent timer | None needed. A cheap `01H`/`09H` read proves the board is alive | **ADAPTER** |
| 22 | Machine configuration | Server config; agent config file | Motor type, curtain mode and timings are per-command parameters, not stored on the board | **ADAPTER** (agent-local configuration) |
| 23 | Remote diagnostics | Admin integration panel, events | `01H`, `03H`, `07H`, `09H`, `0CH`, `0DH`, `10H`, `2AH`, `2BH` | **ADAPTER** (agent diagnostics, exposed as events/status) |
| 24 | Recovery after network failure | Outbox, `reportOutcomes`, late reports accepted | — | **DIRECT** (existing) + agent outbox persistence |
| 25 | Recovery after machine reboot | Journal replay; unacknowledged commands re-polled; acknowledged-but-unrun → `failed` "not executed"; run-sent-no-result → `unknown` | State after power loss not documented | **ADAPTER + UNKNOWN** (board behaviour) |
| 26 | Recovery after Snack Quest server failure | Agent keeps outbox; server sweeps (`sweepTimedOut`, `dispenseRecoveryService`) | — | **DIRECT** |

---

## 5. Dispense safety analysis (the critical section)

### 5.1 The chain, end to end

```
Customer pays (M-Pesa)                                   [server: machineTransactionService]
 → DISPENSE COMMAND CREATED  dsp_{transactionId}          [dispenseCommandRepository.claim — create() fails if it exists]
 → AUTHORIZED / SENT (queued, expires in 2 min)           [snackQuestGatewayAdapter.authorizeVend]
 → agent polls, sees DSP-…                                [GET /api/v1/.../commands]
 → agent checks its journal: never seen → continue
 → agent POST …/ack → 200 = ACKNOWLEDGED                  (≠200 → never touch the motor)
 → agent journal: RUN_PENDING{cmd, board, motor}  (fsync)
 → serial 05H (Y1=motor, Y2=type, Y3=curtain mode 2)
     reply Z1=0 → journal RUN_STARTED  → report `dispensing` (optional)
     reply Z1=1/2/3 → motor did NOT start (see 5.3)
     no reply / bad CRC → AMBIGUOUS (see 5.4)
 → serial 03H every ~200 ms until Z1=2 (finished)
 → journal RESULT{Z3, Z10, currents, runtime} (fsync)
 → map (Z3, Z10) → dispensed | failed{code} | unknown
 → outbox + POST …/status                                  [recordOutcome → decideVendOutcome]
 → SNACK QUEST RECORDS DISPENSED (stock −1) or refund or human review
```

### 5.2 Answers

| Question | Answer | Basis |
|---|---|---|
| Can we uniquely identify a physical dispense? | **Not at the controller.** Neither `05H` nor `03H` carries an operation ID; `03H Z2` is only the motor number. Uniqueness comes from Snack Quest's `commandId`, the agent's journal, and the board's single-flight rule: only one motor at a time, and no new run until the last result is cleared | §5.2, §5.3 [DOC]; the journal is our design |
| Can we safely retry a command? | **Reads, yes** (`03H`, `07H`, `09H`, `2AH` …). **`05H`, never blindly.** After a lost `05H` reply, the next step is always `03H`, never a second `05H` | [DOC] no retry rules; the rule is ours |
| Can we know the motor actually started? | **Yes**, when the reply arrives (`Z1=0`), or from `03H` (`Z1=1` running, or `Z1=2` with our motor number) | §5.2, §5.3 |
| Can we know the product physically dropped? | **Only with a light curtain fitted and `Y3=1/2`**: `Z10 = 1…200` ms. Without one, the protocol can only confirm the motor completed, and Snack Quest's rules make that `unknown`, not `dispensed` | §5.2 `Z10`, §5.3 `Y3`; spec §6.3 |
| Can we detect a jam? | **Partly.** Over-current (0x01) and timeout (0x03) exist, but the document itself says these can come from heavy load or PSU interference. With the curtain, `Z10` settles it: dropped (dispensed, plus a fault) or not dropped (failed jam) | §5.2 |
| "Didn't start" vs "started, outcome unknown"? | **Yes, when replies arrive:** didn't start = `05H Z1 ∈ {1,2,3}` or `03H Z3 = 0x04`. **When the `05H` reply is lost, only partly** — see 5.4 | §5.2, §5.3 |
| Recover from a network (internet) timeout? | **Yes.** The outcome sits in the agent's persistent outbox and is re-sent; the server accepts late reports, and `reportOutcomes` asks for missing ones | spec §6.3; `listNeedingOutcome` |
| Can the same command run twice by accident? | Not if the agent follows the rules: journal before `05H`; never `05H` twice per `commandId`; after ack, unacknowledged commands are the only ones re-polled; a re-ack of an executed command returns `409`. Without these rules, **yes** — the controller would happily run the same motor again once the previous result is cleared | §5.3; spec §6.2 |
| Does the controller provide idempotency? | **No.** It only refuses concurrent runs (`Z1=2`) and runs over an uncleared result (`Z1=3`) | §5.3 |
| Can Snack Quest implement idempotency above it? | **Yes.** The server side is already built and tested (claim-before-act ledger, ack gate, expiry, human review for `unknown`). The agent adds a write-ahead journal keyed by `commandId` | [REPO] |
| Power lost after the motor starts? | Board state after power loss is **undocumented** [UNKNOWN]. The agent journal says `RUN_PENDING`/`RUN_STARTED` with no result → report **`unknown`** → human review; never re-run. The in-flight vend is decided by a person (camera or physical check) | journal design |
| Dispensed, but the network dies before reporting? | The result is journaled and outboxed before any network call and delivered later. The server shows `TIMEOUT` → human review after 5 min, then resolves automatically when the late `dispensed` arrives | spec §6.3–6.4 |
| We send a command and never get the response? | **Serial (`05H`):** ambiguous → `03H` poll → see 5.4. **HTTP (ack/report):** retry with the same `eventId` (idempotent) | spec §4.3 |
| What survives a reboot? | **Board:** undocumented. **Host:** whatever the agent persists (journal, outbox, executed set). **Server:** everything | — |

### 5.3 Outcome mapping the agent must implement

Assumes curtain mode `Y3 = 2` (stop on drop; otherwise run to timeout).

| `05H Z1` | `03H Z3` | `03H Z10` | Report | Certain? |
|---|---|---|---|---|
| 1 (invalid index) | — | — | `failed` code `m109e_invalid_motor` + config fault | Yes — never started |
| 2 (another motor running) | — | — | Wait until idle and retry `05H` (ours didn't start); if it persists past the command window → `failed` `machine_offline` | Yes — ours didn't start |
| 3 (last result not cleared) | — | — | Read/clear the previous result, attribute it through the journal, then retry | Yes — ours didn't start |
| 0 (started) | 0x00 | 1–200 | **`dispensed`** | Yes (curtain) |
| 0 | 0x00 | 0 | Mode 1: **`unknown`** until curtain reliability is proven on our products, then `failed:no_product`. Mode 2 shouldn't produce this — treat it as `unknown` | Not yet |
| 0 | 0x01 over-current | 1–200 | `dispensed` + fault event `m109e_overcurrent` | Yes |
| 0 | 0x01 | 0 | `failed:jam` (same curtain caveat → `unknown` until validated) | Conditional |
| 0 | 0x02 under-current | 0 | `failed` code `m109e_undercurrent` (motor didn't move) + slot fault | High (verify) |
| 0 | 0x03 timeout | 1–200 | `dispensed` + fault | Yes |
| 0 | 0x03 | 0 | `failed:timeout` (empty or jammed; curtain caveat) | Conditional |
| 0 | 0x04 curtain self-test failed | — | `failed:sensor_failure`; the agent reports `online:false` until the curtain passes again | Yes — motor not started |
| 0 | 0x05 door not open | 0 | `failed` code `m109e_door_not_open` | Yes (locker types) |
| 0 | 0x0A microswitch not pressed | 1–200 / 0 | `dispensed` / `failed` code `m109e_switch` (curtain caveat) | Conditional |
| 0 | any other | any | `unknown` | — |
| no reply / CRC error | → 5.4 | | | |

With curtain mode 0 (no curtain), every outcome is `unknown`. **A machine without a working light curtain is not production-viable on Snack Quest.**

### 5.4 The one real hole: a lost `05H` reply

We sent `05H` and got no valid reply. The motor either started or didn't. Only `03H` can tell:
- `03H Z1 = 1` (running), or `Z1 = 2` with `Z2` = our motor → **it started.** Wait for the result and map as in 5.3.
- `03H Z1 = 0` (idle) → it depends on the **undocumented result-clearing rule**:
  - If results are kept until explicitly cleared (the `Z1=3` wording suggests so — [INFERENCE]), then "idle with no result" means **it never started** → safe to send `05H` once more (the board would refuse with `Z1=3` if it had run).
  - If a result can clear itself (a timer, or a read by another process), "idle" is ambiguous → report `unknown`, **never re-run**.

Until the manufacturer answers Q1 (§8) and hardware test S7 (§9) confirms it, the agent treats "lost `05H` reply + idle" as **`unknown`**. That is safe but costs a human review each time. On a correctly wired 9600-baud cable, lost replies should be rare.

### 5.5 Does this give financially safe dispensing?

**Yes, conditionally:**
1. **1 paid order → at most one command.** Already guaranteed server-side (`claim()` uses Firestore `create()`).
2. **One command → at most one `05H`.** Agent journal (fsync before the serial write) plus the `commandId` set.
3. **No execution after refusal or expiry.** Ack gate (spec §6.2).
4. **A second physical run is impossible while a result is uncleared.** Board interlock (`Z1=3`).
5. **Every uncertain case becomes `unknown`.** The server never refunds or completes an `unknown` automatically.

What we **cannot** get from this controller: an audit-grade link between one board result and one command. Correlation relies on the host being the only master on the bus, and on the journal.

---

## 6. Hardware architecture

### 6.1 What the document says about the host

| Question | Answer from the document |
|---|---|
| What is the host? | "主机（安卓或者PC等）" — "host (Android or PC, etc.)" (§4.1). Nothing else |
| Android / Windows / Linux / proprietary? | Not stated beyond "Android or PC etc." |
| CPU, RAM, storage | **Not documented** |
| Can applications be installed? Can we replace theirs? | **Not documented** |
| Can our application run continuously? | **Not documented** |
| How does the host talk to the controller? | Serial: "TTL, RS-485 levels, RS-232 etc." (§4.1). Whether through USB-serial, an onboard UART, or a /dev path is **not documented** |

### 6.2 Proposed physical architecture

```
                 Snack Quest cloud (unchanged)
   /api/vending/* (kiosk, payments)      /api/v1/* (Model B machine API)
              ▲  HTTPS (device secret)            ▲  HTTPS (HMAC keys)
              │                                   │
┌─────────────┴───────────────────────────────────┴───────────────┐
│ HOST (Android or PC — model/OS unknown)                          │
│   ├─ Kiosk: browser in kiosk mode → /machine/{code}              │
│   └─ Snack Quest Machine Agent (native service, always on)       │
│        Model B loop · journal · outbox · diagnostics             │
│        M109E protocol client · serial transport                  │
└──────────────────────────────┬──────────────────────────────────┘
                               │ UART: TTL / RS-485 / RS-232 (which? unknown)
                               │ 9600 8?N1, master addr 0
                ┌──────────────┴──────────────┐
                │ M109E board(s) addr 1..8    │
                └─┬───────┬───────┬─────┬─────┘
          motors 0–59/99  light curtain  temp probe  DHT11  DI×4  DO×4–7
                                                           (fan, compressor, glass heater, light strip, heater)
```

### 6.3 Components we still don't understand

1. The host board: model, OS and version, root/admin access, serial device path and permissions, kiosk-browser support, watchdog/auto-start, storage durability (flash wear, power-loss safety).
2. Which serial variant (TTL/485/232) our unit uses, and its connector/pinout. Sections 1–3 are missing.
3. Motor wiring: which motor index is which physical tray/column; which motor type (`Y2`) each lane needs.
4. The light curtain: fitted as standard? Its coverage for small or light items, and the power-on requirement (`0BH`).
5. DI assignments (door switch?) and DO assignments/count; board power-on default states for DOs (compressor on or off at boot?).
6. Refrigeration: does the board run the thermostat itself? Where is the set-point? What does the machine do if the host dies?
7. Power: board vs host power domains; what happens to a running motor if the host reboots.
8. The manufacturer's own software on the host: what it does today; must it be removed, and can it be?

---

## 7. Adapter design (not implemented)

### 7.1 Layering

```
Snack Quest abstraction      Machine API v1 (Model B) — server unchanged, adapter `snack_quest_gateway`
        ↓
Machine Agent core            poll → ack → execute → report; heartbeat/status; outbox; reportOutcomes; restart
        ↓
M109E adapter (agent-side)    slot map · dispense driver (state machine) · outcome mapper · health · telemetry
        ↓
M109E protocol client         request queue (1 outstanding) · encode/decode · CRC · validation · read retries
        ↓
Serial transport              open/configure 9600 8N1 · write · read 20 bytes with 50 ms settle / 1 s timeout · flush
        ↓
M109E control card (addr 1..8)
        ↓
Motors · light curtain · temperature · DHT11 · DI · DO
```

### 7.2 Where it lives

- **Not in `snack-quest-next`.** The Next.js app cannot reach hardware, and the existing architecture document puts the gateway out of scope there.
- A new deployable, e.g. `machine-agent/` at the repo root (or its own repo).
- The language follows the host:
  - **Kotlin** if Android (we would port the signing SDK; `docs/machine-api/signing-test-vectors.json` makes that verifiable).
  - **TypeScript/Node** or **Python** if Linux/Windows (reuse `sdk/typescript` or `sdk/python`).
- The layout below is language-neutral.

### 7.3 Files

| File | Responsibility |
|---|---|
| `m109e/crc16Modbus` | Poly 0xA001 (reflected 0x8005), init 0xFFFF, low byte first. Tests: all 31 valid §6/§5 frames; the 3 misprinted frames are asserted to be misprints |
| `m109e/frame` | 20-byte frames. Encode `[addr][cmd][16 data][crc]`. Decode with checks: length 20, CRC, reply address = 0, echoed command = the one sent. 16-bit big-endian helpers |
| `m109e/commands` | Typed encoders/decoders: `getId 01`, `motorPoll 03`, `motorRun 05`, `readTemp 07`, `writeDo 08`, `readDi 09`, `laserPower 0B`, `laserState 0C`, `laserCounter 0D`, `readRhTemp 10`, `readSwitch 2A`, `readRowSwitches 2B`. **`FF` (set address) is excluded from the runtime** and lives only in the bench tool |
| `m109e/resultCodes` | `Z3` table → `{meaning, motorStarted, certainNothingDropped}` |
| `transport/serialTransport` | Interface: `open(config)`, `request(frame, {settleMs:50, timeoutMs:1000})`, `flushInput()`, `close()`. Exactly one request in flight |
| `transport/<platform>Serial` | Real port (Android serial / Node `serialport` / pyserial) |
| `transport/faultInjection` | Wrapper that drops, delays or corrupts replies, for tests and bench drills |
| `transport/fakeM109e` | Board simulator implementing the documented behaviour, including the `Z1=2`/`Z1=3` interlocks, `Z3` codes and `Z10`. Configurable result-clear rule, so recovery logic is tested under both interpretations |
| `m109e/protocolClient` | Serialises requests; auto-retries idempotent reads (max 3); **never auto-retries `05H`**; flushes input before each request; logs every frame as hex |
| `m109e/slotMap` | Config: `slotId "b1-m07" → {board:1, motor:7, type:0x03, curtain:2, switchDelay:15, timeout:0, lockTime:0}`. Validated at start-up (index range, duplicates) |
| `m109e/dispenseDriver` | Per-command state machine: `RECEIVED → ACKED → RUN_PENDING (journal) → RUN_STARTED → RESULT (journal) → REPORTED`. Poll `03H` every ~200 ms up to `timeout + 3 s`. Clears/reads results in a fixed order. Carts run strictly one at a time |
| `m109e/outcomeMapper` | The §5.3 table. A policy flag `curtainNegativeIsCertain` (default **false** until hardware test S5 passes) |
| `m109e/health` | Board reachable (`01H`); curtain self-test state; temp sensor present (≠ −50.0); DI snapshot. Decides `online:false` |
| `m109e/telemetry` | Events per run (peak/avg current, run time, drop ms), temperature/RH samples, DI changes → Snack Quest events vocabulary |
| `m109e/refrigeration` | **Only if Q10 says the host must run the thermostat.** Includes the §5.8 compressor protections and a fail-safe if the agent dies |
| `journal/journal` | Append-only, fsync on every state change; replay on start. Executed-command set, pending outbox, last board result |
| `snackquest/client` | Signed HTTP (port of `sdk/*`); retries with the same `eventId` |
| `snackquest/loop` | Heartbeat (≤ 60 s), status, poll (2 s/10 s), ack-then-execute, reports, `reportOutcomes` answers from the journal, `restart` handling |
| `sandbox/controlServer` | Certification control endpoints (`/capabilities`, `/cycle`, `/door-events`, `/empty-slot`, `/hold-next-commands`, `/retransmit-last-report`, `/request-log`, `/defer-next-report`), sandbox only (`docs/MANUFACTURER_CERTIFICATION.md` §3) |
| `diagnostics/benchCli` | Engineer tool: read ID, run one motor, poll, read sensors, scan motors (`2BH`), set address (`FF`, guarded) |

### 7.4 Snack Quest configuration (no code changes)

- **Manufacturer:** integration type inbound, default adapter `snack_quest_gateway`.
- **Model:** `declaredCapabilities` = `vend`, `dispense_confirmation`, `heartbeat`, `telemetry`, `faults`, `temperature`.
  - Add `door_status` only after a door input is confirmed.
  - **Not** `inventory_read`, `payment_device`, `camera` or `remote_price_update`.
- **Slot id format:** `b<1-8>-m<00-59>`. **Confirmation strategy:** `drop_sensor`.
- `effectiveCapabilities` narrows the gateway adapter's broad defaults to this list.

### 7.5 Core follow-ups that would help (optional, not required to integrate)

Recorded, not proposed for now:
- **Auto-pause a slot after a jam, `no_product` or `unknown` dispense.** Today nothing does this, so a jammed lane keeps being sold and refunded.
- **Make the reference SDKs' outbox persistent**, and show the write-ahead journal pattern in the SDK docs.
- **Add a `m109e` entry to `lib/vending/protocol/registry.ts`** with status "requires hardware validation".

### 7.6 Timeouts and retries

- **Serial:** 50 ms settle, 1 s reply timeout (§4.2).
  - Reads: up to 3 attempts.
  - `05H`: 1 attempt, then `03H` disambiguation.
  - Motor completion wait: `Y6` (default 7 s) + 3 s margin, then `unknown`.
- **HTTP:** the SDK's existing retries.
  - Ack must reach 200 before `expiresAt`, else no dispense.
  - Reports are retried until any 200.

---

## 8. Gaps and unknowns

### 8.1 What we can and can't build now

**A. Build now, from the document:**
- CRC, frame codec, command encoders/decoders with golden-frame tests.
- The fake board and the fault-injection transport.
- Outcome mapper (with a conservative default), journal and outbox.
- The Model B loop, run end to end against our sandbox with the fake board, including the certification harness.
- The slot-map format and the bench CLI.

**B. Needs the physical machine:**
- Real timings.
- Curtain reliability on our products.
- Per-lane motor types.
- The index → position map.
- Result-clearing behaviour, observed.
- Power-loss behaviour.
- DI/door wiring.
- The temperature sensor.
- Which serial variant.
- Host OS, serial path and kiosk browser.

**C. Needs more manufacturer documentation:**
- Sections 1–3 (hardware, connectors, wiring).
- Host board specifications.
- DI/DO wiring.
- Motor index map.
- Board firmware version and changelog.
- Whether refrigeration is the board's job or the host's.
- DO power-on defaults.

**D. Needs manufacturer clarification:** the questions in §9.

**E. Would need firmware changes (asks, not blockers):**
- Operation/sequence ID echoed in `03H`.
- An explicit "clear result" command.
- The last result persisted across power loss.
- A firmware-version command.
- A documented door input.
- An autonomous thermostat with a set-point command and a safe default when the host is silent.

**F. Not possible with this controller as documented:**
- Product counting and inventory.
- Controller-level idempotency.
- Board-pushed events (the host must poll).
- DEX audit.
- Payment peripherals — not needed.
- Detecting a product that fell but wasn't seen by the curtain (physics: only better sensing fixes this).

---

## 9. Questions for the manufacturer

Each question is followed by why it matters.

1. **When is a motor result cleared?** By reading `03H`, by a separate command, by a timer, or never until the next run? *(Decides whether a lost `05H` reply is recoverable or goes to human review — §5.4.)*
2. **After the board loses power, what does `03H` report?** Is anything kept? *(Power-loss recovery.)*
3. **Is the motor index range 0–59 or 0–99?** How does an index map to a physical tray/column? Is index = row × 10 + column? *(Slot mapping — D1, D8.)*
4. **Is a light curtain fitted as standard on the model we are buying?** What is the smallest item it reliably detects? Must it be powered with `0BH` before a run in mode 1/2? *(Drop confirmation is mandatory for us.)*
5. **Can `Z10` exceed 200 ms?** What happens if the product takes longer to fall? *(Mapping.)*
6. **Which physical interface does our board use (TTL, RS-485 or RS-232), and how many data bits?** *(Transport.)*
7. **What is the host computer:** model, OS, version? Can we install our own application, get serial port access (device path, permissions or root), and remove or disable your application? *(Whether we can run without your software.)*
8. **What does the `01H` ID contain,** and is it unique per board? *(Identity.)*
9. **What are DI1–DI4 connected to?** Is there a door switch? *(Door status.)*
10. **Refrigeration:** does the board run the fan/compressor logic in §5.8 by itself? How is the target temperature set? What happens if the host stops sending commands? *(Food safety, compressor safety.)*
11. **How many digital outputs are there, and their numbering?** (4 vs 5 vs 0–6.) What is each output's state at power-on? *(D2.)*
12. **For timed locks, is the hold time `Y6` or `Y7`?** *(D3.)*
13. **What is the exact frame for Set Address?** *(D4.)*
14. **Is there a firmware version, and how do we read it?** How are firmware updates delivered? *(Support, certification.)*
15. **Can another device on the bus (e.g. your app) also send commands** while our host is master? *(Single-master assumption.)*
16. **Please supply real captured frames for `2BH`.** The CRCs in the document's examples are wrong. *(Document accuracy — D7.)*
17. **Does a running motor stop by itself if the host stops talking mid-run?** *(Host crash safety.)*
18. **What exactly do over-current (0x01) and timeout (0x03) mean for product delivery?** Can a product still drop in those cases? *(Jam mapping.)*

A Chinese version of these questions is in Appendix A.

---

## 10. Physical machine acceptance test plan

**Pass criteria are binary.** Every test logs raw frames (hex), journal entries and Snack Quest command IDs.

### 10.1 Connectivity

| ID | Test | Pass |
|---|---|---|
| C1 | Identify the serial variant; connect at 9600 8N1 | `01H` answers with a valid CRC |
| C2 | Address discovery by LED blinks; `01H` to addresses 1–8 | Only the configured board(s) answer |
| C3 | CRC: send a frame with a bad CRC | No action taken; the host reports a timeout (document the board's behaviour) |
| C4 | Timing: 1,000 `01H`/`03H` round-trips | 0 CRC errors; p99 reply < 1 s; settle ≥ 50 ms respected |
| C5 | Data bits: try 8N1 (and 7 if the manufacturer says so) | Documented setting confirmed |
| C6 | Cable pull mid-session, then reconnect | Agent reports `online:false`, then recovers |

### 10.2 Motors

| ID | Test | Pass |
|---|---|---|
| M1 | Every configured lane: `05H` with its `Y2` type, mode 2, stocked | `Z3=0`, `Z10>0`, exactly one product per run (counted by hand) |
| M2 | Every lane, empty | Motor runs to timeout; `Z3=0x03`, `Z10=0`; nothing drops |
| M3 | Unplugged motor | `Z3=0x02`; nothing moves |
| M4 | Induced jam (blocked spiral) | `Z3=0x01` or `0x03`; `Z10` agrees with what physically happened |
| M5 | `05H` while another motor runs | `Z1=2`; the second motor does not move |
| M6 | `05H` twice without reading the result | Second reply `Z1=3`; **no second rotation** |
| M7 | Invalid index (60, 99, 100) | `Z1=1`; the answer to D1 recorded |
| M8 | 50 consecutive vends on one lane | 50 products, 50 `dispensed`, 0 unknown |
| M9 | Index → physical position map for every lane | Map signed off; matches the slot-map config |

### 10.3 Sensors

| ID | Test | Pass |
|---|---|---|
| S1 | `0BH` on/off; `0CH` with a hand in the curtain | State follows |
| S2 | `0DH` counter behaviour | Documented (width, reset) |
| S3 | Curtain self-test failure (curtain covered/unpowered) → `05H` | `Z3=0x04`; motor did not move |
| S4 | Drop timing: `Z10` range across all products | All within 1–200, or documented |
| S5 | **Curtain reliability:** ≥ 200 vends per product size, including the smallest item | 100 % detected. Only then set `curtainNegativeIsCertain = true` |
| S6 | False positive: hand in the delivery port during a run on an empty lane | No false `Z10` > 0, or documented |
| S7 | **Result-clearing rule:** after a run, read `03H` repeatedly, wait minutes, power-cycle the host, then issue `05H` | The actual rule recorded (answers Q1) |
| S8 | Temperature `07H`: probe in, probe unplugged | Real value; −50.0 when unplugged |
| S9 | `10H` humidity/temperature | Plausible values; `Z3` semantics documented |
| S10 | DI1–4: open/close the door, other switches | Door input identified (or proven absent) |
| S11 | DO outputs: each index; power-on defaults | Map and defaults documented |
| S12 | Refrigeration: autonomous or host-driven | Behaviour documented (answers Q10) |

### 10.4 Failure recovery

| ID | Test | Pass |
|---|---|---|
| R1 | Internet down during a vend | Product delivered once; outcome delivered after reconnect; sale `dispensed` |
| R2 | Snack Quest unreachable (block DNS) | Same as R1; no execution without ack |
| R3 | Agent killed after ack, before `05H` | On restart: no motor run; `reportOutcomes` answered `failed` "not executed"; customer refunded |
| R4 | Agent killed after `05H`, motor running | On restart: journal `RUN_STARTED` → result read if the board kept it, else `unknown`; **never re-run** |
| R5 | Host reboot mid-run | As R4 |
| R6 | Board (controller) power cut mid-run | Journal shows the run was started; outcome `unknown`; human review; the board's post-power state documented |
| R7 | Whole-machine power cut mid-run | As R6; no second dispense after power returns |
| R8 | Power cut 1 s after a successful drop | Outcome `dispensed` or `unknown` (depending on journal timing), **never re-run** |
| R9 | Lost `05H` reply (fault-injection transport) | Resolved by the `03H` rule; never two rotations |
| R10 | Lost `03H` replies | Retries succeed; no duplicate run |
| R11 | Duplicate command delivery (harness DUPLICATE DELIVERY) | One rotation, one report |
| R12 | Command expired while held (harness TIMEOUT HANDLING) | Never executed |
| R13 | Report deferred (harness OFFLINE RECOVERY) | Delivered on a later cycle; counted once |

### 10.5 Security

| ID | Test | Pass |
|---|---|---|
| X1 | Only the agent can open the serial port (the manufacturer app removed/disabled) | Port exclusive to the agent |
| X2 | Malformed frames from the board (fault injection: wrong length, wrong command echo, wrong address) | Rejected; logged; never interpreted as a result |
| X3 | Invalid CRC replies | Rejected |
| X4 | Unexpected unsolicited bytes on the line | Flushed; no action |
| X5 | Command replay against Snack Quest (re-send a signed request) | `401 replayed_request` (existing) |
| X6 | Agent never sends `FF` (broadcast set-address) at runtime | Verified by frame log |
| X7 | Physical: cabinet locked; host has no open debug ports (ADB/SSH) in production | Checked |
| X8 | Kiosk: browser locked to `/machine/{code}`; no navigation away | Checked |

### 10.6 Financial safety proofs (run on the real machine, sandbox deployment)

| Proof | Method | Pass |
|---|---|---|
| P1 **1 paid order = at most one physical dispense** | 100 sandbox sales, observed on camera; compare products counted vs `dispensed` | Equal; 0 extra drops |
| P2 **2 identical server requests = at most one dispense** | Duplicate delivery and duplicate report drills (R11, harness IDEMPOTENCY) | 1 drop per order |
| P3 **A network timeout cannot cause a second dispense** | R1, R2, R9, R10 under fault injection, repeated 50× | 0 double drops |
| P4 **A successful dispense is eventually reconciled** | R1, R8, R13 | Every drop ends `dispensed` (possibly after human review for R8) |
| P5 **A failed dispense is identified** | M2, M3, M4 (with S5 passed) | Customer refunded; no stock movement |
| P6 **An unknown outcome lands in the right state** | R4–R8 | `unknown` → `manual_review`; no automatic refund or sale |
| P7 **Certification harness** | Full harness run against the real machine in sandbox | Verdict CERTIFIED |

---

## 11. Production risk assessment

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | Host is locked (Android without serial permission, manufacturer app can't be removed) | Unknown | **Blocker** | Q7 before purchase; ask for a Linux/Windows host or a rooted/open Android image |
| 2 | No light curtain, or unreliable on small items | Unknown | **High** — every sale becomes `unknown` (manual work) or false outcomes | Q4; S5; curtain mandatory in the purchase spec |
| 3 | Result-clearing rule makes lost `05H` replies ambiguous | Medium | Medium — human reviews | Q1; S7; good cabling (C4) |
| 4 | Refrigeration becomes the host's job | Unknown | High — food safety; compressor damage if the agent crashes with the compressor on | Q10; prefer the board's thermostat; watchdog if host-driven |
| 5 | Document inaccuracies (CRC errors, range conflicts) | Confirmed | Medium — wrong assumptions | Treat as draft; confirm with real frames (C1–C4, M7) |
| 6 | No door sensor | Unknown | Low–medium — no door alerts or tamper detection | Q9; S10; add a switch on a DI |
| 7 | No inventory sensing | Certain | Medium — stock accuracy depends on restock discipline | Existing ledger and restock workflow; stock counts at restock |
| 8 | Jammed lane keeps selling (repeat refunds) | Likely | Medium — customer frustration | Core follow-up: auto-pause a slot on jam/unknown (§7.5) |
| 9 | Power loss mid-vend | Occasional | Low per event — `unknown` → human review | Journal; camera review |
| 10 | Serial bus has no authentication | Certain | Medium — anyone inside the cabinet or on the host can vend | Physical security; host hardening (X1, X7) |
| 11 | Large carts (many units) vs 2-minute command expiry | Low | Low — late units refused and refunded | Agent runs units back to back; reports each |
| 12 | Single supplier firmware with no version command | Certain | Medium — silent behaviour changes | Q14; record the `01H` ID per machine; re-run the acceptance tests on board swaps |

---

## 12. Final compatibility verdict

### A. Protocol compatibility

**No single percentage is justified.** Of Snack Quest's 17 hardware capabilities (`ALL_HARDWARE_CAPABILITIES`):
- **Supported: 3.** `vend` directly; `temperature` directly; `dispense_confirmation` only with a light curtain.
- **Partial: 5.** `slot_read` (switch state only), `telemetry`, `faults`, `heartbeat` (the host provides it), `remote_configuration` (DO outputs only).
- **Unknown: 1.** `door_status`.
- **Not supported: 8.** `inventory_read`, `inventory_write`, `remote_price_update`, `remote_enable_disable`, `remote_restart` (controller), `audit_export`, `camera`, `payment_device`.

Most of the unsupported ones are **not needed** by Snack Quest's cashless, server-priced design. Against the capabilities Snack Quest actually needs for a production sale — dispense, certain-failure detection, drop confirmation, temperature, liveness — **everything is available, on two conditions:** a light curtain, and a host we control.

### B. Major compatible capabilities

- Byte-level documented serial protocol with a verified checksum.
- Explicit motor start and refusal.
- A detailed per-run result (failure cause, currents, run time).
- Light-curtain drop timing.
- A single-flight interlock.
- A temperature probe.
- Multi-board addressing.

### C. Major incompatibilities

- No command or transaction ID.
- No controller idempotency.
- No documented result-clear or power-loss semantics.
- No inventory.
- No door sensor documented.
- No firmware version.
- Refrigeration responsibility unclear.
- The host is not documented.

### D. Unknowns

- Host platform and access.
- Serial variant and data bits.
- Motor index map and range.
- Whether a light curtain is fitted, and how reliable it is.
- DI/DO wiring.
- Refrigeration ownership.
- Power-loss behaviour.

### E. Required manufacturer questions

§9. **Q1, Q4, Q7 and Q10 decide the purchase.**

### F. Required code changes

- **Snack Quest server:** none to integrate. Configuration only (§7.4). Optional core improvements are in §7.5.
- **New:** the Machine Agent with the M109E driver (§7), built outside the Next.js app.

### G. Physical hardware tests

§10. The gating tests are:
- **S5** — curtain reliability.
- **S7** — the result-clearing rule.
- **R4–R8** — crash and power-loss recovery.
- **P1–P7** — financial safety proofs.

### H. Production risks

§11. The top risks are:
1. A locked host.
2. The curtain.
3. Refrigeration.

### I. Recommended next step

1. **Send the §9 questions (Appendix A) before buying.** Q7 (host access), Q4 (curtain) and Q10 (refrigeration) must be answered in writing.
2. **In parallel, build the agent pieces from category A (§8.1)** against the fake board: codec, fake board, journal, dispense driver, outcome mapper, Model B loop. Run them through our sandbox and certification harness. That is roughly the work that doesn't depend on hardware.
3. **When the machine arrives,** run §10 in order: connectivity → motors → sensors → recovery → security → financial proofs. Declare the model's capabilities only from passed tests.

### The question

> **"If Snack Quest buys one machine from this manufacturer, can we realistically make it run Snack Quest OS end-to-end without depending on the manufacturer's software?"**

**For the controller: yes.** The M109E protocol is complete enough, and precise enough (I verified the checksum against 31 of its 34 examples), to drive every motor and read every sensor we need without the manufacturer's software.

**For the machine as a whole: only if the host is ours to control.** The document says nothing about the host computer. If it is a locked Android tablet running their app, with no serial access for us, we would depend on their software or need a replacement host.

**For financially safe production:** yes, on two conditions:
- a working light curtain on every lane;
- a clear answer on result clearing.

Without the curtain, every sale ends in human review.

**What remains:**
- the host answer;
- the agent build;
- the physical acceptance tests;
- possibly taking over refrigeration control.

---

## Appendix A — Questions for the manufacturer (Chinese)

1. 电机运行结果（03H 返回的 Z1–Z10）在什么情况下会被清除？是读取 03H 后自动清除、需要单独的清除指令、超时自动清除，还是直到下一次运行才清除？
2. 控制卡断电重启后，03H 返回什么？是否保存上一次运行的结果？
3. 电机索引范围到底是 0–59（05H）还是 0–99（03H、2AH、2BH）？索引与实际层/列位置如何对应？是否为“层号×10+列号”？
4. 我们采购的型号是否标配光幕？光幕能可靠检测的最小商品尺寸是多少？模式 1/2 运行前是否必须先用 0BH 打开光幕电源？
5. Z10 是否可能超过 200 ms？商品掉落时间超过 200 ms 时如何表示？
6. 我们的控制卡使用哪种物理接口（TTL、RS‑485 还是 RS‑232）？数据位是 8 位吗？
7. 主机是什么设备？型号、操作系统及版本？我们能否安装自己的应用、获得串口访问权限（设备路径、权限或 root），并卸载或停用贵方应用？
8. 01H 返回的 12 字节 ID 的格式是什么？每块控制卡是否唯一？
9. DI1–DI4 分别连接什么？是否有门控开关？
10. 制冷逻辑（第 5.8 节）是否由控制卡自动执行？目标温度如何设置？主机停止通讯时会怎样？
11. 开关量输出一共有几路？编号如何（文档中有 4 路、5 个名称、0–6 三种说法）？上电时各路默认状态是什么？
12. 时间控制型电磁锁的动作时间是在 Y6 还是 Y7？（第 5.3 节表格与第 6 节示例不一致）
13. 设置地址（FFH）的准确帧格式是什么？（第 5.13 节与第 6 节示例不一致）
14. 是否有读取固件版本的指令？固件如何升级？
15. 在我们的主机作为主站时，总线上是否还有其他设备（例如贵方应用）会发送指令？
16. 请提供 2BH 的真实抓包数据：文档中 2AH/2BH 示例的 CRC 校验码有误。
17. 如果主机在电机运行过程中停止通讯，电机会自行停止吗？
18. 过流（0x01）和超时（0x03）时，商品是否仍可能掉落？

## Appendix B — Checksum verification detail

CRC16‑MODBUS (reflected poly 0xA001, init 0xFFFF) over bytes 1–18, compared with bytes 19–20 (low byte first):

| Frame (as printed) | Printed CRC | Computed | Result |
|---|---|---|---|
| §5.10 `01 10 …` / `00 10 3A 17 …` | `2D DD` / `B9 9C` | same | OK |
| §5.11 `01 2A …` | `1F 70` | `1F 70` | OK |
| §5.11 `00 2A 01 …` | `11 89` | **`8F 1C`** | **Wrong** (§6 prints the correct `8F 1C`) |
| §5.12 `01 2B …` | `1F 70` | **`4E E0`** | **Wrong** (the `2AH` CRC was reused) |
| §5.12 `00 2B 01×10 …` | `12 89` | **`69 AA`** | **Wrong** |
| All 28 frames in §6 (ID, run, poll, set address ×8, DO on/off, DI, timed lock ×2, switch ×4) | — | same | OK |
