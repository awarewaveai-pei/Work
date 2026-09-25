"""Shared test base for single-method slices built on ``ai_lego.core.domain.record_kit`` (2026-09-17 onward).

A concrete test module declares ``class XTests(MethodSliceMixin, unittest.TestCase)`` with:
- ``SPEC``: the ``MethodSliceSpec`` its ``run_<name>_slice.py`` exposes;
- ``REFUSALS``: ``[(error_code_regex, zero-arg callable that must raise InvariantViolation), ...]``;
- ``TAMPERS``: ``[(gate_id, fn(record) -> tampered record), ...]`` -- each must FAIL exactly that gate.
The base proves: schema conformance, catalog + dispatch resolvability, gates pass on the fixture, every refusal
fires at construction, every tamper is caught by the independent gate, and gates fail closed on garbage.
"""

from __future__ import annotations

import copy
import re
import unittest
from functools import lru_cache
from pathlib import Path
from types import MappingProxyType
from typing import Any, Callable

from ai_lego import resolve_spec_root
from ai_lego.apps.api.dispatch import record_id_prefix, resolve_builder, resolve_gate_runner
from ai_lego.apps.cli.method_slice import MethodSliceSpec
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.errors import InvariantViolation
from ai_lego.platform.ai_execution.method_resolver import MethodCatalog

GARBAGE = (None, "not-a-dict", 42, 3.14, True, [], {}, {"junk": 1})


# ---------------------------------------------------------------------------
# Shared per-process method catalog (2026-09-25, perf).
#
# `MethodCatalog.from_spec_root` scans all 285 methods/contracts/*.contract.yaml files from disk
# (~7s). Every one of the ~285 tool test modules calls it at least once (SpecConformanceTests'
# `test_method_resolves_through_the_unmodified_shared_resolver` /
# `test_invoke_through_the_catalog_runs_the_real_implementation`), and this mixin's own
# `setUpClass` called it once per test CLASS on top of that -- the dominant cost of the full
# 14,159-test suite (24-34 min locally, >20 min / 2.4GB in the cloud runner).
#
# `shared_method_catalog(spec_root)` below scans ONCE per process per spec_root (cached in
# `_cached_catalog_parts`) and returns a bare (label, contracts) pair; every CALL to
# `shared_method_catalog` then builds a fresh `MethodCatalog` dataclass instance from those cached
# parts. This is deliberately NOT "cache and return the same MethodCatalog object" -- see the
# contamination note below for why.
#
# Contamination (the actual risk a shared cache introduces, task step 2): `MethodCatalog` is a
# frozen dataclass, so `catalog.label = ...` / `catalog.contracts = ...` already can't happen. The
# two real mutation vectors are (a) `catalog.contracts[k] = v` -- direct dict mutation, frozen does
# NOT block this since it only blocks attribute reassignment -- and (b) `catalog.invoke(...)`,
# which APPENDS to `catalog.invocations` (a plain mutable list field) on every call; several test
# modules (test_workflow_executor.py, test_guided_mode.py, SpecConformanceTests'
# `test_invoke_through_the_catalog_runs_the_real_implementation` in ~250 tool modules) call
# `.invoke(...)` and then assert on `len(catalog.invocations)` or its contents. If every caller
# shared ONE literal MethodCatalog instance, module B's invocation count would include module A's
# leftover invocations from a prior test -- order-dependent test pollution, the exact failure mode
# a "shared cache" must not introduce.
#
# Two independent defenses, addressing (a) and (b) separately -- both are real, neither alone is
# enough:
#   (a) `contracts` is wrapped in `MappingProxyType` before caching, so `catalog.contracts[k] = v`
#       raises `TypeError` from ANY caller, not just a documented convention.
#   (b) Every `shared_method_catalog(...)` call constructs a NEW `MethodCatalog(...)`. Dataclass
#       field `invocations: list = field(default_factory=list, ...)` means each new instance gets
#       its own empty list for free -- `.invoke()` on one caller's instance can never be visible to
#       another's, even though both instances share the same (read-only) `contracts` mapping and
#       `label` string. The expensive part (the disk scan) is cached; the part that must never be
#       shared (`invocations`) never is.
#
# `lru_cache` keys on the (hashable) `str(spec_root)`, not the `Path` object itself, so two equal
# but non-identical `Path`s (rare, but `resolve_spec_root()` vs. a caller's own re-derived Path)
# still hit the same cache entry.
@lru_cache(maxsize=None)
def _cached_catalog_parts(spec_root_str: str) -> tuple[str, "MappingProxyType[str, dict]"]:
    catalog = MethodCatalog.from_spec_root(Path(spec_root_str))
    return catalog.label, MappingProxyType(dict(catalog.contracts))


def shared_method_catalog(spec_root) -> MethodCatalog:
    """Fresh, read-only-`contracts` `MethodCatalog` backed by a per-process cached disk scan.

    Behaves identically to `MethodCatalog.from_spec_root(spec_root)` for every existing caller --
    `.resolve(...)`, `.require(...)`, `.invoke(...)`, `.is_resolvable(...)` are all unchanged
    (`MethodCatalog`/`ContractCatalog` themselves are NOT modified; see this module's own docstring
    update) -- except that the 285-file disk scan itself runs at most once per process per
    spec_root, and `.contracts` is a `MappingProxyType` (attempted mutation raises `TypeError`
    instead of silently corrupting the cache for every other test that will read it this process).
    """
    label, contracts = _cached_catalog_parts(str(spec_root))
    # (c) the contract VALUES are nested dicts: MappingProxyType only guards the top level, so each
    # call gets its own deep copy (~1 ms) -- same semantics as a fresh from_spec_root scan.
    return MethodCatalog(label=label, contracts=MappingProxyType(copy.deepcopy(dict(contracts))))


class MethodSliceMixin:
    SPEC: MethodSliceSpec
    REFUSALS: list[tuple[str, Callable[[], Any]]] = []
    TAMPERS: list[tuple[str, Callable[[dict[str, Any]], dict[str, Any]]]] = []

    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)
        cls.catalog = shared_method_catalog(cls.spec_root)

    def build(self) -> dict[str, Any]:
        args, kwargs = self.SPEC.fixture_args()
        return self.SPEC.builder(*args, **kwargs)

    def test_fixture_validates_against_the_real_schema(self):
        self.contracts.validate(self.SPEC.schema_uri, self.build(), self.SPEC.record_key)

    def test_method_resolves_and_is_dispatchable(self):
        self.assertIsNone(self.catalog.resolve([self.SPEC.method_id])["blocked"])
        self.assertIs(resolve_builder(self.SPEC.method_id), self.SPEC.builder)
        self.assertIs(resolve_gate_runner(self.SPEC.method_id), self.SPEC.gates)
        self.assertTrue(self.build()["id"].startswith(record_id_prefix(self.SPEC.method_id)))

    def test_fixture_passes_all_gates(self):
        results = self.SPEC.gates(self.build(), "test", "2026-09-17T00:00:00Z")
        self.assertTrue(self.SPEC.all_gates_pass(results), results)
        self.assertIn("provenance_required", {g["gate_id"] for g in results})

    def test_every_refusal_fires_at_construction(self):
        self.assertTrue(self.REFUSALS, "declare at least one REFUSAL")
        for code, refuse in self.REFUSALS:
            with self.subTest(code=code), self.assertRaisesRegex(InvariantViolation, code):
                refuse()

    def test_every_tamper_is_caught_by_the_named_gate(self):
        self.assertTrue(self.TAMPERS, "declare at least one TAMPER")
        for gate_id, tamper in self.TAMPERS:
            with self.subTest(gate_id=gate_id):
                tampered = tamper(copy.deepcopy(self.build()))
                results = {g["gate_id"]: g["status"] for g in self.SPEC.gates(tampered, "test", "2026-09-17T00:00:00Z")}
                self.assertEqual(results.get(gate_id), "FAIL", results)

    def test_gates_fail_closed_on_garbage(self):
        for bad in GARBAGE:
            with self.subTest(bad=bad):
                results = self.SPEC.gates(bad, "test", "2026-09-17T00:00:00Z")
                self.assertTrue(all(g["status"] == "FAIL" for g in results), results)

    def test_slice_spec_slug_is_uppercase_identifier(self):
        self.assertRegex(self.SPEC.slug, re.compile(r"^[A-Z0-9]+$"))
