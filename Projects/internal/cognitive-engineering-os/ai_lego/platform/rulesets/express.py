"""EXPRESS's versioned output formats."""

from __future__ import annotations

from ai_lego.platform.rulesets import Ruleset


FORMAT_NAMES = (
    "摘要",
    "證據報告",
    "決策理由",
    "提案",
    "學習紀錄",
    "一封信",
    "談話稿",
    "論文段落",
)

FORMATS = Ruleset(
    "express.formats",
    "EXPRESS",
    "輸出格式",
    "1",
    "平台（EXPRESS 合約卡，2026-10-04）",
    [
        {"name": "摘要", "sections": ["重點", "依據", "不確定"], "reader": "需要快速知道重點的人"},
        {"name": "證據報告", "sections": ["主張", "來源", "查證狀態", "仍不確定"], "reader": "需要檢查來源的人"},
        {"name": "決策理由", "sections": ["我的判斷", "依據", "取捨", "不確定"], "reader": "一起承擔決定的人"},
        {"name": "提案", "sections": ["問題", "提議", "理由", "下一步"], "reader": "要回應提案的人"},
        {"name": "學習紀錄", "sections": ["做了什麼", "看見什麼", "下一次"], "reader": "之後要回來看的人"},
        {"name": "一封信", "sections": ["稱呼", "我想說的", "理由", "請你回應"], "reader": "收到這封信的人"},
        {"name": "談話稿", "sections": ["開場", "重點", "我想問", "收尾"], "reader": "和我談話的人"},
        {"name": "論文段落", "sections": ["主張", "證據", "限制", "結論"], "reader": "要檢查論證的讀者"},
    ],
)

# Changing any format requires a new version.
HISTORY = {"express.formats": {"1": "e14ba2478efc"}}

RULESETS = [FORMATS]
