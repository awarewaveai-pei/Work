"""EXPRESS records: a person's selection, traced draft sentences, and person-only send."""

from __future__ import annotations

from ai_lego.core.domain.doc_kinds import DocKind, Field
from ai_lego.platform.rulesets.express import FORMAT_NAMES


KINDS = [
    DocKind("express.selection", "EXPRESS", "輸出選擇", {
        "items": Field("json", 30000, required=True, human_only=True, shape="array"),
        "format": Field("choice", choices=FORMAT_NAMES, human_only=True),
        "reader": Field("text", 500, human_only=True),
        "key_points": Field("text", 4000, human_only=True),
        "unchecked_ok": Field("bool", human_only=True),
    }, singleton=True),
    DocKind("express.draft", "EXPRESS", "輸出稿", {
        "format": Field("choice", choices=FORMAT_NAMES, required=True),
        "reader": Field("text", 500, required=True),
        "sentences": Field("json", 60000, required=True, shape="array"),
        "last_read_version": Field("int", 100000),
    }, authors=frozenset({"ai", "joint", "user"})),
    DocKind("express.sent", "EXPRESS", "已送出的稿", {
        "draft": Field("text", 64, required=True, human_only=True, scan=False),
        "version": Field("int", 100000, required=True, human_only=True),
        "to": Field("text", 1000, required=True, human_only=True),
    }, authors=frozenset({"user"}), deletable=False),
]
