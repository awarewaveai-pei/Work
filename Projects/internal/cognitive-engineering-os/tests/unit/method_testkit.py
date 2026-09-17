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
from typing import Any, Callable

from ai_lego import resolve_spec_root
from ai_lego.apps.api.dispatch import record_id_prefix, resolve_builder, resolve_gate_runner
from ai_lego.apps.cli.method_slice import MethodSliceSpec
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.errors import InvariantViolation
from ai_lego.platform.ai_execution.method_resolver import MethodCatalog

GARBAGE = (None, "not-a-dict", 42, 3.14, True, [], {}, {"junk": 1})


class MethodSliceMixin:
    SPEC: MethodSliceSpec
    REFUSALS: list[tuple[str, Callable[[], Any]]] = []
    TAMPERS: list[tuple[str, Callable[[dict[str, Any]], dict[str, Any]]]] = []

    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)
        cls.catalog = MethodCatalog.from_spec_root(cls.spec_root)

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
