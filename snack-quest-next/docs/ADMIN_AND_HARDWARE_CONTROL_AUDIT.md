# Admin and hardware control audit

**Scope:**
- Can Snack Quest take control of a manufacturer machine (the M109E control card) with the architecture in this repository?
- Can a non-technical team operate the business through the admin UI, and does authorization match what people should be allowed to do?

**Method:** traced code, not documentation.
- **Routes:** all 263 `app/api/**/route.ts` files. Their guards were extracted mechanically and the anomalies checked by hand.
- **UI callers:** every `fetch('/api/…')` in `app/` and `components/`, matched to route patterns. Dynamic paths were verified by hand.
- **Services:** every public service method, cross-referenced to UI, API, cron and internal callers.
- **Pages and access:** admin, warehouse, finance, agent and partner pages; navigation (`components/admin/adminNav.ts`); session and permission code (`lib/auth/*`); Firestore rules; cron schedule (`vercel.json`).
- **Hardware:** the manufacturer document `M109E型售货机控制卡`, including its four embedded spreadsheets and images.

Companion document: `docs/hardware/M109E_COMPATIBILITY_AUDIT.md`, the byte-level protocol audit. This report does not repeat its detail where a reference is enough.

**Nothing in the product was changed to produce this report.**

### How to read priorities

- **Critical:** the business cannot be operated safely or at all without it, or there is a real security exposure.
- **High:** operations depend on engineering, or a correctness risk.
- **Medium:** visibility and efficiency.
- **Future:** scale features.

---

## 1. Executive summary

### 1.1 Hardware
- **The M109E is a slave I/O and motor controller, not a vending computer.** It talks only when spoken to, over a serial line. It has no network, payment, pricing, inventory, clock, command IDs or persistent-state guarantees.
- **The manufacturer document does not describe the host computer at all.** That is the machine's UI and business-logic computer. The document only says "主机（安卓或者PC等）" — "host (Android or PC, etc.)" (§4.1).
- **Snack Quest can control this controller, but only through software on the machine** that we do not yet have: a **Snack Quest Machine Agent**.
  - The server side needs **no changes**. The agent speaks the existing Model B machine API.
  - Safety depends on:
    - the agent's write-ahead journal;
    - a light curtain on every lane;
    - one manufacturer answer: when is a motor result cleared.

### 1.2 Manufacturer separation
**The server side achieves it; the machine side does not yet.**
- **What works:** the manufacturer registry, models, capability declarations, adapters, the signed machine API, certification, normalized events and the dispense ledger are genuinely manufacturer-agnostic.
- **Where it fails:** for a manufacturer that ships only a controller (like the M109E), the missing agent means we would today depend on the manufacturer's host software to drive the hardware. The kiosk also assumes a host browser we have never verified.

### 1.3 Admin
**The admin UI is far behind the backend.**
- **Machine setup cannot be done through admin.** The basic operational chain — create a machine owner → register a machine → create a location → configure slots → put products on a machine → set prices → set the owner's revenue share → settle and pay the owner — is almost entirely API-only or code-only.
- **The most serious gap:** vending sales that end in `manual_review` or `paid_vend_failed` **have no resolution or refund workflow anywhere.**
  - `machineTransactionService.requestRefund` and `markRefunded` have **zero callers**.
  - The dispense-safety design depends on "a human will resolve it", and no human has a tool to do it.

### 1.4 Authorization
The current model is five fixed roles, one role per person, plus six "sections" that apply **only to the `admin` role and only to page rendering**. API routes check roles, never sections. Consequences:
- An admin restricted to "Marketing" can still call every admin-only API.
- The warehouse role is simultaneously over-permitted and under-served:
  - **Over-permitted in the API:** it can set prices, register machines (receiving device secrets), change slot mappings and edit kiosk artwork.
  - **Under-served in the UI:** it has **no** vending pages at all, because `/admin` redirects warehouse users to `/warehouse`, which has none.

### 1.5 Scale
- The fleet page makes **4 Firestore queries per machine** per page view. At 1,000 machines that is 4,000 queries per page load.
- Nothing supports bulk operations, exports, templated planograms or technicians.

### 1.6 Verdict
**The platform is not yet operable by a non-technical team.** The code base is strong underneath; what is missing is mostly UI, workflows and a real permission layer, not core engine work. The exceptions:
- The Machine Agent (new software).
- The vending refund / review workflow (new server logic + UI).
- A permission enforcement layer.

---

## 2. Hardware architecture

### 2.1 What the M109E board is

| Question | Answer | Evidence |
|---|---|---|
| Main machine computer? | **No** | §4.1: master/slave; the host is "Android or PC etc." |
| Motor controller? | **Yes** — runs one motor, solenoid, lock or belt lane at a time (15 motor types) | `05H` §5.3 |
| I/O controller? | **Yes** — 4 DI, 4–7 DO, temperature, humidity, light curtain | §5.4–5.10 |
| Peripheral / slave controller? | **Yes** — address 1–8 on a shared serial bus; never initiates | §4.1 |
| Runs the UI or business logic? | **No** | Nothing in the document |

### 2.2 Machine components

| Component | Status | Evidence |
|---|---|---|
| Controller | M109E card, addresses 1–8, several per bus | Title; §4.1 |
| Host computer | **UNKNOWN** — "Android or PC etc." | §4.1 |
| Display / touchscreen | **UNKNOWN** — not in document | — |
| Payment device (MDB, coin, bill, cashless) | **Not mentioned** | — |
| Cameras | **Not mentioned** | — |
| Network / modem / Wi-Fi | **Not mentioned** (not on the card) | — |
| Speakers, printer | **Not mentioned** | — |
| Refrigeration controller | **Partial / UNKNOWN** — the card switches fan, compressor, heated glass, light strip and heater outputs (`08H`) and prints a cooling algorithm, but has no set-point command. Board-run or host-run is not stated | §5.8 |
| Light curtain (drop detection) | Supported **if fitted** | `03H Z10`, `05H Y3`, `0BH`–`0DH` |
| Sensors | 1 temperature probe (`07H`), 1 DHT11 humidity/temperature (`10H`), 4 DI (`09H`), per-motor switches (`2AH`/`2BH`) | §5.4, §5.9–5.12 |
| Host operating system (Android, Linux, Windows, embedded, Raspberry Pi, industrial PC, ARM/x86) | **UNKNOWN** — none stated | — |
| DIP switches | **None documented.** The address is set by the broadcast `FF` command and read from LED blink count | §4.1, §5.13 |
| Wiring diagrams / pinout | **Absent.** The document starts at §4; §1–3 are missing | — |

### 2.3 Where Snack Quest OS runs

**Two parts of Snack Quest OS must run on the machine:**
1. **The customer screen** — `components/kiosk/KioskScreen.tsx` at `/machine/{code}`. It needs a browser on the host.
2. **The Machine Agent** — it must own the serial port.

The cloud (Next.js on Vercel) can never reach a serial line (`lib/vending/hardwareAdapter.ts` is server-side; `docs/HARDWARE_COMPATIBILITY_ARCHITECTURE.md` already marks the gateway out of scope for this repo). Required architecture:

```
Snack Quest Cloud  (unchanged: /api/vending/* for the kiosk, /api/v1/* Model B for the agent,
                    adapter `snack_quest_gateway`)
        ↑ HTTPS                                   ↑ HTTPS (HMAC)
Host computer (manufacturer-supplied, UNKNOWN OS)
   ├── Kiosk browser → Snack Quest customer screen
   └── Snack Quest Machine Agent  ← NEW; owns the serial port; journal + outbox
        ↓ UART (TTL / RS-485 / RS-232 — which one: UNKNOWN), 9600 bps
M109E control card(s), addresses 1–8
        ↓
Motors · light curtain · temperature · DHT11 · DI · DO (fan, compressor, heated glass, light strip, heater)
```

**Why not "Cloud → manufacturer host → controller" (that is, Model A through the manufacturer's host software)?**
- It is possible only if the manufacturer's host software exposes an API. Nothing says it does.
- Even then, the manufacturer would own the dispense-safety logic we have built and certified.
- The agent architecture keeps safety, identity and telemetry in Snack Quest's hands, and reduces the manufacturer to hardware plus a documented board protocol.

**Alternative if the host is locked:** a Snack Quest-owned gateway computer — Linux SBC or industrial PC — wired to the M109E bus in place of the manufacturer host. The kiosk would then need our own display, or the manufacturer's screen driven by our computer.

---

## 3. Manufacturer protocol findings

Full detail: `docs/hardware/M109E_COMPATIBILITY_AUDIT.md` §2.

### 3.1 Link layer
- **Electrical:** TTL / RS-485 / RS-232 ("等"); which one our unit uses is not stated (§4.1).
- **Settings:** 9600 bps, 1 stop bit, no parity, no flow control. **Data bits are not stated.**
- **Messaging:** strict request/response; one outstanding request; host 0, boards 1–8, broadcast 255 for addressing only.
- **Timing:** send → 50 ms → reply, 1 s timeout (§4.2). Retries are not documented.
- **Frame:** fixed 20 bytes `[addr][cmd][16 data][CRC16-MODBUS, low byte first]`; 16-bit values big-endian (§4.3).

### 3.2 What the board does not have
- The board never initiates. **It has no transaction ID, command ID, timestamp, networking or internet.**
- **Persistent state is not documented.**

### 3.3 Commands
`01H` ID · `03H` motor poll · `05H` motor run · `07H` temperature · `08H` DO · `09H` DI · `0BH`/`0CH`/`0DH` light curtain · `10H` humidity/temperature · `2AH`/`2BH` motor switch reads · `FFH` set address.

### 3.4 Example-frame verification (every example checked)

I recomputed CRC16-MODBUS on all 34 example frames and decoded every field against the command tables:

| Frame | CRC | Field check |
|---|---|---|
| §5.10 `10H` request/response | OK | RH 58 %, 23 °C in range. **`Z3 = 00` means "stale" by the doc's own rule** (D6) |
| §5.11 `2AH` request | OK | — |
| §5.11 `2AH` response | **Wrong** (`11 89`; correct `8F 1C`, which §6 shows) | Z1 = 1 closed |
| §5.12 `2BH` request | **Wrong** (`1F 70` is the `2AH` CRC; correct `4E E0`) | — |
| §5.12 `2BH` response | **Wrong** (`12 89`; correct `69 AA`) | 10 × `01` then `00`, although the table says `Z1–Z11` (D8) |
| §6 `01H` ID | OK | 12 bytes of undocumented format; the tail reads as ASCII "G623869" |
| §6 `05H` run ×2 | OK | Y1 = 0, Y2 = 3 (3-wire), Y3 = 0 / 2 — consistent |
| §6 `03H` poll | OK | Z1 = 2, Z2 = 0, Z3 = 0, peak 1,466 mA, avg 119 mA, 2,620 ms, **Z10 = 0**. Consistent with curtain mode 0 (no curtain) |
| §6 `FF` ×8 | OK | **Layout contradicts §5.13** (D4): `FF 0N 00…` puts the new address in the command position; the table says command `FF` with `Y1` = address. No response example |
| §6 `08H` on/off | OK | Labelled "启动 #1路 DO" (channel **#1**) but sends `Y1 = 00` (**index 0**) — **D11**: 1-based label or wrong index |
| §6 `09H` | OK | All inputs open |
| §6 timed lock ×2 | OK | `Y4 = 00` is outside the documented 2–50 range (**D12**). The 100 ms value sits in **Y6**, whose documented range 1–250 matches the comment "01d~250d", but the table calls Y6 the *in-position timeout* and Y7 the *lock time* (D3) |
| §6 `2AH` ×4 | OK | — |

### 3.5 Contradictions and omissions

For each item: the quote, the conflict, the engineering consequence, and what to confirm.

| ID | Quote | Contradiction / gap | Consequence | Confirm |
|---|---|---|---|---|
| D1 | §5.3 "电机索引号 00~59"; §5.2 "00~99 共100个"; §5.11 "0-99" | 60 vs 100 motors | Slot mapping may address motors that cannot be run | Real range and index-to-position map |
| D2 | §5.8 "本驱动卡带有4路开关量输出…编号为0~3"; list 00–04; table "0-6" | 4 vs 5 vs 7 outputs | Could switch the wrong output (compressor vs light) | Output count, numbering, power-on state |
| D3 | §5.3 "Y7 时间锁 动作时间"; §6 example sets byte Y6 | Lock time in Y6 or Y7 | Wrong lock timing on locker lanes | Byte position |
| D4 | §5.13 "Set Address 指令 FF", Workbook4 `Y1` new address; §6 `FF 01 00…` | Frame layout differs | Board re-addressing may fail or mis-address | Exact frame; response |
| D5 | Workbook1 image under §5.9: "主机地址 01~08, 指令 8" | Contradicts §4.3.1 (host = 0) and `09H` | Reply validation rules unclear | Reply address and command echo rule |
| D6 | §5.10 "该数不为1时，读取的不是最新采样结果" vs example `Z3 = 00` | The example is "stale" | Can't tell fresh from stale humidity | Z3 semantics |
| D7 | §5.11 / §5.12 CRCs | 3 wrong CRCs | `2BH` examples not captured from hardware | Real captures |
| D8 | §5.12 "Z1~Z11" | 11 values for a 10-motor row | Parsing ambiguity | Row length |
| D9 | §6 "Z2= 00 当前操作 id 0" vs §5.2 "正在运转的电机编号" | Operation ID or motor number | Mistaken belief the board has operation IDs | Confirm there is none |
| D10 | Document starts at §4 | §1–3 missing | No wiring, connectors or electrical variant | Full document |
| D11 | §6 "启动 #1路 DO" with `Y1 = 00` | 1-based label vs 0-based index | Wrong DO switched | Index base |
| D12 | §6 timed lock `Y4 = 00`; §5.3 "2-50" | Out-of-range value in the manufacturer's own example | Defaults for 0 unknown | What 0 means for Y4 |
| D13 | §4.2 "等待50ms" | Minimum wait before reading, or expected latency? | Transport timing | Exact timing contract |
| D14 | §5.5–5.7 `0BH`/`0CH`/`0DH` | No response layout for `0BH`; `0DH` range in 1 byte | Decoder guesses | Response formats |
| D15 | (absent) | No error reply defined (unknown command, bad CRC, busy) | Can't distinguish "board rejected" from "no board" | Error behaviour |
| D16 | (absent) | No result-clear, reset, power-loss or persistence behaviour | **Decides lost-reply recovery and power-loss recovery** | Q1 / Q2 in §9 |
| D17 | (absent) | No firmware-version command | Can't track board firmware | Version command |
| D18 | §5.8 cooling algorithm | Who runs it? No set-point command | Food safety, compressor protection | Board or host |

---

## 4. Hardware capability matrix

Classes:
1. Directly supported
2. Supported but requires our software
3. Needs manufacturer confirmation
4. Not supported
5. Unknown

### 4.1 Inputs

| Capability | Class | Evidence |
|---|---|---|
| Motor state (idle / running / finished) | 1 | `03H Z1` |
| Motor result (ok, over-current, under-current, timeout, curtain fail, door-not-open, microswitch) | 1 | `03H Z3` |
| Motor current and run time | 1 | `03H Z4–Z9` |
| Drop detection | 1 if a curtain is fitted, else 4 | `03H Z10`, `05H Y3` |
| Curtain live state and block timer | 1 | `0CH`, `0DH` |
| Cabinet door sensor | 5 (maybe a DI) | `09H`, no assignment |
| Temperature | 1 (−50.0 = none) | `07H` |
| Humidity | 1 (DHT11, 0–50 °C) | `10H` |
| Payment signals | 4 | — |
| Stock level | 4 | — |
| Motor home switch | 1 | `2AH` / `2BH` |
| Fault query | 4 (only per-run results) | — |

### 4.2 Outputs

| Capability | Class | Evidence |
|---|---|---|
| Motors (15 types) | 1 | `05H Y2` |
| Locks (electric, timed, solenoid) | 1 (with D3) | `05H Y2 = 0x04, 0x07–0x09, 0x0C, 0x0D` |
| Refrigeration (fan, compressor) | 3 | `08H`, §5.8 |
| Lighting (light strip) | 1 (with D2 / D11) | `08H` |
| Heaters (glass, module) | 1 (with D2) | `08H` |
| Alarms, displays, payment devices | 4 | — |

### 4.3 Communication

| Capability | Class |
|---|---|
| Physical interface (TTL / 485 / 232) | 3 |
| Data bits | 3 |
| Framing / CRC / addressing | 1 (verified) |
| Timeout | 1 (1 s) |
| Retry rules | 2 (we define them) |
| Concurrency | 1 (one request; one motor) |
| Controller-initiated messages | 4 |
| Persistent state | 5 |
| Transaction / command IDs | 4 |
| Timestamps | 4 |
| Network / internet | 4 |

---

## 5. Snack Quest integration mapping

| Hardware capability | Manufacturer protocol | Snack Quest abstraction | Existing implementation | Missing work | Risk |
|---|---|---|---|---|---|
| Dispense | `05H` | Dispense command `DSP-…`, Model B poll/ack/status | `dispenseCommandService.dispatchForTransaction`, `snackQuestGatewayAdapter.authorizeVend` (queued), `app/api/v1/machines/[code]/commands/*` | Agent: journal → `05H` → `03H` | Lost `05H` reply (D16) |
| Dispense outcome | `03H Z3`, `Z10` | `commandStatusSchema` → `dispenseCommandService.recordOutcome` → `decideVendOutcome` | Server complete | Agent outcome mapper (M109E audit §5.3) | Curtain reliability |
| Machine identity | `01H` | `connectSchema`, `machineIntegrationIdentities` | `POST /api/v1/machines/connect` | Agent maps unit id + card ID | D9 |
| Heartbeat / liveness | none | `heartbeatSchema`, `deriveMachineLiveness` | Server complete | Agent timer; `online:false` when the board is unreachable | — |
| Status (temperature, door, faults) | `07H`, `09H`?, `03H` | `statusSchema` | Server complete | Agent | Door unknown |
| Events | derived | `eventsSchema`, `machineEventService` | Server complete | Agent emits fault/door/sensor events | — |
| Inventory | none | `inventorySchema` (optional) | `machineInventorySyncService.sync` | None — do not declare `inventory_read`; the ledger is authoritative | Stock accuracy depends on restock discipline |
| Slot mapping | motor index + type + curtain mode | `MachineSlot.manufacturerSlotId`, `lib/vending/slotMapping.ts` | Slot-mapping UI (`MachineIntegrationPanel`) | Agent-local per-motor config (type, mode, timings) | D1 |
| Prices / enable | none | Server sellability (`machineAssortmentService.getSellableCatalog`) | Server | **Admin UI missing (§11)** | — |
| Payments | none | M-Pesa STK (`machineTransactionService.initiateCartPayment`) | Server + kiosk | None | — |
| Capabilities | — | `MachineModel.declaredCapabilities`, `effectiveCapabilities` | Server | **Model edit UI missing** (G-H3) | Over-declared capabilities |
| Certification | — | `integrationCertificationService.run` + sandbox control endpoints | Server + admin UI | Agent must implement control endpoints in sandbox | — |
| Refrigeration | `08H` | **No abstraction** | — | New `refrigeration` concept (if host-run) | Food safety |
| Remote restart | none (board) | `restart` command | Server | Agent: host reboot only | Host permissions |
| Kiosk UI | none | `components/kiosk/KioskScreen.tsx` | Complete | Host browser verification | Host unknown |

**Dual adapter paths (a separation risk).** Adapters are chosen in two places:
- The legacy `machine.manufacturer` resolver: `defaultVendingAdapterResolver(machine.manufacturer)` in `machineTransactionService.ts:619`, `machineTelemetryService.ts:42`, `ownerPortalService.getMachineHealth` and `machineSlotService`.
- The integration layer: `machineIntegrationService` / `adapterKey`.

They must agree for every machine. Recommendation: resolve adapters only through `machineIntegrationService.capabilitiesFor/requireIntegration`, and retire `machine.manufacturer` as an adapter key (priority: Medium).

---

## 6. Machine Agent architecture

**Is it needed? Yes.** Without it, a controller-only manufacturer cannot be driven by Snack Quest.

### 6.1 Responsibilities and components

| Responsibility | Component |
|---|---|
| Serial I/O, one outstanding request, 50 ms / 1 s timing | `transport/serialTransport` (+ platform implementation) |
| Controller discovery (`01H` on addresses 1–8, LED confirmation) | `m109e/discovery` |
| Encode / decode / CRC / reply validation (address 0, command echo, length 20) | `m109e/frame`, `m109e/crc16Modbus` |
| Command definitions | `m109e/commands` (§7) |
| Retries | Reads ×3; **`05H` never retried blind** |
| Local persistence (fsync journal, executed set, outbox) | `journal/` |
| Crash recovery | Journal replay at start; answers `reportOutcomes` |
| Motor execution | `m109e/dispenseDriver` (state machine §7.2) |
| Sensor monitoring | `m109e/health`: temperature, curtain self-test, DI, board reachability |
| Dispense confirmation | `m109e/outcomeMapper` |
| Telemetry, heartbeat, events, status | `snackquest/loop` |
| Command polling and acknowledgements | `snackquest/loop` (2 s / 10 s cadence) |
| Offline operation | Refuses new work: reports `online:false`, so the server refuses orders |
| Safe shutdown | Finish any running motor (poll `03H`), journal, stop polling |
| Configuration | Signed, versioned local config: unit id, board addresses, slot → motor map |
| Diagnostics | Bench CLI; diagnostic events |
| Firmware compatibility | Record the `01H` ID; re-run acceptance tests on board change (no version command exists) |
| Certification | Sandbox-only control server (`docs/MANUFACTURER_CERTIFICATION.md` §3) |

### 6.2 Where it runs

**Not decided. There is no evidence to decide it.**
- **Android:** a Kotlin service. It needs serial device access (vendor ROM permission or root).
- **Linux or Windows:** Node/TypeScript or Python, reusing `sdk/typescript` / `sdk/python`.
- **Locked host:** a Snack Quest gateway computer instead.

**Must be confirmed with the manufacturer:** host model and OS; install rights; serial path and permissions; auto-start and watchdog; storage durability; whether their app can be removed.

---

## 7. Dispense safety assessment

### 7.1 End-to-end path (actual code)

| Step | Code |
|---|---|
| 1. Customer selects | `components/kiosk/KioskScreen.tsx` (order bar) |
| 2. Payment | `POST /api/vending/payments` → `machineTransactionService.initiateCartPayment`: idempotent claim, `dispenseGate('pre_payment')`, one STK push |
| 3. Confirmation | Daraja webhook → `machineTransactionService.handleMpesaCallback` |
| 4. Sellability | `machineAssortmentService.getSellableCatalog` + server re-validation of slots |
| 5. Dispense command | `dispenseCommandService.dispatchForTransaction` → `machineDispenseCommandRepository.claim()` (`create()` = at most once) |
| 6. Delivery | `snackQuestGatewayAdapter.authorizeVend` (queued, expires in 2 min) → `GET /api/v1/.../commands` |
| 7–12. Controller → report | **Agent** (does not exist yet) → `POST .../ack` → `05H` / `03H` → `POST .../status` |
| 13. Record | `dispenseCommandService.recordOutcome` → `decideVendOutcome` |
| 14. Inventory | `machineInventoryMovementService.recordMovement` (sale or waste) |
| 15. Customer outcome | Kiosk polls `GET /api/vending/payments/{id}` |
| 16. Reconciliation | `dispenseCommandService.sweepTimedOut`, `dispenseRecoveryService.sweep`, `deepReconciliationService.run` |
| 17. **Human resolution** | **MISSING** (§21, G-C1) |

### 7.2 Agent state machine

States are persisted per `commandId`. ◆ marks the step where the server is told.

```
RECEIVED ──ack≠200──▶ DISCARDED (never touch hardware)
   │ ack 200 ◆
   ▼
ACKED ──journal fsync──▶ RUN_PENDING ──05H──┬─ Z1=0 ─▶ RUN_STARTED ◆dispensing
                                            ├─ Z1=1 ─▶ RESULT(failed: invalid motor)          [certain]
                                            ├─ Z1=2 ─▶ WAIT_IDLE → retry 05H (ours didn't start)
                                            ├─ Z1=3 ─▶ CLEAR_PREVIOUS → retry 05H
                                            └─ no/invalid reply ─▶ DISAMBIGUATE (03H)
DISAMBIGUATE: Z1∈{1,2} & Z2=our motor → RUN_STARTED
              Z1=0 → UNKNOWN until Q1 is answered (never re-run)
RUN_STARTED ──03H every 200 ms──▶ RESULT(Z3, Z10) ──map──▶ DISPENSED | FAILED(code) | UNKNOWN
RESULT ──journal fsync──▶ OUTBOX ──POST status ◆──▶ REPORTED
Start-up replay:
  ACKED without RUN_PENDING     → answer "failed: not executed"
  RUN_PENDING / RUN_STARTED     → try 03H; else UNKNOWN
  OUTBOX                        → re-send
```

**Mapping to the server's states** (`types/machineDispenseCommand.ts`):

| Server state | Agent state |
|---|---|
| REQUESTED / AUTHORIZED / SENT | Before RECEIVED |
| ACKNOWLEDGED | ACKED |
| DISPENSING | RUN_STARTED |
| DISPENSED / FAILED / UNKNOWN | Reported results |
| TIMEOUT | Server-only (no report within 5 min, or never collected) |
| RECOVERY | `dispenseRecoveryService` + `reportOutcomes` + **human review (missing UI)** |

### 7.3 Answers

| Question | Answer |
|---|---|
| Motor started? | `05H Z1 = 0` or `03H Z1 = 1` |
| Completed? | `03H Z1 = 2` |
| Product dropped? | `03H Z10 > 0` (curtain required) |
| Jammed? | `Z3 = 0x01` / `0x03` with `Z10 = 0` (curtain caveat) |
| Never started? | `05H Z1 ∈ {1, 2, 3}` or `Z3 = 0x04` |
| Offline? | Serial timeouts → agent `online:false`; server liveness (`ORDER_FRESHNESS_SECONDS = 90`) refuses orders |
| Serial reply lost? | `03H` disambiguation; otherwise `unknown` |
| Power cut / host crash / restart mid-vend? | Journal → `unknown` → human review. Board state is undocumented (D16) |
| Network gone? | Outbox; late reports accepted; `reportOutcomes` asks |
| Can the controller repeat a motor command? | Only if sent again after the result is cleared |
| Can our agent repeat one? | Not if it follows the journal rule; the executed set is keyed by `commandId` |
| Controller persistent state / result after reboot / clear rule | **Undocumented** — D16 |
| Can an ambiguous transaction be recovered safely? | **Yes, as `unknown` → human review. But the human-review tool does not exist (G-C1)** |

### 7.4 Is the existing command ledger sufficient?

**Server-side, yes:**
- Claim-before-act.
- Acknowledgement before execution.
- Expiry.
- Human review for `unknown`.
- `reportOutcomes` answered once, fixed in the last pass.

**Two changes are recommended (not required for correctness):**
1. **Auto-pause a slot** after `jam`, `no_product` or `unknown` on it.
   - Today the fleet keeps selling a jammed lane.
   - Add `machineSlotService.quarantine(slotCode, reason)`, called from `dispenseCommandService.recordOutcome`, with an admin "Return slot to sale" action.
   - Priority: High.
2. **A resolution API for `manual_review` / `paid_vend_failed`.** That is G-C1.

---

## 8. Hardware unknowns

- Host: model, OS, access rights, serial path.
- Serial variant and data bits.
- Motor index range and physical map.
- Light curtain: fitted as standard, detection threshold, power-up requirement.
- DI / DO wiring and count; DO power-on defaults.
- Refrigeration ownership.
- Result-clear, reset and power-loss behaviour.
- Error replies.
- Firmware version.
- The missing §1–3.
- Door sensor.
- Board behaviour if the host stops talking mid-run.

---

## 9. Manufacturer questions

Priority order. **Q1, Q4, Q7 and Q10 gate the purchase.** The Chinese translation is in `docs/hardware/M109E_COMPATIBILITY_AUDIT.md` Appendix A.

1. When is a motor result (`03H`) cleared: on read, by command, by timer, or at the next run? (D16)
2. What does `03H` report after the board loses power? Is anything persisted? (D16)
3. Motor range 0–59 or 0–99? The index → tray/column map? (D1, D8)
4. Is a light curtain fitted as standard? What is the smallest detectable item? Is `0BH` required before modes 1 and 2?
5. Can `Z10` exceed 200 ms?
6. Which interface (TTL / 485 / 232), and how many data bits?
7. **Host:** model, OS and version; can we install software, access the serial port, and remove your app?
8. What is the `01H` ID format, and is it unique per board?
9. What are DI1–DI4 wired to? Is there a door switch?
10. Refrigeration: is it board-autonomous? How is the set-point set? What happens if the host goes silent? (D18)
11. How many DO outputs, what is the index base, and what are the power-on states? (D2, D11)
12. Timed-lock time: `Y6` or `Y7`? What does `Y4 = 0` mean? (D3, D12)
13. The exact Set Address frame and its reply. (D4)
14. Is there a firmware version command? How are updates delivered? (D17)
15. What does the board reply to an unknown command, a bad CRC, or while busy? (D15)
16. Can any other device be master on the bus?
17. If the host stops talking mid-run, does the motor stop?
18. Can a product still drop after over-current (0x01) or timeout (0x03)?
19. Please send the complete document (§1–3) and real `2BH` captures. (D7, D10)

---

## 10. Admin capability inventory

Reading key:
- **UI** = a page or client component performs it.
- **API-only** = only reachable by calling an HTTP route.
- **Code-only** = no route at all.
- Role = today's guard (`lib/auth/requireStaffRole.ts` constants; ADMIN = `admin` + `super_admin`; SA = `super_admin` only).

The route-level detail is in Appendix A (all 170 staff routes).

### 10.1 Vending: machines, catalogue, stock

| Backend capability | Code | Backend | UI | UI complete | Role | Missing UI |
|---|---|---|---|---|---|---|
| Register machine + issue kiosk device secret | `machineService.provisionDevice`, `POST /api/vending/register` | ✓ | ✗ | — | ADMIN, **warehouse** | Machine creation wizard (G-C3) |
| Rotate / revoke kiosk device secret | `machineService.rotateDeviceCredential`, `revokeDeviceCredential` | ✓ | ✗ (**code-only**) | — | none | Device credential panel (G-C3) |
| Change machine status (active / inactive / maintenance / decommissioned) | `machineService.updateStatus`, `PATCH /api/vending/machines/[id]` | ✓ | ✗ | — | ADMIN, warehouse | Status control (G-C6) |
| Relocate machine | `machineService.relocate` (+ `machineLocationHistory`) | ✓ | ✗ | — | ADMIN, warehouse | Move-machine flow (G-C6) |
| Reassign machine owner | none (only at provisioning) | ✗ | ✗ | — | — | Owner reassignment (G-C2) |
| Configure slot (product, capacity, price, enabled) | `machineSlotService.configureSlot` (code-only); `setPrice` / `setEnabled` via `PATCH …/slots` | partial | ✗ | — | ADMIN, **warehouse** | Slot grid editor (G-C4) |
| Assort / unassort product; link slot | `machineAssortmentService.assortProduct/unassortProduct/linkSlot` | ✓ | ✗ | — | ADMIN, warehouse | Machine catalogue page (G-C5) |
| Per-machine price override + history | `setPriceOverride`, `GET …/assortment/{cat}/{id}` | ✓ | ✗ | — | ADMIN, **warehouse** | Price editor with history (G-C5) |
| Screen presentation (name, description, photo, badge, visible) | `updateMerchandising`, `setVisible` | ✓ | ✓ | ✓ | ADMIN, warehouse | — |
| Kiosk artwork | `kioskScreenService` | ✓ | ✓ | ✓ | ADMIN, warehouse | — |
| Stock adjustment (count correction) | `POST …/slots/adjust` | ✓ | ✓ (`StockDiscrepancyForm`) | partial (no reason codes list, no bulk count) | ADMIN, warehouse | Bulk stock-count sheet |
| Inventory movement ledger per machine | `machineInventoryMovementRepository` | ✓ | partial (machine page) | ✗ no filters / export | — | Movement history tab |
| Inventory reconcile | `machineInventoryMovementService.reconcile` | ✓ | ✗ (code-only) | — | — | Reconcile action |
| Reserve (KSh 100k) | `machineInventoryReserveService` | ✓ | ✓ (machine page) | ✓ | — | — |
| Restock task lifecycle | `restockTaskService`, `/api/vending/restock/*` | ✓ | ✓ (`/admin/vending/restock`) | ✗ **not reachable by warehouse users** | ADMIN, warehouse | Warehouse vending workspace (G-H9) |
| Remote commands (restart…) | `machineCommandService` | ✓ | ✓ | ✓ | ADMIN, warehouse | — |
| Test vend | `startDiagnosticVend` | ✓ | ✓ | ✓ | ADMIN | — |
| Cameras | `cameraService` | ✓ | ✓ | ✓ | ADMIN (+ finance/warehouse view) | — |
| Snapshots for a sale (dispute evidence) | `cameraService.listSnapshotsByTransaction` | ✓ | ✗ (code-only) | — | — | Snapshot strip in sale review (G-C1) |

### 10.2 Vending: money, sales and owners

| Backend capability | Code | Backend | UI | UI complete | Role | Missing UI |
|---|---|---|---|---|---|---|
| Create / edit / deactivate machine owner (partner) | `partnerService.create` (**code-only**); no update | partial | ✗ | — | none | Owner CRUD (G-C2) |
| Revenue-share agreement | `partnerMachineAgreementRepository.create` (**tests only**) | ✗ | ✗ | — | none | Agreements tab (G-C2) |
| Settlement draft / finalize | `machineSettlementService.createDraft/finalize` | ✓ | ✗ | — | ADMIN | Settlement workflow (G-H1) |
| Owner payout (withdrawal) | `/api/vending/partners/[id]/withdrawals` | ✓ | ✓ | partial | ADMIN | — |
| Subscription create / pause / resume / cancel / record payment | `machineSubscriptionService.*` | ✓ | ✗ | — | ADMIN | Subscription panel (G-H2) |
| Subscription arrears reconcile | `machineSubscriptionService.reconcileArrears` | ✓ | ✗ (code-only) | — | — | Part of G-H2 |
| Vending sales list / search | `GET /api/vending/transactions` | ✓ | ✗ (only per-machine last 20 + Trace a Sale) | — | ADMIN, finance, warehouse | Sales list (G-H5) |
| **Resolve `manual_review` / refund `paid_vend_failed`** | `machineTransactionService.requestRefund/markRefunded` — **zero callers** | ✗ | ✗ | — | — | **Sale review queue (G-C1)** |
| Payment reconciliation (vending) | `vendingReconciliationService` | ✓ | ✓ view | ✗ no actions | — | Actions (G-C1) |
| Deep reconciliation | `deepReconciliationService.run` (cron) | ✓ | ✗ results not shown | — | — | Discrepancy list (G-M6) |
| Alerts | `alertService` | ✓ | ✓ | ✓ acknowledge / resolve | ADMIN, finance, warehouse | Alert → action links (G-M5) |

### 10.3 Vending: integrations, analytics, jobs

| Backend capability | Code | Backend | UI | UI complete | Role | Missing UI |
|---|---|---|---|---|---|---|
| Locations create / edit / by type | `locationService.create/update/listByType` | ✓ | ✗ (read-only intelligence pages) | — | ADMIN (create), + finance/warehouse (edit) | Locations CRUD (G-C6) |
| Manufacturer create / stage / status | `manufacturerRegistryService` | ✓ | ✓ | partial | ADMIN | Edit (G-H3) |
| Manufacturer edit | `updateManufacturer` | ✓ | ✗ | — | ADMIN, warehouse | G-H3 |
| Model create / certify / checks / revoke | ✓ | ✓ | ✓ | ✓ | ADMIN | — |
| Model edit (capabilities, slot format, adapter) | `updateModel` | ✓ | ✗ | — | ADMIN | G-H3 |
| Inbound HMAC credentials issue / rotate / revoke | `integrationCredentialService` | ✓ | ✓ | ✓ | ADMIN | Narrow the permission (G-H10) |
| Outbound API credentials (Model A) set / rollback / revoke | `manufacturerApiCredentialService.set/rollBack/revoke` | ✓ | ✓ (`ManufacturerApiCredentialsPanel` on the manufacturer page) | ✓ write-only, fingerprint shown | ADMIN | Narrow the permission (G-H10) |
| Machine integration configure / activate / suspend / maintenance / test / slot mapping | `machineIntegrationService` | ✓ | ✓ | ✓ | ADMIN / warehouse | — |
| Certification harness / API probe | ✓ | ✓ | ✓ | ✓ | ADMIN | — |
| Network overview / location DNA / product performance / opportunities | intelligence services | ✓ | ✓ | ✓ | page = ADMIN | — |
| Location-type performance, compare locations, product-in-location performance, product affinity, new-machine assortment recommendation, owner summary | `networkIntelligenceService.getLocationTypePerformance/compareLocations`, `productIntelligenceService.getLocationProductPerformance`, `peerLearningService.*`, `ownerIntelligenceService.getMachineOwnerSummary` | ✓ | ✗ | — | ADMIN, finance, warehouse | G-M1 |
| Hourly / weekday sales | `productIntelligenceService.getTimeIntelligence` | ✓ | partial (location DNA; **UTC bug**) | ✗ | — | G-H13 |
| Recommendations generate | `recommendationEngineService.generate*` | ✓ | ✗; **no cron** | — | ADMIN, warehouse | G-H6 |
| Recommendations approve / dismiss / outcome | ✓ | ✓ | ✓ | ✓ | ADMIN, warehouse | — |
| Rollup rebuild for a date range | `vendingRollupService.rebuild*Range` | ✓ | ✗ | — | cron | G-H11 |
| Scheduled job health | `scheduledJobService.health` | ✓ | ✓ (`/admin/operations`) | ✗ no run-now, no per-run errors | ADMIN | G-M7 |

### 10.4 Platform

| Backend capability | Code | Backend | UI | UI complete | Role | Missing UI |
|---|---|---|---|---|---|---|
| Staff invite / role / sections / disable / remove / reset password | `staffManagementService` | ✓ | ✓ (`/admin/staff`) | ✗ single role; sections only for `admin` | SA | Permission editor (§14) |
| View-as | `/api/admin/view-as` | ✓ | ✓ | ✓ | SA | — |
| Audit log | `auditLogRepository.listByBusiness` | ✓ | ✓ | ✗ 6 entity filters only; no actor / machine / date filter; no export | ADMIN | G-H7 |
| Global search | `globalSearchService` | ✓ | ✓ | ✗ no machines, sales, owners, locations, manufacturers | ADMIN | G-M3 |
| Exports (CSV) | none | ✗ | ✗ | — | — | G-M4 |

**Box-business domains** (orders, products, snack items, recipes, inventory, purchase orders, suppliers, customers, creators, campaigns, referrals, discount codes, marketing email and SMS, opt-outs, notification templates, FAQs, reviews, withdrawals, reconciliation, analytics, delivery zones, shipments, fulfilment batches, conversations, settings, feature flags, integrations, storage): **every staff mutation route has a UI caller** (Appendix A). Their gaps are permission granularity (§13) and exports and bulk actions, not missing screens.

---

## 11. Admin blind spots

| # | The backend… | …but the admin cannot… | Code |
|---|---|---|---|
| B1 | knows a sale is `manual_review` or `paid_vend_failed` (a refund is owed) | resolve it, refund, or even list all such sales | `machineTransactionService.requestRefund/markRefunded` (no callers); `GET /api/vending/transactions` (no UI) |
| B2 | detects an unresolved outcome conflict (`deepReconciliationService`) | see the result list or act on it | `deepReconciliationService.run` (cron only) |
| B3 | can create owners and agreements | do either | `partnerService.create`; `partnerMachineAgreementRepository.create` |
| B4 | can provision machines and device secrets | create a machine, or rotate a leaked kiosk secret | `/api/vending/register`; `machineService.rotateDeviceCredential` |
| B5 | can configure slots, assort products, set prices | do any of it | `configureSlot`, `assortProduct`, `setPrice`, `setPriceOverride` |
| B6 | knows prices changed (price history) | see the history | `machineAssortmentRepository.listPriceHistory` |
| B7 | records `machineId` on every vending audit entry | see a machine's history or filter the audit log by machine, actor or vending entity | `auditLogRepository` (`machineId`); `audit-logs/page.tsx` `ENTITY_TYPE_FILTERS` |
| B8 | computes location-type performance, comparisons, affinities, new-machine suggestions, owner summaries | see them | §10 G-M1 |
| B9 | has recommendation generators | get any recommendations (never run) | `recommendationEngineService.generate*`; `vercel.json` has no such cron |
| B10 | records scheduled-job runs and failures | re-run a job or see which item failed | `scheduledJobRunRepository`; `/admin/operations` shows state only |
| B11 | knows a machine reports `online:false` (liveness `reports_offline`) | see it on the fleet page, which uses `lastSeenAt` connectivity instead | `deriveConnectivityStatus` vs `deriveMachineLiveness` |
| B12 | records jams and `no_product` per slot | see slot health, or stop a jammed slot from selling | no quarantine; `recordOutcome` |
| B13 | stores camera snapshots per transaction | pull them up while reviewing a disputed sale | `cameraService.listSnapshotsByTransaction` |
| B14 | calculates subscription arrears | see or act on arrears per owner | `machineSubscriptionService.reconcileArrears` |
| B15 | can rebuild analytics after corrections | trigger a rebuild | `vendingRollupService.rebuild*Range` |
| B16 | knows an owner's contact email is needed to claim the portal | set it | `partnerRepository.findUnclaimedByContactEmail` |
| B17 | has warehouse-role vending API rights | give warehouse staff a screen that uses them | `/admin` redirects warehouse users (`app/admin/(protected)/layout.tsx`) |
| B19 | shows peak hours | show them in Nairobi time (they are UTC) | `productIntelligenceService.getTimeIntelligence` (`getUTCHours`) |

---

## 12. Missing UI

One entry per gap.

### G-C1 — Vending sale review and refund workflow
- **Exists:**
  - States `manual_review` and `paid_vend_failed`.
  - `machineTransactionService.requestRefund/markRefunded` (no callers).
  - Order refunds through `refundService` (box business only).
  - Alerts; the vending reconciliation view (read-only).
- **Missing:**
  - Any list of these sales.
  - Any action to confirm dispensed, refund, or close with a note.
  - Any M-Pesa refund path for vending.
- **Why:** the dispense-safety design routes every uncertain vend to "a human", and customers are told "support will follow up". No human can.
- **Files:** `services/machineTransactionService.ts` (`requestRefund`, `markRefunded`, `moveStatus` to `manual_review`); `services/refundService.ts`; `app/admin/(protected)/vending/reconciliation/page.tsx`.
- **User:** support, finance.
- **Security:** refunds move money. They need a dedicated permission and an audit trail.
- **Operational:** without it, refunds owed accumulate and cannot be cleared.
- **Recommended UI:** `/admin/vending/sales/review`, a queue filtered by status (`manual_review`, `paid_vend_failed`, `refund_requested`). Each row opens `/admin/vending/sales/[transactionId]` with:
  - the payment record;
  - the dispense command history;
  - machine events around the time;
  - camera snapshots;
  - three actions: **Confirm delivered** (→ `dispensed`, stock −1), **Refund customer** (→ `refund_requested` → Daraja reversal → `refunded`), and **Close as not owed**.

  Every action needs a reason note and is audited.
- **Permission:** `sales.review.resolve`, `payments.refund.vending`.
- **Complexity:** L (new service method for the vending reversal + UI).
- **Priority:** **Critical.**

### G-C2 — Machine owners and agreements
- **Exists:**
  - `partnerService.create` (code-only).
  - Owner list and detail pages (read-only) and payouts.
  - `partnerMachineAgreementRepository` (tests only).
  - `provisionDevice(ownerPartnerId)`.
- **Missing:** create, edit, deactivate owner; set contact email (needed for portal claim); machine reassignment; revenue-share agreements.
- **Why:** the owner business model cannot be operated. Settlements depend on agreements.
- **Files:** `services/partnerService.ts`, `repositories/partnerMachineAgreementRepository.ts`, `services/machineSettlementService.ts:145`, `app/admin/(protected)/vending/partners/*`.
- **User:** operations, finance.
- **Security:** reassignment changes who sees revenue. It needs its own permission and an audit record.
- **Operational:** today onboarding an owner requires a developer.
- **Recommended UI:**
  - `/admin/vending/owners/new` and `/owners/[id]/edit`: name, contacts, status, portal-invite state.
  - An "Agreements" tab: share %, start and end dates, machine; history.
  - An "Assign owner" action on the machine page, with effective date.
- **Permission:** `owners.manage`, `owners.agreements.manage`.
- **Complexity:** M.
- **Priority:** **Critical.**

### G-C3 — Machine registration and device credentials
- **Exists:** `POST /api/vending/register` (returns the device secret once); `rotateDeviceCredential` / `revokeDeviceCredential` (code-only); kiosk pairing typed on the device.
- **Missing:** a registration UI; secret display and handover; rotate and revoke.
- **Why:** you can't onboard a machine or respond to a leaked kiosk secret without engineering.
- **Files:** `app/api/vending/register/route.ts`, `services/machineService.ts` (`provisionDevice`, `rotateDeviceCredential`, `revokeDeviceCredential`).
- **User:** operations.
- **Security:** the secret must be shown once, never stored in plaintext, and rotation must invalidate the old one. **Warehouse can currently call register** (G-C8).
- **Operational:** blocks every new machine.
- **Recommended UI:** `/admin/vending/machines/new`, a wizard:
  1. Code, serial, manufacturer and model (from the registry).
  2. Owner and location.
  3. Issue the kiosk secret (shown once, with a QR code for pairing).

  Plus a "Device credential" card on the machine page with Rotate and Revoke (typed confirmation).
- **Permission:** `machines.create`, `machines.credentials.manage`.
- **Complexity:** M.
- **Priority:** **Critical.**

### G-C4 — Slot configuration
- **Exists:** `machineSlotService.configureSlot` (**no route**); `PATCH /api/vending/machines/[id]/slots` (price and enabled only; no UI); slot table on the machine page (read-only).
- **Missing:** create and edit slots (product, capacity, price, enabled, manufacturer slot id).
- **Why:** a machine cannot sell until slots exist.
- **Files:** `services/machineSlotService.ts` (`configureSlot`, `setPrice`, `setEnabled`); `app/api/vending/machines/[id]/slots/route.ts`.
- **User:** machine operations.
- **Security:** price edits must be separable from stock edits.
- **Operational:** blocks every new machine.
- **Recommended UI:** `/admin/vending/[machineId]/slots`, a grid shaped like the physical tray layout. Per cell: product picker, capacity, price, enabled, manufacturer slot id. Bulk actions: set price for selection, disable a row, copy a layout from a machine or template. Price changes show old → new.
- **Permission:** `machines.slots.configure`; price field `pricing.manage`.
- **Complexity:** M (needs a route for `configureSlot`).
- **Priority:** **Critical.**

### G-C5 — Machine catalogue (assortment)
- **Exists:** `assortProduct`, `unassortProduct`, `linkSlot`, `setPriceOverride`, `listPriceHistory` (routes; no UI except screen presentation).
- **Missing:**
  - Adding products to a machine; removing them.
  - Linking to a slot.
  - Machine price override with history.
  - Bulk: add a snack to many machines, copy one machine's range.
- **Why:** per-location ranges with cross-cutting snacks is the core model.
- **Files:** `services/machineAssortmentService.ts`, `app/api/vending/machines/[id]/assortment/*`.
- **User:** machine operations, product managers.
- **Security:** price override needs `pricing.manage`.
- **Operational:** blocks per-location ranges.
- **Recommended UI:**
  - `/admin/vending/[machineId]/catalog`: add products (search the snack and box catalogue), link slot, price override (with history drawer), remove.
  - `/admin/products/[id]/machines`: "which machines carry this", bulk add/remove.
  - A "Copy range from…" action.
- **Permission:** `machine_catalog.manage`, `pricing.manage`.
- **Complexity:** M.
- **Priority:** **Critical.**

### G-C6 — Locations, status and relocation
- **Exists:** `locationService.create/update`, `machineService.updateStatus/relocate` (routes, no UI); location intelligence pages (read-only).
- **Missing:** location CRUD; changing a machine's status; moving it.
- **Files:** `app/api/vending/locations/*`, `app/api/vending/machines/[id]/route.ts` PATCH, `services/machineService.ts`.
- **User:** operations.
- **Operational:** a new site, a relocation or a decommission all need engineering.
- **Recommended UI:**
  - `/admin/vending/locations` (list, new, edit: type, address, coordinates, venue contact).
  - Machine header menu: **Change status** (with a reason) and **Move to location** (effective date; history tab from `machineLocationHistory`).
- **Permission:** `locations.manage`, `machines.status.manage`, `machines.relocate`.
- **Complexity:** S–M.
- **Priority:** **Critical.**

### G-C7 — Section permissions not enforced on APIs
Security gap; see §18 S1.
- **Exists:** `canAccessAdminSection` used only in `app/admin/(protected)/*/layout.tsx`.
- **Missing:** enforcement in `app/api/**`.
- **Recommended fix:** a central `requirePermission(session, 'perm')` used by every route (§14).
- **Complexity:** M.
- **Priority:** **Critical.**

### G-C8 — Warehouse role over-permitted in vending APIs
Security gap; see §18 S2.
- **Exists:** `ADMIN_OR_WAREHOUSE` on:
  - `/api/vending/register`;
  - slot `PATCH` (prices);
  - assortment `PATCH` (price overrides);
  - slot mapping;
  - integration maintenance;
  - kiosk images;
  - recommendations.
- **Recommended fix:** the permission model (§14). Until then, move the price and register routes to `ADMIN_ONLY`.
- **Complexity:** S.
- **Priority:** **Critical.**

### G-C9 — Fleet page cost at scale
- **Exists:** `app/admin/(protected)/vending/page.tsx` runs 4 queries per machine (`listRange`, `listByMachine` slots, last transaction, restock tasks).
- **Missing:** a per-machine summary document and pagination.
- **Operational:** at 1,000+ machines the page times out and costs grow linearly.
- **Recommended fix:** a `machineFleetSummary/{machineId}` document maintained by the rollup job and on writes; a paginated, filterable table; search by code, owner or location.
- **Complexity:** M.
- **Priority:** **Critical** at >200 machines; High now.

### High-priority gaps (UI)

| ID | Exists | Missing | Files | Recommended UI | Permission | Size |
|---|---|---|---|---|---|---|
| G-H1 | `createDraft`, `finalize` routes | Settlement workflow | `services/machineSettlementService.ts` | `/admin/vending/owners/[id]/settlements`: period picker, draft preview (gross, COGS, subscription, share), finalize (typed confirm), PDF/CSV | `owner_finance.settlements.manage`, `.finalize` | M |
| G-H2 | `machineSubscriptionService.*` routes | Subscription management | `app/api/vending/machines/[id]/subscription/*` | Subscription card on the machine and owner pages: create plan, pause, resume, cancel, record payment, arrears | `owner_finance.subscriptions.manage` | S |
| G-H3 | `updateManufacturer`, `updateModel` routes (outbound API credentials already have a UI: `ManufacturerApiCredentialsPanel`) | Edit forms | `services/manufacturerRegistryService.ts` | Edit dialogs on `/admin/vending/integrations/[manufacturerId]`: contact, docs URL, adapter; model capabilities (checkbox list with the certification warning that editing a contract revokes certification), slot count, slot id format | `integrations.manufacturers.manage`, `integrations.models.manage` | S |
| G-H5 | `GET /api/vending/transactions` | Sales list | `repositories/machineTransactionRepository.listByBusiness` | `/admin/vending/sales`: filters (status, machine, owner, location, date, payment ref), CSV export, link to the trace | `sales.view`, `sales.export` | M |
| G-H6 | Generators; no cron | Scheduling + button | `services/recommendationEngineService.ts`, `vercel.json` | Nightly cron + "Generate now" on the recommendations page with the last-run time | `recommendations.act` | S |
| G-H7 | Audit log with 6 filters | Vending entity filters, actor, machine, date, export; per-machine history tab | `app/admin/(protected)/audit-logs/page.tsx`, `repositories/auditLogRepository.ts` | Add filters + CSV; "History" tab on machine, owner and manufacturer pages | `audit.view`, `audit.export` | S–M |
| G-H8 | Staff roles / sections | Granular permissions | `services/staffManagementService.ts`, `components/admin/InviteStaffDialog.tsx` | §14 | `users.manage` | L |
| G-H9 | Warehouse / finance / agent workspaces without vending | Vending pages per workspace | `app/warehouse`, `app/finance`, `app/agent` | Warehouse: restock queue + pick/dispatch/receive, stock counts. Finance: vending sales, settlements, payouts, refunds owed. Support: sale lookup + review queue | per §14 | M each |
| G-H10 | Credential issuance on ADMIN_ONLY | Narrower permission + expiry view | `app/api/vending/integrations/*/credentials` | Credentials page with expiry, last use, owner; **super-admin or `integrations.credentials.manage` only** | `integrations.credentials.manage` | S |
| G-H11 | Rebuild range methods | Rebuild action | `services/vendingRollupService.ts` | "Rebuild analytics for date range" on `/admin/operations` (async job; progress) | `ops.jobs.run` | S |
| G-H12 | Outcomes per slot | Slot quarantine + health | `dispenseCommandService.recordOutcome`, `machineSlotService` | Slot health column (last 20 outcomes); auto-pause after jam/unknown; "Return to sale" | `machines.slots.configure` | M |
| G-H13 | UTC peak hours | Nairobi time | `productIntelligenceService.getTimeIntelligence` | Fix: `Africa/Nairobi` via Intl | — | XS |
| G-H14 | Two online signals | One truth | `lib/vending/connectivity.ts` vs `lib/vending/machineLiveness.ts` | Fleet / owner pages use liveness (state + reason) | — | S |

### Medium-priority gaps

| ID | Gap | Recommended UI | Permission | Size |
|---|---|---|---|---|
| G-M1 | Computed analytics hidden (location types, compare, product-in-location, affinity, new-machine suggestion, owner summary) | Tabs on the intelligence pages; a "Plan a new machine" wizard using `recommendAssortmentForNewMachine` that can save the result as a catalogue template | `analytics.vending.view` | M |
| G-M2 | Price history hidden | Drawer in the catalogue editor | `pricing.view` | XS |
| G-M3 | Global search misses vending | Add machines (code, serial), sales (ref, M-Pesa receipt), owners, locations, manufacturers to `globalSearchService` | inherits | S |
| G-M4 | No exports | CSV on sales, settlements, stock movements, audit log, owners | `*.export` | S each |
| G-M5 | Alerts don't link to fixes | Each alert type → deep link to the fixing screen (e.g. stockout → restock task pre-filled) | `alerts.resolve` | S |
| G-M6 | Deep reconciliation results invisible | `/admin/vending/reconciliation` shows the latest `deepReconciliationService` discrepancies with actions | `sales.review.resolve` | S |
| G-M7 | Jobs: no run-now or per-item errors | Run-now button (lease-safe) and last error per job | `ops.jobs.run` | S |
| G-M8 | Inventory reconcile code-only | "Reconcile ledger vs slot counts" action | `machine_inventory.adjust` | S |
| G-M9 | Kiosk pairing by typing a secret | QR pairing from the machine page | `machines.credentials.manage` | S |
| G-M10 | `machine.manufacturer` adapter path duplicates `adapterKey` | Resolve adapters only via the integration layer | — | M |

---

## 13. RBAC / permission audit

### 13.1 What exists
- **Roles:** `types/common.ts` `Role`. Staff roles are `admin`, `super_admin`, `agent`, `warehouse`, `finance` (`types/staffProfile.ts`). The staff profile holds **one** `role`; sessions carry `roles[]`.
- **API guards:** role-set constants in `lib/auth/requireStaffRole.ts` (`ADMIN_ONLY`, `ADMIN_OR_AGENT`, `ADMIN_OR_WAREHOUSE`, `ADMIN_AGENT_OR_WAREHOUSE`, `ADMIN_FINANCE_OR_WAREHOUSE`), plus `isSuperAdmin` (`lib/auth/requireSuperAdmin.ts`).
- **Sections:** `lib/auth/adminSections.ts` — six keys (`orders`, `finance`, `marketing`, `conversations`, `operations`, `vending`), stored in `StaffProfile.permissions`.
  - Only settable for role `admin` (`InviteStaffDialog.tsx:196`).
  - Empty = unrestricted.
  - Enforced **only** by `requireAdminSection` in page layouts.
- **Workspaces:** `/admin` redirects single-role agent, warehouse and finance users to `/agent`, `/warehouse`, `/finance` (`app/admin/(protected)/layout.tsx`).
- **View-as:** a super admin can narrow to one role (`lib/auth/viewAs.ts`).

### 13.2 Route guard inventory (mechanical extraction, Appendix A)

| Principal | Routes |
|---|---|
| Staff (role constant) | 111 |
| Staff + super-admin | 30 |
| Admin integration wrapper (`withStaffRoles`) | 26 |
| Partner (owner) | 20 |
| Machine API v1 (HMAC) | 9 (+1 webhook) |
| Cron | 9 |
| Device (kiosk / legacy) | 8 |
| Creator | 7 |
| Signed webhooks | 3 |
| Public or custom secret | 36 |

All 36 unguarded-by-helper routes were checked by hand. They are intentionally public (checkout, analytics, login and session, lead forms, reviews, pickup stations, partner register — constrained to pre-provisioned emails) or use their own secret (`verifyWhatchimpBridgeRequest`, `verifyDarajaWebhookRequest`, TextSMS shared secret, `INTERNAL_AGENT_API_KEY`).

### 13.3 Findings

| # | Finding | Evidence | Severity |
|---|---|---|---|
| R1 | Sections are page-only; APIs ignore them | `canAccessAdminSection` only in layouts | **Critical** |
| R2 | Warehouse can set prices, register machines, change slot mapping, maintenance mode, kiosk artwork, recommendations | `ADMIN_OR_WAREHOUSE` on those routes | **Critical** |
| R3 | Warehouse has no vending UI despite API rights | `/admin` layout redirect; `app/warehouse` has no vending pages | High |
| R4 | `admin` (not just super admin) can issue manufacturer HMAC keys and outbound API credentials | `ADMIN_ONLY` in `app/api/vending/integrations/**/credentials` | High |
| R5 | Finance reads vending integration events and machine internals | `ADMIN_FINANCE_OR_WAREHOUSE` on `integration-events`, cameras, intelligence | Medium |
| R6 | One role per staff member; no custom roles; sections only for `admin` | `StaffProfile.role`, `staffManagementService.inviteStaff` | High |
| R7 | Firestore rules grant tenant-admin reads on many collections regardless of sections | `firestore.rules` `isTenantAdmin(...)` | Medium |
| R8 | Internal API key compared with `!==` (not constant-time) | `app/api/internal/conversations/[conversationId]/price-door-delivery/route.ts` | Low |
| R9 | Money-moving actions share broad roles: order refund `ADMIN_ONLY`; withdrawals `ADMIN_ONLY`; vending refund does not exist | routes | High (with G-C1) |
| R10 | Tenant isolation: staff routes derive `businessId` from the session; partner routes use `assertPartnerOwnsMachine`; covered by `tests/services/partnerIsolation.test.ts` and earlier adversarial tests | — | OK |

---

## 14. Recommended permission model

### 14.1 Design
- **Permissions** are strings, `domain.resource.action`, granted to users. This is the only thing checked.
- **Role templates** are named bundles (e.g. "Warehouse manager"). Assigning a template copies its permissions to the user and records the template.
- **Permission groups** are UI groupings: one checkbox grants the group.
- **Individual overrides:** per user, `granted[]` and `revoked[]` on top of the template.
- **Effective permissions** = template ∪ granted − revoked. `super_admin` has all permissions and cannot be edited below itself.

### 14.2 Storage and enforcement
- Store on `staffProfiles/{uid}`:
  - `template` (string);
  - `granted: string[]`, `revoked: string[]`;
  - `permissionsVersion`, bumped on change so sessions refresh.
- Keep `role` for workspace routing only.
- **Enforcement:**
  - `lib/auth/permissions.ts` — the permission catalogue (typed union) and `hasPermission(session, p)`.
  - `requirePermission(request, p)` — replaces `hasStaffRole` in every route.
  - `requirePagePermission(p)` — in layouts.
  - The session loader computes effective permissions (cached by `permissionsVersion`).
  - Navigation filters on permissions.
  - Firestore rules continue to deny client writes. Staff client reads should go through the server (tighten R7).
- **Migration:** map each existing role to a template that reproduces today's API behaviour **minus** R2 and R4, then enable per-route checks.

### 14.3 Permission catalogue (derived from the actual routes; Appendix A maps each route)

| Domain | Permissions |
|---|---|
| Orders & payments | `orders.view`, `orders.create`, `orders.manage`, `orders.costs.manage`, `orders.refund`, `payments.view`, `payments.record_manual`, `payments.reconcile` |
| Products | `products.view`, `products.manage`, `products.media.manage`, `products.snacks.manage`, `products.recipes.manage`, `products.publish` |
| Warehouse | `warehouse_inventory.view`, `warehouse_inventory.adjust`, `warehouse_fulfilment.view`, `warehouse_fulfilment.manage`, `procurement.view`, `procurement.manage` |
| Customers & support | `customers.view`, `customers.manage`, `customers.wallet.adjust`, `support.conversations.view`, `support.conversations.handle` |
| Marketing & content | `marketing.view`, `marketing.campaigns.manage`, `marketing.discounts.manage`, `marketing.messages.manage`, `marketing.messages.send`, `marketing.optouts.manage`, `content.view`, `content.manage`, `creators.view`, `creators.manage` |
| Finance | `finance.view`, `finance.withdrawals.approve`, `finance.reconciliation.resolve`, `analytics.view`, `analytics.spend.manage` |
| Logistics | `logistics.view`, `logistics.manage` |
| Machines | `machines.view`, `machines.create`, `machines.status.manage`, `machines.relocate`, `machines.slots.configure`, `machines.commands.issue`, `machines.test_vend`, `machines.credentials.manage`, `machine_screen.manage` |
| Machine catalogue & pricing | `machine_catalog.view`, `machine_catalog.manage`, `pricing.view`, `pricing.manage` |
| Machine stock | `machine_inventory.view`, `machine_inventory.adjust`, `restock.view`, `restock.plan`, `restock.execute` |
| Locations & owners | `locations.view`, `locations.manage`, `owners.view`, `owners.manage`, `owners.agreements.manage` |
| Owner finance | `owner_finance.view`, `owner_finance.subscriptions.manage`, `owner_finance.settlements.manage`, `owner_finance.settlements.finalize`, `owner_finance.payouts.approve` |
| Sales | `sales.view`, `sales.export`, `sales.review.resolve`, `payments.refund.vending` |
| Alerts & cameras | `alerts.view`, `alerts.resolve`, `cameras.view`, `cameras.snapshot`, `cameras.manage` |
| Analytics (vending) | `analytics.vending.view`, `recommendations.act` |
| Integrations | `integrations.view`, `integrations.manufacturers.manage`, `integrations.models.manage`, `integrations.machines.configure`, `integrations.machines.activate`, `integrations.certify`, `integrations.credentials.manage` |
| System | `users.view`, `users.manage`, `users.view_as`, `settings.view`, `settings.manage`, `settings.integrations.manage`, `settings.notifications.manage`, `settings.storage.manage`, `audit.view`, `audit.export`, `ops.jobs.run`, `media.upload` (directory-scoped) |

### 14.4 Role templates

Derived from what the routes do, not copied from a generic list.

| Template | Grants | Explicitly excluded |
|---|---|---|
| **Super admin** | all | — |
| **Operations director** | everything except `users.*`, `settings.integrations.manage`, `integrations.credentials.manage` | credentials, secrets |
| **Machine operations** | `machines.*` (except credentials), `machine_catalog.*`, `pricing.*`, `locations.*`, `restock.*`, `machine_inventory.*`, `alerts.*`, `cameras.view`, `cameras.snapshot`, `integrations.view`, `integrations.machines.configure`, `sales.view`, `analytics.vending.view` | payments, refunds, owner finance, credentials, users |
| **Warehouse manager** | `restock.*`, `machine_inventory.*`, `warehouse_*`, `procurement.*`, `machines.view`, `alerts.view` | pricing, machine config, payments, integrations |
| **Product manager** | `products.*`, `machine_catalog.view`, `content.*` | machines, payments, users, integrations, pricing |
| **Marketing** | `marketing.*`, `content.*`, `creators.*`, `products.media.manage`, `machine_screen.manage` | prices, machines, payments |
| **Finance** | `finance.*`, `payments.*`, `orders.view`, `orders.refund`, `sales.*`, `owner_finance.*`, `analytics.*` | machine config, integrations, users |
| **Support** | `customers.view`, `orders.view`, `support.conversations.*`, `sales.view`, `sales.review.resolve`, `alerts.view`, `cameras.snapshot` | refunds execution (request only), pricing, machines |
| **Integration engineer** | `integrations.*` (credentials only if also granted individually), `machines.view`, `machines.test_vend` | payments, owners, pricing |

### 14.5 UI

`/admin/users` (replaces `/admin/staff`):
- **List:** name, template, status, last sign-in.
- **User page:** a template picker, then permission groups as expandable checkbox groups. Each shows "(from template)", "(added)" or "(removed)", with a diff summary before save.
- **"Test as this user":** reuses view-as, extended to permissions.
- **Change history:** from the audit log (`users.permissions.change`).

---

## 15. Admin navigation architecture

Derived from the actual domains. Every entry is filtered by permission; an empty group is hidden.

| Domain | Pages (list / detail / create / edit / archive · bulk · search · filters · export · audit) | View permission |
|---|---|---|
| **Dashboard** | Role-aware home: alerts, reviews owed, restock due, offline machines | any |
| **Machines** | Fleet (paginated; filters: liveness, owner, location, alert; search code/serial) · machine detail tabs: Overview, Slots, Catalogue, Screen, Stock, Sales, Commands, Integration, Cameras, History · New machine wizard · status / archive · bulk: status, catalogue copy | `machines.view` |
| **Locations** | List · detail (machines, performance) · new / edit · archive | `locations.view` |
| **Owners** | List · detail (machines, agreements, settlements, subscriptions, payouts, portal access) · new / edit / deactivate | `owners.view` |
| **Products** | Boxes, snacks, recipes, media · "machines carrying this" · bulk availability | `products.view` |
| **Stock** | Restock queue (plan → pick → dispatch → receive) · machine stock · counts / adjustments · warehouse inventory · purchase orders · suppliers | `restock.view` / `warehouse_inventory.view` |
| **Sales & payments** | Vending sales · review queue · refunds · box orders · payment reconciliation · export | `sales.view` / `orders.view` |
| **Customers** | Customers · wallets · conversations · reviews | `customers.view` |
| **Marketing** | Campaigns, creators, referrals, discounts, email, SMS, opt-outs, FAQs, machine screen artwork | `marketing.view` |
| **Finance** | Owner settlements, payouts, subscriptions, withdrawals, revenue | `finance.view` |
| **Analytics** | Network, locations, products, time-of-day, recommendations, new-machine planner | `analytics.view` / `analytics.vending.view` |
| **Manufacturers & integrations** | Manufacturers, models, certification, credentials, integration health | `integrations.view` |
| **Alerts** | Alert center with deep links to the fix | `alerts.view` |
| **Users & permissions** | Users, templates, history | `users.view` |
| **Operations** | Scheduled jobs (run-now), rebuild analytics, storage, webhooks | `settings.view` |
| **Audit log** | Filters: entity, actor, machine, date · export | `audit.view` |
| **Settings** | Business settings, feature flags, integrations (secrets), notification templates | `settings.view` |

Today's nav (`components/admin/adminNav.ts`) groups vending into 12 flat links under one "Vending" section. The structure above splits by job-to-be-done and adds Owners, Locations, Sales, and Users & permissions, which are missing today.

---

## 16. Owner portal boundaries

| Principal | Auth | Scope today | Verdict |
|---|---|---|---|
| Snack Quest admin | staff session | tenant | see §13 |
| **Machine owner** | partner session (`lib/auth/partnerSession.ts`); claim limited to a pre-provisioned email (`partnerAuthService.register`) | `assertPartnerOwnsMachine` on every machine read; 20 `/api/vending/partners/me/*` routes | **Isolation is good.** Owners see normalized events in owner language (`OWNER_EVENT_LABEL`), never manufacturer names, adapters or credentials (`ownerPortalService.getMachineHealth`); tests: `partnerIsolation.test.ts`, `ownerPortalService.test.ts` |
| Manufacturer | HMAC keys (Model B) / webhook signatures (Model A) | `/api/v1/*` scoped to its own registered machines; uniform 404 otherwise | OK (previous audits) |
| Machine agent | = manufacturer credential in Model B | same | Agent should get **per-machine keys** (spec §3.6) |
| Customer | none (kiosk device secret) | kiosk sees only its own machine catalogue and its own payments (404 otherwise) | OK |

### 16.1 Owner-portal gaps
- **Owner machine health uses `lastSeenAt` connectivity, not liveness (G-H14).** An owner can see "online" for a machine that reports it cannot dispense.
- **Owners cannot see why a sale was refunded or is under review.** Once G-C1 exists, show owner-safe statuses ("refunded", "being checked").
- **Settlements appear only if finance creates them,** and there is no UI to do so (G-H1). The owner page shows empty settlement history.

**No leakage found:** no manufacturer secrets, other owners, integration internals or admin controls are exposed.

---

## 17. Operational scalability audit

| Can a non-technical team…? | Today | Blocking gap |
|---|---|---|
| Onboard a machine | **No** | G-C3, G-C4, G-C5 |
| Assign to an owner | **No** (only at registration via API) | G-C2 |
| Assign to a location | **No** | G-C6 |
| Configure slots | **No** | G-C4 |
| Assign products | **Partly** (screen styling only) | G-C5 |
| Set prices | **No** | G-C4 / G-C5 |
| Restock | Admins yes; **warehouse staff no** | G-H9 |
| Remove stock / waste | Yes (adjustment form) | reason codes, bulk |
| Replace a machine (same site and owner, new hardware) | **No** — no workflow to move slots, catalogue and identity to new hardware | Future F1 |
| Suspend a machine | Integration suspend: yes; machine status: **no** | G-C6 |
| Diagnose a failure | Mostly (alerts, events, integration panel, cameras, trace) | G-H12 slot health; G-H14 |
| See why a machine isn't selling | Partly — no single "why not selling" panel (liveness, sellable slots, stock, payments, jams) | Future F2 |
| See why a machine is offline | Partly (liveness reason in the integration panel, not the fleet) | G-H14 |
| See what needs restocking | Yes (restock center, low-stock alerts) | — |
| Compare locations | **No** (computed, hidden) | G-M1 |
| Move products between machines | **No** | G-C5 + stock transfer (Future F3) |
| See machine profitability | Partly (settlement preview only via API) | G-H1 |
| Manage manufacturers / certify hardware | Yes, except editing a manufacturer or model after creation | G-H3 |
| Manage credentials | Inbound yes (too broad); device secrets no | G-C3, G-H10 |
| Manage technicians | **No concept of technicians.** Restock tasks record who picked, dispatched and received (`pickedBy` / `dispatchedBy` / `receivedBy` in `types/restockTask.ts`), but nothing assigns work in advance or routes it | Future F4 |
| Manage permissions | Coarse only | G-H8 |

**At 100 / 1,000 / 10,000 machines:**
- The fleet page breaks (G-C9).
- There are no bulk operations, CSV exports or templated planograms.
- Alerts are evaluated on page views (`alertService.evaluateIfStale`) as well as by cron. At scale that should be cron-only.
- `machineRepository.listAllForBusiness` is unpaginated everywhere.

---

## 18. Security and authorization gaps

| ID | Gap | Implication | Fix | Priority |
|---|---|---|---|---|
| S1 | Sections not enforced on APIs (R1) | A restricted admin can approve withdrawals, send marketing, change settings through the API | `requirePermission` everywhere (§14) | Critical |
| S2 | Warehouse can set prices, register machines (gets device secrets), remap slots (R2) | Price fraud; rogue machine registration | Tighten now: `ADMIN_ONLY` for register, slot price, price override, slot mapping | Critical |
| S3 | Admin can mint manufacturer keys and outbound credentials (R4) | Credential sprawl | `integrations.credentials.manage` (super admin by default) | High |
| S4 | Kiosk device secret: no rotation or revocation UI; kept in browser `localStorage` on the machine | A leaked secret can't be killed without engineering | G-C3 + QR pairing | High |
| S5 | No vending refund permission or path | Ad hoc refunds outside the system | G-C1 with `payments.refund.vending` + dual control for large amounts | Critical |
| S6 | Firestore tenant-admin reads ignore sections (R7) | Client-side reads bypass restrictions | Route staff reads through the server; restrict rules to super admin | Medium |
| S7 | Internal key non-constant-time compare (R8) | Timing leak (low) | `timingSafeEqual` | Low |
| S8 | Serial bus / host (hardware) | Anyone inside the cabinet can vend | Physical security; agent owns the port exclusively | Medium |

---

## 19. Data visibility gaps

The data exists but no UI exposes it:
- Vending sales by status across the fleet.
- Deep-reconciliation discrepancies.
- Price history.
- Machine location history.
- Per-machine audit history.
- Slot outcome history.
- Camera snapshots per sale.
- Subscription arrears.
- Location-type performance.
- Location comparisons.
- Product affinity.
- New-machine assortment suggestions.
- Owner intelligence summary.
- Time-of-day at machine level (UTC bug).
- Scheduled-job per-item errors.
- Integration request / nonce logs beyond the integration panel.
- Outbound manufacturer credential status.
- Owner contact emails (needed for portal claim).

---

## 20. Developer-only workflows

Operations that today require an engineer (API call, script or Firestore):
1. Create a machine owner; set its contact email.
2. Create revenue-share agreements.
3. Register a machine and hand over its device secret.
4. Rotate or revoke a kiosk secret.
5. Create or edit a location.
6. Change a machine's status; relocate it; reassign its owner.
7. Configure slots (product, capacity); set slot prices; enable or disable slots.
8. Add or remove products on a machine; link slots; set price overrides.
9. Create, pause or cancel owner subscriptions; record subscription payments.
10. Create and finalize settlements.
11. Refund a failed vending sale; resolve a `manual_review` sale.
12. Edit a manufacturer or a model's declared capabilities.
13. Generate recommendations.
14. Rebuild analytics after data corrections.
15. Re-run a failed scheduled job outside its schedule.
16. Export any list.

---

## 21. Critical gaps

In order of fix:
1. **G-C1** — vending sale review and refund (customer money owed; the safety promise).
2. **G-C7 / G-C8, S1 / S2** — authorization tightening: an immediate route-guard patch, then permissions.
3. **G-C3** — machine registration and device credentials.
4. **G-C4** — slot configuration (+ a route for `configureSlot`).
5. **G-C5** — machine catalogue and pricing.
6. **G-C6** — locations, status, relocation.
7. **G-C2** — owners, agreements, reassignment.
8. **G-C9** — fleet summary and pagination (before the fleet exceeds ~200 machines).
9. **Hardware: the Machine Agent** and the manufacturer answers Q1 / Q4 / Q7 / Q10, before any physical M109E is connected.

## 22. High-priority gaps

- **Owner money and machine management:** G-H1 settlements · G-H2 subscriptions · G-H3 manufacturer / model edit · G-H10 credential permission.
- **Sales and review:** G-H5 sales list · G-H6 recommendations scheduling · G-H12 slot quarantine and health.
- **Visibility and correctness:** G-H7 audit log filters and history · G-H11 rollup rebuild · G-H13 Nairobi time · G-H14 single liveness truth.
- **Access:** G-H8 permission model · G-H9 workspace vending pages.

## 23. Medium-priority gaps

G-M1 hidden analytics · G-M2 price history · G-M3 search · G-M4 exports · G-M5 alert deep links · G-M6 deep-reconciliation view · G-M7 job run-now · G-M8 inventory reconcile · G-M9 QR pairing · G-M10 single adapter path · S6 · S7.

## 24. Future improvements

- **F1 Machine replacement:** keep identity, catalogue, slots and history; swap hardware and integration identity.
- **F2 "Why isn't this machine selling?":** one panel combining liveness, sellable slots, stock, payment gate, recent jams and alerts.
- **F3 Stock transfer between machines** (and warehouse ↔ machine) with movements on both sides.
- **F4 Technicians:** people, assignments, routes; restock and maintenance tasks assigned to them; mobile checklists.
- **F5 Planogram templates** by location type, applied to many machines.
- **F6 Bulk operations** everywhere (status, prices, catalogue).
- **F7 Refrigeration domain** (set-points, compliance log), if hosts must control cooling.
- **F8 Multi-tenant hardening** (`getCurrentBusinessId()` is env-based for public and device routes).
- **F9 Per-machine manufacturer keys** issued from the machine wizard.

---

## 25. Exact implementation roadmap

Each phase is independently shippable. Every item needs tests (service + route + RBAC) and audit logging.

### Phase 0 — Safety patches (days)
1. **Tighten route guards (S2):** `app/api/vending/register/route.ts`, `…/slots/route.ts` (PATCH), `…/assortment/**` (price), `…/slot-mapping/route.ts` → `ADMIN_ONLY`. Add tests.
2. **G-H13** Nairobi time in `productIntelligenceService.getTimeIntelligence`.
3. **G-H6** add a nightly `recommendations` cron + route; "Generate now" button.
4. **S7** `timingSafeEqual` for the internal key.

### Phase 1 — Money owed (1–2 weeks)
5. **G-C1:**
   - `machineTransactionService.resolveReview(txId, {outcome: 'dispensed' | 'refund' | 'not_owed', note, actor})`.
   - A vending reversal via the existing Daraja reversal plumbing (`refundService` pattern).
   - Routes `/api/vending/sales/[id]/resolve`, `/api/vending/sales?status=`.
   - Pages `/admin/vending/sales`, `/admin/vending/sales/review`, `/admin/vending/sales/[id]` (payment, commands, events, snapshots).
6. **G-H5** sales list + CSV.

### Phase 2 — Permissions (2–3 weeks)
7. `lib/auth/permissions.ts` (catalogue §14.3), `requirePermission`, `requirePagePermission`. Session computes effective permissions.
8. Replace every `hasStaffRole` call (170 routes, Appendix A) with a permission. Keep role templates reproducing today's behaviour minus S1 / S2 / S3.
9. `/admin/users` with templates, groups, overrides and history (G-H8). Navigation filtered by permission (§15).
10. Warehouse, finance and support workspace vending pages (G-H9).

### Phase 3 — Machine onboarding (2–3 weeks)
11. **G-C6** locations CRUD; machine status and relocate.
12. **G-C2** owners CRUD, contact email and portal invite, agreements, reassignment.
13. **G-C3** machine wizard, device credential card (rotate / revoke), QR pairing (G-M9).
14. **G-C4** route for `configureSlot`; slot grid editor with separate price permission.
15. **G-C5** machine catalogue page, product → machines page, copy range, price history (G-M2).
16. **G-H12** slot quarantine and health.

### Phase 4 — Owner finance (1–2 weeks)
17. **G-H1** settlements workflow.
18. **G-H2** subscriptions.
19. Owner-portal statuses for refunded / under-review sales.

### Phase 5 — Scale and visibility (2 weeks)
20. **G-C9** `machineFleetSummary` + paginated fleet; alert evaluation cron-only.
21. **G-H7** audit filters, export and per-entity history tabs.
22. **G-H11 / G-M7** job run-now and rollup rebuild.
23. **G-M1** hidden analytics tabs + new-machine planner.
24. **G-M3 / G-M4 / G-M5 / G-M6 / G-M8** search, exports, alert deep links, deep-reconciliation view, inventory reconcile.
25. **G-H14 / G-M10** single liveness truth, single adapter path.
26. **G-H3 / G-H10** manufacturer and model edit, credential permission.

### Phase 6 — Hardware (parallel to phases 1–3; gated on manufacturer answers)
27. Send the §9 questions.
28. Build the Machine Agent pieces that don't need hardware (M109E audit §8 category A) against a fake board; run the sandbox certification harness.
29. On hardware arrival: the acceptance plan (M109E audit §10), then declare model capabilities only from passed tests.

---

## Appendix A — Staff route authorization inventory

- **Current guard** is the role constant(s) found in the route file (ADMIN = `admin` + `super_admin`; `super_admin` = SA-only routes).
- **Proposed permission** is from §14.3.
- **Client UI caller** means a component calls the route with `fetch`. GET routes without one are usually rendered server-side by a page that calls the service directly. Missing *mutation* callers are the gaps in §12.

| Route | Methods | Current guard | Proposed permission | Client UI caller |
|---|---|---|---|---|
| `/api/admin/analytics/marketing-spend` | POST | ADMIN_ONLY | write→analytics.spend.manage | yes |
| `/api/admin/audit-logs` | GET | ADMIN_ONLY | GET→audit.view | no |
| `/api/admin/campaigns` | POST | ADMIN_ONLY | write→marketing.campaigns.manage | yes |
| `/api/admin/campaigns/[campaignId]` | PATCH | ADMIN_ONLY | write→marketing.campaigns.manage | yes |
| `/api/admin/conversations/[conversationId]/assign` | POST | ADMIN_OR_AGENT | write→support.conversations.handle | yes |
| `/api/admin/conversations/[conversationId]/price-door-delivery` | POST | ADMIN_OR_AGENT | write→support.conversations.handle | yes |
| `/api/admin/conversations/[conversationId]/reply` | POST | ADMIN_OR_AGENT | write→support.conversations.handle | yes |
| `/api/admin/conversations/[conversationId]/return-to-bot` | POST | ADMIN_OR_AGENT | write→support.conversations.handle | yes |
| `/api/admin/creators/[uid]/status` | POST | ADMIN_ONLY | write→creators.manage | yes |
| `/api/admin/customers/[phoneNumber]/wallet` | GET,POST | ADMIN_ONLY | GET→customers.view; write→customers.wallet.adjust | yes |
| `/api/admin/delivery-zones` | GET,PATCH | ADMIN_ONLY | GET→logistics.view; write→logistics.manage | yes |
| `/api/admin/discount-codes` | GET,POST,PATCH | super_admin | GET→marketing.view; write→marketing.discounts.manage | yes |
| `/api/admin/faqs` | POST | ADMIN_ONLY | write→content.manage | yes |
| `/api/admin/faqs/[faqId]` | PATCH,DELETE | ADMIN_ONLY | write→content.manage | yes |
| `/api/admin/feature-flags` | GET,PATCH | ADMIN_ONLY | GET→settings.view; write→settings.manage | yes |
| `/api/admin/fulfillment-batches` | POST | ADMIN_ONLY | write→logistics.manage | yes |
| `/api/admin/integrations` | GET | super_admin | GET→settings.view | no |
| `/api/admin/integrations/[provider]` | GET,PATCH | super_admin | GET→settings.view; write→settings.integrations.manage | yes |
| `/api/admin/integrations/[provider]/test` | POST | super_admin | write→settings.integrations.manage | yes |
| `/api/admin/inventory/[packageId]/adjust` | POST | ADMIN_ONLY | write→warehouse_inventory.adjust | yes |
| `/api/admin/inventory/batches/[batchId]/write-off` | POST | ADMIN_ONLY | write→warehouse_inventory.adjust | yes |
| `/api/admin/locale` | POST | any staff | write→(any staff) | yes |
| `/api/admin/marketing-emails` | GET,POST | super_admin | GET→marketing.view; write→marketing.messages.manage | yes |
| `/api/admin/marketing-emails/[id]` | GET,PATCH,DELETE | super_admin | GET→marketing.view; write→marketing.messages.manage | yes |
| `/api/admin/marketing-emails/[id]/resend` | POST | super_admin | write→marketing.messages.send | yes |
| `/api/admin/marketing-emails/[id]/send` | POST | super_admin | write→marketing.messages.send | yes |
| `/api/admin/marketing-emails/creator-search` | GET | super_admin | GET→marketing.view | yes |
| `/api/admin/marketing-emails/recipients` | POST | super_admin | write→marketing.messages.manage | yes |
| `/api/admin/marketing-sms` | GET,POST | super_admin | GET→marketing.view; write→marketing.messages.manage | yes |
| `/api/admin/marketing-sms/[id]` | GET,PATCH,DELETE | super_admin | GET→marketing.view; write→marketing.messages.manage | yes |
| `/api/admin/marketing-sms/[id]/resend` | POST | super_admin | write→marketing.messages.send | yes |
| `/api/admin/marketing-sms/[id]/send` | POST | super_admin | write→marketing.messages.send | yes |
| `/api/admin/marketing-sms/preview` | POST | super_admin | write→marketing.messages.manage | yes |
| `/api/admin/notification-templates` | GET | super_admin | GET→settings.view | no |
| `/api/admin/notification-templates/[code]` | GET,PATCH | super_admin | GET→settings.view; write→settings.notifications.manage | yes |
| `/api/admin/orders/[orderId]/box` | PATCH | super_admin | write→orders.manage | yes |
| `/api/admin/orders/[orderId]/collect-payment` | POST | ADMIN_OR_WAREHOUSE | write→orders.manage | yes |
| `/api/admin/orders/[orderId]/manual-payment` | PATCH | super_admin | write→payments.record_manual | yes |
| `/api/admin/orders/[orderId]/refund` | POST | ADMIN_ONLY | write→orders.refund | yes |
| `/api/admin/orders/[orderId]/send-confirmation-sms` | POST | ADMIN_ONLY | write→orders.manage | yes |
| `/api/admin/orders/[orderId]/status` | POST | ADMIN_OR_WAREHOUSE | write→orders.manage | yes |
| `/api/admin/orders/costs/bulk` | POST | ADMIN_ONLY | write→orders.costs.manage | yes |
| `/api/admin/orders/initiate` | POST | ADMIN_ONLY | write→orders.create | yes |
| `/api/admin/payments/[intentId]/complete` | POST | super_admin | write→payments.reconcile | yes |
| `/api/admin/payments/reconcile` | POST | super_admin | write→payments.reconcile | yes |
| `/api/admin/premium-snacks` | GET | ADMIN_OR_WAREHOUSE | GET→products.view | yes |
| `/api/admin/products` | POST | ADMIN_ONLY | write→products.manage | yes |
| `/api/admin/products/[packageId]` | PATCH | ADMIN_ONLY | write→products.manage | yes |
| `/api/admin/purchase-orders` | POST | ADMIN_ONLY | write→procurement.manage | yes |
| `/api/admin/purchase-orders/[purchaseOrderId]/cancel` | POST | ADMIN_ONLY | write→procurement.manage | yes |
| `/api/admin/purchase-orders/[purchaseOrderId]/order` | POST | ADMIN_ONLY | write→procurement.manage | yes |
| `/api/admin/purchase-orders/[purchaseOrderId]/receive` | POST | ADMIN_ONLY | write→procurement.manage | yes |
| `/api/admin/recipes/[packageId]` | PUT,DELETE | ADMIN_ONLY | write→products.recipes.manage | yes |
| `/api/admin/reconciliation/resolve` | POST | ADMIN_ONLY | write→finance.reconciliation.resolve | yes |
| `/api/admin/referral-links/[linkId]` | PATCH | ADMIN_ONLY | write→marketing.campaigns.manage | yes |
| `/api/admin/reviews` | POST | ADMIN_ONLY | write→content.manage | yes |
| `/api/admin/reviews/[reviewId]` | PATCH | ADMIN_ONLY | write→content.manage | yes |
| `/api/admin/reviews/requests/[orderId]` | POST | ADMIN_ONLY | write→content.manage | yes |
| `/api/admin/search` | GET | ADMIN_ONLY | GET→(any staff) | yes |
| `/api/admin/settings` | GET,PATCH | ADMIN_ONLY | GET→settings.view; write→settings.manage | yes |
| `/api/admin/shipments/[shipmentId]/complete-booking` | POST | ADMIN_AGENT_OR_WAREHOUSE | write→logistics.manage | yes |
| `/api/admin/shipments/[shipmentId]/status` | POST | ADMIN_ONLY | write→logistics.manage | yes |
| `/api/admin/sms-opt-outs` | GET,POST | ADMIN_ONLY | GET→marketing.view; write→marketing.optouts.manage | yes |
| `/api/admin/sms-opt-outs/[phone]` | DELETE | super_admin | write→marketing.optouts.manage | yes |
| `/api/admin/snack-items` | GET,POST | ADMIN_ONLY | GET→products.view; write→products.snacks.manage | yes |
| `/api/admin/snack-items/[id]` | PATCH,DELETE | ADMIN_ONLY | write→products.snacks.manage | yes |
| `/api/admin/staff` | GET,POST | super_admin | GET→users.view; write→users.manage | yes |
| `/api/admin/staff/[uid]` | PATCH,DELETE | super_admin | write→users.manage | yes |
| `/api/admin/staff/[uid]/reset-password` | POST | super_admin | write→users.manage | yes |
| `/api/admin/storage` | GET,DELETE | ADMIN_ONLY | GET→settings.view; write→settings.storage.manage | yes |
| `/api/admin/suppliers` | POST | ADMIN_ONLY | write→procurement.manage | yes |
| `/api/admin/suppliers/[supplierId]` | PATCH | ADMIN_ONLY | write→procurement.manage | yes |
| `/api/admin/view-as` | POST | super_admin | write→users.view_as | yes |
| `/api/admin/whatchimp/send-test-message` | POST | super_admin | write→settings.integrations.manage | yes |
| `/api/admin/withdrawals/[withdrawalId]/approve` | POST | ADMIN_ONLY | write→finance.withdrawals.approve | yes |
| `/api/admin/withdrawals/[withdrawalId]/pay-manually` | POST | ADMIN_ONLY | write→finance.withdrawals.approve | yes |
| `/api/admin/withdrawals/[withdrawalId]/reject` | POST | ADMIN_ONLY | write→finance.withdrawals.approve | yes |
| `/api/admin/withdrawals/[withdrawalId]/resolve` | POST | ADMIN_ONLY | write→finance.withdrawals.approve | yes |
| `/api/storage/upload` | POST | any staff | write→media.upload (+ directory-scoped) | yes |
| `/api/vending/alerts` | GET | ADMIN_FINANCE_OR_WAREHOUSE | GET→alerts.view | no |
| `/api/vending/alerts/[id]/acknowledge` | POST | ADMIN_FINANCE_OR_WAREHOUSE | write→alerts.resolve | yes |
| `/api/vending/alerts/[id]/resolve` | POST | ADMIN_FINANCE_OR_WAREHOUSE | write→alerts.resolve | yes |
| `/api/vending/analytics` | GET | ADMIN_FINANCE_OR_WAREHOUSE | GET→analytics.vending.view | no |
| `/api/vending/cameras/[cameraId]` | GET | ADMIN_FINANCE_OR_WAREHOUSE | GET→cameras.view | yes |
| `/api/vending/cameras/[cameraId]/activate` | POST | ADMIN_ONLY | write→cameras.manage (snapshot: cameras.snapshot) | yes |
| `/api/vending/cameras/[cameraId]/configure` | PATCH | ADMIN_ONLY | write→cameras.manage (snapshot: cameras.snapshot) | yes |
| `/api/vending/cameras/[cameraId]/disable` | POST | ADMIN_ONLY | write→cameras.manage (snapshot: cameras.snapshot) | yes |
| `/api/vending/cameras/[cameraId]/health-check` | POST | ADMIN_FINANCE_OR_WAREHOUSE | write→cameras.manage (snapshot: cameras.snapshot) | yes |
| `/api/vending/cameras/[cameraId]/snapshot` | POST | ADMIN_FINANCE_OR_WAREHOUSE | write→cameras.manage (snapshot: cameras.snapshot) | yes |
| `/api/vending/cameras/[cameraId]/snapshots` | GET | ADMIN_FINANCE_OR_WAREHOUSE | GET→cameras.view | yes |
| `/api/vending/cameras/[cameraId]/stream-info` | GET | ADMIN_FINANCE_OR_WAREHOUSE | GET→cameras.view | yes |
| `/api/vending/cameras/[cameraId]/test` | POST | ADMIN_FINANCE_OR_WAREHOUSE | write→cameras.manage (snapshot: cameras.snapshot) | yes |
| `/api/vending/integrations/credentials/[keyId]/revoke` | POST | ADMIN_ONLY | write→integrations.credentials.manage | yes |
| `/api/vending/integrations/credentials/[keyId]/rotate` | POST | ADMIN_ONLY | write→integrations.credentials.manage | yes |
| `/api/vending/integrations/manufacturers` | GET,POST | ADMIN_ONLY, ADMIN_OR_WAREHOUSE | GET→integrations.view; write→integrations.manufacturers.manage | yes |
| `/api/vending/integrations/manufacturers/[id]` | GET,PATCH | ADMIN_ONLY, ADMIN_OR_WAREHOUSE | GET→integrations.view; write→integrations.manufacturers.manage | no |
| `/api/vending/integrations/manufacturers/[id]/api-credentials` | GET | ADMIN_ONLY | GET→integrations.view | yes |
| `/api/vending/integrations/manufacturers/[id]/api-credentials/[environment]` | PUT | ADMIN_ONLY | write→integrations.credentials.manage | yes |
| `/api/vending/integrations/manufacturers/[id]/api-credentials/[environment]/revoke` | POST | ADMIN_ONLY | write→integrations.credentials.manage | yes |
| `/api/vending/integrations/manufacturers/[id]/api-credentials/[environment]/rollback` | POST | ADMIN_ONLY | write→integrations.credentials.manage | yes |
| `/api/vending/integrations/manufacturers/[id]/credentials` | POST | ADMIN_ONLY | write→integrations.credentials.manage | yes |
| `/api/vending/integrations/manufacturers/[id]/stage` | POST | ADMIN_ONLY | write→integrations.manufacturers.manage | yes |
| `/api/vending/integrations/manufacturers/[id]/status` | POST | ADMIN_ONLY | write→integrations.manufacturers.manage | yes |
| `/api/vending/integrations/models` | POST | ADMIN_ONLY | write→integrations.manufacturers.manage | yes |
| `/api/vending/integrations/models/[id]` | PATCH | ADMIN_ONLY | write→integrations.models.manage | no |
| `/api/vending/integrations/models/[id]/certify` | POST | ADMIN_ONLY | write→integrations.certify | yes |
| `/api/vending/integrations/models/[id]/checks` | POST | ADMIN_ONLY | write→integrations.certify | yes |
| `/api/vending/integrations/models/[id]/revoke-certification` | POST | ADMIN_ONLY | write→integrations.certify | yes |
| `/api/vending/integrations/overview` | GET | ADMIN_OR_WAREHOUSE | GET→integrations.view | no |
| `/api/vending/intelligence/location-types` | GET | ADMIN_FINANCE_OR_WAREHOUSE | GET→analytics.vending.view | no |
| `/api/vending/intelligence/locations/[id]` | GET | ADMIN_FINANCE_OR_WAREHOUSE | GET→analytics.vending.view | no |
| `/api/vending/intelligence/locations/[id]/products` | GET | ADMIN_FINANCE_OR_WAREHOUSE | GET→analytics.vending.view | no |
| `/api/vending/intelligence/machines/[id]` | GET | ADMIN_FINANCE_OR_WAREHOUSE | GET→analytics.vending.view | no |
| `/api/vending/intelligence/network` | GET | ADMIN_FINANCE_OR_WAREHOUSE | GET→analytics.vending.view | no |
| `/api/vending/intelligence/new-machine-recommendation` | POST | ADMIN_FINANCE_OR_WAREHOUSE | write→analytics.vending.view | no |
| `/api/vending/intelligence/products` | GET | ADMIN_FINANCE_OR_WAREHOUSE | GET→analytics.vending.view | no |
| `/api/vending/intelligence/products/[id]/affinity` | GET | ADMIN_FINANCE_OR_WAREHOUSE | GET→analytics.vending.view | no |
| `/api/vending/intelligence/products/opportunities` | GET | ADMIN_FINANCE_OR_WAREHOUSE | GET→analytics.vending.view | no |
| `/api/vending/kiosk-screen/images` | GET,POST | ADMIN_FINANCE_OR_WAREHOUSE, ADMIN_OR_WAREHOUSE | GET→machines.view; write→machine_screen.manage | yes |
| `/api/vending/kiosk-screen/images/[imageId]` | PATCH,DELETE | ADMIN_OR_WAREHOUSE | write→machine_screen.manage | yes |
| `/api/vending/locations` | GET,POST | ADMIN_FINANCE_OR_WAREHOUSE, ADMIN_ONLY | GET→locations.view; write→locations.manage | no |
| `/api/vending/locations/[id]` | GET,PATCH | ADMIN_FINANCE_OR_WAREHOUSE | GET→locations.view; write→locations.manage | no |
| `/api/vending/machines/[id]` | GET,PATCH | ADMIN_FINANCE_OR_WAREHOUSE, ADMIN_OR_WAREHOUSE | GET→machines.view; write→machines.status.manage / machines.relocate | no |
| `/api/vending/machines/[id]/api-probe` | POST | ADMIN_ONLY | write→integrations.certify | yes |
| `/api/vending/machines/[id]/assortment` | GET,POST | ADMIN_FINANCE_OR_WAREHOUSE, ADMIN_OR_WAREHOUSE | GET→machine_catalog.view; write→machine_catalog.manage (+ pricing.manage for price override) | no |
| `/api/vending/machines/[id]/assortment/[productCatalogue]/[productId]` | PATCH,GET | ADMIN_FINANCE_OR_WAREHOUSE, ADMIN_OR_WAREHOUSE | GET→machine_catalog.view; write→machine_catalog.manage (+ pricing.manage for price override) | yes |
| `/api/vending/machines/[id]/cameras` | GET,POST | ADMIN_FINANCE_OR_WAREHOUSE, ADMIN_ONLY | GET→cameras.view; write→cameras.manage | yes |
| `/api/vending/machines/[id]/certification-runs` | POST | ADMIN_ONLY | write→integrations.certify | yes |
| `/api/vending/machines/[id]/commands` | GET,POST | ADMIN_FINANCE_OR_WAREHOUSE, ADMIN_OR_WAREHOUSE | GET→machines.view; write→machines.commands.issue | yes |
| `/api/vending/machines/[id]/integration` | GET,PUT | ADMIN_ONLY, ADMIN_OR_WAREHOUSE | GET→integrations.view; write→integrations.machines.configure | yes |
| `/api/vending/machines/[id]/integration-events` | GET | ADMIN_FINANCE_OR_WAREHOUSE | GET→integrations.view | no |
| `/api/vending/machines/[id]/integration/activate` | POST | ADMIN_ONLY | write→integrations.machines.activate | yes |
| `/api/vending/machines/[id]/integration/maintenance` | PUT | ADMIN_OR_WAREHOUSE | write→integrations.machines.configure | yes |
| `/api/vending/machines/[id]/integration/suspend` | POST | ADMIN_ONLY | write→integrations.machines.activate | yes |
| `/api/vending/machines/[id]/integration/test` | POST | ADMIN_ONLY | write→integrations.machines.configure | yes |
| `/api/vending/machines/[id]/reserve` | GET | ADMIN_FINANCE_OR_WAREHOUSE | GET→machine_inventory.view | no |
| `/api/vending/machines/[id]/settlements` | GET,POST | ADMIN_FINANCE_OR_WAREHOUSE, ADMIN_ONLY | GET→owner_finance.view; write→owner_finance.settlements.manage / .finalize | no |
| `/api/vending/machines/[id]/slot-mapping` | GET,PUT | ADMIN_OR_WAREHOUSE | GET→integrations.view; write→integrations.machines.configure | yes |
| `/api/vending/machines/[id]/slots` | GET,PATCH | ADMIN_FINANCE_OR_WAREHOUSE, ADMIN_OR_WAREHOUSE | GET→machines.view; write→machines.slots.configure (+ pricing.manage for price) | no |
| `/api/vending/machines/[id]/slots/adjust` | POST | ADMIN_OR_WAREHOUSE | write→machine_inventory.adjust | yes |
| `/api/vending/machines/[id]/subscription` | GET,POST | ADMIN_FINANCE_OR_WAREHOUSE, ADMIN_ONLY | GET→owner_finance.view; write→owner_finance.subscriptions.manage | no |
| `/api/vending/machines/[id]/subscription/[subscriptionId]` | PATCH | ADMIN_ONLY | write→owner_finance.subscriptions.manage | no |
| `/api/vending/machines/[id]/testVend` | POST | ADMIN_ONLY | write→machines.test_vend | yes |
| `/api/vending/partners/[partnerId]/machines/[machineId]/intelligence` | GET | ADMIN_FINANCE_OR_WAREHOUSE | GET→owners.view | no |
| `/api/vending/partners/[partnerId]/settlements` | GET | ADMIN_FINANCE_OR_WAREHOUSE | GET→owners.view | no |
| `/api/vending/partners/[partnerId]/subscriptions` | GET | ADMIN_FINANCE_OR_WAREHOUSE | GET→owners.view | no |
| `/api/vending/partners/[partnerId]/wallet` | GET | ADMIN_FINANCE_OR_WAREHOUSE | GET→owners.view | no |
| `/api/vending/partners/[partnerId]/withdrawals` | GET,POST | ADMIN_FINANCE_OR_WAREHOUSE, ADMIN_ONLY | GET→owner_finance.view; write→owner_finance.payouts.approve | yes |
| `/api/vending/recommendations` | GET | ADMIN_FINANCE_OR_WAREHOUSE | GET→analytics.vending.view | no |
| `/api/vending/recommendations/[id]/approve` | POST | ADMIN_OR_WAREHOUSE | write→recommendations.act | yes |
| `/api/vending/recommendations/[id]/dismiss` | POST | ADMIN_OR_WAREHOUSE | write→recommendations.act | yes |
| `/api/vending/recommendations/[id]/outcome` | POST | ADMIN_OR_WAREHOUSE | write→recommendations.act | yes |
| `/api/vending/recommendations/generate` | POST | ADMIN_OR_WAREHOUSE | write→recommendations.act | no |
| `/api/vending/reconciliation` | GET | ADMIN_FINANCE_OR_WAREHOUSE | GET→sales.view | no |
| `/api/vending/register` | POST | ADMIN_OR_WAREHOUSE | write→machines.create | no |
| `/api/vending/restock` | GET,POST | ADMIN_OR_WAREHOUSE | GET→restock.view; write→restock.plan | yes |
| `/api/vending/restock/[taskId]/approve` | POST | ADMIN_OR_WAREHOUSE | write→restock.plan | yes |
| `/api/vending/restock/[taskId]/cancel` | POST | ADMIN_OR_WAREHOUSE | write→restock.plan | yes |
| `/api/vending/restock/[taskId]/dispatch` | POST | ADMIN_OR_WAREHOUSE | write→restock.execute | yes |
| `/api/vending/restock/[taskId]/mark-in-transit` | POST | ADMIN_OR_WAREHOUSE | write→restock.execute | yes |
| `/api/vending/restock/[taskId]/receive` | POST | ADMIN_OR_WAREHOUSE | write→restock.execute | yes |
| `/api/vending/restock/[taskId]/start-picking` | POST | ADMIN_OR_WAREHOUSE | write→restock.execute | yes |
| `/api/vending/settlements/[id]/finalize` | POST | ADMIN_ONLY | write→owner_finance.settlements.manage / .finalize | no |
| `/api/vending/trace` | GET | ADMIN_FINANCE_OR_WAREHOUSE | GET→sales.view | no |
| `/api/vending/transactions` | POST,GET | ADMIN_FINANCE_OR_WAREHOUSE | GET→sales.view; write→(device) | no |
| `/api/warehouse/orders/[orderId]/costs` | POST | ADMIN_OR_WAREHOUSE | write→warehouse_fulfilment.manage | yes |
| `/api/warehouse/orders/[orderId]/curated-snacks` | POST | ADMIN_OR_WAREHOUSE | write→warehouse_fulfilment.manage | yes |
| `/api/warehouse/shopping-runs` | POST | warehouse, ADMIN (inline check) | write→warehouse_fulfilment.manage | yes |
| `/api/warehouse/shopping-runs/[runId]/complete` | POST | warehouse, ADMIN (inline check) | write→warehouse_fulfilment.manage | yes |
| `/api/warehouse/shopping-runs/[runId]/lines` | PATCH | warehouse, ADMIN (inline check) | write→warehouse_fulfilment.manage | yes |
