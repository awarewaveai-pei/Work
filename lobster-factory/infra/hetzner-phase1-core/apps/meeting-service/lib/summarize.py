"""逐字稿 -> 貼上用 prompt（不呼叫 API，零額外費用）。

2026-08-17 原本設計是呼叫 Claude API（見 git 歷史）。改版原因：使用者要求
不額外付費，只用 Claude Code 訂閱額度；而 nested `claude -p` headless 呼叫
在這個 Windows + Git Bash 環境下經三次真實測試證實不可靠（孤兒 process、
stdout 管線斷裂）。改為人工回路：本函式產生一份完整 prompt，使用者複製到
任一 Claude 對話視窗（用訂閱，非 API 計費），把回傳的 JSON 貼回頁面，
pipeline.resume_after_summary() 接手完成 PPT/教練稿/會議記錄。

Schema 與規則沿用 2026-08-17 對 BU5.m4a 手動處理時學到的教訓：
  - 不是每段錄音都是「會議」——閒聊不可硬套決議格式編造不存在的東西
  - 講者標籤（A/B/C）是演算法推定，_provenance 要誠實說明限制
  - coaching.per_slide 長度必須「精確等於」deck.plan_slides() 的頁數，
    這是一次性單一 prompt 生成，由 LLM 自己維持一致（就像人工當時做的一樣）；
    pipeline 端仍會用 validate() 硬擋數量不符，不寄望 prompt 遵從率 100%
"""
import json
import re

MAX_TRANSCRIPT_CHARS = 60_000  # 貼上到聊天視窗的合理上限，避免單則訊息過長

SCHEMA = """{
  "title": "string，依內容取的標題，不要用「未命名會議」這種空話",
  "date": "string，YYYY-MM-DD，若逐字稿無法判斷就留空字串",
  "duration_min": number,
  "attendees": ["依對話內容推定的角色描述，如 'A — 供應商主談'；人數不明就盡量少猜"],
  "_provenance": "string，誠實說明：轉錄方式、講者標籤是否為演算法推定、幻覺過濾比例、還原了哪些專有名詞、任何不確定之處",
  "tldr": ["三句話結論，每句是完整判斷句不是標題；不是會議可留空陣列"],
  "decisions": [{"what": "string", "owner": "string，用逐字稿中的講者標籤如 A/B/C", "rationale": "string"}],
  "actions": [{"task": "string", "owner": "string", "due": "string，逐字稿沒提到就填'未定'", "priority": "high|medium|low"}],
  "topics": [{"heading": "string", "points": ["3-5條"], "quotes": [{"text": "逐字稿原句，不可意譯", "speaker": "A/B/C", "t": "mm:ss"}]}],
  "open_questions": ["string"],
  "risks": ["string"],
  "coaching": {
    "opening_hook": "string，用逐字稿裡最有力的一句話或數字破題",
    "per_slide": [
      {"goal": "string，這頁要達成什麼", "script": "string，口語講稿",
       "seconds": "number", "transition": "string，銜接下一頁的一句話",
       "watch_out": "string，這頁報告時容易出的錯或會被問的問題"}
    ],
    "qa": [{"q": "string", "a": "string", "trap": "string，回答這題容易犯的錯"}],
    "delivery_tips": ["string"],
    "practice": ["string，具體的練習建議"]
  }
}"""

INSTRUCTIONS = f"""你是會議記錄助手兼報告教練。輸入是一份繁體中文逐字稿（可能帶 A/B/C 講者標籤）。

嚴格規則：
1. 這份錄音不一定是正式會議。如果內容主要是閒聊、社交、跟業務無關，不要編造 decisions
   或硬套「雙方共識」這類空話。tldr/decisions/actions 可以是空陣列。
2. 講者標籤（若有）來自語音分群演算法，不是人工核對過的，逐句歸屬可能有誤。
   _provenance 欄位必須誠實說明這個限制，不能省略或美化。
3. 只根據逐字稿實際內容寫，不要用常識腦補逐字稿沒提到的細節（不要編造具體金額、
   日期，除非逐字稿真的有講）。
4. 引用（quotes）必須是逐字稿中真實出現的句子，不可意譯或重組。
5. 專有名詞若逐字稿明顯是同音異字，可還原但要在 _provenance 說明。
6. coaching.per_slide 的陣列長度必須「精確等於」以下頁面數：
   title(1) + tldr(1) + decisions(1，僅當 decisions 非空) + actions(1，僅當 actions 非空)
   + topics 每個一頁(最多 6 個) + open(1，僅當 open_questions 或 risks 非空)。
   也就是說：你在上面的 decisions/actions/topics/open_questions/risks 寫了什麼，
   per_slide 就要對應幾頁講稿，順序一致。這是硬性要求，數量不對整份輸出視為壞的。
7. per_slide 的 seconds 要讓 script 字數除以 240 字/分鐘接近該秒數（誤差 25% 內）。
8. qa 至少 3 題，若逐字稿含推定/不確定成分，必須有一題是「這份記錄準不準/講者標籤準不準」。
9. 只輸出符合以下 schema 的單一 JSON 物件，不要有任何 schema 以外的文字、
   不要用 markdown code fence、不要加註解。

Schema:
{SCHEMA}
"""


def build_transcript_text(turns: list = None, merged: list = None) -> str:
    """優先用講者分離後的 turns；沒有就用合併後的 merged 輪次。"""
    lines = []
    if turns:
        for t in turns:
            mm, ss = int(t["start"] // 60), int(t["start"] % 60)
            lines.append(f"[{mm:02d}:{ss:02d}] {t['speaker']}：{t['text']}")
    elif merged:
        for m in merged:
            mm, ss = int(m["start"] // 60), int(m["start"] % 60)
            lines.append(f"[{mm:02d}:{ss:02d}] {m['text']}")
    text = "\n".join(lines)
    if len(text) > MAX_TRANSCRIPT_CHARS:
        text = text[:MAX_TRANSCRIPT_CHARS] + "\n\n（逐字稿過長，已截斷，可能影響後段內容判讀）"
    return text


def build_prompt(transcript_text: str, audio_duration_sec: float,
                  hallucination_stats: dict = None, overlap_sec: float = None,
                  speakers: list = None) -> str:
    """回傳完整可直接貼進聊天視窗的 prompt（instructions + 資料）。"""
    extra = []
    if hallucination_stats:
        extra.append(f"幻覺偵測：約 {hallucination_stats.get('suspect_pct_chars', 0)}% 文字被標記為可疑"
                      f"（語速物理不可能或近距重複），寫 _provenance 時請提及此比例。")
    if overlap_sec is not None:
        extra.append(f"重疊語音（多人同時說話）共 {overlap_sec:.0f} 秒，佔音檔 "
                      f"{overlap_sec/max(audio_duration_sec,1)*100:.1f}%。")
    if speakers:
        extra.append(f"偵測到講者：{', '.join(speakers)}（標籤為演算法推定，非人工核對）。")

    parts = [
        INSTRUCTIONS,
        f"\n音檔長度：{audio_duration_sec/60:.1f} 分鐘",
    ]
    if extra:
        parts.append("\n".join(extra))
    parts.append("\n逐字稿：\n" + transcript_text)
    return "\n".join(parts)


def parse_pasted_json(text: str) -> dict:
    """使用者貼回的內容常帶 markdown code fence 或前後贅字，即使 prompt 明講不要。
    這裡容錯處理，不假設輸出乾淨。"""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    # 有時會夾雜「這是您要的 JSON：」之類前言，抓第一個 { 到最後一個 } 之間
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("找不到有效的 JSON 物件（沒有 { }）")
    return json.loads(text[start:end + 1])


def validate(minutes: dict) -> list:
    """回傳錯誤訊息清單；空清單代表通過。不丟例外，讓呼叫端決定怎麼回報給使用者。"""
    from . import deck
    errs = []
    required = ("title", "tldr", "topics", "_provenance", "coaching")
    for k in required:
        if k not in minutes:
            errs.append(f"缺少必要欄位: {k}")
    if errs:
        return errs

    plan = deck.plan_slides(minutes)
    per_slide = minutes.get("coaching", {}).get("per_slide", [])
    if len(per_slide) != len(plan):
        errs.append(
            f"講稿頁數 {len(per_slide)} 與投影片頁數 {len(plan)} 不一致"
            f"（頁面計畫：{', '.join(plan)}）；請照 prompt 規則 6 重新產生"
        )
    return errs
