"""逐字稿 -> minutes dict（Claude API）。

這是 2026-08-17 對話中原本由人工完成的那一步（讀逐字稿、判斷角色、寫
tldr/decisions/actions/topics）現在自動化。編碼了當時學到的教訓：

  - 不是每段錄音都是「會議」——約 40-60% 可能是社交閒聊，不可硬套決議格式
    編造不存在的東西（見 BU5.m4a 案例：業務餐敘而非正式會議）
  - 講者標籤（A/B/C）來自演算法分群，逐句歸屬不可全信；prompt 要求輸出
    _provenance 誠實說明限制，不得省略
  - 幻覺段落（hallucination.suspect_ids 標記者）要從摘要輸入中排除，
    避免虛構內容混進決議

兩段式呼叫：
  1. 產生 minutes 核心（不含 coaching）
  2. 用 deck.plan_slides() 算出的精確頁面計畫，生成對應數量的講稿
     （避免頁數與講稿數量不一致——這是 2026-08-17 手動製作時踩過的 bug）
"""
import json
import os
import re

MODEL = os.environ.get("MEETING_SUMMARY_MODEL", "claude-sonnet-4-6")
MAX_TRANSCRIPT_CHARS = 40_000  # 粗略字數上限，避免超長會議超出合理 context 使用

CORE_SCHEMA = """{
  "title": "string，依內容取的標題，不要用「未命名會議」這種空話",
  "date": "string，YYYY-MM-DD，若逐字稿無法判斷就留空字串",
  "duration_min": number,
  "attendees": ["依對話內容推定的角色描述，如 'A — 供應商主談' ；人數不明就盡量少猜"],
  "_provenance": "string，誠實說明：轉錄方式、講者標籤是否為演算法推定、幻覺過濾比例、還原了哪些專有名詞、任何不確定之處",
  "tldr": ["三句話結論，每句是完整判斷句不是標題"],
  "decisions": [{"what": "string", "owner": "string，用逐字稿中的講者標籤如 A/B/C", "rationale": "string"}],
  "actions": [{"task": "string", "owner": "string", "due": "string，逐字稿沒提到就填'未定'", "priority": "high|medium|low"}],
  "topics": [{"heading": "string", "points": ["3-5條"], "quotes": [{"text": "逐字稿原句", "speaker": "A/B/C", "t": "mm:ss"}]}],
  "open_questions": ["string"],
  "risks": ["string"]
}"""

SYSTEM_PROMPT = f"""你是會議記錄助手。輸入是一份繁體中文逐字稿（可能帶 A/B/C 講者標籤，可能沒有）。

嚴格規則：
1. 這份錄音不一定是正式會議。如果內容主要是閒聊、社交、跟業務無關，不要編造 decisions
   或硬套「雙方共識」這類空話。tldr/decisions/actions 可以是空陣列。
2. 講者標籤（若有）來自語音分群演算法，不是人工核對過的，逐句歸屬可能有誤。
   _provenance 欄位必須誠實說明這個限制，不能省略或美化。
3. 只根據逐字稿實際內容寫，不要用常識腦補逐字稿沒提到的細節（例如不要編造具體金額、
   日期，除非逐字稿真的有講）。
4. 引用（quotes）必須是逐字稿中真實出現的句子，不可意譯或重組。
5. 專有名詞若逐字稿明顯是同音異字（如中文口語轉英文縮寫），可還原但要在 _provenance 說明。
6. 只輸出符合以下 schema 的 JSON，不要有任何 schema 以外的文字、不要用 markdown code fence。

Schema:
{CORE_SCHEMA}
"""

COACHING_SYSTEM_PROMPT = """你是報告教練。根據會議記錄 JSON 與一份「頁面計畫」，
為每一頁寫報告用的講稿與教練筆記。

嚴格規則：
1. per_slide 陣列長度必須「精確等於」頁面計畫的項目數，順序也要一致。這是硬性要求，
   數量不對這份輸出就是壞的。
2. seconds 要讓 script 字數除以 240 字/分鐘接近該秒數（誤差 25% 內），不要寫超長講稿
   配很短的秒數。
3. script 要用口語、有停頓感的講稿，不是條列式書面語。
4. qa 至少 3 題，若逐字稿含推定/不確定成分，必須有一題是「這份記錄準不準/講者標籤準不準」。
5. 只輸出符合以下 schema 的 JSON，不要有 schema 以外文字、不要 markdown code fence。

Schema:
{
  "opening_hook": "string，用逐字稿裡最有力的一句話或數字破題",
  "per_slide": [
    {"goal": "string，這頁要達成什麼", "script": "string，口語講稿",
     "seconds": number, "transition": "string，銜接下一頁的一句話",
     "watch_out": "string，這頁報告時容易出的錯或會被問的問題"}
  ],
  "qa": [{"q": "string", "a": "string", "trap": "string，回答這題容易犯的錯"}],
  "delivery_tips": ["string"],
  "practice": ["string，具體的練習建議"]
}
"""


def _client():
    import anthropic
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise RuntimeError("環境變數 ANTHROPIC_API_KEY 未設定")
    return anthropic.Anthropic(api_key=key)


def _extract_json(text: str) -> dict:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.MULTILINE)
    return json.loads(text)


def build_transcript_text(turns: list = None, merged: list = None, suspect_ids: set = None) -> str:
    """優先用講者分離後的 turns；沒有就用合併後的 merged 輪次。
    suspect_ids（來自 hallucination.suspect_ids 對應的原始 segment id）目前
    turns/merged 是輪次級別，若需要逐段過濾請在呼叫端先處理。"""
    lines = []
    if turns:
        for t in turns:
            mm = int(t["start"] // 60)
            ss = int(t["start"] % 60)
            lines.append(f"[{mm:02d}:{ss:02d}] {t['speaker']}：{t['text']}")
    elif merged:
        for m in merged:
            mm = int(m["start"] // 60)
            ss = int(m["start"] % 60)
            lines.append(f"[{mm:02d}:{ss:02d}] {m['text']}")
    text = "\n".join(lines)
    if len(text) > MAX_TRANSCRIPT_CHARS:
        text = text[:MAX_TRANSCRIPT_CHARS] + "\n\n（逐字稿過長，已截斷）"
    return text


def summarize_core(transcript_text: str, audio_duration_sec: float,
                    hallucination_stats: dict = None, overlap_sec: float = None,
                    speakers: list = None, log=print) -> dict:
    log("[摘要 1/2] 產生 minutes 核心 ...")
    client = _client()

    extra = []
    if hallucination_stats:
        extra.append(f"幻覺偵測：約 {hallucination_stats.get('suspect_pct_chars', 0)}% 文字被標記為可疑（語速不可能或重複），"
                      f"寫 _provenance 時請提及此比例。")
    if overlap_sec is not None:
        extra.append(f"重疊語音（多人同時說話）共 {overlap_sec:.0f} 秒，佔音檔 {overlap_sec/max(audio_duration_sec,1)*100:.1f}%。")
    if speakers:
        extra.append(f"偵測到講者：{', '.join(speakers)}（標籤為演算法推定，非人工核對）。")

    user_msg = (
        f"音檔長度：{audio_duration_sec/60:.1f} 分鐘\n"
        + ("\n".join(extra) + "\n\n" if extra else "\n")
        + "逐字稿：\n" + transcript_text
    )

    resp = client.messages.create(
        model=MODEL, max_tokens=4096, system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_msg}],
    )
    core = _extract_json(resp.content[0].text)
    core["duration_min"] = round(audio_duration_sec / 60)
    log(f"      決議 {len(core.get('decisions',[]))} / 待辦 {len(core.get('actions',[]))} / "
        f"主題 {len(core.get('topics',[]))}")
    return core


def summarize_coaching(minutes_core: dict, transcript_text: str, log=print) -> dict:
    from . import deck
    plan = deck.plan_slides(minutes_core)
    log(f"[摘要 2/2] 產生報告教練，頁面計畫 {len(plan)} 頁 ...")

    client = _client()
    user_msg = (
        f"頁面計畫（依序，共 {len(plan)} 頁，per_slide 陣列長度必須等於這個數字）：\n"
        + "\n".join(f"{i+1}. {p}" for i, p in enumerate(plan))
        + "\n\n會議記錄 JSON：\n" + json.dumps(minutes_core, ensure_ascii=False, indent=2)
        + "\n\n逐字稿（供引用查證）：\n" + transcript_text[:MAX_TRANSCRIPT_CHARS]
    )

    resp = client.messages.create(
        model=MODEL, max_tokens=8192, system=COACHING_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_msg}],
    )
    coaching = _extract_json(resp.content[0].text)

    got = len(coaching.get("per_slide", []))
    if got != len(plan):
        raise ValueError(
            f"LLM 產生 {got} 頁講稿，頁面計畫要求 {len(plan)} 頁；"
            f"這會導致講稿與投影片錯位，已阻擋輸出"
        )
    log(f"      講稿頁數 {got} 與計畫一致")
    return coaching


def summarize(transcript_text: str, audio_duration_sec: float, **kw) -> dict:
    log = kw.pop("log", print)
    core = summarize_core(transcript_text, audio_duration_sec, log=log, **kw)
    core["coaching"] = summarize_coaching(core, transcript_text, log=log)
    return core
