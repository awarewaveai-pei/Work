#!/usr/bin/env python3
"""
Typed-object schema `examples:` vs. real gates check (golden-test check family 7).

The gap this closes: every ``specs/cognitive/typed-objects/*.schema.yaml`` file
carries its own ``examples:`` block (a JSON-Schema-level list of
``{description, value}`` worked examples used for human documentation), but
until this file existed, NOTHING ever ran those examples through
``jsonschema`` -- let alone through the ``ai_lego`` module that actually
produces and gates that record type. They were correctness claims a human (or
a critic subagent) had to hand-verify by reading the schema and the module
side by side; nothing caught a drift between them automatically. The runtime
half of that gap matters more than the schema half: several
``evaluate_*_gates`` functions (e.g.
``ai_lego/modules/database_data/reconciliation.py``'s
``evaluate_reconciliation_integrity_gate``) RECOMPUTE a derived value from the
record's own raw fields and compare it against the value the record claims --
a schema-only check cannot see that kind of internal-consistency bug at all,
only the real gate can.

Two independent checks per example, run in this order:

  1. Schema conformance -- ``example["value"]`` validates against the schema
     file's own root shape (same ``jsonschema.Draft202012Validator`` +
     cross-file ``ai-lego://`` registry machinery as
     ``tests/run_golden_tests.py`` check family 1, duplicated here rather than
     imported so this file stays independently runnable -- same precedent
     ``tests/architecture/search_content_pack_check.py`` already set for its
     own ``UniqueKeyLoader`` copy).
  2. Real-gate conformance -- for every typed-object schema whose producing
     ``ai_lego/modules/**/*.py`` module exposes a matching
     ``evaluate_*_gates(record, validator, timestamp) -> list[dict]`` function
     and an ``all_gates_pass(gate_results) -> bool`` helper (see
     ``_build_gate_index`` below for exactly how "matching" is decided), the
     SAME real function the runtime calls is imported and run against the
     example, and ``all_gates_pass`` must return True. A schema-valid example
     that fails its own real gate is reported as a failure, not silently
     accepted.

Schema-to-module resolution (``_build_gate_index``): every module function
that BUILDS a typed object carries a docstring citation of the exact form
``Instance of ``typed-objects/<slug>.schema.yaml``` (verified by grep across
all 41 schemas before writing this file -- every one has exactly one such
citation, in exactly one module file). For the 38 schemas whose citing file
builds only that one typed object, the file's lone ``evaluate_*_gates``
function is used directly. One file, ``ai_lego/modules/root_cause/fishbone.py``,
builds three typed objects (``problem-statement``, ``cause-hypothesis-set``,
``root-cause-fact``) but defines exactly one gate function,
``evaluate_fishbone_gates(cause_hypothesis_set, ...)`` -- by design (Atlas
Section 11.4 / Section 9 forbidden_transition: Fishbone the METHOD only ever
produces and gates a CauseHypothesisSet; ProblemStatement is its precondition
input and RootCauseFact is a separately-gated downstream promotion).
Attributing that one function to all three would silently misfire on the
other two. This file disambiguates by matching the gate function's own first
PARAMETER name against the schema slug (``cause_hypothesis_set`` ->
``cause-hypothesis-set``, an exact match); ``problem-statement``/
``root-cause-fact`` have no match and correctly fall back to schema-only
checking (check 1 above still runs on them) -- see ``EXPECTED_SCHEMA_ONLY_SLUGS``
for the hard floor that keeps that fallback from silently swallowing a THIRD,
unintended schema.

2026-09-06 critic mutation-testing review (agency-os/WORKLOG.md, same date)
found and fixed several ways this file's own detector could go quiet without
a visible failure: a bare ">0" coverage-count guard (proven by mutation to
tolerate coverage collapsing from 39 gate-checked schemas to 1 with zero
reported failures -- replaced with the exact-set assertion in ``run()``); a
source-text regex for gate-function discovery (proven to miss a reformatted,
multi-line signature -- replaced with ``inspect`` over the actually-imported
module); an unused, latent-risk "slug is a prefix of param name" match branch
(removed); and no verification that the dotted-import actually resolved to
the file that was scanned (added an ``os.path.samefile`` check).

No mother document, ADR, schema, or ``ai_lego`` module file is modified by
this file or by running it -- it only reads and imports.
"""
from __future__ import annotations

import glob
import importlib
import inspect
import os
import re
import sys
import urllib.parse

import yaml
from jsonschema import Draft202012Validator
from referencing import Registry, Resource
from referencing.exceptions import Unresolvable

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # spec root: agency-os/docs/AI_LEGO_Cognitive_Engineering_OS
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(ROOT)))  # monorepo root (two roots, one product -- see ai_lego/__init__.py)
PRODUCT_ROOT = os.path.join(REPO_ROOT, "Projects", "internal", "cognitive-engineering-os")
MODULES_ROOT = os.path.join(PRODUCT_ROOT, "ai_lego", "modules")
TYPED_OBJECTS_DIR = os.path.join(ROOT, "specs", "cognitive", "typed-objects")

urllib.parse.uses_relative.append("ai-lego")
urllib.parse.uses_netloc.append("ai-lego")


class UniqueKeyLoader(yaml.SafeLoader):
    """Same duplicate-key guard as tests/run_golden_tests.py's UniqueKeyLoader
    (PyYAML's safe_load otherwise lets a duplicate key silently overwrite the
    first value with no error). Duplicated rather than imported so this file
    stays independently runnable -- same precedent
    tests/architecture/search_content_pack_check.py already set."""


def _construct_mapping(loader, node, deep=False):
    mapping = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if key in mapping:
            raise ValueError(f"Duplicate key {key!r} at line {key_node.start_mark.line + 1}")
        mapping[key] = loader.construct_object(value_node, deep=deep)
    return mapping


UniqueKeyLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, _construct_mapping)

_load_cache = {}


def load(path):
    path = os.path.normpath(path)
    if path in _load_cache:
        return _load_cache[path]
    with open(path, encoding="utf-8") as f:
        data = yaml.load(f, Loader=UniqueKeyLoader)
    _load_cache[path] = data
    return data


def uri_to_path(uri):
    parsed = urllib.parse.urlsplit(uri)
    relpath = (parsed.netloc + parsed.path).lstrip("/")
    return os.path.join(ROOT, relpath)


def retrieve(uri):
    data = load(uri_to_path(uri))
    return Resource.from_contents(data)


registry = Registry(retrieve=retrieve)

failures = []
passed = 0


def check(cond, msg):
    global passed
    if cond:
        passed += 1
    else:
        failures.append(msg)


# ---------------------------------------------------------------------------
# Schema <-> ai_lego module resolution -- see module docstring for the full
# rationale of every rule applied here.
# ---------------------------------------------------------------------------
CITATION_RE = re.compile(r"Instance of ``typed-objects/([a-z0-9-]+)\.schema\.yaml``")

# Schemas whose producing module legitimately has no evaluate_*_gates function
# of its own (both built by root_cause/fishbone.py, which defines exactly one
# gate function -- for cause-hypothesis-set, not these two; see module
# docstring). Any OTHER schema landing in the schema-only bucket is a real
# regression (e.g. a gate function renamed/reformatted so discovery can no
# longer find it) and must fail loudly via the exact-set assertion in run() --
# a bare ">0" coverage count was proven by mutation testing to tolerate that
# regression silently (2026-09-06 critic review).
EXPECTED_SCHEMA_ONLY_SLUGS = frozenset({"problem-statement", "root-cause-fact"})


def _slug_hyphen(param_name):
    return param_name.replace("_", "-")


def _find_gate_functions(mod):
    """Real evaluate_*_gates functions DEFINED IN this module (not merely
    imported into its namespace) that follow this codebase's
    ``(record, validator, timestamp)`` POSITIONAL calling convention. Uses the
    already-imported module's live functions via ``inspect`` rather than a
    source-text regex, so it survives any reformatting (line-wrapped
    signatures, decorators, comments) a regex would silently miss -- proven by
    mutation testing (2026-09-06 critic review). Filtering on the first
    parameter's ``kind`` (not name) structurally excludes a keyword-only
    variant like ``ai_lego.modules.research.gates.evaluate_method_specific_gates``
    without a name denylist -- that function cannot be called the way every
    other gate function here is called."""
    found = []
    for name, fn in inspect.getmembers(mod, inspect.isfunction):
        if fn.__module__ != mod.__name__:
            continue  # imported from elsewhere into this module's namespace, not defined here
        if not (name.startswith("evaluate_") and name.endswith("_gates")):
            continue
        params = list(inspect.signature(fn).parameters.values())
        if not params or params[0].kind not in (inspect.Parameter.POSITIONAL_OR_KEYWORD, inspect.Parameter.POSITIONAL_ONLY):
            continue
        found.append((name, params[0].name))
    return found


def _import_module_from_path(py_path):
    rel = os.path.relpath(py_path, PRODUCT_ROOT).replace(os.sep, "/")
    dotted = rel[: -len(".py")].replace("/", ".")
    if PRODUCT_ROOT not in sys.path:
        # append, not insert(0): don't let this test's own generic top-level
        # product-root names (docs/scripts/tests) shadow anything else
        # importing in the same process (2026-09-06 critic review).
        sys.path.append(PRODUCT_ROOT)
    mod = importlib.import_module(dotted)
    if not os.path.samefile(mod.__file__, py_path):
        # Guards against a stale/duplicate "ai_lego" package resolving first on
        # sys.path (e.g. an installed copy from `pip install .` per
        # pyproject.toml's own packaging config) -- without this, the check
        # could silently gate-check examples against the WRONG copy of the
        # gate code and still report PASS (2026-09-06 critic review).
        raise RuntimeError(f"IMPORT_IDENTITY_MISMATCH: {dotted!r} resolved to {mod.__file__!r}, expected {py_path!r} -- a stale/duplicate ai_lego package is shadowing this one")
    return mod


def _build_gate_index():
    """Returns (index, ambiguous). ``index`` maps schema slug -> (imported
    module object, gate function name) for every schema this file can
    unambiguously attribute a real gate function to. ``ambiguous`` lists
    (slug, [files]) pairs where the same slug is cited as an "Instance of" by
    more than one distinct module file -- a real structural problem worth a
    failure of its own (a fixable citation error), not a silent schema-only
    fallback."""
    py_files = sorted(glob.glob(os.path.join(MODULES_ROOT, "**", "*.py"), recursive=True))
    text_by_file = {}
    for p in py_files:
        with open(p, encoding="utf-8") as f:
            text_by_file[p] = f.read()

    citation_map = {}  # slug -> set of files (deduped: 2 citations of the same
    # slug in the same file's docstrings must not be treated as 2 different files)
    for p, text in text_by_file.items():
        for m in CITATION_RE.finditer(text):
            citation_map.setdefault(m.group(1), set()).add(p)

    file_schema_count = {}  # file -> set of slugs it builds
    for slug, files in citation_map.items():
        for f in files:
            file_schema_count.setdefault(f, set()).add(slug)

    cited_files = sorted({f for files in citation_map.values() for f in files})
    file_gate_fns = {}  # file -> (module object, [(fn_name, first_param_name), ...])
    for f in cited_files:
        try:
            mod = _import_module_from_path(f)
        except Exception as e:  # noqa: BLE001 -- report and continue, don't abort discovery
            check(False, f"could not import {os.path.relpath(f, REPO_ROOT)} to discover its real gate functions -- {type(e).__name__}: {e}")
            continue
        file_gate_fns[f] = (mod, _find_gate_functions(mod))

    index = {}
    ambiguous = []
    for slug, files in citation_map.items():
        files = sorted(files)
        if len(files) != 1:
            ambiguous.append((slug, files))
            continue
        f = files[0]
        entry = file_gate_fns.get(f)
        if entry is None:
            continue  # import already failed and was reported above
        mod, fns = entry
        if not fns:
            continue  # module genuinely defines no evaluate_*_gates -- schema-only check
        if len(fns) == 1 and len(file_schema_count.get(f, ())) == 1:
            index[slug] = (mod, fns[0][0])
            continue
        # File builds >1 typed object and/or defines >1 gate function:
        # disambiguate by matching the gate function's first parameter name
        # against this schema's own slug (see module docstring -- this is the
        # root_cause/fishbone.py case).
        matches = [fn for fn, param in fns if slug == _slug_hyphen(param)]
        if len(matches) == 1:
            index[slug] = (mod, matches[0])
        # else: no unique match -- deliberately left out of index (falls back
        # to schema-only checking for this slug; EXPECTED_SCHEMA_ONLY_SLUGS
        # below asserts this only ever happens for the 2 known cases).
    return index, ambiguous


def run():
    global passed
    schema_files = sorted(glob.glob(os.path.join(TYPED_OBJECTS_DIR, "*.schema.yaml")))
    check(len(schema_files) > 0, "no specs/cognitive/typed-objects/*.schema.yaml files found -- typed-object example/gate check is empty")

    check(
        os.path.isdir(MODULES_ROOT),
        f"ai_lego modules root not found at {os.path.relpath(MODULES_ROOT, REPO_ROOT)} -- every typed-object example would silently fall back to schema-only checking (real-gate coverage would drop to zero without any visible signal)",
    )

    gate_index, ambiguous = _build_gate_index()
    for slug, files in ambiguous:
        rels = [os.path.relpath(f, REPO_ROOT) for f in files]
        check(False, f"typed-objects/{slug}.schema.yaml: 'Instance of' citation found in {len(files)} different module files {rels} -- cannot unambiguously pick one to gate-check (fix the duplicate citation)")

    all_slugs = {os.path.basename(p)[: -len(".schema.yaml")] for p in schema_files}
    schema_only_slugs = all_slugs - set(gate_index)
    check(
        schema_only_slugs == EXPECTED_SCHEMA_ONLY_SLUGS,
        f"typed-object schemas with NO real gate function resolved changed from the expected {sorted(EXPECTED_SCHEMA_ONLY_SLUGS)} to {sorted(schema_only_slugs)} -- "
        "either update EXPECTED_SCHEMA_ONLY_SLUGS (a schema genuinely gained/lost gate-less status on purpose) or fix the real regression (a schema SILENTLY LOST real-gate coverage)",
    )

    schemas_with_examples = 0
    schemas_gate_checked = 0
    examples_schema_checked = 0
    examples_gate_checked = 0

    for schema_path in schema_files:
        rel_schema = os.path.relpath(schema_path, ROOT).replace("\\", "/")
        slug = os.path.basename(schema_path)[: -len(".schema.yaml")]
        try:
            schema_doc = load(schema_path)
        except Exception as e:  # noqa: BLE001 -- report and continue, don't abort the whole suite
            check(False, f"{rel_schema}: failed to parse -- {e}")
            continue

        examples = schema_doc.get("examples") or []
        if not examples:
            continue
        schemas_with_examples += 1

        schema_id = schema_doc.get("$id")
        if not schema_id:
            check(False, f"{rel_schema}: has an examples: block but no top-level $id -- cannot build a validator for it")
            continue
        reg = registry.with_resource(schema_id, Resource.from_contents(schema_doc))
        try:
            validator = Draft202012Validator(schema_doc, registry=reg)
        except Exception as e:  # noqa: BLE001
            check(False, f"{rel_schema}: could not build a Draft202012Validator -- {e}")
            continue

        gate_target = gate_index.get(slug)
        gate_mod = gate_fn = all_pass_fn = None
        fn_name = None
        if gate_target:
            gate_mod, fn_name = gate_target
            gate_fn = getattr(gate_mod, fn_name)
            all_pass_fn = getattr(gate_mod, "all_gates_pass")
        if gate_mod is not None:
            schemas_gate_checked += 1

        for i, example in enumerate(examples):
            name = example.get("description", f"<example {i}>") if isinstance(example, dict) else f"<example {i}>"
            if not isinstance(example, dict) or "value" not in example:
                check(False, f"{rel_schema}::examples[{i}] ({name}): missing 'value' key")
                continue
            value = example["value"]
            examples_schema_checked += 1

            try:
                schema_errors = list(validator.iter_errors(value))
            except Unresolvable as e:
                check(False, f"{rel_schema}::examples[{i}] ({name}): unresolvable $ref during schema validation -- {e}")
                continue
            check(not schema_errors, f"{rel_schema}::examples[{i}] ({name}): fails its OWN schema: {[err.message for err in schema_errors]}")

            if gate_mod is None:
                continue
            try:
                gate_results = gate_fn(value, "golden-test:typed-object-example", "2026-01-01T00:00:00Z")
                gates_ok = all_pass_fn(gate_results)
            except Exception as e:  # noqa: BLE001
                check(False, f"{rel_schema}::examples[{i}] ({name}): real gate {fn_name} raised {type(e).__name__}: {e}")
                continue
            examples_gate_checked += 1
            # Derive which individual gates are unacceptable from the module's
            # OWN all_gates_pass on a singleton list, instead of restating its
            # {"PASS", "NOT_APPLICABLE"} constant here -- stays correct even if
            # a future module's acceptance criteria diverges (2026-09-06 critic review).
            failed_gates = [{"gate_id": g.get("gate_id"), "evidence": g.get("evidence")} for g in gate_results if not all_pass_fn([g])]
            check(gates_ok, f"{rel_schema}::examples[{i}] ({name}): schema-valid but FAILS its own real gate {fn_name} -- {failed_gates}")

    check(schemas_with_examples > 0, "zero typed-object schemas carried an examples: block -- this check is not exercising anything")
    check(schemas_gate_checked > 0, "zero typed-object schemas were matched to a real evaluate_*_gates function -- the real-gate half of this check is not exercising anything")
    schema_only_count = schemas_with_examples - schemas_gate_checked
    print(
        f"typed_object_example_gates_check: {schemas_with_examples} schemas with examples, "
        f"{examples_schema_checked} examples schema-validated, {examples_gate_checked} examples real-gate-checked "
        f"across {schemas_gate_checked} schemas ({schema_only_count} schema-only, no gate function resolved)"
    )


if __name__ == "__main__":
    run()
    print(f"PASSED: {passed}")
    if failures:
        print(f"FAILED: {len(failures)}")
        for f in failures:
            print(" -", f)
        sys.exit(1)
    print("ALL TYPED-OBJECT EXAMPLE/GATE CHECKS PASSED")
