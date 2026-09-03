"""Append-only JSONL Event Ledger (Master Plan §57; envelope owned by ``specs/execution/event-ledger.schema.yaml``).

Invariants enforced here rather than by convention:

* ``event_id`` is never reused (EC §27 L1125) -- deterministic ids plus an
  in-memory guard, and a ledger file that already has content is refused
  (a second run can never append duplicate ids to it);
* per-aggregate ``sequence`` is strictly monotonic;
* ``causation_id`` only ever points at an event of the same tenant;
* an optional ``validator`` runs BEFORE the line is written, so an invalid
  envelope never reaches disk;
* an optional ``payload_guard`` runs before validation, for cross-cutting
  refusals (the slice uses it to keep detected personal data out of the
  ledger, whose contents can never be deleted).

There is no update or delete API. Replay is by index (``through``) or by
time (``through_timestamp``); both return deep copies.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any, Callable

from ai_lego.core.support import SyntheticClock, parse_timestamp, stable_id
from ai_lego.errors import InvariantViolation

Validator = Callable[[str, Any, str], None]
PayloadGuard = Callable[[str, dict[str, Any]], None]
EVENT_SCHEMA = "ai-lego://specs/execution/event-ledger.schema.yaml"


class EventLedger:
    def __init__(self, path: Path, run_id: str, clock: SyntheticClock, validator: Validator | None = None, payload_guard: PayloadGuard | None = None) -> None:
        if path.exists() and path.stat().st_size > 0:
            raise InvariantViolation(f"LEDGER_NOT_EMPTY: {path} already holds events; a run never appends to another run's ledger")
        self.path = path
        self.run_id = run_id
        self.clock = clock
        self.validator = validator
        self.payload_guard = payload_guard
        self.events: list[dict[str, Any]] = []
        self.used_event_ids: set[str] = set()
        self.last_event_by_tenant: dict[str, str] = {}
        self.sequence_by_aggregate: dict[str, int] = {}
        self.terminal_aggregates: set[str] = set()
        path.parent.mkdir(parents=True, exist_ok=True)

    def close_aggregate(self, aggregate_id: str) -> None:
        """Mark an aggregate's execution as terminal: no further event may be appended to it."""
        self.terminal_aggregates.add(aggregate_id)

    def append(self, tenant_id: str, aggregate_id: str, event_type: str, payload: dict[str, Any], offset: float) -> dict[str, Any]:
        if aggregate_id in self.terminal_aggregates:
            raise InvariantViolation(f"TERMINAL_STATE_EMIT_REFUSED: {aggregate_id} is closed; cannot append {event_type}")
        if self.payload_guard is not None:
            self.payload_guard(event_type, payload)
        sequence = self.sequence_by_aggregate.get(aggregate_id, 0) + 1
        event_id = stable_id("EV", self.run_id, aggregate_id, str(sequence), event_type)
        if event_id in self.used_event_ids:
            raise InvariantViolation(f"EVENT_ID_REUSE_PREVENTED: {event_id}")
        event = {
            "event_id": event_id,
            "event_type": event_type,
            "tenant_id": tenant_id,
            "aggregate_id": aggregate_id,
            "sequence": sequence,
            "occurred_at": self.clock.at(offset),
            "schema_version": "1.0.0",
            "correlation_id": self.run_id,
            "causation_id": self.last_event_by_tenant.get(tenant_id),
            "payload": payload,
        }
        if self.validator is not None:
            self.validator(EVENT_SCHEMA, event, f"{event_type} {event_id}")
        with self.path.open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(event, ensure_ascii=False, sort_keys=True) + "\n")
        self.events.append(event)
        self.used_event_ids.add(event_id)
        self.last_event_by_tenant[tenant_id] = event_id
        self.sequence_by_aggregate[aggregate_id] = sequence
        return event

    def find(self, event_type: str, **payload_match: Any) -> list[dict[str, Any]]:
        return [copy.deepcopy(event) for event in self.events if event["event_type"] == event_type and all(event["payload"].get(k) == v for k, v in payload_match.items())]

    def through(self, event_index: int) -> list[dict[str, Any]]:
        return copy.deepcopy(self.events[:event_index])

    def through_timestamp(self, timestamp: str) -> list[dict[str, Any]]:
        target = parse_timestamp(timestamp)
        return [copy.deepcopy(event) for event in self.events if parse_timestamp(event["occurred_at"]) <= target]

    @staticmethod
    def read_events(path: Path) -> list[dict[str, Any]]:
        return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
