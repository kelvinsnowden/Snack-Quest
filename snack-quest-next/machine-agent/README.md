# Snack Quest Machine Agent — M109E

The program that runs on a vending machine's host computer. It drives an M109E control card over its serial line and talks to Snack Quest through the machine API (Model B, `/api/v1`), using the reference TypeScript SDK.

**Status:** built from the manufacturer's protocol document and tested against a fake board. **Never run against an M109E.** Not deployable yet:
- There is no real serial transport. It needs the host answer (manufacturer question 7).
- There is no process entry point or packaging. Both depend on the host's OS.

It imports nothing from the Next.js app except `sdk/typescript`. A test holds that.

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
