#!/usr/bin/env python3
"""
AI-LEGO Cognitive Engineering OS -- Phase 3 Wave 8 golden test runner.

Resolves MACHINE_READABLE_SPEC_PLAN.md section 3 Build Order: "Wave 8
tests/ 全目錄（對 Wave 1-7 的每個 schema 寫 golden test）". Runs seven
independent check families against the built (status: ACTIVE/PROVISIONAL)
Wave 1-7+ output (plus the Phase 5 Research Mode MVP slice deliverables
added 2026-08-30: research.qualitative_coding method contract,
run_statistics/Cohen's Kappa capability contract, research-qualitative-v1
recipe instance):

  1. Schema conformance  -- tests/contracts/**/*.fixtures.yaml drives
     positive (must validate) and negative (must fail validation) instance
     checks against every specs/ and policies/ai-execution/ (and, as of the
     Tier 0 method-contract backfill, policies/privacy/) file that declares
     a $schema (see tests/README.md for the fixture contract).
  2. Recipe instance conformance -- the validated recipes/validated/*.recipe.yaml
     files (which are DATA instances, not schemas themselves) validate
     against specs/cognitive/recipe.schema.yaml. (Was 3 through Wave 7;
     research-qualitative-v1.recipe.yaml added 2026-08-30, Phase 5 Research
     Mode MVP slice deliverable per MVP_VERTICAL_SLICE_PLAN.md section 4.)
  2b. Method/Lens contract instance conformance -- methods/contracts/*.contract.yaml
      (Tier 0 method/lens contract backfill, docs/architecture/
      MACHINE_READABLE_SPEC_PLAN.md section 4) validate against
      specs/cognitive/method.schema.yaml or specs/cognitive/lens.schema.yaml#/lens,
      dispatched by which schema-specific required key is present.
  2c. Capability contract instance conformance -- capabilities/contracts/*.capability.yaml
      (new 2026-08-30, Phase 5 Research Mode MVP slice: run_statistics /
      Cohen's Kappa inter-rater reliability, docs/architecture/
      MVP_VERTICAL_SLICE_PLAN.md section 4; plus transcribe / literature_search /
      artifact.generate_research_paper, 2026-09-04, ADR-023 section
      Consequences 1 -- all four pinned by name) validate against
      specs/domain/capability-contract.schema.yaml. No separate INSTANCE-
      driving fixtures file (the schema itself is already fixture-tested by
      check 1, tests/contracts/specs/domain/capability-contract.fixtures.yaml)
      -- same precedent as 2b's method/lens contracts; see
      capabilities/contracts/run_statistics.capability.yaml's own
      description for why this file is not instead under methods/contracts/.
  3. Registry invariants -- methods/registry/method-inventory.yaml and
     contract-backlog.yaml are not governed by an external JSON Schema
     (they are Phase-0-migrated free-form registries); this file instead
     checks the specific structural invariants those two files' own
     headers claim about themselves (counts, has_contract<->contract_status
     consistency). method-inventory.yaml's `phase_3_additions` block (new
     2026-08-30 -- GROUNDED ORIGINAL DESIGN entries with no mother-document
     source, kept separate from `by_document` so the 289-count invariant
     stays a pure Phase-0-migration fact) gets its own, separate
     has_contract<->contract_status consistency check.
  4. Cross-file $ref resolution smoke test -- every "ai-lego://..." URI
     found anywhere under specs/, policies/, methods/, recipes/validated/,
     and capabilities/contracts/ resolves to a real file and (if it carries
     a "#/..." JSON-pointer fragment) a real node within that file.
  5. SearchContent architecture pack (ADR-021 D10, Gate H) -- see the
     run_search_content_pack_check docstring below.
  6. Generated spec indexes fresh -- tests/gen_spec_index.py --check must
     report docs/architecture/{SPEC_QUICKREF,MOTHER_DOC_SECTION_INDEX}.md
     identical to a fresh generation (ADR-024 Decision 2: cite mother
     documents by section, look shapes up in the quick-ref; a stale index
     is a detector that went quiet, so it fails the suite instead of
     drifting silently the way hand-typed line numbers did).
  7. Contract <-> backlog registration parity (added 2026-09-06, closing a
     gap that let the SAME defect ship twice in one session: a contract's
     own decided_by/mandated_by field claims "registered in
     contract-backlog.yaml tier_1/tier_0" while the actual registry edit was
     never made -- database_data.data_contract, commit 72b47cd0d, caught by
     critic review before landing; database_data.data_quality_dimensions,
     caught by critic review in this same session, after the false claim was
     already committed). Every methods/contracts/*.contract.yaml file with
     status: ACTIVE must have its own `id` present as a `method_id` in
     contract-backlog.yaml's tier_0 or tier_1 section with
     contract_status: complete. tier_0 is included alongside tier_1 (the
     section named in the two known incidents) because the same invariant
     applies to tier_0's own 4 pre-existing contracts (root_cause.fishbone,
     stakeholder.regulator, strategy.swot, evidence.triangulation) --
     checking tier_1 alone would false-positive on exactly those 4, verified
     by hand before this check was written.

No mother document, ADR, or existing spec/policy file's normative content
is modified by this file or by running it. Exit code 0 = all checks
passed; 1 = at least one failure (each printed with enough context to
locate the failing fixture/instance).
"""
import glob
import os
import re
import sys
import urllib.parse

import yaml
from jsonschema import Draft202012Validator
from referencing import Registry, Resource
from referencing.exceptions import Unresolvable

# 2026-08-30 critic finding (mutation-tested, real CP950 crash reproduced on
# a Windows console with no PYTHONIOENCODING set): this corpus's own
# `verification`/description text already contains non-Big5 characters
# (e.g. U+2705 in specs/domain/capability-contract.schema.yaml:27). A
# type-error value containing one would raise UnicodeEncodeError mid-print
# in the failure-reporting loop below, silently truncating the remaining
# failure list while still exiting 1 (fail-closed, but not fail-LOUD as the
# module's own docstring promises -- "each printed with enough context").
# Reconfigure stdout to UTF-8 unconditionally rather than special-casing
# the one character found today; more will land as the corpus grows.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class UniqueKeyLoader(yaml.SafeLoader):
    """Same duplicate-key guard used throughout this session's ad hoc
    verification scripts (PyYAML silently lets the last key win otherwise)."""


def _construct_mapping(loader, node, deep=False):
    mapping = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if key in mapping:
            raise ValueError(f"Duplicate key {key!r} at line {key_node.start_mark.line + 1}")
        mapping[key] = loader.construct_object(value_node, deep=deep)
    return mapping


UniqueKeyLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, _construct_mapping)

urllib.parse.uses_relative.append("ai-lego")
urllib.parse.uses_netloc.append("ai-lego")

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
# 1. Schema conformance via tests/contracts/**/*.fixtures.yaml
# ---------------------------------------------------------------------------
def run_schema_conformance():
    # Searches all of tests/ (not just tests/contracts/) so the same fixture
    # mechanism also drives tests/governance/ai-execution/**/golden scenario
    # fixtures -- one format, two directory purposes (per-schema conformance
    # vs. EC section 94/141 governance-category illustration).
    fixture_files = sorted(glob.glob(os.path.join(ROOT, "tests", "**", "*.fixtures.yaml"), recursive=True))
    check(len(fixture_files) > 0, "no *.fixtures.yaml files found under tests/ -- schema conformance suite is empty")
    for ff in fixture_files:
        rel_ff = os.path.relpath(ff, ROOT)
        try:
            fx = load(ff)
        except Exception as e:  # noqa: BLE001 -- report and continue, don't abort the whole suite
            check(False, f"{rel_ff}: failed to parse -- {e}")
            continue
        schema_id = fx.get("schema_id")
        if not schema_id:
            check(False, f"{rel_ff}: missing required top-level 'schema_id'")
            continue
        target_ref = fx.get("target_ref", "")
        try:
            schema_doc = retrieve(schema_id).contents
        except Exception as e:  # noqa: BLE001
            check(False, f"{rel_ff}: schema_id {schema_id!r} did not resolve -- {e}")
            continue
        reg = registry.with_resource(schema_id, Resource.from_contents(schema_doc))
        pointer_schema = {"$ref": f"{schema_id}{target_ref}"}
        try:
            validator = Draft202012Validator(pointer_schema, registry=reg)
        except Exception as e:  # noqa: BLE001
            check(False, f"{rel_ff}: could not build validator for {schema_id}{target_ref} -- {e}")
            continue

        valid_cases = fx.get("valid", [])
        invalid_cases = fx.get("invalid", [])
        check(len(valid_cases) >= 1, f"{rel_ff}: has zero 'valid' cases -- every fixture needs at least one golden instance")
        check(len(invalid_cases) >= 1, f"{rel_ff}: has zero 'invalid' cases -- every fixture needs at least one adversarial instance")

        for case in valid_cases:
            name = case.get("name", "<unnamed>")
            try:
                errors = list(validator.iter_errors(case["instance"]))
            except Unresolvable as e:
                check(False, f"{rel_ff}::valid::{name}: unresolvable $ref during validation -- {e}")
                continue
            check(not errors, f"{rel_ff}::valid::{name} unexpectedly INVALID: {[err.message for err in errors]}")

        for case in invalid_cases:
            name = case.get("name", "<unnamed>")
            try:
                errors = list(validator.iter_errors(case["instance"]))
            except Unresolvable as e:
                check(False, f"{rel_ff}::invalid::{name}: unresolvable $ref during validation -- {e}")
                continue
            check(bool(errors), f"{rel_ff}::invalid::{name} unexpectedly VALID (expected reason: {case.get('reason', '<no reason given>')})")


# ---------------------------------------------------------------------------
# 2. Recipe instance conformance -- recipes/validated/*.recipe.yaml against
#    specs/cognitive/recipe.schema.yaml
# ---------------------------------------------------------------------------
def run_recipe_instance_conformance():
    recipe_schema_id = "ai-lego://specs/cognitive/recipe.schema.yaml"
    schema_doc = retrieve(recipe_schema_id).contents
    reg = registry.with_resource(recipe_schema_id, Resource.from_contents(schema_doc))
    validator = Draft202012Validator(schema_doc, registry=reg)
    recipe_files = sorted(glob.glob(os.path.join(ROOT, "recipes", "validated", "*.recipe.yaml")))
    recipe_basenames = {os.path.basename(p)[: -len(".recipe.yaml")] for p in recipe_files}
    expected_recipe_ids = {
        "art-therapy-creative-reflection-v1",
        "art-therapy-project-ideation-v1",
        "business-planning-feasibility-v1",
        "business-feasibility-review-v1",
        "business-foundation-v1",
        "champion-challenger",
        "db-migration-expand-contract",
        "edd-literature-search-v1",
        "edd-research-evidence-v1",
        "life-decision-v1",
        "method-deprecation-retirement",
        "research-qualitative-v1",
    }
    check(set(recipe_basenames) == expected_recipe_ids, f"recipe inventory mismatch: expected {sorted(expected_recipe_ids)}, found {sorted(recipe_basenames)}")
    # 2026-08-30 critic finding: a bare count check does not pin WHICH file is
    # present -- deleting research-qualitative-v1.recipe.yaml and adding any
    # other well-formed decoy recipe would still pass len()==4 silently.
    check("research-qualitative-v1" in recipe_basenames, f"expected recipes/validated/research-qualitative-v1.recipe.yaml specifically (Phase 5 Research Mode slice deliverable), found {sorted(recipe_basenames)}")
    for p in recipe_files:
        rel_p = os.path.relpath(p, ROOT)
        inst = load(p)
        errors = list(validator.iter_errors(inst))
        check(not errors, f"recipe instance {rel_p} fails recipe.schema.yaml: {[e.message for e in errors]}")
        check(inst.get("id") == os.path.basename(p)[: -len(".recipe.yaml")], f"recipe instance {rel_p}: id field does not match filename slug")


# ---------------------------------------------------------------------------
# 2b. Method/Lens contract instance conformance -- methods/contracts/*.yaml
#     against either method.schema.yaml or lens.schema.yaml#/lens. Dispatched
#     by which schema-specific required key is present (cognitive_primitives
#     is method-only per method.schema.yaml's own required list; labels is
#     lens-only per lens.schema.yaml#/lens's required list) rather than by
#     filename pattern, so this does not silently miss a future contract
#     whose filename doesn't follow today's naming convention.
# ---------------------------------------------------------------------------
def run_method_contract_conformance():
    method_schema_id = "ai-lego://specs/cognitive/method.schema.yaml"
    method_schema = retrieve(method_schema_id).contents
    reg_m = registry.with_resource(method_schema_id, Resource.from_contents(method_schema))
    method_validator = Draft202012Validator(method_schema, registry=reg_m)

    lens_schema_id = "ai-lego://specs/cognitive/lens.schema.yaml"
    lens_schema = retrieve(lens_schema_id).contents
    reg_l = registry.with_resource(lens_schema_id, Resource.from_contents(lens_schema))
    lens_validator = Draft202012Validator({"$ref": f"{lens_schema_id}#/lens"}, registry=reg_l)

    contract_files = sorted(glob.glob(os.path.join(ROOT, "methods", "contracts", "*.contract.yaml")))
    check(len(contract_files) >= 4, f"expected at least 4 methods/contracts/*.contract.yaml files (Tier 0), found {len(contract_files)}")
    for p in contract_files:
        rel_p = os.path.relpath(p, ROOT)
        inst = load(p)
        if "cognitive_primitives" in inst:
            errors = list(method_validator.iter_errors(inst))
            check(not errors, f"method contract {rel_p} fails method.schema.yaml: {[e.message for e in errors]}")
        elif "labels" in inst:
            errors = list(lens_validator.iter_errors(inst))
            check(not errors, f"lens contract {rel_p} fails lens.schema.yaml#/lens: {[e.message for e in errors]}")
        else:
            check(False, f"{rel_p}: neither 'cognitive_primitives' (method) nor 'labels' (lens) present -- cannot determine which schema to validate against")
        check(inst.get("id") == os.path.basename(p)[: -len(".contract.yaml")], f"contract {rel_p}: id field does not match filename slug")


# ---------------------------------------------------------------------------
# 2c. Capability contract instance conformance -- capabilities/contracts/*.yaml
#     against domain/capability-contract.schema.yaml. Same direct-instance-
#     check pattern as 2b (no separate fixtures file -- see that check's own
#     docstring/2c comment above for why method/lens contracts already
#     established this precedent).
# ---------------------------------------------------------------------------
def run_capability_contract_conformance():
    cap_schema_id = "ai-lego://specs/domain/capability-contract.schema.yaml"
    cap_schema = retrieve(cap_schema_id).contents
    reg_c = registry.with_resource(cap_schema_id, Resource.from_contents(cap_schema))
    cap_validator = Draft202012Validator(cap_schema, registry=reg_c)

    cap_files = sorted(glob.glob(os.path.join(ROOT, "capabilities", "contracts", "*.capability.yaml")))
    check(len(cap_files) >= 4, f"expected at least 4 capabilities/contracts/*.capability.yaml files (the research-qualitative-v1 Recipe's four capability refs, ADR-023 section Consequences 1), found {len(cap_files)}")
    # 2026-08-30 critic finding: a bare >=1 count does not pin WHICH file is
    # present -- deleting run_statistics.capability.yaml and adding any other
    # well-formed decoy capability would still pass silently.
    cap_basenames = {os.path.basename(p)[: -len(".capability.yaml")] for p in cap_files}
    # 2026-09-04: every capability ref of recipes/validated/research-qualitative-v1.recipe.yaml
    # is pinned by name (ADR-023 section Consequences 1). Deleting any one of them would otherwise
    # pass the count check while silently flipping the runtime's plan verdict back to
    # executable: false -- a "detector goes silent" regression.
    for required in ("run_statistics", "transcribe", "literature_search", "artifact.generate_research_paper"):
        check(required in cap_basenames, f"expected capabilities/contracts/{required}.capability.yaml specifically (research-qualitative-v1 capability ref, ADR-023 section Consequences 1) among the {len(cap_files)} found, found {sorted(cap_basenames)}")
    for p in cap_files:
        rel_p = os.path.relpath(p, ROOT)
        inst = load(p)
        errors = list(cap_validator.iter_errors(inst))
        check(not errors, f"capability contract {rel_p} fails capability-contract.schema.yaml: {[e.message for e in errors]}")
        expected_slug = os.path.basename(p)[: -len(".capability.yaml")]
        check(inst.get("id") == expected_slug, f"capability contract {rel_p}: id field {inst.get('id')!r} does not match filename slug {expected_slug!r}")


# ---------------------------------------------------------------------------
# 3. Registry invariants -- method-inventory.yaml / contract-backlog.yaml
#    (no external schema governs these; check their own stated claims)
# ---------------------------------------------------------------------------
def _has_contract_status_mismatch(entry):
    # 2026-08-30 critic finding: the original by_document form
    # (`expected = "complete" if has_contract else "pending"`, exact
    # equality) is strictly stronger than a bare
    # `(status == "complete") != bool(has_contract)` XOR check -- the XOR
    # form silently accepts ANY non-"complete" string (a typo like
    # "pendng", or "in_progress", or None) whenever has_contract is falsy.
    # Shared here so by_document/phase_3_additions/tier_0 all enforce the
    # one strong invariant instead of three independently-drifting copies.
    has_contract = entry.get("has_contract")
    contract_status = entry.get("contract_status")
    expected = "complete" if has_contract else "pending"
    return contract_status != expected


def run_registry_invariants():
    mi_path = os.path.join(ROOT, "methods", "registry", "method-inventory.yaml")
    mi = load(mi_path)
    total = 0
    bad_consistency = []
    for doc_name, doc_val in mi.get("by_document", {}).items():
        for entry in doc_val.get("methods", []):
            total += 1
            if _has_contract_status_mismatch(entry):
                bad_consistency.append((doc_name, entry.get("name"), entry.get("has_contract"), entry.get("contract_status")))
    check(total == 289, f"method-inventory.yaml: expected 289 total method entries in by_document (per its own header claim; phase_3_additions is a separate, additive block not counted here), found {total}")
    check(not bad_consistency, f"method-inventory.yaml: {len(bad_consistency)} entries have has_contract/contract_status mismatch: {bad_consistency[:5]}{'...' if len(bad_consistency) > 5 else ''}")

    # 2026-08-30 critic finding: the original check had no existence/identity
    # assertion at all -- deleting this whole block, renaming it, or emptying
    # it to [] all passed silently (no numeric signal moves either, since
    # `total` above only counts by_document). This block is the sole carrier
    # of the one GROUNDED ORIGINAL DESIGN method entry (research.qualitative_coding,
    # no mother-document source -- see that method contract's own
    # compilation_decisions), so losing it silently is exactly the
    # "detector goes silent" failure mode this project's own R0 discipline
    # singles out as the worst outcome.
    phase3 = mi.get("phase_3_additions", [])
    check(len(phase3) >= 1, f"method-inventory.yaml: expected phase_3_additions to be present and non-empty (research.qualitative_coding, added 2026-08-30), found {len(phase3)} entries")
    required_phase3 = {
        "research.qualitative_coding",
        "feasibility.telos",
        "feasibility.cost_benefit_analysis",
        "feasibility.cost_effectiveness",
        "feasibility.tco",
        "feasibility.unit_economics",
        "feasibility.break_even",
        "feasibility.npv",
        "feasibility.irr",
        "feasibility.real_options",
    }
    found_phase3 = {e.get("name") for e in phase3}
    check(required_phase3.issubset(found_phase3), f"method-inventory.yaml phase_3_additions: missing required live entries {sorted(required_phase3 - found_phase3)}")
    phase3_bad = [e.get("name") for e in phase3 if _has_contract_status_mismatch(e)]
    check(not phase3_bad, f"method-inventory.yaml phase_3_additions: has_contract/contract_status mismatch for {phase3_bad}")

    cb_path = os.path.join(ROOT, "methods", "registry", "contract-backlog.yaml")
    cb = load(cb_path)
    tier0 = cb.get("tier_0", [])
    check(len(tier0) == 4, f"contract-backlog.yaml tier_0: expected 4 entries (per its own header claim -- root_cause.fishbone, stakeholder.regulator, strategy.swot, evidence.triangulation), found {len(tier0)}")
    tier0_bad = [e["method_id"] for e in tier0 if _has_contract_status_mismatch(e)]
    check(not tier0_bad, f"contract-backlog.yaml tier_0: has_contract/contract_status mismatch for {tier0_bad}")

    tier1 = cb.get("tier_1", {})
    check(tier1.get("no_method_ids_listed") is True, "contract-backlog.yaml tier_1: expected no_method_ids_listed: true (Tier 1's general 15-25-method list is an explicit TODO, not populated, per plan section 4 -- unaffected by tier_1.first_concrete_entry, an individually-mandated addition, not a derived list entry)")
    first_entry = tier1.get("first_concrete_entry")
    # 2026-08-30 critic finding: `bool(first_entry) and first_entry.get(...)`
    # only guards against a falsy value -- a truthy non-dict (e.g. a bare
    # string, a plausible YAML authoring slip) makes `.get()` raise an
    # uncaught AttributeError that aborts the whole suite before any
    # PASSED/FAILED summary prints. isinstance() guards the type, not just
    # truthiness.
    check(
        isinstance(first_entry, dict) and first_entry.get("method_id") == "research.qualitative_coding" and first_entry.get("contract_status") == "complete",
        f"contract-backlog.yaml tier_1.first_concrete_entry: expected a mapping with method_id: research.qualitative_coding, contract_status: complete, found {first_entry!r}",
    )

    tier2 = cb.get("tier_2", {})
    explicit_entries = tier2.get("explicit_entries", [])
    check(len(explicit_entries) >= 1, "contract-backlog.yaml tier_2.explicit_entries: expected at least the ADR-008-mandated finance.financial_assumptions entry, found none")
    check(
        any(e.get("method_id") == "finance.financial_assumptions" for e in explicit_entries),
        "contract-backlog.yaml tier_2.explicit_entries: missing the ADR-008-mandated 'finance.financial_assumptions' entry",
    )


# ---------------------------------------------------------------------------
# 4. Cross-file ai-lego:// $ref resolution smoke test
#
# Walks the PARSED YAML structure (not raw text) looking for dict keys named
# "$ref" whose value is a real ai-lego:// URI. Deliberately does NOT grep raw
# file text for anything that merely looks like "ai-lego://..." -- several
# files in this corpus quote that scheme inside prose/description blocks
# (e.g. explaining the URI convention itself, or narrating a past bug via a
# hypothetical urljoin() call) and those prose quotes can be word-wrapped
# across lines by YAML's folded-scalar (">") style, which a line-based regex
# mis-truncates into a false "dangling reference". A $ref is only ever a
# YAML mapping value in this corpus, never prose, so walking the parsed
# structure for the literal key "$ref" is both simpler and correct where the
# earlier raw-text-regex version (kept only in this file's own git history)
# produced 2 false positives on its first run against policies/ai-execution/
# authority.yaml.
# ---------------------------------------------------------------------------
def _walk_refs(node):
    if isinstance(node, dict):
        for k, v in node.items():
            if k == "$ref" and isinstance(v, str) and v.startswith("ai-lego://"):
                yield v
            else:
                yield from _walk_refs(v)
    elif isinstance(node, list):
        for item in node:
            yield from _walk_refs(item)


def run_ref_resolution_smoke():
    roots = ["specs", "policies", "methods", "recipes/validated", "capabilities/contracts"]
    checked = 0
    for root in roots:
        for p in glob.glob(os.path.join(ROOT, root, "**", "*.yaml"), recursive=True):
            rel_p = os.path.relpath(p, ROOT)
            try:
                doc = load(p)
            except Exception as e:  # noqa: BLE001
                check(False, f"{rel_p}: failed to parse while scanning for $ref -- {e}")
                continue
            if not isinstance(doc, dict):
                continue
            for m in sorted(set(_walk_refs(doc))):
                checked += 1
                base_uri = m.split("#", 1)[0]
                fragment = m[len(base_uri):]
                base_path = uri_to_path(base_uri)
                if not os.path.isfile(base_path):
                    check(False, f"{rel_p}: dangling $ref {m!r} -- target file does not exist: {os.path.relpath(base_path, ROOT)}")
                    continue
                if fragment:
                    try:
                        target_doc = load(base_path)
                        resource = Resource.from_contents(target_doc)
                        resolver = registry.with_resource(base_uri, resource).resolver()
                        resolver.lookup(m)
                    except Exception as e:  # noqa: BLE001
                        check(False, f"{rel_p}: $ref {m!r} has unresolvable fragment -- {e}")
                        continue
                check(True, f"resolved {m}")
    check(checked > 0, "cross-file $ref smoke test found zero ai-lego:// $ref values to check -- suite is not actually exercising anything")


# ---------------------------------------------------------------------------
# 5. SearchContent architecture pack (ADR-021 SS D10, Gate H) -- imports
#    tests/architecture/search_content_pack_check.py and folds its rule
#    functions' pass/fail counts into this suite's totals, rather than
#    collapsing its ~1480 individual invariant checks into a single
#    pass/fail line (which would hide a regression's exact cause).
# ---------------------------------------------------------------------------
def run_search_content_pack_check():
    global passed
    import importlib.util
    spec_path = os.path.join(ROOT, "tests", "architecture", "search_content_pack_check.py")
    try:
        spec = importlib.util.spec_from_file_location("search_content_pack_check", spec_path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        for rule in mod.RULES + [mod.rule9_manifest]:
            rule()
    except Exception as e:  # noqa: BLE001
        # A crash here must not take down the other 4 check families' already-
        # accumulated pass counts and failure messages with it (2026-09-03
        # critic finding: __main__ had no try/except, so an exception in this
        # family printed a bare traceback and skipped both the final summary
        # and check family 4, which runs after this one in file order).
        failures.append(f"search_content_pack_check: CRASHED -- {type(e).__name__}: {e}")
        return
    passed += mod.passed
    for f in mod.failures:
        failures.append(f"search_content_pack_check.{f}")


# ---------------------------------------------------------------------------
# 6. Generated spec indexes (ADR-024 Decision 2). Imports tests/gen_spec_index.py
#    and runs its --check; the two generated markdown files must equal a fresh
#    generation byte-for-byte. Regenerate with `python tests/gen_spec_index.py`.
# ---------------------------------------------------------------------------
def run_generated_index_freshness():
    import importlib.util
    spec_path = os.path.join(ROOT, "tests", "gen_spec_index.py")
    try:
        spec = importlib.util.spec_from_file_location("gen_spec_index", spec_path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        rc = mod.main(["--check"])
    except Exception as e:  # noqa: BLE001 -- same crash-isolation stance as family 5
        failures.append(f"gen_spec_index --check: CRASHED -- {type(e).__name__}: {e}")
        return
    check(rc == 0, "generated spec indexes are STALE -- run `python tests/gen_spec_index.py` and commit docs/architecture/SPEC_QUICKREF.md + MOTHER_DOC_SECTION_INDEX.md")


# ---------------------------------------------------------------------------
# 7. Contract <-> backlog registration parity -- see module docstring family 7.
#    Catches a contract whose own decided_by/mandated_by text claims
#    registration in contract-backlog.yaml while the registry edit was never
#    actually made (database_data.data_contract, commit 72b47cd0d;
#    database_data.data_quality_dimensions, same session, both caught only by
#    a critic reading two files by hand -- this check makes that mechanical).
#
#    2026-09-06 critic review hardened this beyond the first draft:
#    - MAJ-1: a contract's own `status` field is not schema-governed, so
#      trusting `!= "ACTIVE"` to mean "skip, not our concern" let ANY typo/
#      case/whitespace variant (or a renamed field) silently exempt a
#      contract from registration checking with zero signal -- the exact
#      "detector goes silent" failure this file's own docstring calls out
#      four times. Every non-"ACTIVE" contract is now LISTED and asserted
#      empty, not silently trusted.
#    - MAJ-2: added the same non-vacuity floor (`evaluated > 0`) every other
#      check family in this file already has (see docstring families
#      1/2b/2c/3/5) -- without it, the corpus-wide typo above would produce
#      passed=0/failures=0 and report green.
#    - MAJ-3: the original only checked contract -> registry. A registry
#      entry marked contract_status: complete whose contract file was
#      deleted/renamed afterward went undetected -- the exact mirror of the
#      defect this check exists to catch. Now checked both directions.
#    - MIN-2/MIN-3: guarded against a non-string/missing `id` (would crash
#      re.escape) and against tier_0 entries that aren't dicts (tier_1's own
#      loop already had this guard; tier_0's did not).
#    - MIN-4: a failed line-number lookup now omits the `:line` suffix
#      instead of fabricating `:1`.
#    - MIN-5: tier_2.explicit_entries is a real, separate section
#      (finance.financial_assumptions, pending per ADR-008) that must never
#      satisfy this check via a stray contract_status: complete -- asserted,
#      not just assumed.
#    - Duplicate-registration guard: two tier_0/tier_1 keys claiming the same
#      method_id (a plausible copy-paste slip in a file whose Tier 1 entries
#      are hand-named first_/second_/.../fortyfifth_concrete_entry).
# ---------------------------------------------------------------------------
def _first_line_matching(path, pattern):
    """1-based line number of the first line in `path` matching regex
    `pattern`, or None. Good enough for these single-line scalar fields
    (id:, method_id:) -- this corpus never folds them across lines."""
    rx = re.compile(pattern)
    with open(path, encoding="utf-8") as f:
        for i, line in enumerate(f, start=1):
            if rx.search(line):
                return i
    return None


def run_contract_backlog_registration_parity():
    cb_path = os.path.join(ROOT, "methods", "registry", "contract-backlog.yaml")
    cb = load(cb_path)

    # method_id -> list of (location_label, contract_status) across every
    # tier_0 list entry and every tier_1 dict entry (first_concrete_entry,
    # second_concrete_entry, ... -- tier_1 is a mapping of hand-named keys,
    # not a list, so this walks .items() rather than iterating a list;
    # non-entry keys like tier_1.status/note are skipped via isinstance).
    registered = {}
    for entry in (cb.get("tier_0") or []):
        if isinstance(entry, dict) and entry.get("method_id"):
            registered.setdefault(entry["method_id"], []).append(("tier_0", entry.get("contract_status")))
    for key, entry in (cb.get("tier_1") or {}).items():
        if isinstance(entry, dict) and entry.get("method_id"):
            registered.setdefault(entry["method_id"], []).append((f"tier_1.{key}", entry.get("contract_status")))

    # Tier 2 is pending-by-definition (contract-backlog.yaml's own
    # tier_2.policy) -- a tier_2 entry marked complete would let an ACTIVE
    # contract's registration satisfy this check via the wrong tier.
    tier2_complete = [
        e.get("method_id") for e in ((cb.get("tier_2") or {}).get("explicit_entries") or [])
        if isinstance(e, dict) and e.get("contract_status") == "complete"
    ]
    check(not tier2_complete, f"contract-backlog.yaml tier_2.explicit_entries: {tier2_complete} marked contract_status: complete -- Tier 2 is pending-by-definition per tier_2.policy")

    dup_registrations = {mid: locs for mid, locs in registered.items() if len(locs) > 1}
    check(not dup_registrations, f"contract-backlog.yaml: method_id registered more than once across tier_0/tier_1: {dup_registrations}")

    contract_files = sorted(glob.glob(os.path.join(ROOT, "methods", "contracts", "*.contract.yaml")))
    contract_ids = set()
    non_active = []
    evaluated = 0
    for p in contract_files:
        rel_p = os.path.relpath(p, ROOT)
        inst = load(p)
        method_id = inst.get("id")
        if isinstance(method_id, str) and method_id:
            contract_ids.add(method_id)
        status = inst.get("status")
        if status != "ACTIVE":
            non_active.append((rel_p, status))
            continue
        if not isinstance(method_id, str) or not method_id:
            continue  # missing/non-string id is already covered by check family 2b
        evaluated += 1
        matches = registered.get(method_id, [])
        complete_matches = [loc for loc, st in matches if st == "complete"]
        id_line = None
        if not complete_matches:
            id_line = _first_line_matching(p, r'^id:\s*[\'"]?' + re.escape(method_id) + r'[\'"]?\s*(?:#.*)?$')
        loc = f"{rel_p}:{id_line}" if id_line else rel_p
        check(
            bool(complete_matches),
            f"{loc}: ACTIVE contract id {method_id!r} has no contract-backlog.yaml "
            f"tier_0/tier_1 entry with contract_status: complete (found: "
            f"{matches if matches else 'no method_id match at all'}) -- the contract's own "
            f"decided_by/mandated_by field may claim a registration that was never actually "
            f"written to {os.path.relpath(cb_path, ROOT)} (this exact defect shipped twice: "
            f"database_data.data_contract commit 72b47cd0d, database_data.data_quality_dimensions same session)",
        )

    check(evaluated > 0, "check family 7 evaluated zero ACTIVE contracts -- either methods/contracts/ is empty or every contract's own `status` field is missing/misspelled/not exactly 'ACTIVE', silently exempting the whole corpus from registration-parity checking")
    check(not non_active, f"contract file(s) skipped by check family 7 because their own `status` field is not exactly 'ACTIVE' -- confirm each is a genuine non-ACTIVE contract (e.g. PROVISIONAL), not a status field typo: {non_active}")

    # Reverse direction (critic review MAJ-3): a registry entry claiming
    # contract_status: complete must point at a contract file that actually
    # exists with that id, or the registry itself is the one lying (contract
    # deleted/renamed after being marked complete).
    for mid, locs in registered.items():
        complete_locs = [loc for loc, st in locs if st == "complete"]
        if complete_locs:
            check(mid in contract_ids, f"contract-backlog.yaml {complete_locs[0]}: method_id {mid!r} is contract_status: complete, but no methods/contracts/*.contract.yaml file has that id")


if __name__ == "__main__":
    run_schema_conformance()
    run_recipe_instance_conformance()
    run_method_contract_conformance()
    run_capability_contract_conformance()
    run_registry_invariants()
    run_search_content_pack_check()
    run_generated_index_freshness()
    run_contract_backlog_registration_parity()
    run_ref_resolution_smoke()

    print(f"PASSED: {passed}")
    if failures:
        print(f"FAILED: {len(failures)}")
        for f in failures:
            print(" -", f)
        sys.exit(1)
    print("ALL GOLDEN TESTS PASSED")
