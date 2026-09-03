"""Deterministic helpers: canonical hashing, base64, JSON I/O, stable ids, a synthetic clock.

Everything here is pure (no I/O beyond the two explicit JSON helpers) so that
a slice run is replayable byte-for-byte given the same inputs.
"""

from __future__ import annotations

import base64
import hashlib
import json
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any


def b64(value: bytes) -> str:
    return base64.b64encode(value).decode("ascii")


def unb64(value: str) -> bytes:
    return base64.b64decode(value.encode("ascii"), validate=True)


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def canonical_json(value: Any) -> str:
    """RFC-8785-style canonical form: sorted keys, no insignificant whitespace."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_json(value: Any) -> str:
    return sha256_bytes(canonical_json(value).encode("utf-8"))


def stable_id(kind: str, *parts: str) -> str:
    """Deterministic identifier: same inputs -> same id, so fixtures replay identically."""
    return f"{kind}-{uuid.uuid5(uuid.NAMESPACE_URL, '|'.join(parts)).hex[:16].upper()}"


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def parse_timestamp(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


@dataclass(frozen=True)
class SyntheticClock:
    """A fixed synthetic timeline. Offsets are seconds from ``base``.

    Real wall-clock time never enters a slice run: every ``occurred_at`` /
    ``transitioned_at`` / ``destroyed_at`` is an offset on this clock, which is
    what makes T0/T1/T2 replay points exact rather than approximate.
    """

    base: datetime

    def at(self, offset_seconds: float) -> str:
        moment = self.base + timedelta(seconds=offset_seconds)
        return moment.astimezone(UTC).isoformat().replace("+00:00", "Z")


DEFAULT_CLOCK = SyntheticClock(datetime(2026, 8, 31, 0, 0, 0, tzinfo=UTC))
