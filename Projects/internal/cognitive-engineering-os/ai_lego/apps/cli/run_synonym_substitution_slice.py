"""``art_therapy.synonym_substitution`` vertical slice. Run: ``python -m ai_lego.apps.cli.run_synonym_substitution_slice``."""

from __future__ import annotations

from typing import Any

from ai_lego.apps.cli.method_slice import MethodSliceSpec, main
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.art_therapy.synonym_substitution import METHOD_ID, all_gates_pass, evaluate_synonym_substitution_gates, generate_synonym_substitution

SCHEMA = "ai-lego://specs/cognitive/typed-objects/synonym-substitution-record.schema.yaml"
P = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def fixture_args() -> tuple[tuple[Any, ...], dict[str, Any]]:
    subs = [{"id": "X1", "original_phrase": "我很糟", "replacement_phrase": "我正在學習中", "rationale": "把狀態從固定改成進行式"}, {"id": "X2", "original_phrase": "我一定會失敗", "replacement_phrase": "我還不知道結果", "rationale": "把預言改成事實"}]
    return ("SYNSUB-2026-09-17-001", "自我批評的口頭禪", subs, P), {}


def refuse() -> Any:
    """Replacement identical to the original."""
    return generate_synonym_substitution("SYNSUB-BAD-001", "c", [{"id": "X1", "original_phrase": "我很糟", "replacement_phrase": " 我很糟", "rationale": "r"}], P)


def tamper(record: dict[str, Any]) -> dict[str, Any]:
    record["substitutions"][0]["replacement_phrase"] = record["substitutions"][0]["original_phrase"]
    return record


SPEC = MethodSliceSpec(
    method_id=METHOD_ID,
    schema_uri=SCHEMA,
    builder=generate_synonym_substitution,
    gates=evaluate_synonym_substitution_gates,
    all_gates_pass=all_gates_pass,
    fixture_args=fixture_args,
    refuse=refuse,
    tamper=tamper,
    record_key="synonym_substitution",
    summary=lambda r: f"{len(r['substitutions'])} substitutions,",
)

if __name__ == "__main__":
    raise SystemExit(main(SPEC))
