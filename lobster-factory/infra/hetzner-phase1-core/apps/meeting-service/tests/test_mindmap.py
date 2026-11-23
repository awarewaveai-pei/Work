"""lib/mindmap.py：逐字稿 -> prompt；AI 回覆 -> 樹。跑法：python -m pytest tests/test_mindmap.py"""
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from lib import mindmap

FENCE = "`" * 3


def test_prompt_carries_the_transcript_and_caps_its_length():
    assert mindmap.build_prompt("[00:00] A：上線改到三月").endswith("[00:00] A：上線改到三月")
    long = mindmap.build_prompt("字" * (mindmap.MAX_TRANSCRIPT_CHARS + 10))
    assert long.endswith("（逐字稿過長，已截斷）")


def test_reply_with_code_fence_becomes_a_tree():
    reply = {"text": "供應商季會", "children": [{"text": "時程", "children": [{"text": "上線改到三月"}]}, {"text": "預算"}]}
    tree = mindmap.parse_tree(f"{FENCE}json\n{json.dumps(reply, ensure_ascii=False)}\n{FENCE}")
    assert tree == {"text": "供應商季會", "children": [
        {"text": "時程", "children": [{"text": "上線改到三月", "children": []}]},
        {"text": "預算", "children": []}]}


def test_untrusted_shapes_are_trimmed_not_trusted():
    deep = {"text": "1", "children": [{"text": "2", "children": [{"text": "3", "children": [
        {"text": "4", "children": [{"text": "5"}]}]}]}, "x", {"text": ""}, {"text": 7, "children": None}]}
    tree = mindmap.parse_tree(json.dumps(deep))
    assert [c["text"] for c in tree["children"]] == ["2", "7"]
    assert tree["children"][0]["children"][0]["children"][0] == {"text": "4", "children": []}
    wide = {"text": "r", "children": [{"text": "長" * 500}] * 30}
    tree = mindmap.parse_tree(json.dumps(wide))
    assert len(tree["children"]) == mindmap.MAX_CHILDREN and len(tree["children"][0]["text"]) == mindmap.MAX_TEXT_CHARS


@pytest.mark.parametrize("bad", ["沒有 JSON", "{}", json.dumps({"text": "只有根"}),
                                 json.dumps({"text": "", "children": [{"text": "a"}]})])
def test_a_reply_without_branches_is_refused(bad):
    with pytest.raises(ValueError):
        mindmap.parse_tree(bad)
