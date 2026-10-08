"""GOVERN's later half (STEP34_SHARED_RULES.md §6): the consent that shares a person's own case documents. It names
documents, never copies (a copy is a pointer): the reader gets the document's current version, or the one the consent
names when it does not follow versions. Every version stays (the audit trail); the account erasure, and the erasure of
the group it names, remove it."""

from __future__ import annotations

from ai_lego.core.domain.doc_kinds import MAX_JSON_BYTES, DocKind, Field

PURPOSES = ("group", "facilitator", "research")   # research is stored, never a read path here (platform/research_export.py)
MAX_ITEMS = 500

KINDS = [
    DocKind("govern.consent", "GOVERN", "同意分享", {
        "purpose": Field("choice", choices=PURPOSES, required=True),
        "target": Field("text", 200, required=True),               # a group id | a facilitator's identity id | a study id
        "items": Field("json", MAX_JSON_BYTES, shape="array"),     # [{project_id, kind, doc_id, version?}], at most MAX_ITEMS
        "follow_versions": Field("bool"),
        "withdrawn": Field("bool"),
    }, owner="person", deletable=False),
]
