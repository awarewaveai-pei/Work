"""GOVERN's later half (STEP34_SHARED_RULES.md §6): the consent that shares a person's own case documents. It names
documents, never copies (a copy is a pointer): the reader gets the document's current version, or the one the consent
names when it does not follow versions. Every version stays (the audit trail); the account erasure, and the erasure of
the group it names, remove it.

The appeal (§9, card 30): a participant's objection to how a facilitator of their group led. The platform's (owner id =
the tenant), so no facilitator's or group's erasure reaches it; its writer stays in the event, masked by its one read
path (platform/visibility.py ``appeals_for``). Anonymous unless ``named``. Its author deletes it; their account erasure too."""

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
    DocKind("govern.appeal", "GOVERN", "申訴", {
        "group_id": Field("text", 200, required=True, scan=False),
        "about_identity_id": Field("text", 200, required=True, scan=False),   # a facilitator of that group, never its reader
        "text": Field("text", 4000, required=True, human_only=True),
        "named": Field("bool"),                                                 # false: no reader but the author sees who wrote it
    }, owner="platform", deletable=True),
]
