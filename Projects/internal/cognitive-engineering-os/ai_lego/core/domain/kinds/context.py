"""規範與脈絡 (contract card): the lens across MAP's six layers -- the world this matter sits in. The notes are the
person's (every version stays); the AI only points at facets that may matter but are not looked at yet
(``context.pointers``). No country, culture or legal order is assumed: the places come from the intake, and a law
claim without its 法域、時效、來源 is shown as 未確認."""

from __future__ import annotations

from ai_lego.core.domain.doc_kinds import DocKind, Field

# The list grows (card 「清單會再增加」): bump the version with any change; a note records the version it was written with.
FACETS_VERSION = "2026-10-03.1"
FACETS = (
    ("地理／地形／地域", "距離、交通、氣候、災害、資源和邊界在哪裡；城鄉、區域落差、地方的歷史"),
    ("歷史與集體記憶", "以前在這裡發生過什麼、當地人記得什麼；口耳相傳的事，外人常常不知道"),
    ("國際關係", "這個國家跟別國的關係：外交、同盟、制裁、鄰國的壓力、大國角力"),
    ("戰爭與武裝衝突", "國與國的戰爭、內戰、軍閥割據、佔領、停火之後的局面"),
    ("國內政治情勢", "政黨與派系、政權穩不穩、選舉、各方對外國政權的立場、對國家前途的根本分歧"),
    ("經濟", "就業、物價、貧富、債務、產業、誰掌握資源"),
    ("教育狀況", "誰能受教育、教什麼、誰被排除在外（例：阿富汗禁止女性受教育）"),
    ("資訊環境", "媒體、審查、演算法、宣傳：這裡的人看得到什麼、看不到什麼"),
    ("認知作戰與資訊戰", "有沒有人在有組織地影響這裡的人怎麼想：假帳號、機器人帳號、偽造的新聞網站、內容農場、在地協力者；用大量內容把網路上看得到的東西換掉"),
    ("群體處境", "性別、族群、世代、少數：同一件事對不同的人是不是不同的事"),
    ("文化", "什麼被當成理所當然；傳統內部也有不同的聲音"),
    ("宗教", "教義、教團、宗教權威；內部有多種詮釋"),
    ("法律", "適用哪裡的法律、時效、來源；法律義務不是個人偏好"),
    ("倫理", "依據的原則、彼此衝突的價值"),
    ("道德", "什麼被視為應該、不該；誰承擔後果"),
)
FACET_NAMES = tuple(name for name, _ in FACETS)
# Two questions for each facet that matters
FACET_QUESTIONS = (
    ("defines_normal", "它怎麼界定這裡的「正常、正確、允許」？"),
    ("is_cause", "它是不是造成這件事的原因之一？如果換一個地方、一種制度、一個文化，這件事還會發生嗎？"),
)
# The four checks every judgment walks (the third is MAP's claim columns)
CHECKS = (
    ("rights_duties", "誰有權決定、誰負什麼義務、這樣正不正當", "寫下：誰有權利、誰有義務，和它正當的條件。"),
    ("norm_origin", "這條規範從哪來、誰定的、誰傳下來、誰受益", "寫下：這條規範的來源，和背後的權力與利益。"),
    ("claim_kind", "它是事實、法律條件，還是價值", "這一項在「拆解」的主張欄做：事實要查證，法律要寫法域和來源，價值要寫怎麼權衡。"),
    ("stance", "你是真心認同、暫時遵守、仍有保留，還是沒看見別的可能", "寫下：暫定的立場、理由，和什麼情況要重新檢查。"),
)
STANCES = ("真心認同", "暫時遵守", "仍有保留", "沒看見別的可能")
# 文化、宗教: ask the person for their own understanding before anything else (card 「碰到文化和宗教，要先問當事人自己怎麼理解」)
OWN_FIRST = ("文化", "宗教")
OWN_FIRST_NOTE = "先寫你自己怎麼理解。傳統內部也有不同的詮釋；你的理解放在平台的任何說法之前。"
# 公共議題判斷: the interface questions of 《判斷主權教育架構 v0.1》, asked when the intake's package is this one
PUBLIC_ISSUE_PACKAGE = "公共議題判斷"
INTERFACE_QUESTIONS = (
    "個體判斷權與制度決策權在哪裡相遇？",
    "制度何時有正當理由限制個體選擇？",
    "誰來判斷「共同利益」？",
    "如果制度必須保有權威，如何避免權威變成認知上的接管？",
    "如果個體必須保有自主，如何避免自主變成拒絕一切共同責任？",
)

KINDS = [
    DocKind("context.notes", "CONTEXT", "脈絡註記", {
        "facets_version": Field("text", 40),                # which list of facets this was written with
        "facets": Field("json", 40000, labels=FACET_NAMES),  # [{facet, relevant, defines_normal, is_cause, custom?, definition?}]; a facet you name yourself is your words
        "jurisdictions": Field("list", 10, scan=False),     # 適用哪裡的法律 (places, from the intake or your own; not read for risk, like the intake's places)
        "rights_duties": Field("text", 3000, human_only=True),
        "norm_origin": Field("text", 3000, human_only=True),
        "stance_kind": Field("choice", choices=STANCES, human_only=True),
        "stance": Field("text", 3000, human_only=True),     # 暫定的立場和理由
        "recheck_when": Field("text", 1000, human_only=True),
        "interface": Field("json", 8000, human_only=True),  # {"1".."5": your answer} when the package is 公共議題判斷
    }, deletable=False, singleton=True),
    DocKind("context.pointers", "CONTEXT", "AI 提醒可能有關的面向", {
        "facets": Field("json", 8000),                     # [{facet, why}]: facets not looked at yet that may matter
    }, authors=frozenset({"ai"}), singleton=True),
]


def spec() -> dict:
    """What the page shows, from the one place that holds it."""
    return {
        "version": FACETS_VERSION,
        "facets": [{"facet": name, "definition": definition} for name, definition in FACETS],
        "facet_questions": [{"key": key, "question": question} for key, question in FACET_QUESTIONS],
        "checks": [{"key": key, "question": question, "how": how} for key, question, how in CHECKS],
        "stances": list(STANCES),
        "own_first": {"facets": list(OWN_FIRST), "note": OWN_FIRST_NOTE},
        "public_issue": {"package": PUBLIC_ISSUE_PACKAGE, "questions": list(INTERFACE_QUESTIONS)},
    }
