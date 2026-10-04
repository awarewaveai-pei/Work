"""VERIFY's versioned lists (STEP2_SHARED_RULES §6; the card: 「這份清單有版本」「系統記下這次用的手法清單、查核資料庫名單」).

- ``verify.techniques``: the manipulation patterns the AI may name -- the nine of the card, each with what it looks like.
- ``verify.factcheck_dbs``: which fact-check databases are shown, per place (你在別的地方時，系統換成當地的查核組織), and
  whose hits come first. Collect asks the databases and owns matching and licences (specs/wire/lookup.v1.json R5); v1
  held thresholds and is kept as recorded. A place is matched with the crisis lines' place names (``safety.covers``); a
  place not on the list gets ``elsewhere``.
"""

from __future__ import annotations

from ai_lego.platform.rulesets import Ruleset

TECHNIQUES = Ruleset("verify.techniques", "VERIFY", "操弄手法清單", "1", "平台（VERIFY 合約卡列的九種，2026-10-04）", [
    {"name": "斷章取義", "looks_like": "只摘一段話，拿掉前後文，讓意思變了"},
    {"name": "冒充來源", "looks_like": "假裝是政府、媒體、醫院、名人或親友說的"},
    {"name": "舊圖新用", "looks_like": "把以前的圖片或影片，說成是現在發生的"},
    {"name": "移花接木", "looks_like": "把不同時間、地點或人的事接在一起"},
    {"name": "半真半假", "looks_like": "真的事情裡夾一部分假的"},
    {"name": "假的二選一", "looks_like": "只給兩個選項，好像沒有別的可能"},
    {"name": "情緒勒索", "looks_like": "用害怕、憤怒、愧疚逼你馬上做，例如「不轉就來不及」"},
    {"name": "用量造勢", "looks_like": "用「大家都在傳」「已經幾萬人分享」讓你覺得一定是真的"},
    {"name": "冒充在地人", "looks_like": "假裝是本地人或某個群體的一份子來說話"},
])

FACTCHECK_DBS = Ruleset("verify.factcheck_dbs", "VERIFY", "查核資料庫名單", "2", "平台（蒐集器查的兩個資料庫，加上要金鑰的一個；比對門檻和授權文字在蒐集器）", {
    "dbs": {
        "claimreview": {"name": "全球查核結果公開資料檔", "by": "各查核組織，由 Data Commons 彙整"},
        "cofacts": {"name": "Cofacts 真的假的", "by": "Cofacts 志工"},
        "google": {"name": "Google 查核搜尋", "by": "Google Fact Check Tools"},
    },
    "places": {"台灣": {"use": ["cofacts", "claimreview", "google"], "local_publishers": ["tfc-taiwan.org.tw", "mygopen.com"]}},
    "elsewhere": {"use": ["claimreview", "google"], "local_publishers": []},
})

RULESETS = [TECHNIQUES, FACTCHECK_DBS]

HISTORY = {
    "verify.techniques": {"1": "91c7b1062b44"},
    "verify.factcheck_dbs": {"1": "8581426e417e", "2": "30fa10ec9bb1"},
}
