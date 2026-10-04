"""Plan P-k: "is this already running?" is answered by ai_lego.platform.workflow.run_lock, never by a registry in one
process's memory (a second worker re-runs the work; a dead runner's entry is lost and its run stays RUNNING forever --
Codex oracle 2026-09-28 r3 + critic). This test fails on a module-level name that looks like such a registry."""

from __future__ import annotations

import ast
import re
import threading
import unittest
from pathlib import Path
from unittest import mock

from ai_lego.data.events import record_log
from ai_lego.platform import block_hooks

AI_LEGO = Path(__file__).resolve().parents[2] / "ai_lego"
REGISTRY_NAME = re.compile(r"IN_FLIGHT|RUNNING|ACTIVE_RUN|INFLIGHT|_RUNS\b|_JOBS\b|_TASKS\b", re.IGNORECASE)
MUTABLE = (ast.Set, ast.Dict, ast.List, ast.SetComp, ast.DictComp, ast.ListComp)


def _registry_like(node: ast.AST) -> list[str]:
    targets = node.targets if isinstance(node, ast.Assign) else [node.target] if isinstance(node, ast.AnnAssign) else []
    value = getattr(node, "value", None)
    mutable = isinstance(value, MUTABLE) or (isinstance(value, ast.Call) and getattr(value.func, "id", "") in {"set", "dict", "list", "defaultdict"})
    return [t.id for t in targets if isinstance(t, ast.Name) and mutable and REGISTRY_NAME.search(t.id)]


class NoProcessLocalRunRegistryTests(unittest.TestCase):
    def test_no_module_level_running_work_registry(self):
        found = []
        for path in sorted(AI_LEGO.rglob("*.py")):
            for node in ast.parse(path.read_text(encoding="utf-8"), filename=str(path)).body:
                for name in _registry_like(node):
                    found.append(f"{path.relative_to(AI_LEGO.parent)}:{node.lineno} {name}")
        self.assertEqual(found, [], "use ai_lego.platform.workflow.run_lock (plan P-k), not a process-local registry")

    def test_the_detector_sees_the_pattern_it_forbids(self):
        tree = ast.parse("_RUNS_IN_FLIGHT: set[tuple[str, str]] = set()\n_ACTIVE_RUNS = {}\n_CATALOG_CACHE = {}\n")
        self.assertEqual([name for node in tree.body for name in _registry_like(node)], ["_RUNS_IN_FLIGHT", "_ACTIVE_RUNS"])

    def test_wait_idle_waits_for_a_submitted_hook_without_a_future_registry(self):
        entered, release = threading.Event(), threading.Event()

        def slow_hook(*_args):
            entered.set()
            release.wait(5)

        with mock.patch.object(block_hooks, "_run_after_sources", side_effect=slow_hook):
            block_hooks.after_sources(None, "tenant", record_log.case("case"), {})
            self.assertTrue(entered.wait(3))
            waiter = threading.Thread(target=block_hooks.wait_idle, kwargs={"timeout": 3})
            waiter.start()
            try:
                waiter.join(0.1)
                self.assertTrue(waiter.is_alive())
            finally:
                release.set()
                waiter.join(1)
            self.assertFalse(waiter.is_alive())


if __name__ == "__main__":
    unittest.main()
