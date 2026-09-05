"""Data-quality threshold-gate compute -- deterministic, backing ``database_data
.data_quality_dimensions``.

Atlas's own F21 tool table formula (L904: "rules→profiling→threshold→
quarantine→owner") names a real derived fact: whether a profiled
dimension actually clears its own declared threshold, and whether the
dataset as a whole clears every dimension it was assessed against.
Both are simple, deterministic `>=` comparisons -- no accumulation, no
summation, so (unlike several prior genuine-compute modules in this
package, e.g. `compute/reconciliation/compare.py`'s own `Decimal`
fix) floating-point comparison precision is not a real risk here: a
single `>=` between two already-finite floats is exact IEEE-754
ordering, not an accumulation whose rounding error can compound.

ASSUMES every dimension entry's own `profiled_score`/`threshold` is
already a finite real number in `[0.0, 1.0]` -- validated by the
CALLER (the shared predicates in ``ai_lego/modules/database_data
/data_quality_dimensions.py``, checked by BOTH the builder and the
gate BEFORE this function is ever called), the same "compute layer
assumes well-formed input, method layer validates it" separation
every prior compute module in this package already follows.
"""

from __future__ import annotations

from typing import Any


def evaluate_dimensions(dimensions: list[dict[str, Any]]) -> dict[str, Any]:
    """For each dimension entry, computes ``passes_threshold`` (``profiled_score >= threshold``). Returns
    ``{dimensions, quality_gate_status, quarantined_dimensions}`` where ``dimensions`` is a NEW list of NEW
    dicts (each entry plus its own computed ``passes_threshold``, never mutating or aliasing the caller's own
    input dicts), ``quality_gate_status`` is ``"PASS"`` iff every entry passes, else ``"QUARANTINED"``, and
    ``quarantined_dimensions`` is the (order-preserving) sublist of entries that did not pass -- self-
    contained evidence, not references back into ``dimensions``."""
    assessed = [dict(entry, passes_threshold=entry["profiled_score"] >= entry["threshold"]) for entry in dimensions]
    quarantined = [dict(entry) for entry in assessed if not entry["passes_threshold"]]
    quality_gate_status = "QUARANTINED" if quarantined else "PASS"
    return {"dimensions": assessed, "quality_gate_status": quality_gate_status, "quarantined_dimensions": quarantined}
