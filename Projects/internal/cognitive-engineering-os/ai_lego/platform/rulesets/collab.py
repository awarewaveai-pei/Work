"""COLLAB's rules (STEP34_SHARED_RULES.md §8): how 「大家怎麼看」 is decided -- the rule the pure function
platform/collab_agreement.py applies, as the page shows it. Deterministic, no model."""

from __future__ import annotations

from ai_lego.platform.rulesets import Ruleset

AGREEMENT = Ruleset("collab.agreement", "COLLAB", "大家怎麼看的算法", "1", "平台（第 3 步）", {
    "counted": "目前在群組裡、已經確認的成員；還在等召集人確認的人不算，名字列出來",
    "vector": "每個人對每個標過的方案（這一輪和之前幾輪）：同意 1、異議 -1、沒標 0；這一輪的標記蓋過之前的",
    "sides": "用 2-means 分成兩邊：從距離最遠的兩個人開始（不同的格數），一樣遠時取成員編號小的；最多算 20 次",
    "agreed_across": "兩邊都有人同意，而且沒有任何人異議，才算想法不同的人都同意；不看人數",
    "without_heaviest": "再算一次：排除標得最多的 10%（無條件進位），10 個人以上才排除",
    "insufficient": "還不夠看出誰跟誰不同",
    "insufficient_when": "算進來的人不到 3 個、標過的方案不到 2 個，或分不出兩邊",
})

RULESETS = [AGREEMENT]

HISTORY = {
    "collab.agreement": {"1": "e224657f2c3a"},
}
