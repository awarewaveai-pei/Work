"""把 VAD 切碎的短段合併成可讀的說話輪次。

whisper + VAD 常把一句話拆成 3-4 段（實測平均 1.56 秒/段）。純後處理，不重跑轉錄。
"""
from .transcribe import joined_text

GAP_MERGE = 0.8
MAX_CHARS = 120
MAX_SPAN = 45.0
END_PUNCT = "。！？!?…"


def _text_tr(s: dict) -> str:
    """原文後面括號附翻譯（tr，聆聽時的即時翻譯）；給會議記錄的輸入用，lib/diarize.py turns 同一規則。"""
    return s["text"] + (f"（{s['tr']}）" if s.get("tr") else "")


def merge(segments: list) -> list:
    out = []
    cur = None
    for s in segments:
        if cur is None:
            cur = {"start": s["start"], "end": s["end"], "text": s["text"], "text_tr": _text_tr(s),
                   "ids": [s["id"]], "min_lp": s["avg_logprob"], "who": s.get("who")}
            continue
        gap = s["start"] - cur["end"]
        ends_clean = cur["text"][-1:] in END_PUNCT
        too_long = len(cur["text"]) + len(s["text"]) > MAX_CHARS
        too_wide = s["end"] - cur["start"] > MAX_SPAN

        joinable = gap <= GAP_MERGE and not too_long and not too_wide
        if not joinable and not ends_clean and gap <= GAP_MERGE * 2 and not too_long and not too_wide:
            joinable = True
        if s.get("who") != cur["who"]:
            joinable = False        # 我 and 對方 never share a paragraph

        if joinable:
            cur["text"] = joined_text((cur["text"], s["text"]))
            cur["text_tr"] = joined_text((cur["text_tr"], _text_tr(s)))
            cur["end"] = s["end"]
            cur["ids"].append(s["id"])
            cur["min_lp"] = min(cur["min_lp"], s["avg_logprob"])
        else:
            out.append(cur)
            cur = {"start": s["start"], "end": s["end"], "text": s["text"], "text_tr": _text_tr(s),
                   "ids": [s["id"]], "min_lp": s["avg_logprob"], "who": s.get("who")}
    if cur:
        out.append(cur)
    return out
