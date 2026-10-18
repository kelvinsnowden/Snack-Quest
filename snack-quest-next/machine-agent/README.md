# Snack Quest Machine Agent — M109E

The program that runs on a vending machine's host computer. It drives an M109E control card over its serial line and talks to Snack Quest through the machine API (Model B, `/api/v1`), using the reference TypeScript SDK.

**Status:** built from the manufacturer's protocol document, tested against a fake board and over a real Linux serial line (a pseudo-terminal). **Never run against an M109E yet** — the acceptance tests in `docs/hardware/` come first. Installable on a Raspberry Pi or any Debian-based Linux computer, and runnable today as a fake machine against staging.

## Install on a machine (Raspberry Pi)

Hardware: a Raspberry Pi 4/5 (or any Debian-based Linux box) running Raspberry Pi OS Bookworm, and a USB-RS232 adapter cabled to the M109E's serial port. The manufacturer's own vending app must not be connected to the board at the same time (acceptance test X1).

1. In the admin, register the machine (Vending → Register machine, Snack Quest gateway) and issue a **sandbox** API key for its manufacturer. Map each slot to its lane, e.g. `A07` → `b1-m07`.
2. On the Pi:
   ```sh
   curl -fsSL https://www.snackquests.shop/machine-agent/install.sh | sudo sh -s -- --kiosk SQ0001
   ```
   `--kiosk <machine code>` also sets up the customer screen full-screen at boot (pair it with a screen key from the machine's Setup page). Leave it out on a machine whose screen is driven another way.
3. Edit `/etc/snack-quest-agent/config.json` (see below) and paste the API secret into `/etc/snack-quest-agent/secret`.
4. Check, then start:
   ```sh
   sudo -u snackquest node /opt/snack-quest-agent/current/agent.mjs --config /etc/snack-quest-agent/config.json --check
   sudo systemctl start snack-quest-agent
   journalctl -u snack-quest-agent -f
   ```
5. Run the acceptance tests with a technician (bench tool, then `docs/hardware/M109E_ACCEPTANCE_RECORD.template.json`), save the record next to the config and set `acceptanceRecordFile`. Only then swap in a live key.

The service starts at boot, restarts after a crash, a hang (systemd watchdog) or an update, and stops for good (exit 78) when the config, acceptance record or journal needs a person — check the log. Every start begins with the journal's crash recovery, so a restart never runs a motor twice.

**Updates:** every deploy of the site publishes the agent from this folder at `/machine-agent/` (`scripts/buildMachineAgent.mjs`). When a machine runs an older release, its admin page shows **Update to x.y.z** under *Machine software*. The machine downloads the file from the site, checks its SHA-256 against the one in the signed command, installs it beside the old one and restarts into it. The two previous releases stay in `/opt/snack-quest-agent/releases/`; to roll back by hand, point the `current` link at one and restart the service.

## Run a fake machine (no hardware)

The same program, with `"transport": { "kind": "fake" }`, drives a simulated M109E that follows the protocol document: products drop, the curtain sees them, the probe reads a temperature. Everything else is real — signed API calls, the journal, commands, reports — so staff can make test sales and watch them land in the admin. It only runs with a sandbox key.

```json
{
  "snackQuest": { "baseUrl": "https://www.snackquests.shop", "keyId": "sqk_test_…", "secretFile": "secret" },
  "manufacturerMachineId": "FAKE-001",
  "transport": { "kind": "fake", "stock": { "b1-m07": 5, "b1-m08": 3 }, "temperatureCelsius": 5 },
  "slots": [
    { "slotId": "b1-m07", "motorType": 3, "curtainMode": 2 },
    { "slotId": "b1-m08", "motorType": 3, "curtainMode": 2 }
  ],
  "dataDir": "data"
}
```

Run it on any computer with Node 18+: `npm run agent:build`, then `node public/machine-agent/m109e-agent-<release>.mjs --config ./config.json`. Map the machine's slots to `b1-m07`/`b1-m08` in the admin, then use **Test vend** on the machine page.

## Config reference

| Field | Meaning |
|---|---|
| `snackQuest.baseUrl` | The site, `https://www.snackquests.shop` (http only for localhost) |
| `snackQuest.keyId`, `secretFile` | The machine API key id; the secret lives in its own file (mode 0640) |
| `manufacturerMachineId` | The id the machine was registered with |
| `transport` | `{ "kind": "serial", "device": "/dev/ttyUSB0", "baud": 9600 }` or `{ "kind": "fake", … }` |
| `slots` | One per lane: `slotId` `b<board>-m<NN>`, `motorType`, `curtainMode` (0 none, 1, 2), optional timings |
| `acceptanceRecordFile` | The machine's acceptance record. Unset: every safety setting stays conservative and no cooling control |
| `dataDir` | Journal (`journal.jsonl`) and cooling range (`cooling.json`) |

## What is here

| Path | What it does |
|---|---|
| `m109e/crc16Modbus.ts`, `m109e/frame.ts` | CRC16-MODBUS and 20-byte frames. Golden frames come from the document's printed CRCs; the three misprints are asserted as misprints |
| `m109e/commands.ts`, `m109e/resultCodes.ts` | Encoders, decoders and result codes. No `FF` (set address) anywhere |
| `m109e/protocolClient.ts` | One request in flight; strict reply checks (host address, command echo, CRC). Reads are retried; a motor run is sent exactly once |
| `m109e/slotMap.ts` | `b<board>-m<NN>` → board, motor and run settings, validated at start |
| `m109e/outcomeMapper.ts` | The §5.3 table. "The curtain saw nothing" is `unknown` until acceptance test S5 passes |
| `m109e/dispenseDriver.ts` | Runs acknowledged commands. `run_pending` is on disk before the motor-run frame goes out. A lost reply is settled by asking the board, never by running again. Crash recovery never re-runs anything |
| `journal/journal.ts` | Append-only, fsync'd journal: command states, outcomes, and the outbox of reports owed to Snack Quest |
| `agent/m109eAgent.ts` | The loop: connect, heartbeat (answers `reportOutcomes` from the journal), health and status, door events, owed reports, poll → ack → execute → report |
| `sandbox/` | The sandbox control endpoints for the certification harness. Sandbox keys only, bearer token, localhost by default |
| `acceptance/acceptanceRecord.ts` | The §10 acceptance record and the gate: capabilities and safety settings only from passed tests |
| `main.ts` | The program: loads the config, builds the transport, runs the loop with back-off, watchdog pings and clean shutdown |
| `config/agentConfig.ts` | The config file, checked with plain-language errors; safety settings only from the acceptance record |
| `transport/linuxSerialTransport.ts` | The real serial line on Linux (`stty` + Node's tty stream, no native modules) |
| `update/updater.ts` | Installs `update_agent` releases: same site only, SHA-256 checked, atomic switch, keeps two previous releases |
| `agent/thermostat.ts`, `agent/coolingStore.ts` | Cooling control (only with host-run cooling proven by S11/S12) and the saved range |
| `deploy/install.sh` | The Raspberry Pi installer: user, folders, systemd service with watchdog, optional kiosk screen |
| `bench/bench.ts` | Technician commands: read-only by default; `run` turns one motor once and needs `--yes` |
| `transport/fakeM109e.ts`, `transport/faultInjection.ts` | A board that follows the document, and a serial line that loses, corrupts or misdirects frames |

## Safety settings, and what turns them on

| Setting | Default | Turned on only by |
|---|---|---|
| `curtainNegativeIsCertain` — report `failed` (refund) when the curtain saw nothing | **false**: reported `unknown`, and a person checks | S3 and S5 passed |
| `resultsPersistUntilRead` — after a lost motor-run request with the board idle, run once more | **false**: reported `unknown` | S7 passed, and it found "until read" |
| `doorInput` — which DI is the door | **null**: no door state, no door events | S10 passed, and it found a door input |

## What the certification harness says (fake board, sandbox)

The harness was run with `tests/machineAgent/m109eAgentCertification.test.ts`, in-process and over the HTTP control endpoints. A fake-board run proves the agent's logic against the document, never the machine, and can't be recorded as model evidence.

- **Conservative settings: NOT CERTIFIED.**
  - `inventory` fails: the M109E can't count stock.
  - `failure_handling` fails: an empty lane ends `unknown`, not `failed`.
  - `timeout_handling` is not verified: that `unknown` quarantines the slot, and the next test sale is blocked.
- **With `curtainNegativeIsCertain` on: NOT CERTIFIED** on `inventory` only.

The inventory result needs a decision (see the control audit, Phase 6).

## Tests

`tests/machineAgent/`: protocol, board and client, driver and recovery, acceptance gate and bench, the import boundary, and the harness runs. The harness run needs the Firestore emulator; the rest don't.
