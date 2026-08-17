"""偵測 Whisper 重複型幻覺。

為什麼需要：avg_logprob 抓不到。實測 BU5.m4a 中三段完全相同的幻覺文字，
logprob 全是 -0.23（高信心）。信心分數只反映模型對自己吐的 token有多確定，
不反映這段話是否真的存在於音訊中。

兩個獨立訊號：
  1. 語速物理上限 —— 中文口語最快約 8-9 字/秒，>12 字/秒 幾乎必為幻覺
  2. 近距重複 —— 同一句在短時間窗內重複出現
"""
from collections import defaultdict

MAX_CPS = 12.0
WARN_CPS = 9.0
REPEAT_WINDOW = 30.0
MIN_REPEAT_LEN = 4


def analyse(segs: list) -> dict:
    flags = defaultdict(list)

    for s in segs:
        dur = s["end"] - s["start"]
        txt = s["text"].strip()
        if dur <= 0 or not txt:
            continue
        cps = len(txt) / dur
        if cps > MAX_CPS:
            flags["impossible_rate"].append((s, cps))
        elif cps > WARN_CPS:
            flags["fast_rate"].append((s, cps))

    seen = []
    for s in segs:
        t = s["text"].strip()
        if len(t) < MIN_REPEAT_LEN:
            continue
        for pt, ps in reversed(seen):
            if s["start"] - ps["start"] > REPEAT_WINDOW:
                break
            if pt == t:
                flags["near_repeat"].append((s, ps))
                break
        seen.append((t, s))
        seen = seen[-60:]

    return flags


def suspect_ids(segs: list) -> tuple[set, dict]:
    """回傳 (可疑 segment id 集合, 統計摘要)。呼叫端可用 id 集合過濾摘要輸入。"""
    flags = analyse(segs)
    imp, rep = flags["impossible_rate"], flags["near_repeat"]
    ids = {s["id"] for s, _ in imp} | {s["id"] for s, _ in rep}
    tot_chars = sum(len(s["text"]) for s in segs) or 1
    sus_chars = sum(len(s["text"]) for s in segs if s["id"] in ids)
    stats = {
        "total_segments": len(segs),
        "impossible_rate_count": len(imp),
        "near_repeat_count": len(rep),
        "suspect_segments": len(ids),
        "suspect_pct_segments": round(len(ids) / len(segs) * 100, 1) if segs else 0,
        "suspect_pct_chars": round(sus_chars / tot_chars * 100, 1),
    }
    return ids, stats
