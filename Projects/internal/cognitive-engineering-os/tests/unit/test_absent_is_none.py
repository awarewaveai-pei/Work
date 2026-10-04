"""Only an absent value is none (Codex 2026-10-04, COMPUTE F1). `x or {}` reads 0, "", [] and False as "nothing given",
so a value of the wrong kind passes as none: a request's 悲觀: 0 reused 一般's number and the range was wrong. Where the
person's request or a service's report is read before its type is checked, write `{} if x is None else x` and check the
type (block_hooks/compute.py plan, main.py CollectionCompleteRequest.wire_error).

Every `<expr> or <empty>` left in the block hooks, the block routes and the AI actions is listed below under why it
cannot hide a wrong value. A new one fails here until it is rewritten or listed with its reason."""

from __future__ import annotations

import ast
import unittest
from collections import Counter

from ai_lego import PRODUCT_ROOT

ROOTS = ("ai_lego/platform/block_hooks", "ai_lego/apps/api/blocks", "ai_lego/platform/ai_actions")

TOP = "a top-level field of a kind: the save refuses 0 and False there and reads '' [] {} as absent (doc_kinds._empty)"
SYSTEM = "a record or value the system itself wrote or computed (run, card, grouping, channel, ruleset, method registry)"
AI = "the model's answer, kept item by item only if each passes isinstance: a falsy value is no items"
FILTERED = "a list inside a stored json field, each item kept only if it passes isinstance: a falsy value is no items and claims nothing"
GUARDED = "the same expression checks the type first (... if isinstance(x, list) else ...)"
WIRE = "collect's report, checked first by main.py CollectionCompleteRequest.wire_error: None or a list of checked items"
LOOKUP = "collect's answer about an address: a falsy site name is read as none, which only leaves the outlet unnamed"
REFUSED = "the person's raw content, where the empty default is refused right after (a mark or split names at least one page)"
LIB = "a library's or the framework's None, or an optional argument (urlsplit().hostname, a Query value, a repository miss)"

HARMLESS: dict[str, dict[str, int]] = {
    TOP: {
        "blocks/gather.py:gather_overview": 1, "blocks/think.py:expand_batch": 3, "blocks/verify.py:confirm_readings": 1, "blocks/verify.py:ledger": 2,
        "blocks/verify.py:save_stance": 1, "ai_actions/act.py:_split_input": 1, "ai_actions/context.py:_point_input": 1, "ai_actions/decide.py:_check_input": 1,
        "ai_actions/gather.py:_handback": 1, "ai_actions/gather.py:_map_gaps": 1, "ai_actions/map.py:_lens": 1, "ai_actions/map.py:_method_input": 1,
        "ai_actions/think.py:own_texts": 1, "block_hooks/decide.py:also_decides": 2, "block_hooks/learn.py:_calibration_checked": 1,
        "block_hooks/learn.py:_calibration_saved": 2, "block_hooks/map.py:_map_saved": 2, "block_hooks/map.py:_map_saved.checkable": 1,
        "block_hooks/think.py:_card_checked": 2, "block_hooks/think.py:_round_checked": 2, "block_hooks/verify.py:_map_claims": 1,
        "block_hooks/verify.py:_proposal_ok": 1, "block_hooks/verify.py:reading_entry": 1,
    },
    SYSTEM: {
        "blocks/govern.py:_records_markdown": 1, "blocks/verify.py:ledger": 4, "ai_actions/compute.py:_explain_handback": 1,
        "ai_actions/compute.py:_explain_input": 6, "ai_actions/gather.py:_organize_input": 1, "ai_actions/map.py:_tools": 5,
        "block_hooks/compute.py:case_runs": 1, "block_hooks/compute.py:plan": 1, "block_hooks/gather.py:_Item.__init__": 6,
        "block_hooks/gather.py:_ancestor_card": 1, "block_hooks/gather.py:_source_card": 3, "block_hooks/gather.py:_sources_arrived": 2,
        "block_hooks/gather.py:_sources_arrived.item": 2, "block_hooks/gather.py:_split_checked.same_text": 1, "block_hooks/gather.py:_title_parts": 1,
        "block_hooks/gather.py:channel_state": 6, "block_hooks/gather.py:distribution.engine": 1, "block_hooks/gather.py:distribution.value.read": 2,
    },
    AI: {
        "ai_actions/act.py:_flag_shape": 1, "ai_actions/act.py:_split_shape": 2, "ai_actions/act.py:_trend_shape": 1, "ai_actions/compute.py:_explain_shape": 1,
        "ai_actions/compute.py:_suggest_shape": 1, "ai_actions/decide.py:_shape": 1, "ai_actions/gather.py:_compare_shape": 5, "ai_actions/gather.py:_says_shape": 1,
        "ai_actions/learn.py:_compare_shape": 1, "ai_actions/verify.py:_next_shape": 1, "ai_actions/verify.py:_summary_shape": 1,
    },
    FILTERED: {"ai_actions/context.py:_point_input": 1, "ai_actions/map.py:_items": 1, "block_hooks/map.py:_map_checked": 2},
    GUARDED: {"ai_actions/map.py:_held_back": 1, "block_hooks/map.py:_map_checked": 1},
    WIRE: {"block_hooks/gather.py:_aside_card": 1, "block_hooks/gather.py:_clean_channels": 1, "block_hooks/gather.py:_sources_arrived": 1,
           "block_hooks/verify.py:_after_sources": 1},
    LOOKUP: {"block_hooks/gather.py:_cells": 1},
    REFUSED: {"block_hooks/gather.py:_mark_checked": 3, "block_hooks/gather.py:_split_checked": 2},
    LIB: {"blocks/govern.py:export_account": 1, "blocks/govern.py:help_for": 1, "ai_actions/think.py:_message": 1, "block_hooks/gather.py:_cells": 1,
          "block_hooks/gather.py:_host": 1},
}


def _empty(node: ast.expr) -> bool:
    if isinstance(node, ast.Dict):
        return not node.keys
    if isinstance(node, (ast.List, ast.Tuple, ast.Set)):
        return not node.elts
    if isinstance(node, ast.Constant):
        return node.value == "" or node.value == b""
    return isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in ("dict", "list", "tuple", "set", "frozenset", "str") \
        and not node.args and not node.keywords


def falsy_defaults(source: str) -> Counter:
    """Each `<expr> or <empty>` by the function (dotted, nested) it sits in."""
    found: Counter = Counter()

    def walk(node: ast.AST, where: str) -> None:
        for child in ast.iter_child_nodes(node):
            inside = f"{where}.{child.name}".lstrip(".") if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) else where
            if isinstance(child, ast.BoolOp) and isinstance(child.op, ast.Or) and _empty(child.values[-1]):
                found[inside or "<module>"] += 1
            walk(child, inside)

    walk(ast.parse(source), "")
    return found


class AbsentIsNoneTests(unittest.TestCase):
    def test_every_falsy_default_is_listed_with_why_it_hides_nothing(self):
        found: Counter = Counter()
        for root in ROOTS:
            for path in sorted((PRODUCT_ROOT / root).glob("*.py")):
                place = f"{path.parent.name}/{path.name}"
                for where, count in falsy_defaults(path.read_text(encoding="utf-8")).items():
                    found[f"{place}:{where}"] += count
        listed: Counter = Counter()
        for sites in HARMLESS.values():
            listed.update(sites)
        self.assertTrue(found, "nothing scanned -- the gate would guard nothing")
        self.assertEqual(dict(found), dict(listed), "a value read with `or <empty>`: write `[] if x is None else x` and check its type, "
                                                     "or list it in HARMLESS under why it cannot hide a wrong value")

    def test_the_check_reads_every_spelling(self):
        for source in ("x or {}", "x or []", "x or ''", "x or ()", "x or dict()", "x or list()", "x or str()", "a or b or []", "def f():\n    return y.get('k') or {}"):
            self.assertEqual(sum(falsy_defaults(source).values()), 1, source)
        for source in ("x or {'a': 1}", "x or None", "[] if x is None else x", "x.get('k', [])", "x and []", "x or 0"):
            self.assertEqual(sum(falsy_defaults(source).values()), 0, source)


if __name__ == "__main__":
    unittest.main()
