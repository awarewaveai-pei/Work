"""The runtime egress allowlist (docker-compose.yml) never exceeds the policy (network-egress.yaml EGRESS-EC99-2).

Two places hold the same list (RESEARCH_LINES_MASTER_PLAN §3.3 Egress allowlist, K1); this test is what keeps them one fact.
"""

from __future__ import annotations

import ast
import re
import unittest

import yaml

from ai_lego import PRODUCT_ROOT, resolve_spec_root
from ai_lego.platform.net.egress import EGRESS_ALLOWLIST_ENV, egress_allowlist


def _compose_allowlist() -> frozenset[str]:
    compose = yaml.safe_load((PRODUCT_ROOT / "docker-compose.yml").read_text(encoding="utf-8"))
    entries = compose["services"]["cognitive-os-api"]["environment"]
    values = dict(entry.split("=", 1) for entry in entries if isinstance(entry, str) and "=" in entry)
    return egress_allowlist({EGRESS_ALLOWLIST_ENV: values[EGRESS_ALLOWLIST_ENV]})


def _policy_allowlist() -> frozenset[str]:
    policy = yaml.safe_load((resolve_spec_root() / "policies" / "ai-execution" / "network-egress.yaml").read_text(encoding="utf-8"))
    rules = [rule for rule in policy["seed_content"]["rules"] if rule["rule_id"] == "EGRESS-EC99-2"]
    return frozenset(host.lower() for host in rules[0]["allowlist"])


ENGINE_HOSTS = frozenset({"api.anthropic.com", "app.aware-wave.com"})   # the AI provider and collect (the collection service)
# modules that can open a connection, matched on every import spelling (import x.y, from x import y, as ...)
_NETWORK = ("urllib.request", "http.client", "http.server", "socket", "ssl", "asyncio", "urllib3", "httpx", "requests", "aiohttp",
            "anthropic", "openai", "smtplib", "ftplib", "telnetlib", "xmlrpc", "websocket", "websockets")
_PROCESS_MODULES = ("subprocess", "multiprocessing", "pty")
_PROCESS_CALLS = re.compile(r"\bos\.(?:system|popen|exec\w*|spawn\w*|startfile)\(")
_DYNAMIC_IMPORT = re.compile(r"\bimport_module\(|__import__\(")


def _imported(source: str) -> set[str]:
    """Every dotted name a module imports: `from http import client` is http.client, like `import http.client as c`."""
    names: set[str] = set()
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.Import):
            names |= {alias.name for alias in node.names}
        elif isinstance(node, ast.ImportFrom) and node.module and not node.level:
            names |= {node.module} | {f"{node.module}.{alias.name}" for alias in node.names}
    return names


def _imports_any(source: str, roots: tuple[str, ...]) -> bool:
    return any(name == root or name.startswith(root + ".") for name in _imported(source) for root in roots)


def _engine_modules(check) -> set[str]:
    return {path.relative_to(PRODUCT_ROOT).as_posix() for path in (PRODUCT_ROOT / "ai_lego").rglob("*.py") if check(path.read_text(encoding="utf-8"))}


class EgressAllowlistParityTests(unittest.TestCase):
    def test_every_runtime_host_is_in_the_policy(self):
        runtime = _compose_allowlist()
        self.assertTrue(runtime, "compose allowlist parsed empty -- the guard would guard nothing")
        self.assertLessEqual(runtime, _policy_allowlist())

    def test_the_collection_service_host_is_allowed_in_both_places(self):
        self.assertIn("app.aware-wave.com", _compose_allowlist())
        self.assertIn("app.aware-wave.com", _policy_allowlist())

    def test_the_engine_reaches_only_the_ai_provider_and_collect(self):
        """STEP2_SHARED_RULES §7 (operator 2026-09-17, why 2026-10-04: blocks built separately, then chained; collect is the
        searcher). A new outside host or a new module under platform/net/ is a decision, not a quiet addition."""
        self.assertEqual(_compose_allowlist(), ENGINE_HOSTS)
        self.assertLessEqual(ENGINE_HOSTS, _policy_allowlist())   # the policy is the ceiling for several services; the engine uses two
        net = PRODUCT_ROOT / "ai_lego" / "platform" / "net"
        self.assertEqual({path.stem for path in net.glob("*.py")}, {"__init__", "egress", "collection_service", "collect_lookups"})

    def test_only_egress_opens_a_connection(self):
        """Codex 2026-10-04 F1: the CLI model gateway opened its own urllib connection to any endpoint.uri, and the SDK it
        used took ANTHROPIC_BASE_URL from the environment -- both past the allowlist. One module opens connections."""
        self.assertEqual(_engine_modules(lambda source: _imports_any(source, _NETWORK)), {"ai_lego/platform/net/egress.py"})
        # the processes the engine starts, each a decision: its own CLI slices (a demo route), Windows speech for audio
        # fixtures, git for the manifest. None is a network tool; a new one is reviewed here, not added quietly.
        self.assertEqual(_engine_modules(lambda source: _imports_any(source, _PROCESS_MODULES) or bool(_PROCESS_CALLS.search(source))),
                         {"ai_lego/apps/api/main.py", "ai_lego/modules/knowledge/ingest/audio_fixtures.py", "ai_lego/platform/ai_execution/manifest.py"})
        # imports by computed name cannot be read here. Each resolves the engine's own packages (blocks, doc kinds,
        # rulesets, AI actions, block hooks), a method contract's builder path (dispatch, the methods' self-checks, COMPUTE's
        # ruleset), an optional speech package (transcription) or os (journal_protection). A new one is reviewed here.
        self.assertEqual(_engine_modules(lambda source: bool(_DYNAMIC_IMPORT.search(source))), {
            "ai_lego/apps/api/blocks/__init__.py", "ai_lego/core/domain/doc_kinds.py", "ai_lego/platform/rulesets/__init__.py",
            "ai_lego/platform/ai_gate.py", "ai_lego/platform/block_hooks/__init__.py", "ai_lego/platform/block_hooks/compute.py",
            "ai_lego/apps/api/dispatch.py", "ai_lego/modules/computation/monte_carlo.py", "ai_lego/modules/decision/expected_value.py",
            "ai_lego/modules/decision/rice.py", "ai_lego/modules/decision/topsis.py", "ai_lego/modules/decision/wsjf.py",
            "ai_lego/modules/learning/prediction_tracking.py", "ai_lego/modules/research/gates.py",
            "ai_lego/modules/knowledge/ingest/transcription.py", "ai_lego/platform/workflow/journal_protection.py"})

    def test_the_connection_check_reads_every_import_spelling(self):
        """Codex 2026-10-04 pass 2: a list of import spellings missed `from http import client`."""
        for source in ("from http import client", "import http.client as c", "from urllib import request as r", "import socket",
                       "from asyncio import open_connection", "import xmlrpc.client", "from http.client import HTTPSConnection",
                       "def f():\n    import requests"):
            self.assertTrue(_imports_any(source, _NETWORK), source)
        for source in ("from urllib.parse import urlsplit", "import json", "from http import HTTPStatus", "from . import socket"):
            self.assertFalse(_imports_any(source, _NETWORK), source)


if __name__ == "__main__":
    unittest.main()
