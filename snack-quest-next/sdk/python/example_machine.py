"""A minimal machine built on the reference client: connect, report, poll, dispense, report.

    SQ_BASE_URL=https://sandbox.example SQ_KEY_ID=sqk_test_... SQ_SECRET=... \
    SQ_MACHINE_ID=YOUR-UNIT-ID python3 sdk/python/example_machine.py

Prints one JSON line per step, so a person (or a test) can see exactly
what happened. Sandbox keys only — the example refuses a live key.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from snack_quest_machine import Outbox, SnackQuestMachineClient, new_event_id, run_poll_cycle  # noqa: E402


def main() -> int:
    key_id = os.environ["SQ_KEY_ID"]
    if not key_id.startswith("sqk_test_"):
        print(json.dumps({"step": "refused", "reason": "example runs with sandbox keys only"}))
        return 2
    client = SnackQuestMachineClient(os.environ["SQ_BASE_URL"], key_id, os.environ["SQ_SECRET"], sleep=lambda _s: None)
    unit = os.environ["SQ_MACHINE_ID"]
    stock = {"spiral_01": int(os.environ.get("SQ_STOCK", "3"))}

    def emit(step, result):
        print(json.dumps({"step": step, "status": result.status, "error": (result.error or {}).get("code"), "data": result.data, "requestId": result.request_id}), flush=True)
        return result

    connected = emit("connect", client.connect(unit, firmwareVersion="py-ref-1.0.0"))
    if not connected.ok:
        return 1
    code = connected.data["machineCode"]
    emit("heartbeat", client.heartbeat(code, new_event_id("hb"), uptimeSeconds=3600))
    emit("status", client.status(code, new_event_id("st"), True, doorOpen=False, temperatureCelsius=4.5, faults=[], paymentDeviceOk=True))
    emit("inventory", client.inventory(code, new_event_id("inv"), [{"slotId": slot, "quantity": qty} for slot, qty in stock.items()]))
    emit("events", client.events(code, [{"eventId": new_event_id("ev"), "type": "DOOR_OPENED"}, {"eventId": new_event_id("ev"), "type": "DOOR_CLOSED"}]))

    def dispense(slot_id):
        if stock.get(slot_id, 0) <= 0:
            return {"outcome": "failed", "failureCode": "no_product", "reason": "slot empty"}
        stock[slot_id] -= 1
        return {"outcome": "dispensed"}

    cycle = run_poll_cycle(client, code, dispense, Outbox())
    print(json.dumps({"step": "cycle", **cycle}), flush=True)
    print(json.dumps({"step": "log", "attempts": len(client.log), "nonces_unique": len({entry["nonce"] for entry in client.log}) == len(client.log)}), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
