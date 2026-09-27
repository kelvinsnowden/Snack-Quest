"""Snack Quest Machine API v1 — reference client for Python 3.8+.

Copy this one file into your integration. Standard library only
(hmac, hashlib, json, secrets, urllib). It mirrors the TypeScript
reference client in sdk/typescript/snackQuestMachine.ts and is tested
against the official signing test vectors and the real server.

What it does for you:
  * signs every request (HMAC-SHA256 over method, path, timestamp,
    nonce and the SHA-256 of the exact body bytes);
  * retries network errors, 5xx and 429 (honouring Retry-After) with the
    SAME body bytes — so the same eventId — and a fresh nonce/signature;
  * corrects its clock offset once when the server reports a stale
    timestamp;
  * never retries other 4xx responses: the request itself is wrong.

What your code must still do: get a 200 from ack() BEFORE turning the
motor; never dispense a command whose ack was refused; keep re-sending
an outcome report (same eventId) until it is accepted, across reboots;
report "unknown", never "failed", when you cannot tell whether the
product dropped.
"""

import hashlib
import hmac
import json
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

RETRYABLE_STATUSES = {429, 500, 502, 503, 504}


# ─── signing ──────────────────────────────────────────────────────────

def canonical_string(method: str, path_with_query: str, timestamp: int, nonce: str, body: bytes) -> str:
    body_hash = hashlib.sha256(body).hexdigest()
    return "\n".join(["v1", str(timestamp), nonce, method.upper(), path_with_query, body_hash])


def signature_header(secret: str, canonical: str) -> str:
    digest = hmac.new(secret.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256).hexdigest()
    return "v1=" + digest


def signed_headers(key_id: str, secret: str, method: str, path_with_query: str, body: bytes, timestamp: int, nonce: str) -> Dict[str, str]:
    return {
        "X-SQ-Key-Id": key_id,
        "X-SQ-Timestamp": str(timestamp),
        "X-SQ-Nonce": nonce,
        "X-SQ-Signature": signature_header(secret, canonical_string(method, path_with_query, timestamp, nonce, body)),
    }


def new_nonce() -> str:
    return secrets.token_urlsafe(18)


def new_event_id(prefix: str) -> str:
    """A unique, retry-stable id for one occurrence: generate once, store, reuse on every retry."""
    return "%s-%x-%s" % (prefix, int(time.time() * 1000), secrets.token_hex(6))


# ─── client ───────────────────────────────────────────────────────────

@dataclass
class ApiResult:
    status: int
    ok: bool
    data: Optional[Dict[str, Any]]
    error: Optional[Dict[str, Any]]
    request_id: Optional[str]
    attempts: int


class SnackQuestMachineClient:
    def __init__(self, base_url: str, key_id: str, secret: str, max_attempts: int = 4, max_backoff_seconds: float = 30.0,
                 now: Callable[[], float] = time.time, sleep: Callable[[float], None] = time.sleep, timeout_seconds: float = 15.0):
        self.base_url = base_url.rstrip("/")
        self.key_id = key_id
        self.secret = secret
        self.max_attempts = max_attempts
        self.max_backoff_seconds = max_backoff_seconds
        self.now = now
        self.sleep = sleep
        self.timeout_seconds = timeout_seconds
        self.clock_offset = 0
        self.log: List[Dict[str, Any]] = []

    # endpoints

    def connect(self, manufacturer_machine_id: str, **facts: Any) -> ApiResult:
        return self.request("POST", "/api/v1/machines/connect", dict(manufacturerMachineId=manufacturer_machine_id, **facts))

    def heartbeat(self, machine_code: str, event_id: str, **fields: Any) -> ApiResult:
        return self.request("POST", self._path(machine_code, "heartbeat"), dict(eventId=event_id, **fields))

    def status(self, machine_code: str, event_id: str, online: bool, **fields: Any) -> ApiResult:
        return self.request("POST", self._path(machine_code, "status"), dict(eventId=event_id, online=online, **fields))

    def inventory(self, machine_code: str, report_id: str, slots: List[Dict[str, Any]]) -> ApiResult:
        return self.request("POST", self._path(machine_code, "inventory"), {"reportId": report_id, "slots": slots})

    def events(self, machine_code: str, events: List[Dict[str, Any]]) -> ApiResult:
        return self.request("POST", self._path(machine_code, "events"), {"events": events})

    def poll_commands(self, machine_code: str) -> ApiResult:
        return self.request("GET", self._path(machine_code, "commands"))

    def ack(self, machine_code: str, command_id: str) -> ApiResult:
        """Must return 200 before you act. 409 means: do not execute."""
        return self.request("POST", self._path(machine_code, "commands/%s/ack" % urllib.parse.quote(command_id, safe="")))

    def report(self, machine_code: str, command_id: str, report: Dict[str, Any]) -> ApiResult:
        return self.request("POST", self._path(machine_code, "commands/%s/status" % urllib.parse.quote(command_id, safe="")), report)

    def _path(self, machine_code: str, relative: str) -> str:
        return "/api/v1/machines/%s/%s" % (urllib.parse.quote(machine_code, safe=""), relative)

    # transport

    def request(self, method: str, path: str, body: Optional[Dict[str, Any]] = None) -> ApiResult:
        raw = b"" if method == "GET" or body is None else json.dumps(body, separators=(",", ":")).encode("utf-8")
        corrected = False
        attempt = 0
        last = ApiResult(0, False, None, {"code": "network_error", "message": "no attempt made"}, None, 0)
        while attempt < self.max_attempts:
            attempt += 1
            timestamp = int(self.now()) + self.clock_offset
            nonce = new_nonce()
            headers = signed_headers(self.key_id, self.secret, method, path, raw, timestamp, nonce)
            headers["Content-Type"] = "application/json"
            retry_after: Optional[float] = None
            status = 0
            try:
                req = urllib.request.Request(self.base_url + path, data=None if method == "GET" else raw, method=method, headers=headers)
                with urllib.request.urlopen(req, timeout=self.timeout_seconds) as response:
                    status, text, response_headers = response.status, response.read().decode("utf-8"), response.headers
            except urllib.error.HTTPError as error:
                status, text, response_headers = error.code, error.read().decode("utf-8"), error.headers
            except (urllib.error.URLError, OSError) as error:
                last = ApiResult(0, False, None, {"code": "network_error", "message": str(error)}, None, attempt)
                text, response_headers = None, None
            if text is not None:
                envelope = _parse(text)
                error = envelope.get("error") or ({"code": "http_error", "message": "HTTP %d" % status} if status >= 400 else None)
                request_id = (envelope.get("meta") or {}).get("requestId") or response_headers.get("SQ-Request-Id")
                last = ApiResult(status, 200 <= status < 300, envelope.get("data"), error, request_id, attempt)
                ra = response_headers.get("Retry-After")
                retry_after = float(ra) if ra and ra.isdigit() else None
            self.log.append({"method": method, "path": path, "attempt": attempt, "status": last.status, "error": (last.error or {}).get("code"), "requestId": last.request_id, "nonce": nonce})

            if last.ok:
                return last
            if status == 401 and (last.error or {}).get("code") == "stale_timestamp" and not corrected:
                server_ts = ((last.error or {}).get("details") or {}).get("serverTimestamp")
                if isinstance(server_ts, int):
                    self.clock_offset = server_ts - int(self.now())
                    corrected = True
                    attempt -= 1  # the correction doesn't use up an attempt
                    continue
            if not (status == 0 or status in RETRYABLE_STATUSES) or attempt >= self.max_attempts:
                return last
            backoff = retry_after if retry_after is not None else min(0.5 * (2 ** (attempt - 1)), self.max_backoff_seconds)
            self.sleep(min(backoff, self.max_backoff_seconds))
        return last


def _parse(text: str) -> Dict[str, Any]:
    if not text:
        return {}
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else {}
    except ValueError:
        return {"error": {"code": "invalid_response", "message": "response was not JSON"}}


# ─── the machine loop ─────────────────────────────────────────────────

@dataclass
class Outbox:
    """Outcome reports waiting to be accepted. On real hardware, persist this (e.g. a JSON file written atomically)."""
    items: Dict[str, Dict[str, Any]] = field(default_factory=dict)


def run_poll_cycle(client: SnackQuestMachineClient, machine_code: str, dispense: Callable[[str], Dict[str, Any]], outbox: Outbox) -> Dict[str, Any]:
    """One cycle of a correct machine. `dispense(slot_id)` returns {"outcome": "dispensed"|"failed"|"unknown", ...}."""
    for command_id, report in list(outbox.items.items()):
        sent = client.report(machine_code, command_id, report)
        if sent.ok or (400 <= sent.status < 500 and sent.status != 429):
            del outbox.items[command_id]

    poll = client.poll_commands(machine_code)
    executed, refused = [], []
    for command in (poll.data or {}).get("commands", []):
        if command.get("type") != "dispense":
            continue
        if client.ack(machine_code, command["commandId"]).status != 200:
            refused.append(command["commandId"])
            continue
        outcome = dispense(command.get("slotId", ""))
        if outcome["outcome"] == "dispensed":
            report = {"status": "dispensed", "eventId": new_event_id("out")}
        elif outcome["outcome"] == "failed":
            report = {"status": "failed", "eventId": new_event_id("out"), "failureCode": outcome.get("failureCode", "failed"), "failureReason": outcome.get("reason")}
        else:
            report = {"status": "unknown", "eventId": new_event_id("out"), "failureReason": outcome.get("reason")}
        outbox.items[command["commandId"]] = report
        if client.report(machine_code, command["commandId"], report).ok:
            del outbox.items[command["commandId"]]
        executed.append(command["commandId"])
    return {"executed": executed, "refused": refused, "nextPollSeconds": (poll.data or {}).get("nextPollSeconds", 10)}
