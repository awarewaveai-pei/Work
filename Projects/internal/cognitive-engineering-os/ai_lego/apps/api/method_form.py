"""Method input form, derived from the method's own typed-object record schema.

The builder signature only says WHICH parameters exist; the record schema
(``specs/cognitive/typed-objects/``) says what each one IS -- enums, fixed positional rows
(``prefixItems``), row sub-fields, variants, recursive trees, conditional requirements. Rendering
from the signature alone turned 5W1H's six WHO..HOW rows into one raw-JSON box labelled
"Dimensions" (2026-09-19); every structured parameter of every method had the same defect. Labels
and the few structural overrides come from ``methods/registry/method-input-forms.yaml`` (method
path > method key > glossary).

Traps:
- A builder parameter's schema property is the RECORD field of the same name: the builder copies
  it in. Fields the builder computes are record-only and must never be rendered as inputs -- the
  builder refuses them. Detected from the schema's own ``COMPUTED``/``GENUINE_COMPUTE`` wording,
  plus ``_computed`` overrides in the labels file for the few schemas that do not say so.
- An optional key must be OMITTED when empty, never sent as ``""`` (dashboard serializer): several
  builders treat a present-but-empty key as a violation (5W1H: an UNKNOWN row must not carry
  ``answer`` at all).
- ``tests/unit/test_method_form.py`` pushes every schema's own example through this form and runs
  the real builder + gates on the result; that is what keeps this module honest.
"""

from __future__ import annotations

import inspect
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

from ai_lego.apps.api.dispatch import self_id_param

SYSTEM_PARAMS = frozenset({"record_id", "provenance", "version", "generated_by_method"})
# Live server objects, never user input: the API passes them in by name (main.py SERVER_INJECTED).
SERVER_INJECTED_PARAMS = frozenset({"method_catalog"})
TYPED_OBJECTS = Path("specs") / "cognitive" / "typed-objects"
_SCHEMA_REF = re.compile(r"specs/cognitive/typed-objects/([A-Za-z0-9_.-]+\.schema\.yaml)")
# Schema descriptions also mention GENUINE_COMPUTE about OTHER fields ("change_classifications below
# is GENUINE_COMPUTE", "never GENUINE_COMPUTE"), so only a description that OPENS with the marker, or
# states the field itself is never an input, counts. Misses are fixed with `_computed` / `_inputs`
# in the labels file; the example-projection test is what proves the result.
_COMPUTED_PREFIXES = ("COMPUTED", "GENUINE_COMPUTE --", "GENUINE_COMPUTE,", "GENUINE_COMPUTE:", "GENUINE COMPUTE")
_COMPUTED_PHRASES = ("never caller-supplied", "NEVER caller-supplied", "Never a constructor input", "never a builder parameter", "NEVER a builder parameter", "NEVER an accepted builder parameter")
_PROVENANCE_KEYS = frozenset({"epistemic_type", "authorship_state"})
_MAX_DEPTH = 8


def _load_yaml(path: Path) -> Any:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=4)
def _schema_indexes(spec_root: str) -> tuple[dict[str, str], dict[str, str]]:
    """(normalized title -> filename, generated_by_method default -> filename)."""
    by_title: dict[str, str] = {}
    by_method: dict[str, str] = {}
    for path in sorted(Path(spec_root, TYPED_OBJECTS).glob("*.schema.yaml")):
        try:
            doc = _load_yaml(path)
        except yaml.YAMLError:
            continue
        if not isinstance(doc, dict):
            continue
        if isinstance(doc.get("title"), str):
            by_title[re.sub(r"[^a-z0-9]", "", doc["title"].lower())] = path.name
        generated = (doc.get("properties") or {}).get("generated_by_method")
        if isinstance(generated, dict):
            for key in ("default", "const"):
                if isinstance(generated.get(key), str):
                    by_method.setdefault(generated[key], path.name)
    return by_title, by_method


def record_schema_name(spec_root: Path, method_id: str, contract: dict[str, Any], contract_text: str) -> str | None:
    """Typed-object schema filename of a method's output record. Order: exact title match on the
    contract's ``outputs`` name, then the schema whose ``generated_by_method`` default is this
    method, then a typed-object path the contract cites (contracts also cite SIBLING schemas as
    conventions, so a cited path is only the last resort)."""
    by_title, by_method = _schema_indexes(str(spec_root))
    for output in contract.get("outputs") or []:
        key = re.sub(r"[^a-z0-9]", "", str(output).lower())
        if key in by_title:
            return by_title[key]
    if method_id in by_method:
        return by_method[method_id]
    cited = _SCHEMA_REF.findall(contract_text)
    return cited[0] if cited else None


def _pointer(document: Any, pointer: str) -> Any:
    node = document
    for part in [p for p in pointer.split("/") if p]:
        part = part.replace("~1", "/").replace("~0", "~")
        if not isinstance(node, dict) or part not in node:
            return None
        node = node[part]
    return node


def _non_null_type(prop: dict[str, Any]) -> str | None:
    kind = prop.get("type")
    if isinstance(kind, list):
        kinds = [k for k in kind if k != "null"]
        return kinds[0] if len(kinds) == 1 else None
    if isinstance(kind, str):
        return kind
    if "enum" in prop or "const" in prop:
        return "string"
    if "properties" in prop:
        return "object"
    if "items" in prop or "prefixItems" in prop:
        return "array"
    return None


def _is_computed(prop: dict[str, Any]) -> bool:
    description = " ".join(str(prop.get("description") or "").split())
    if description.startswith(_COMPUTED_PREFIXES) or any(phrase in description for phrase in _COMPUTED_PHRASES):
        return True
    enum = prop.get("enum")
    # single-legal-value enum with a default = the builder stamps it (random_stimulus.feasibility_status)
    return isinstance(enum, list) and len(enum) == 1 and "default" in prop


def _is_provenance(key: str, prop: dict[str, Any], external_ref: str | None) -> bool:
    if external_ref and "provenance_record" in external_ref:
        return True
    properties = prop.get("properties")
    return isinstance(properties, dict) and _PROVENANCE_KEYS <= set(properties) and "provenance" in key


def _conditions(prop: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    """``allOf: [{if: {properties: {K: {const: V}}}, then: {required: [...], not: {required: [...]}}}]``
    -> per sub-field ``[{"key": K, "equals": V, "mode": "required"|"forbidden"}]``. Other shapes are
    left to the builder, which enforces them regardless."""
    rules: dict[str, list[dict[str, Any]]] = {}
    for member in prop.get("allOf") or []:
        if not isinstance(member, dict) or not isinstance(member.get("if"), dict) or not isinstance(member.get("then"), dict):
            continue
        condition = member["if"].get("properties") or {}
        if len(condition) != 1:
            continue
        ((key, test),) = condition.items()
        if not isinstance(test, dict) or "const" not in test:
            continue
        then = member["then"]
        for name in then.get("required") or []:
            rules.setdefault(name, []).append({"key": key, "equals": test["const"], "mode": "required"})
        negated = then.get("not")
        forbidden: list[str] = []
        if isinstance(negated, dict):
            forbidden.extend(negated.get("required") or [])
            for branch in negated.get("anyOf") or []:
                if isinstance(branch, dict):
                    forbidden.extend(branch.get("required") or [])
        for name in forbidden:
            rules.setdefault(name, []).append({"key": key, "equals": test["const"], "mode": "forbidden"})
    return rules


class FormBuilder:
    def __init__(self, spec_root: Path, method_id: str, labels: dict[str, Any]) -> None:
        self.spec_root = spec_root
        self.method_id = method_id
        method_labels = (labels.get("methods") or {}).get(method_id)
        self.method_labels: dict[str, Any] = method_labels if isinstance(method_labels, dict) else {}
        self.glossary: dict[str, Any] = labels.get("glossary") or {}
        self.enum_glossary: dict[str, Any] = labels.get("enum_labels") or {}
        computed = self.method_labels.get("_computed") or []
        self.computed_paths = {str(p) for p in computed} if isinstance(computed, list) else set()
        inputs = self.method_labels.get("_inputs") or []
        self.input_paths = {str(p) for p in inputs} if isinstance(inputs, list) else set()
        self.unlabelled: list[str] = []
        self._external: dict[str, Any] = {}
        self._stack: list[tuple[int, str]] = []

    # -- refs ----------------------------------------------------------------------------------------
    def _external_doc(self, relative: str) -> Any:
        if relative not in self._external:
            path = self.spec_root / relative
            self._external[relative] = _load_yaml(path) if path.is_file() else None
        return self._external[relative]

    def _deref(self, prop: dict[str, Any], doc: Any) -> tuple[Any, Any, str | None, str | None]:
        """One ``$ref`` hop -> (target merged with siblings, doc, external ref, local def name)."""
        ref = str(prop["$ref"])
        siblings = {k: v for k, v in prop.items() if k != "$ref"}
        if ref.startswith("#"):
            target = _pointer(doc, ref[1:])
            local = ref.split("/")[-1] if ref.startswith("#/$defs/") else None
            return {**(target if isinstance(target, dict) else {}), **siblings}, doc, None, local
        if ref.startswith("ai-lego://"):
            relative, _, fragment = ref[len("ai-lego://"):].partition("#")
            ext = self._external_doc(relative)
            target = _pointer(ext, fragment) if fragment else ext
            return {**(target if isinstance(target, dict) else {}), **siblings}, ext, ref, None
        return siblings, doc, None, None

    def _flatten(self, prop: Any, doc: Any) -> tuple[dict[str, Any], Any, str | None, list[str]]:
        """Follow refs and merge ``allOf`` members. Returns the local ``$defs`` names crossed so the
        caller can detect recursion (a tree node whose children are the same node type)."""
        external_ref: str | None = None
        crossed: list[str] = []
        for _ in range(16):
            if not isinstance(prop, dict):
                return {}, doc, external_ref, crossed
            if "$ref" in prop:
                prop, doc, ext, local = self._deref(prop, doc)
                external_ref = ext or external_ref
                if local:
                    crossed.append(local)
                continue
            members = prop.get("allOf")
            if isinstance(members, list) and all(isinstance(m, dict) and ("$ref" in m or "properties" in m or "required" in m) for m in members) and not any("if" in m for m in members):
                merged: dict[str, Any] = {k: v for k, v in prop.items() if k != "allOf"}
                for member in members:
                    resolved, doc, ext, names = self._flatten(member, doc)
                    external_ref = ext or external_ref
                    crossed.extend(names)
                    for key, value in resolved.items():
                        if key == "properties" and isinstance(value, dict):
                            base = dict(merged.get("properties") or {})
                            for name, sub in value.items():
                                base[name] = {**base[name], **sub} if isinstance(sub, dict) and isinstance(base.get(name), dict) else sub
                            merged["properties"] = base
                        elif key == "required" and isinstance(value, list):
                            merged["required"] = list(dict.fromkeys([*(merged.get("required") or []), *value]))
                        elif key not in merged:
                            merged[key] = value
                prop = merged
                continue
            return prop, doc, external_ref, crossed
        return prop if isinstance(prop, dict) else {}, doc, external_ref, crossed

    # -- labels ----------------------------------------------------------------------------------------
    def _label(self, path: str, key: str) -> tuple[str | None, str | None]:
        for entry in (self.method_labels.get(path), self.method_labels.get(key), self.glossary.get(key)):
            if isinstance(entry, str):
                return entry, None
            if isinstance(entry, dict) and isinstance(entry.get("label"), str):
                hint = entry.get("hint")
                return entry["label"], hint if isinstance(hint, str) else None
        self.unlabelled.append(path)
        return None, None

    def _option_label(self, path: str, key: str, value: Any) -> str | None:
        for table in (self.method_labels.get(f"{path}="), self.method_labels.get(f"{key}=")):
            if isinstance(table, dict) and value in table:
                return str(table[value])
        if isinstance(value, str) and value in self.enum_glossary:
            return str(self.enum_glossary[value])
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return None  # a number (box 1-8, traffic 25%) is shown as itself
        self.unlabelled.append(f"{path}={value}")
        return None

    def _options(self, path: str, key: str, values: list[Any]) -> list[dict[str, Any]]:
        return [{"value": value, "label": self._option_label(path, key, value)} for value in values]

    # -- schema -> node ------------------------------------------------------------------------------
    def node(self, key: str, prop: Any, doc: Any, path: str, required: bool, depth: int = 0) -> dict[str, Any] | None:
        if path in self.computed_paths or key in self.computed_paths:
            return None
        flat, doc, external_ref, crossed = self._flatten(prop, doc)
        # a builder parameter is an input by definition; only nested record fields can be computed
        if depth > 0 and path not in self.input_paths and _is_computed(flat):
            return None
        if _is_provenance(key, flat, external_ref):
            node: dict[str, Any] = {"key": key, "kind": "provenance", "required": required}
            pinned = ((flat.get("properties") or {}).get("epistemic_type") or {})
            if isinstance(pinned, dict) and "const" in pinned:
                # assumption.schema.yaml pins entry provenance to ASSUMPTION; the default must honour it
                node["epistemic_type"] = pinned["const"]
            return node
        recursion = next((name for name in crossed if (id(doc), name) in self._stack), None)
        label, hint = self._label(path, key)
        base: dict[str, Any] = {"key": key, "label": label, "hint": hint, "required": required}
        if key.endswith("_ref") or key.endswith("_refs"):
            base["advanced"] = True
        if "default" in flat and isinstance(flat["default"], (str, int, float, bool)):
            base["default"] = flat["default"]
        if recursion is not None:
            return {**base, "kind": "recursive", "target": recursion}
        if depth > _MAX_DEPTH:
            return {**base, "kind": "json"}
        pushed = [(id(doc), name) for name in crossed]
        self._stack.extend(pushed)
        try:
            result = self._node_body(base, key, flat, doc, path, depth)
        finally:
            for _ in pushed:
                self._stack.pop()
        if crossed and result.get("kind") in ("variant", "group"):
            result["def_id"] = crossed[-1]
        return result

    def _node_body(self, base: dict[str, Any], key: str, prop: dict[str, Any], doc: Any, path: str, depth: int) -> dict[str, Any]:
        nullable = [b for b in (prop.get("oneOf") or prop.get("anyOf") or []) if not (isinstance(b, dict) and b.get("type") == "null")]
        if (prop.get("oneOf") or prop.get("anyOf")) and len(nullable) == 1:
            # `X | None` spelled as oneOf [null, X]: the form omits an empty optional key, which is the null case
            inner, doc, _, _ = self._flatten(nullable[0], doc)
            return self._node_body({**base, "nullable": True}, key, {**{k: v for k, v in prop.items() if k not in ("oneOf", "anyOf")}, **inner}, doc, path, depth)
        if isinstance(prop.get("type"), list) and "null" in prop["type"]:
            base = {**base, "nullable": True}
        variants = self._variants(prop, doc, path, depth)
        if variants is not None:
            return {**base, **variants}
        kind = _non_null_type(prop)
        if "const" in prop:
            return {**base, "kind": "const", "value": prop["const"]}
        if kind in ("string", "number", "integer") and isinstance(prop.get("enum"), list):
            return {**base, "kind": "choice", "options": self._options(path, key, prop["enum"])}
        if kind == "string":
            node = {**base, "kind": "text"}
            if isinstance(prop.get("format"), str):
                node["format"] = prop["format"]
            return node
        if kind in ("number", "integer"):
            node = {**base, "kind": "number", "integer": kind == "integer"}
            for source, target in (("minimum", "min"), ("maximum", "max"), ("exclusiveMinimum", "exclusive_min"), ("exclusiveMaximum", "exclusive_max")):
                value = prop.get(source)
                if isinstance(value, (int, float)) and not isinstance(value, bool):
                    node[target] = value
            return node
        if kind == "boolean":
            return {**base, "kind": "bool"}
        if kind == "array":
            return self._array(base, key, prop, doc, path, depth)
        if kind == "object":
            return self._object(base, prop, doc, path, depth)
        return {**base, "kind": "json"}

    def _variants(self, prop: dict[str, Any], doc: Any, path: str, depth: int) -> dict[str, Any] | None:
        """``oneOf``/``anyOf`` of object shapes told apart by one ``const`` property (decision-tree
        ``node_type``, Monte Carlo ``distribution_type``) -> a discriminator choice + per-variant fields."""
        branches = prop.get("oneOf") or prop.get("anyOf")
        if not isinstance(branches, list) or len(branches) < 2:
            return None
        flats = []
        for branch in branches:
            flat, branch_doc, _, crossed = self._flatten(branch, doc)
            if not isinstance(flat.get("properties"), dict):
                return None
            flats.append((flat, branch_doc, crossed))
        common = set.intersection(*(set(f[0]["properties"]) for f in flats))
        discriminator = next(
            (name for name in sorted(common) if all(isinstance(f[0]["properties"][name], dict) and "const" in f[0]["properties"][name] for f in flats)),
            None,
        )
        if discriminator is None and not all(f[2] for f in flats):
            return None
        options = []
        for flat, branch_doc, crossed in flats:
            # no shared const (attack tree: internal vs leaf node told apart by which keys exist):
            # the branch's own $defs name is the choice; nothing is sent for it (``synthetic``)
            value = flat["properties"][discriminator]["const"] if discriminator else crossed[-1]
            pushed = [(id(branch_doc), name) for name in crossed]
            self._stack.extend(pushed)
            try:
                fields = self._fields(flat, branch_doc, path, depth, skip={discriminator} if discriminator else set())
            finally:
                for _ in pushed:
                    self._stack.pop()
            label = self._option_label(f"{path}.{discriminator or '_variant'}", discriminator or "_variant", value)
            options.append({"value": value, "label": label, "fields": fields, "conditions": _conditions(flat), "required_keys": sorted(flat.get("required") or [])})
        return {"kind": "variant", "discriminator": discriminator, "synthetic": discriminator is None, "options": options}

    def _array(self, base: dict[str, Any], key: str, prop: dict[str, Any], doc: Any, path: str, depth: int) -> dict[str, Any]:
        bounds = {k: prop[k] for k in ("minItems", "maxItems") if isinstance(prop.get(k), int)}
        prefix = prop.get("prefixItems")
        if isinstance(prefix, list) and prefix:
            resolved = [self._flatten(item, doc) for item in prefix]
            if all(_non_null_type(r[0]) in ("string", "number", "integer") and "const" not in r[0] for r in resolved):
                first = _non_null_type(resolved[0][0])
                return {**base, "kind": "list", "item_kind": "text" if first == "string" else "number", "integer": first == "integer", "minItems": len(prefix), "maxItems": len(prefix)}
            row_key = None
            first_props = resolved[0][0].get("properties") or {}
            for name in first_props:
                if all(isinstance((r[0].get("properties") or {}).get(name), dict) and "const" in r[0]["properties"][name] for r in resolved):
                    row_key = name
                    break
            rows = []
            for index, (flat, row_doc, _, crossed) in enumerate(resolved):
                value = flat["properties"][row_key]["const"] if row_key else index
                pushed = [(id(row_doc), name) for name in crossed]
                self._stack.extend(pushed)
                try:
                    fields = self._fields(flat, row_doc, path, depth, skip={row_key} if row_key else set())
                finally:
                    for _ in pushed:
                        self._stack.pop()
                label = self._option_label(f"{path}.{row_key}", row_key, value) if row_key else None
                rows.append({"value": value, "label": label, "fields": fields, "conditions": _conditions(flat)})
            min_rows = prop["minItems"] if isinstance(prop.get("minItems"), int) and prop["minItems"] < len(rows) else len(rows)
            return {**base, "kind": "fixed_rows", "row_key": row_key, "rows": rows, "min_rows": min_rows}
        items = prop.get("items")
        if not isinstance(items, dict):
            return {**base, "kind": "json"}
        flat, item_doc, external_ref, crossed = self._flatten(items, doc)
        if _is_provenance(key, flat, external_ref):
            return {**base, "kind": "json"}
        variants_or_recursion = (flat.get("oneOf") or flat.get("anyOf")) is not None or any((id(item_doc), name) in self._stack for name in crossed)
        item_kind = _non_null_type(flat)
        if variants_or_recursion or item_kind == "object" or (isinstance(flat.get("properties"), dict) and flat["properties"]):
            item = self.node(key, items, doc, path, True, depth)
            if item is None or item["kind"] not in ("group", "variant", "recursive"):
                return {**base, "kind": "json"}
            return {**base, "kind": "rows", "item": {k: v for k, v in item.items() if k not in ("key", "label", "hint", "required", "advanced", "default")}, **bounds}
        if item_kind in ("string", "number", "integer") and isinstance(flat.get("enum"), list):
            return {**base, "kind": "multi_choice", "options": self._options(path, key, flat["enum"]), **bounds}
        if item_kind in ("string", "number", "integer"):
            return {**base, "kind": "list", "item_kind": "text" if item_kind == "string" else "number", "integer": item_kind == "integer", **bounds}
        return {**base, "kind": "json"}

    def _object(self, base: dict[str, Any], prop: dict[str, Any], doc: Any, path: str, depth: int) -> dict[str, Any]:
        properties = prop.get("properties")
        if isinstance(properties, dict) and properties:
            return {**base, "kind": "group", "fields": self._fields(prop, doc, path, depth), "conditions": _conditions(prop)}
        additional = prop.get("additionalProperties")
        if isinstance(additional, dict):
            value, _, _, _ = self._flatten(additional, doc)
            value_kind = _non_null_type(value)
            if value_kind in ("string", "number", "integer"):
                return {**base, "kind": "map", "value_kind": "text" if value_kind == "string" else "number"}
        if not base["required"] and "additionalProperties" not in prop:
            # schema says "left as an open object" (representation views' layout/filters): optional
            # free-form state, not method content -- raw JSON under the advanced toggle is its honest shape
            return {**base, "kind": "json", "open_object": True, "advanced": True}
        return {**base, "kind": "json"}

    def _fields(self, prop: dict[str, Any], doc: Any, path: str, depth: int, skip: set[str] | frozenset[str] = frozenset()) -> list[dict[str, Any]]:
        required = set(prop.get("required") or [])
        fields = []
        for name, sub in (prop.get("properties") or {}).items():
            if name in skip:
                continue
            node = self.node(name, sub, doc, f"{path}.{name}", name in required, depth + 1)
            if node is not None:
                fields.append(node)
        return fields


def _nested_record_field(form: FormBuilder, properties: dict[str, Any], doc: Any, name: str) -> tuple[Any, str]:
    """A builder that nests its inputs one level down in the record (problem_statement stores
    ``current_state`` under ``content``): find the single object property that holds ``name``."""
    hits = []
    for parent, prop in properties.items():
        flat, _, _, _ = form._flatten(prop, doc)
        if isinstance(flat.get("properties"), dict) and name in flat["properties"]:
            hits.append((flat["properties"][name], f"{parent}.{name}"))
    return hits[0] if len(hits) == 1 else (None, name)


def _reference_variant(form: FormBuilder, spec_root: Path, spec: dict[str, Any]) -> tuple[dict[str, Any], set[str]]:
    """Choice among a reference-data catalog's entries (reporting guidelines), each option carrying
    that entry's constants and its official items as fixed rows -- the user fills only the drafted
    content, never retypes official wording the builder compares verbatim. ``flatten``: the chosen
    option's fields are top-level builder parameters, not a nested object."""
    catalog = _load_yaml(spec_root / spec["file"]) or {}
    collection = catalog.get(spec["collection"]) or {}
    rows_spec = spec["rows"]
    row_fields_schema = {"type": "object", "properties": rows_spec.get("fields") or {}, "required": list(rows_spec.get("fields") or {})}
    options = []
    for value, entry in collection.items():
        option_fields: list[dict[str, Any]] = [
            {"key": param, "kind": "const", "value": str(entry.get(source, "")).strip(), "required": True} for param, source in (spec.get("constants") or {}).items()
        ]
        rows = []
        for item in entry.get(rows_spec["source"]) or []:
            constants = [{"key": key, "kind": "const", "value": str(item.get(source, "")).strip(), "required": True} for key, source in (rows_spec.get("constants") or {}).items()]
            editable = form._fields(row_fields_schema, None, rows_spec["param"], 0)
            rows.append({"value": item[rows_spec["row_key"]], "label": str(item.get(rows_spec.get("row_label", ""), "")).strip() or None, "fields": [*constants, *editable], "conditions": {}})
        option_fields.append({"key": rows_spec["param"], "kind": "fixed_rows", "row_key": rows_spec["row_key"], "rows": rows, "label": form._label(rows_spec["param"], rows_spec["param"])[0], "hint": None, "required": True})
        options.append({"value": value, "label": str(entry.get(spec.get("option_label", ""), "")).strip() or None, "fields": option_fields, "conditions": {}})
    label, hint = form._label(spec["discriminator"], spec["discriminator"])
    node = {"key": spec["discriminator"], "label": label, "hint": hint, "required": True, "kind": "variant", "flatten": True, "discriminator": spec["discriminator"], "options": options}
    return node, {spec["discriminator"], rows_spec["param"], *(spec.get("constants") or {})}


def _norm(name: Any) -> str:
    return re.sub(r"[^a-z0-9]", "", str(name).lower())


def output_producers(contracts: dict[str, dict[str, Any]]) -> dict[str, list[str]]:
    """normalized output type name -> method ids whose contract declares it in ``outputs``."""
    producers: dict[str, list[str]] = {}
    for method_id, contract in sorted(contracts.items()):
        for output in contract.get("outputs") or []:
            producers.setdefault(_norm(output), []).append(method_id)
    return producers


def _upstream_method(name: str, contract: dict[str, Any], producers: dict[str, list[str]]) -> str | None:
    """A parameter that IS a whole upstream record (fishbone's ``problem_statement``): its name
    matches one of the contract's declared input types, produced by exactly one method."""
    inputs = contract.get("inputs") or {}
    declared = [*(inputs.get("required") or []), *(inputs.get("optional") or [])] if isinstance(inputs, dict) else []
    if _norm(name) not in {_norm(t) for t in declared}:
        return None
    candidates = producers.get(_norm(name)) or []
    return candidates[0] if len(candidates) == 1 else None


def build_method_form(
    spec_root: Path,
    method_id: str,
    builder: Any,
    contract: dict[str, Any],
    contract_text: str,
    forms: dict[str, Any],
    producers: dict[str, list[str]],
) -> dict[str, Any]:
    """Field tree for ``builder``'s user-facing parameters. ``unrendered`` lists parameters with no
    shape to render (raw-JSON fallback); ``unlabelled`` lists label keys missing from
    method-input-forms.yaml. Both are empty for a finished method -- the test suite checks."""
    form = FormBuilder(spec_root, method_id, forms)
    schema_name = record_schema_name(spec_root, method_id, contract, contract_text)
    schema_path = spec_root / TYPED_OBJECTS / schema_name if schema_name else None
    doc = _load_yaml(schema_path) if schema_path is not None and schema_path.is_file() else None
    properties = (doc or {}).get("properties") or {}
    workflow_only = form.method_labels.get("_workflow_only")
    if isinstance(workflow_only, str):
        # recipe-internal step (its inputs are other steps' outputs, e.g. coder reviews): a hand form would be fake
        return {"fields": [], "identity_param": None, "record_schema": schema_name, "workflow_only": workflow_only, "unrendered": [], "unlabelled": []}
    param_overrides = form.method_labels.get("_params") if isinstance(form.method_labels.get("_params"), dict) else {}
    identity = self_id_param(builder)
    fields: list[dict[str, Any]] = []
    unrendered: list[str] = []
    covered: set[str] = set()
    reference = form.method_labels.get("_reference_variant")
    if isinstance(reference, dict):
        node, covered = _reference_variant(form, spec_root, reference)
        fields.append(node)
    for name, parameter in inspect.signature(builder).parameters.items():
        if name in SYSTEM_PARAMS or name in SERVER_INJECTED_PARAMS or name == identity or name in covered:
            continue
        required = parameter.default is inspect.Parameter.empty
        override = param_overrides.get(name) if isinstance(param_overrides.get(name), dict) else {}
        upstream = override.get("upstream") if isinstance(override.get("upstream"), (str, dict)) else None
        if upstream is None and name not in properties and not isinstance(override.get("schema"), dict):
            upstream = _upstream_method(name, contract, producers)
        if upstream is not None:
            label, hint = form._label(name, name)
            node: dict[str, Any] = {"key": name, "label": label, "hint": hint, "required": required, "kind": "upstream"}
            if isinstance(upstream, str):
                node["method_id"] = upstream
            else:  # {select_by: <sibling param>, methods: {<value>: <method_id>}}
                node["select_by"] = upstream.get("select_by")
                node["methods"] = upstream.get("methods")
            fields.append(node)
            continue
        record_field = override.get("record_field", name)
        if record_field not in properties and name.endswith("_") and name[:-1] in properties:
            record_field = name[:-1]  # Python keyword/shadowing convention: `fidelity_` param -> `fidelity` field
        prop = override.get("schema") if isinstance(override.get("schema"), dict) else properties.get(record_field)
        if prop is None and not isinstance(override.get("schema"), dict):
            prop, record_field = _nested_record_field(form, properties, doc, record_field)
        if prop is None:
            label, hint = form._label(name, name)
            fields.append({"key": name, "label": label, "hint": hint, "required": required, "kind": "json"})
            unrendered.append(name)
            continue
        node = form.node(name, prop, doc, name, required)
        if node is None:
            unrendered.append(name)
            continue
        if node["kind"] == "json" and not node.get("open_object"):
            unrendered.append(name)
        if record_field != name:
            node["record_field"] = record_field
        fields.append(node)
    return {
        "fields": fields,
        "identity_param": identity,
        "record_schema": schema_name,
        "unrendered": unrendered,
        "unlabelled": sorted(set(form.unlabelled)),
    }


FORMS_RELATIVE_PATH = Path("methods") / "registry" / "method-input-forms.yaml"
EXAMPLES_RELATIVE_PATH = Path("methods") / "registry" / "method-form-examples.yaml"


@lru_cache(maxsize=8)
def _cached_registry(path_string: str, mtime_ns: int) -> dict[str, Any]:
    """Keyed on mtime rather than read-once: a copy edit still takes effect with no restart, but the
    134 KB examples file is not re-parsed on every dashboard click."""
    try:
        document = _load_yaml(Path(path_string))
    except yaml.YAMLError:
        return {}
    return document if isinstance(document, dict) else {}


def _registry(spec_root: Path, relative: Path) -> dict[str, Any]:
    """A missing or malformed registry degrades to an empty one, never a 500 on the discovery routes."""
    path = spec_root / relative
    try:
        stamp = path.stat().st_mtime_ns
    except OSError:
        return {}
    return _cached_registry(str(path), stamp)


def load_forms(spec_root: Path) -> dict[str, Any]:
    """Labels and the few structural overrides for the form tree."""
    return _registry(spec_root, FORMS_RELATIVE_PATH)


def load_examples(spec_root: Path) -> dict[str, Any]:
    """method_id -> {scenario, input}: the filled-in example behind the dashboard's one-click button.
    Parameter-keyed like /invoke's body, so it can be dropped straight into the form state."""
    examples = _registry(spec_root, EXAMPLES_RELATIVE_PATH).get("examples")
    return examples if isinstance(examples, dict) else {}


@lru_cache(maxsize=4)
def _contracts(spec_root: str, paths: tuple[tuple[str, str], ...]) -> dict[str, tuple[dict[str, Any], str]]:
    """method_id -> (parsed contract, raw text). Keyed on the catalog's own (id, path) tuple, so a
    catalog built from a different spec root never reuses another root's contracts."""
    loaded: dict[str, tuple[dict[str, Any], str]] = {}
    for method_id, relative in paths:
        path = Path(relative) if Path(relative).is_absolute() else Path(spec_root) / relative
        text = path.read_text(encoding="utf-8")
        parsed = yaml.safe_load(text)
        loaded[method_id] = (parsed if isinstance(parsed, dict) else {}, text)
    return loaded


def describe_method_form(spec_root: Path, contract_paths: dict[str, str], method_id: str, builder: Any, forms: dict[str, Any]) -> dict[str, Any]:
    """The /methods/{id}/form field tree for one method (``contract_paths``: method_id -> contract path)."""
    contracts = _contracts(str(spec_root), tuple(sorted(contract_paths.items())))
    contract, contract_text = contracts[method_id]
    producers = output_producers({mid: parsed for mid, (parsed, _) in contracts.items()})
    form = build_method_form(spec_root, method_id, builder, contract, contract_text, forms, producers)
    example = load_examples(spec_root).get(method_id)
    if isinstance(example, dict) and isinstance(example.get("input"), dict):
        form["example"] = example
    return form
