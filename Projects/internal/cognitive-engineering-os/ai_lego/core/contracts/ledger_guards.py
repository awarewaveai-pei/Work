"""Cross-cutting ledger safety: refuse to write detected personal-data values into the append-only ledger.

The ledger has no delete API (by design -- Master Plan section 57). A value
that should only ever exist encrypted (inside a ``personal-data-envelope``)
must never appear as plaintext anywhere in an event payload, regardless of
which code path produced that payload -- this is what closes the "the
interactive review path passed the raw transcript as the code quote" class
of defect.

Values are registered incrementally as they are detected (PII is discovered
per source while ingest proceeds), so this is a mutable guard, not a fixed
table built up front.

One deliberate, narrow exemption: ``EXEMPT_FIELDS`` names payload fields
whose OWN redaction contract is "first occurrence of each detected value
only" (``redact_transcript``), not "every occurrence, including an
unrelated later use of the same word" -- a city name that is also an
ordinary English word (the P4 fixture's "Reading") legitimately reappears
in that field's later, non-identifying text. That narrower guarantee has
its own dedicated test coverage; this guard does not re-litigate it.
"""

from __future__ import annotations

import json
from typing import Any

from ai_lego.core.support import canonical_json
from ai_lego.errors import InvariantViolation

EXEMPT_FIELDS = frozenset({"redacted_transcript"})


class PiiLedgerGuard:
    def __init__(self) -> None:
        self._forbidden: dict[str, str] = {}

    def register(self, label: str, value: str) -> None:
        if value:
            self._forbidden[label] = value

    def register_many(self, label_prefix: str, values: dict[str, str]) -> None:
        for field, value in values.items():
            self.register(f"{label_prefix}.{field}", value)

    def __call__(self, event_type: str, payload: dict[str, Any]) -> None:
        if not self._forbidden:
            return
        checked = {key: value for key, value in payload.items() if key not in EXEMPT_FIELDS}
        try:
            serialized = canonical_json(checked)
        except (TypeError, ValueError):
            serialized = json.dumps(checked, default=str, ensure_ascii=False)
        for label, value in self._forbidden.items():
            if value in serialized:
                raise InvariantViolation(f"LEDGER_PII_GUARD_TRIPPED: {event_type} payload contains detected PII value ({label}); the ledger has no delete API")
