"""The Cognitive Sovereignty Platform's blocks: 14 blocks + 5 always-on parts (contract cards:
agency-os/handoffs/2026-10-02-cognitive-sovereignty-platform/platform-supervisor.html, BLOCKS / CROSS).

Every record names the block that wrote it (共用紀錄: 每一筆都標兩件事：作者是誰、是哪一塊寫的). A tool's block comes from
its contract's ``family`` (the supervisor's TOOL_ROWS uses the same map; check-supervisor.mjs compares the two).
"""

from __future__ import annotations

from ai_lego.errors import InvariantViolation

BLOCKS = ("SENSE", "GATHER", "MAP", "THINK", "VERIFY", "COMPUTE", "DECIDE", "ACT", "LEARN", "TEACH", "EXPRESS", "FACILITATE", "COLLAB", "GOVERN")
# 完整性核心, 規範與脈絡, 組裝器, 協作合約, 共用紀錄
ALWAYS_ON = ("INTEGRITY", "CONTEXT", "ASSEMBLER", "COLLAB_CONTRACT", "RECORD")
# Engineering tools kept for internal and engineering clients; never in a user's menu (TOOL_ROWS 「不給一般使用者」).
INTERNAL = "INTERNAL"
ALL_CODES = (*BLOCKS, *ALWAYS_ON, INTERNAL)

FAMILY_BLOCK = {
    "art_therapy": "SENSE",
    "systems": "MAP", "root_cause": "MAP", "causal": "MAP", "framing": "MAP", "decomposition": "MAP",
    "strategy": "MAP", "foresight": "MAP", "stakeholders": "MAP", "insight": "MAP", "research": "MAP", "representation": "MAP",
    "stakeholder": "MAP",   # stakeholder.regulator: a lens, not a method (the supervisor's tool list leaves it out)
    "divergent": "THINK", "association": "THINK", "challenge": "THINK",
    "epistemic": "VERIFY", "evidence": "VERIFY",
    "feasibility": "COMPUTE", "finance": "COMPUTE", "computation": "COMPUTE",
    "decision": "DECIDE",
    "delivery": "ACT", "experiment": "ACT",
    "learning": "LEARN",
    "jurisdiction": "CONTEXT",
    "architecture": INTERNAL, "devops_sre": INTERNAL, "database_data": INTERNAL, "security": INTERNAL,
}


def require_block(code: object) -> str:
    if code not in ALL_CODES:
        raise InvariantViolation(f"RECORD_BLOCK_INVALID: {code!r}")
    return code  # type: ignore[return-value]


def block_of_family(family: object) -> str:
    """The block a tool belongs to; an unmapped family is a contract the map has not caught up with -- refused, never guessed."""
    if family not in FAMILY_BLOCK:
        raise InvariantViolation(f"RECORD_FAMILY_UNMAPPED: tool family {family!r} has no block")
    return FAMILY_BLOCK[family]  # type: ignore[index]
