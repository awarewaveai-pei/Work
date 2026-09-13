import unittest

from ai_lego.errors import InvariantViolation
from ai_lego.platform.workflow.capability_adapters import CapabilityAdapterRegistry


class _Catalog:
    def __init__(self, resolvable):
        self.resolvable = set(resolvable)

    def is_resolvable(self, ref):
        return ref in self.resolvable

    def resolve(self, refs):
        missing = [ref for ref in refs if ref not in self.resolvable]
        return {"blocked": {"unresolved": missing}} if missing else {"blocked": None}


class CapabilityAdapterRegistryTests(unittest.TestCase):
    def test_registered_adapter_receives_explicit_binding_values(self):
        registry = CapabilityAdapterRegistry(_Catalog({"literature_search"}))
        registry.register("literature_search", lambda payload, _node: {"question": payload["research.question"]})
        handler = registry.handlers_for(["literature_search"])["literature_search"]
        self.assertEqual(handler({"source.question": "ignored", "__bindings__": {"research.question": "real question"}}, {}), {"question": "real question"})

    def test_missing_adapter_fails_closed_before_handler_lookup(self):
        registry = CapabilityAdapterRegistry(_Catalog({"literature_search"}))
        with self.assertRaisesRegex(InvariantViolation, "CAPABILITY_ADAPTER_UNAVAILABLE"):
            registry.handlers_for(["literature_search"])

    def test_registration_requires_active_contract_and_rejects_duplicates(self):
        registry = CapabilityAdapterRegistry(_Catalog({"literature_search"}))
        with self.assertRaisesRegex(InvariantViolation, "CAPABILITY_ADAPTER_CONTRACT_REQUIRED"):
            registry.register("transcribe", lambda _payload, _node: {})
        registry.register("literature_search", lambda _payload, _node: {})
        with self.assertRaisesRegex(InvariantViolation, "CAPABILITY_ADAPTER_DUPLICATE"):
            registry.register("literature_search", lambda _payload, _node: {})

