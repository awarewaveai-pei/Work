"""把 VAD 切碎的短段合併成可讀的說話輪次。

whisper + VAD 常把一句話拆成 3-4 段（實測平均 1.56 秒/段）。純後處理，不重跑轉錄。
"""
import re

GAP_MERGE = 0.8
MAX_CHARS = 120
MAX_SPAN = 45.0
END_PUNCT = "。！？!?…"


def merge(segments: list) -> list:
    out = []
    cur = None
    for s in segments:
        if cur is None:
            cur = {"start": s["start"], "end": s["end"], "text": s["text"],
                   "ids": [s["id"]], "min_lp": s["avg_logprob"]}
            continue
        gap = s["start"] - cur["end"]
        ends_clean = cur["text"][-1:] in END_PUNCT
        too_long = len(cur["text"]) + len(s["text"]) > MAX_CHARS
        too_wide = s["end"] - cur["start"] > MAX_SPAN

        joinable = gap <= GAP_MERGE and not too_long and not too_wide
        if not joinable and not ends_clean and gap <= GAP_MERGE * 2 and not too_long and not too_wide:
            joinable = True

        if joinable:
            sep = "" if re.search(r"[一-鿿]$", cur["text"]) and re.match(r"^[一-鿿]", s["text"]) else " "
            cur["text"] = (cur["text"] + sep + s["text"]).strip()
            cur["end"] = s["end"]
            cur["ids"].append(s["id"])
            cur["min_lp"] = min(cur["min_lp"], s["avg_logprob"])
        else:
            out.append(cur)
            cur = {"start": s["start"], "end": s["end"], "text": s["text"],
                   "ids": [s["id"]], "min_lp": s["avg_logprob"]}
    if cur:
        out.append(cur)
    return out
