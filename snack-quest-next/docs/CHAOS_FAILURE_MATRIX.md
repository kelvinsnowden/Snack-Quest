# Chaos failure matrix (internal)

**Internal.** Not part of the manufacturer handoff package.

For each failure: what the customer, the money, the machine, the owner
portal and the admin console see, how it recovers, and the test that
proves it. "Refund path" means the sale is recorded as owed back
(`paid_vend_failed`, then `refund_requested` → `refunded` when staff
return the money); **returning M-Pesa money is not automated** — see
docs/VENDING_FOUNDATION.md. Nothing below ever dispenses without a
confirmed payment, and no retry ever sends a second vend under a new
reference.

| # | Failure | Customer | Payment | Machine | Owner portal | Admin console | Recovery | Evidence |
|---|---|---|---|---|---|---|---|---|
| 1 | Manufacturer API refuses the connection (Model A) | Told it failed | Refund path — provably never sent | Nothing sent (retried with the same key first) | Sale not counted | `manufacturer_api_unavailable` alert if most machines are affected; next customers refused before paying | Automatic | `dispenseStateMatrix` "unreachable", `manufacturerHttpResilience` "connection refused", `horribleDay` G |
| 2 | Manufacturer API times out, or the answer is lost after it dispensed | Told to wait / staff contact | Held (`manual_review`), never refunded or re-sent | May have dispensed | Pending | Unknown dispense in review; pull reconciliation asks the manufacturer with backoff | Automatic when the lookup answers; else human | `dispenseStateMatrix` "timeout", "lost response"; `horribleDay` G |
| 3 | Manufacturer answers 409, 3xx, malformed/partial/oversized, or 429 that never clears | As #2 | As #2 | May have dispensed | Pending | As #2 | As #2 | `manufacturerHttpResilience` (20 real-socket cases) |
| 4 | Manufacturer silent for 30 min / disappears | New customers refused before paying; queued ones refunded | Uncollected → refund path; acknowledged → review | Offline | Machine offline | One `manufacturer_outage` alert; clears on return | Automatic | `horribleDay` G, T |
| 5 | Machine (Model B) offline before collecting | Told it failed within ~2.5 min (2 min TTL + 30 s grace) | Refund path (never acknowledged = never ran) | Late ack refused `409 command_expired` | Sale not counted | `machine_offline` alert | Automatic | `commandPollingSemantics`, `horribleDay` A |
| 6 | Machine loses power / restarts mid-dispense (acknowledged, no outcome) | Told to wait | Held for review once the command times out (15 min) | Never offered the command again; after 3 min the heartbeat asks for the outcome | Pending | In review until the machine reports | Late report resolves it | `commandPollingSemantics` restart, `v1SimulatorScenarios` restart (flash kept / lost), `horribleDay` B |
| 7 | Machine back after 12 hours | Already refunded | Refund path | Expired command not offered; ack refused | Sale not counted | — | Automatic | `commandPollingSemantics` "back after 12 hours" |
| 8 | Command delivered twice / polled twice | — | Charged once | Executes once (keyed on `commandId`) | One sale | — | n/a | `v1SimulatorScenarios` duplicate delivery, `commandPollingSemantics` |
| 9 | Same outcome or webhook sent many times | — | Applied once | — | One sale, stock −1 once | Duplicates acknowledged | n/a | `horribleDay` C, `webhookSecurity`, `dispenseStateMatrix` duplicate webhook |
| 10 | Outcome contradicts a decision (dispensed after refund decided) | — | Refund put on hold, human decides | — | — | `dispense_conflict` alert | Human | `dispenseStateMatrix` late report, `horribleDay` D |
| 11 | Safaricom callback never arrives | Waits; told outcome later | Query says paid → review (never dispensed on a query alone); failed → `payment_failed`; no answer → review after 6 h | Nothing dispensed | — | Review queue | Sweep + human with statement | `chaos` callback cases |
| 12 | Safaricom callback delivered twice / concurrently | — | One payment, one dispense | Told once | One sale | — | n/a | `horribleDay` K, `machineTransactionPaymentFlow` |
| 13 | Customer taps pay twice / kiosk retries | One prompt | One charge | — | — | — | n/a | `dispenseStateMatrix` customer retries |
| 14 | Firestore transient failure mid-request | — | Unchanged until the retry | Gets `503` + `Retry-After`; retry with same `eventId` applies once | — | — | Client retry | `chaos` datastore |
| 15 | KV (rate limits / nonces) down | — | — | Served normally | — | Warning logged | Falls back to shared Firestore counters/nonces (never per-process) | `rateLimitDistributed`, `nonceConcurrency` |
| 16 | Scheduler stopped / job fails / job killed mid-run | Refunds and reviews happen later (request-path recovery still runs) | Delayed | — | — | `job_failure` alert (failing, abandoned, overdue); `/api/cron/health` 503 for an external monitor | Next run (steps idempotent) | `scheduledJobs`, `cron*Route` |
| 17 | Two job runs overlap | — | Each sale resolved once | — | — | Second run recorded `skipped` | n/a | `scheduledJobs` overlap, `dispenseRecovery` overlapping sweeps |
| 18 | Credential leaked / revoked mid-flight | — | — | Refused within 30 s (`key_revoked`) | — | `integration_auth_failures` alert while it is still used | Rotate | `credentialLifecycle`, `horribleDay` H, M |
| 19 | Manufacturer suspended | New orders refused | — | Every endpoint `403 manufacturer_suspended` | Machine not selling | — | Reinstate | `credentialLifecycle` |
| 20 | Machine clock 20 min off | — | — | Refused with server time; corrected retry succeeds | — | — | Client corrects offset | `commandPollingSemantics`, `horribleDay` P |
| 21 | One machine floods / forged requests flood | Others unaffected | — | Throttled (`429`) on that endpoint only; forger's IP cut off | — | — | Automatic | `rateLimitDistributed`, `horribleDay` N, O |
| 22 | Two customers buy the last item at once | One gets it; the other is told it failed | Other → refund path (no reservation at checkout: both are charged, one refunded) | Second dispense reports `no_product` | One sale | — | Automatic | `concurrency` last item |
| 23 | SMS gateway down during a critical alert | — | — | — | — | Alert still in the Alert Center; job recorded partial | Next run re-texts (1 h cooldown per condition) | `cronVendingFastRecoveryRoute`, `integrationAlerts` cooldown |

Known limits (not failures of the above, but true): no stock reservation
at checkout (#22); refunds are recorded, not executed automatically;
during a KV outage in KV nonce mode, a request replayed within the 10
minute window whose nonce was stored only in KV could be accepted once
(Firestore mode has no such gap).
