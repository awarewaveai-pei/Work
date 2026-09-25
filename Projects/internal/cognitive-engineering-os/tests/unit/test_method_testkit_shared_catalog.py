"""Contamination guard for `shared_method_catalog` (T11, 2026-09-25).

The whole point of the shared per-process cache in method_testkit.py is that HUNDREDS of test
modules call it -- so if it let one test's mutation leak into another's, that would be silent,
order-dependent test pollution across the entire suite, exactly the failure mode a shared cache
must not introduce. These tests exercise both defenses named in `shared_method_catalog`'s own
docstring: (a) `.contracts` is read-only (`MappingProxyType`), (b) every call constructs a FRESH
`MethodCatalog` so `.invocations` is never shared, (c) the nested contract dicts are deep-copied per call.
"""

from __future__ import annotations

import unittest

from ai_lego import resolve_spec_root
from tests.unit.method_testkit import _cached_catalog_parts, shared_method_catalog


class SharedCatalogCacheTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()

    # ── Test A: attempt to pollute a shared catalog ──────────────────────────────────────────
    def test_a_direct_contracts_mutation_attempt_raises_and_leaves_no_trace(self):
        catalog = shared_method_catalog(self.spec_root)
        with self.assertRaises(TypeError):
            catalog.contracts["POLLUTED-BY-TEST-A"] = {"status": "ACTIVE", "path": "nowhere", "version": "0"}
        # The raise itself proves .contracts is read-only; this proves the FAILED attempt also left
        # no partial trace for a wholly independent call to see.
        again = shared_method_catalog(self.spec_root)
        self.assertNotIn("POLLUTED-BY-TEST-A", again.contracts)

    def test_a_invoke_only_appends_to_its_own_instance(self):
        catalog = shared_method_catalog(self.spec_root)
        method_id = next(mid for mid, entry in catalog.contracts.items() if entry.get("status") == "ACTIVE")
        catalog.invoke(method_id, lambda: None)
        self.assertEqual(len(catalog.invocations), 1)
        # A fresh call, right after an .invoke() on a DIFFERENT instance, must start clean.
        fresh = shared_method_catalog(self.spec_root)
        self.assertEqual(fresh.invocations, [], "a fresh call must never see another instance's invocations")

    # ── Test B: a wholly separate call sees none of test A's attempted damage ───────────────
    def test_b_a_fresh_catalog_is_unaffected_by_anything_test_a_did(self):
        catalog = shared_method_catalog(self.spec_root)
        self.assertNotIn("POLLUTED-BY-TEST-A", catalog.contracts)
        self.assertEqual(catalog.invocations, [])

    def test_c_nested_contract_mutation_does_not_reach_the_next_caller(self):
        # MappingProxyType guards only the top level; a contract's own dict is still writable, so
        # every call must hand out its own copy or one test's edit leaks into every later test.
        first = shared_method_catalog(self.spec_root)
        key = next(iter(first.contracts))
        first.contracts[key]["POLLUTED-NESTED"] = True
        second = shared_method_catalog(self.spec_root)
        self.assertNotIn("POLLUTED-NESTED", second.contracts[key])
        self.assertIsNot(first.contracts[key], second.contracts[key])

    # ── The other half of the point: the expensive scan really is cached ────────────────────
    def test_the_expensive_scan_is_cached_across_calls_but_instances_are_not_shared(self):
        before = _cached_catalog_parts.cache_info()
        first = shared_method_catalog(self.spec_root)
        mid = _cached_catalog_parts.cache_info()
        second = shared_method_catalog(self.spec_root)
        after = _cached_catalog_parts.cache_info()
        # Relative, not absolute, assertions -- other test modules in the same process run may
        # already have warmed (or not yet touched) this cache; what must hold regardless is that
        # the SECOND of these two calls is a hit, not a fresh miss.
        self.assertEqual(after.hits, mid.hits + 1, "second call did not hit the cache -- re-scanned instead")
        self.assertLessEqual(after.misses, mid.misses, "second call must never trigger a re-scan")
        self.assertEqual(first.label, second.label)
        # same content from the one cached scan, but each caller owns its copy (the nested contract
        # dicts are writable; sharing the mapping itself leaked them -- see test_c)
        self.assertEqual(dict(first.contracts), dict(second.contracts))
        self.assertIsNot(first.contracts, second.contracts, "each caller gets its own copy of the cached mapping")
        self.assertIsNot(first, second, "different MethodCatalog instances -- .invocations must never be shared")
