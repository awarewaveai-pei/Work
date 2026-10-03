"""VERIFY 查證主張 (contract card): a message is split into claims (the AI proposes, the person confirms); each checkable
fact gets a ledger line -- how many independent origins support or oppose it -- and the person's own 採信／存疑／不採信.
The platform never rules true or false. The first four kinds are shared (docs/platform/STEP2_SHARED_RULES.md §3; read
through ``ai_lego.platform.evidence.checked_claims``); VERIFY adds its own kinds below them."""

from __future__ import annotations

from ai_lego.core.domain.doc_kinds import DocKind, Field
from ai_lego.core.domain.evidence_words import SENTENCE_KINDS, STANCES, STATES, VERDICTS

CLAIM_FROM = ("訊息", "MAP", "我加的")

KINDS = [
    # one claim the person confirmed (你確認了才算)
    DocKind("verify.claim", "VERIFY", "主張", {
        "text": Field("text", 2000, required=True, human_only=True),
        "sentence": Field("choice", choices=SENTENCE_KINDS, required=True, human_only=True, labels=SENTENCE_KINDS),
        "law": Field("bool", human_only=True),                    # 講法律的句子另外標「法律」
        "jurisdiction": Field("text", 300, human_only=True),     # 法域
        "limitation": Field("text", 300, human_only=True),       # 時效
        "law_source": Field("text", 1000, human_only=True),      # 來源
        "alternative": Field("text", 2000, human_only=True),     # 對事實的解釋：你至少寫一個別的解釋
        "from": Field("choice", choices=CLAIM_FROM, required=True, labels=CLAIM_FROM),
        "map_claim": Field("text", 64, scan=False),              # the MAP claim it came from
    }),
    # what one source card says about one claim version, as the person reads it (or confirms the AI's reading): only
    # this counts in the ledger. Read from one snapshot of the page; an older claim version or snapshot is shown, not counted.
    DocKind("verify.stance", "VERIFY", "來源怎麼說", {
        "claim": Field("text", 64, required=True, scan=False),
        "claim_version": Field("int", 100000, required=True),
        "card": Field("text", 64, required=True, scan=False),
        "snapshot": Field("text", 64, required=True, scan=False),   # the card's snapshot sha256 it was read from
        "stance": Field("choice", choices=STANCES, required=True, human_only=True, labels=STANCES),
        "quote": Field("text", 2000, scan=False),               # the source's words, not the person's
        "reading": Field("text", 64, scan=False),                # the AI reading it confirms (verify.reading doc id), if any
        "reason": Field("text", 1000, human_only=True),          # 你改 AI 的讀法時，要留下理由
    }),
    # the AI's reading of sources for claims: what each card says, with the exact quote the gate checked; never counted
    # until the person confirms it into verify.stance (AI 不准宣判真假)
    DocKind("verify.reading", "VERIFY", "AI 讀來源", {
        "readings": Field("json", 60000, required=True, scan=False, cited=True),   # [{"claim", "claim_version", "card", "snapshot", "reads_as": STANCES, "quote", "citations"}]
    }, authors=frozenset({"ai"})),
    # the background search for one claim ended: 查到 / 查不到 / 無法檢查 (private group, no tool)
    DocKind("verify.search", "VERIFY", "背後找來源", {
        "claim": Field("text", 64, required=True, scan=False),
        "claim_version": Field("int", 100000, required=True),
        "state": Field("choice", choices=STATES, required=True, scan=False),
        "why": Field("text", 300, scan=False),
        "run": Field("text", 64, scan=False),
        "rules": Field("json", 2000, scan=False),
    }, authors=frozenset({"system"}), deletable=False),
    # 你對每個主張標採信、存疑或不採信，並寫一句理由
    DocKind("verify.verdict", "VERIFY", "你的判定", {
        "claim": Field("text", 64, required=True, scan=False),
        "claim_version": Field("int", 100000, required=True),     # the claim as you judged it; a changed claim shows the verdict as earlier
        "verdict": Field("choice", choices=VERDICTS, required=True, human_only=True, labels=VERDICTS),
        "reason": Field("text", 1000, required=True, human_only=True),
    }),
]
