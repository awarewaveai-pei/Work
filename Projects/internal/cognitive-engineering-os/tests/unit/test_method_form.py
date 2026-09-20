"""Every ACTIVE method's dashboard form (GET /methods/{id}/form) is derived from its own record
schema, is fully labelled in Chinese, and produces input the REAL builder + gates accept.

Regression class (2026-09-19): the form was built from the Python signature alone -- 5W1H's six
WHO..HOW rows became one raw-JSON box labelled "Dimensions" (browser-translated to 「方面」), and 266
of 285 methods had the same defect. ``serialize_fields`` mirrors dashboard.html ``collectFields``:
change both together.
"""

from __future__ import annotations

import datetime
import unittest
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

from ai_lego import resolve_spec_root
from ai_lego.apps.api.dispatch import invoke_builder, record_id_prefix, resolve_builder, resolve_gate_runner, run_gate_runner
from ai_lego.apps.api.main import get_catalog
from ai_lego.apps.api.method_form import SYSTEM_PARAMS, TYPED_OBJECTS, describe_method_form, load_forms
from ai_lego.core.domain.provenance import make_provenance

SPEC_ROOT = resolve_spec_root()
ROW_PROVENANCE = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")  # dashboard default for a row a person typed
RECORD_PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")  # main.py /invoke default
SAMPLES_PATH = Path(__file__).resolve().parents[1] / "fixtures" / "method_form_samples.yaml"
_MISSING = object()


def _catalog():
    return get_catalog()


def _contract_paths() -> dict[str, str]:
    return {method_id: entry["path"] for method_id, entry in _catalog().contracts.items()}


@lru_cache(maxsize=None)
def method_form(method_id: str) -> dict[str, Any]:
    return describe_method_form(SPEC_ROOT, _contract_paths(), method_id, resolve_builder(method_id), load_forms(SPEC_ROOT))


@lru_cache(maxsize=1)
def _fixture_samples() -> dict[str, Any]:
    return yaml.safe_load(SAMPLES_PATH.read_text(encoding="utf-8")) or {}


def _schema_example(schema_name: str | None) -> dict[str, Any] | None:
    if not schema_name:
        return None
    doc = yaml.safe_load((SPEC_ROOT / TYPED_OBJECTS / schema_name).read_text(encoding="utf-8"))
    for example in doc.get("examples") or []:
        if isinstance(example, dict) and isinstance(example.get("value"), dict):
            return example["value"]
        if isinstance(example, dict):
            return example
    return None


def collect_defs(fields: list[dict[str, Any]], registry: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """def_id -> first expansion, so a ``recursive`` node (tree child) can render its own type again."""
    for field in fields:
        if field.get("def_id"):
            registry.setdefault(field["def_id"], field)
        collect_defs(field.get("fields") or [], registry)
        for option in field.get("options") or []:
            if isinstance(option, dict):
                collect_defs(option.get("fields") or [], registry)
        for row in field.get("rows") or []:
            if isinstance(row, dict):
                collect_defs(row.get("fields") or [], registry)
        if isinstance(field.get("item"), dict):
            collect_defs([field["item"]], registry)
    return registry


def _empty(value: Any) -> bool:
    """Same rule as dashboard.html isEmptyValue: a whitespace-only string is empty too."""
    return value is None or (isinstance(value, str) and not value.strip()) or value == [] or value == {}


def _read(value: Any, dotted: str) -> Any:
    for part in dotted.split("."):
        value = value.get(part, _MISSING) if isinstance(value, dict) else _MISSING
    return value


def serialize_value(field: dict[str, Any], value: Any, defs: dict[str, dict[str, Any]], siblings: dict[str, Any]) -> Any:
    kind = field["kind"]
    if kind == "recursive":
        return serialize_value(defs[field["target"]], value, defs, siblings)
    if kind == "provenance":
        return {**ROW_PROVENANCE, **({"epistemic_type": field["epistemic_type"]} if field.get("epistemic_type") else {})}
    if kind == "const":
        return field["value"]
    if kind == "upstream":
        if isinstance(value, dict):
            return value  # a whole upstream record already in the state (an example, or pasted raw JSON)
        method_id = field.get("method_id") or (field.get("methods") or {}).get(siblings.get(field.get("select_by")))
        return sample_record(method_id)
    if kind == "variant":
        source = value if isinstance(value, dict) else {}
        if field.get("synthetic"):  # no discriminator key on the wire: pick the branch whose required keys are present
            option = next((o for o in field["options"] if all(k in source for k in o["required_keys"])), field["options"][0])
            return serialize_fields(option["fields"], source, defs, option.get("conditions"))
        chosen = source.get(field["discriminator"], field["options"][0]["value"])
        option = next(o for o in field["options"] if o["value"] == chosen)
        return {field["discriminator"]: option["value"], **serialize_fields(option["fields"], source, defs, option.get("conditions"))}
    if kind == "fixed_rows":
        items = value if isinstance(value, list) else []
        sources = []
        for index, row in enumerate(field["rows"]):
            if field.get("row_key"):
                sources.append(next((i for i in items if isinstance(i, dict) and i.get(field["row_key"]) == row["value"]), {}))
            else:
                sources.append(items[index] if index < len(items) and isinstance(items[index], dict) else {})
        # rows past min_rows are optional (PDCA's in-progress cycle stops after DO): send up to the last touched one
        touched = [i for i, (row, source) in enumerate(zip(field["rows"], sources)) if any(not _empty(source.get(f["key"])) for f in row["fields"] if f["kind"] not in ("provenance", "const"))]
        count = max(field.get("min_rows", len(field["rows"])), (touched[-1] + 1) if touched else 0)
        out = []
        for row, source in list(zip(field["rows"], sources))[:count]:
            serialized = serialize_fields(row["fields"], source, defs, row.get("conditions"))
            out.append({field["row_key"]: row["value"], **serialized} if field.get("row_key") else serialized)
        return out
    if kind == "rows":
        return [serialize_value(field["item"], item, defs, {}) for item in (value if isinstance(value, list) else [])]
    if kind == "group":
        return serialize_fields(field["fields"], value if isinstance(value, dict) else {}, defs, field.get("conditions"))
    return value


def serialize_fields(fields: list[dict[str, Any]], value: dict[str, Any], defs: dict[str, dict[str, Any]], conditions: dict[str, Any] | None = None, by_param: bool = False) -> dict[str, Any]:
    """What the dashboard sends for a filled-in form: rendered keys only, empty optional keys omitted
    (never sent as ``""`` -- see method_form.py traps), defaults for untouched fields, and a field the
    schema forbids under the current sibling value (5W1H UNKNOWN -> no ``answer``) dropped. ``by_param``:
    ``value`` is keyed by builder parameter like the dashboard's own state (an example), not a record."""
    out: dict[str, Any] = {}
    for field in fields:
        if field["kind"] == "variant" and field.get("flatten"):
            out.update(serialize_value(field, value, defs, out))
            continue
        raw = value.get(field["key"], _MISSING) if by_param else _read(value, field.get("record_field", field["key"]))
        if raw is _MISSING and "default" in field:
            raw = field["default"]
        if raw is _MISSING and field["kind"] not in ("provenance", "const", "upstream", "fixed_rows", "variant"):
            continue
        if raw is None and field.get("nullable"):
            if field["required"]:
                out[field["key"]] = None  # `X | None` required key: null is the legitimate "not recorded" state
            continue
        serialized = serialize_value(field, None if raw is _MISSING else raw, defs, {**value, **out})
        if _empty(serialized) and not field["required"]:
            continue
        out[field["key"]] = serialized
    for key, rules in (conditions or {}).items():
        if any(rule["mode"] == "forbidden" and out.get(rule["key"]) == rule["equals"] for rule in rules):
            out.pop(key, None)
    return out


def sample_input(method_id: str) -> dict[str, Any]:
    form = method_form(method_id)
    example, fixture = _schema_example(form["record_schema"]), _fixture_samples().get(method_id)
    base = {**(example or {}), **(fixture or {})} if (example or fixture) else None
    if base is None:
        raise AssertionError(f"{method_id}: no schema example and no tests/fixtures/method_form_samples.yaml entry")
    return serialize_fields(form["fields"], base, collect_defs(form["fields"], {}))


def invoke(method_id: str, kwargs: dict[str, Any], record_id: str | None = None) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Same path as main.py /methods/{id}/invoke."""
    builder = resolve_builder(method_id)
    record_id = record_id or f"{record_id_prefix(method_id, required=False) or ''}FORMTEST01"
    injected = {"method_catalog": _catalog()}
    record = invoke_builder(builder, record_id, dict(RECORD_PROVENANCE), kwargs, injected)
    gates = run_gate_runner(resolve_gate_runner(method_id), record, "test.method_form", datetime.datetime.now(datetime.timezone.utc).isoformat(), injected, kwargs)
    return record, gates


@lru_cache(maxsize=None)
def sample_record(method_id: str) -> dict[str, Any]:
    """An upstream record, built through its own form the way the dashboard runs an upstream step
    first. Keeps the example's own id: downstream examples reference its hypothesis ids by it."""
    example = _schema_example(method_form(method_id)["record_schema"]) or {}
    record, _ = invoke(method_id, sample_input(method_id), example.get("id") if isinstance(example.get("id"), str) else None)
    return record


def _walk(fields: list[dict[str, Any]]):
    for field in fields:
        yield field
        yield from _walk(field.get("fields") or [])
        for option in field.get("options") or []:
            if isinstance(option, dict):
                yield from _walk(option.get("fields") or [])
        for row in field.get("rows") or []:
            if isinstance(row, dict):
                yield from _walk(row.get("fields") or [])
        if isinstance(field.get("item"), dict):
            yield from _walk([field["item"]])


def _method_ids() -> list[str]:
    return sorted(_catalog().contracts)


class MethodFormStructureTests(unittest.TestCase):
    def test_every_parameter_of_every_method_renders_as_a_real_field(self):
        """No raw-JSON fallback: a parameter with no schema shape is exactly the 5W1H defect."""
        unrendered = {m: method_form(m)["unrendered"] for m in _method_ids() if method_form(m)["unrendered"]}
        self.assertEqual(unrendered, {})

    def test_system_and_identity_parameters_are_never_form_fields(self):
        """record_id/provenance/version/generated_by_method and the domain identity param (analysis_id...)
        are server-supplied; the operator's form showed 「版本」「生成方法」 as fields to fill."""
        for method_id in _method_ids():
            form = method_form(method_id)
            keys = {field["key"] for field in form["fields"]}
            with self.subTest(method_id=method_id):
                self.assertFalse(keys & SYSTEM_PARAMS)
                if form["identity_param"]:
                    self.assertNotIn(form["identity_param"], keys)

    def test_every_visible_field_and_option_has_a_chinese_label(self):
        missing = {m: method_form(m)["unlabelled"] for m in _method_ids() if method_form(m)["unlabelled"]}
        self.assertEqual(missing, {}, f"{sum(len(v) for v in missing.values())} unlabelled keys; add them to methods/registry/method-input-forms.yaml")

    def test_five_w_one_h_form_is_topic_plus_the_six_fixed_dimensions(self):
        form = method_form("framing.five_w_one_h")
        fields = {field["key"]: field for field in form["fields"]}
        self.assertEqual(list(fields), ["topic", "dimensions", "informs_problem_statement_ref"])
        dimensions = fields["dimensions"]
        self.assertEqual(dimensions["kind"], "fixed_rows")
        self.assertEqual(dimensions["row_key"], "dimension")
        self.assertEqual([row["value"] for row in dimensions["rows"]], ["WHO", "WHAT", "WHEN", "WHERE", "WHY", "HOW"])
        first = {field["key"]: field for field in dimensions["rows"][0]["fields"]}
        self.assertEqual(first["status"]["kind"], "choice")
        self.assertEqual([o["value"] for o in first["status"]["options"]], ["KNOWN", "UNKNOWN"])
        self.assertEqual(first["provenance"]["kind"], "provenance")
        # KNOWN requires answer / forbids gap_note; UNKNOWN forbids answer -- straight from the schema's allOf
        conditions = dimensions["rows"][0]["conditions"]
        self.assertIn({"key": "status", "equals": "UNKNOWN", "mode": "forbidden"}, conditions["answer"])
        self.assertIn({"key": "status", "equals": "KNOWN", "mode": "forbidden"}, conditions["gap_note"])


class MethodFormRoundTripTests(unittest.TestCase):
    def test_every_form_produces_input_the_real_builder_and_gates_accept(self):
        failures: dict[str, str] = {}
        for method_id in _method_ids():
            if method_form(method_id).get("workflow_only"):
                continue
            try:
                _, gates = invoke(method_id, sample_input(method_id))
            except Exception as error:  # noqa: BLE001 -- collect every method's failure, not just the first
                failures[method_id] = f"{type(error).__name__}: {str(error)[:300]}"
                continue
            failed = [gate.get("gate_id") for gate in gates if gate.get("status") not in ("PASS", "NOT_APPLICABLE")]
            if failed:
                failures[method_id] = f"gates failed: {failed}"
        self.assertEqual(failures, {})

    def test_an_unknown_dimension_never_sends_its_answer_even_if_one_was_typed(self):
        """5W1H refuses an UNKNOWN row carrying ``answer`` at all. A person who typed an answer and then
        switched the row to 未知 still has that text in the form state (the field is only hidden), so the
        schema's own allOf rule -- not emptiness -- is what must drop it."""
        form = method_form("framing.five_w_one_h")
        sample = {"topic": "t", "dimensions": [{"dimension": d, "status": "UNKNOWN", "answer": "先前填過的答案"} for d in ("WHO", "WHAT", "WHEN", "WHERE", "WHY", "HOW")]}
        kwargs = serialize_fields(form["fields"], sample, {})
        self.assertTrue(all("answer" not in row for row in kwargs["dimensions"]))
        record, gates = invoke("framing.five_w_one_h", kwargs)
        self.assertEqual(record["information_gaps"], ["WHO", "WHAT", "WHEN", "WHERE", "WHY", "HOW"])
        self.assertTrue(all(g["status"] == "PASS" for g in gates))


if __name__ == "__main__":
    unittest.main()
