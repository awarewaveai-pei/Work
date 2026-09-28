"""逐字稿 -> 摘要 JSON，兩條路並存。

**貼上模式（預設，零費用）**：build_prompt() 產生完整 prompt，使用者複製到
任一 AI 對話視窗（用既有訂閱額度，非 API 計費），把回傳的 JSON 貼回頁面，
pipeline.resume_after_summary() 接手完成 PPT/教練稿/會議記錄。2026-08-17
原本設計是呼叫 Claude API（見 git 歷史），因使用者要求零額外費用而改版；
nested `claude -p` headless 呼叫在 Windows+Git Bash 環境下經三次真實測試
證實不可靠（孤兒 process、stdout 管線斷裂），才走人工回路這條路。

**API 模式（2026-08-20 新增，選填，需自行填 key）**：summarize_via_api()
直接呼叫 Anthropic API，跳過貼上這一步。這是給客戶端用的——客戶碰不到
操作者的 Claude Code 對話視窗，「叫我處理」這條路對客戶不成立，只有
「自己貼」或「真正的 API」兩選一。key 由使用者在網頁設定頁自行填入
（見 lib/settings.py），不共用操作者的訂閱或憑證，每次呼叫真實計費。

兩條路共用同一份 INSTRUCTIONS/SCHEMA，行為一致；也共用 validate()，
API 模式下若驗證失敗會自動重試一次（人工回路則是使用者自己看錯誤訊息
決定要不要回去要求 AI 重新生成）。

Schema 與規則沿用 2026-08-17 對 BU5.m4a 手動處理時學到的教訓：
  - 不是每段錄音都是「會議」——閒聊不可硬套決議格式編造不存在的東西
  - 講者標籤（A/B/C）是演算法推定，_provenance 要誠實說明限制
  - coaching.per_slide 長度必須「精確等於」deck.plan_slides() 的頁數
"""
import json
import re
import time

from lib.speaker_notes import WPM_ZH

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
7. qa 至少 3 題，若逐字稿含推定/不確定成分，必須有一題是「這份記錄準不準/講者標籤準不準」。
8. 只輸出符合以下 schema 的單一 JSON 物件，不要有任何 schema 以外的文字、
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


MODEL = "claude-opus-5-5"
# Opus 5.5 always thinks; effort is the only control (its API default is medium, set explicitly here).
EFFORT = "medium"
# A safety-classifier decline is re-run by the API on the model it picks for that category.
FALLBACK_BETA = "server-side-fallback-2026-07-01"

# 兩種重試**刻意分開計數**，不共用預算：
#   內容重試 = 模型輸出不合規（解析失敗／驗證不過），要帶著錯誤訊息請它修正。
#   傳輸重試 = 網路抖動／429／5xx，跟輸出好壞無關，帶錯誤提示反而是雜訊。
# 合用一個計數器時，一次網路抖動會吃掉唯一的自我修正機會，「壞了要自己救一次」
# 這個設計意圖就靜默失效了（2026-08-27 critic 指出）。
API_CONTENT_RETRIES = 2    # 首次 + 1 次帶修正提示的重試
API_TRANSPORT_RETRIES = 3  # 每次請求各自擁有的傳輸層重試額度

# 這份 schema 的真實產出量（實測 jobs/*/minutes.json）：9,916 / 10,531 / 14,115
# 字元，內容以中文為主約等於同量級的 token 數。原本設 8192 會讓每一場真實會議
# 都在輸出中途被截斷 —— 截斷後 parse_pasted_json 的 rfind("}") 會落在內層物件、
# json.loads 拋 JSONDecodeError，而重試用的是同一個上限，於是必然二次失敗，
# 使用者被計費兩次仍退回人工貼上。32000 對最長的實測值留約 2 倍餘裕；
# claude-opus-5-5 的 thinking 也算進 max_tokens，另加 8000 給思考。
API_MAX_TOKENS = 32000 + 8000


def summarize_via_api(transcript_text: str, audio_duration_sec: float, api_key: str,
                       hallucination_stats: dict = None, overlap_sec: float = None,
                       speakers: list = None, log=print) -> dict:
    """直接呼叫 Anthropic API 產生摘要 JSON。會真的計費，呼叫前呼叫端應自行
    確認使用者已同意（app.py 的 upload 端點已要求 use_api 需搭配已設定的 key）。

    失敗（驗證不過、API 錯誤）時丟例外，讓 pipeline 走 error 狀態，不靜默吞掉。
    """
    import anthropic

    if not api_key:
        raise RuntimeError("未設定 API key，無法使用 API 模式")

    client = anthropic.Anthropic(api_key=api_key)
    prompt = build_prompt(transcript_text, audio_duration_sec,
                          hallucination_stats=hallucination_stats,
                          overlap_sec=overlap_sec, speakers=speakers)

    def _call(user_msg: str):
        """送一次請求，傳輸層錯誤自行重試（獨立額度）。回傳 resp 或丟 RuntimeError。"""
        for t in range(1, API_TRANSPORT_RETRIES + 1):
            try:
                # 串流：32k 上限的非串流請求會撞 SDK 的 10 分鐘非串流保護；get_final_message() 回完整結果
                with client.beta.messages.stream(
                    model=MODEL, max_tokens=API_MAX_TOKENS,
                    output_config={"effort": EFFORT},
                    betas=[FALLBACK_BETA], fallbacks="default",
                    messages=[{"role": "user", "content": user_msg}],
                ) as stream:
                    return stream.get_final_message()
            except (anthropic.APIConnectionError, anthropic.RateLimitError,
                    anthropic.InternalServerError, anthropic.OverloadedError,
                    anthropic.ConflictError) as e:
                # 五類都是暫時性的（網路抖動/429/伺服器端 5xx/529 過載/409 鎖衝突，
                # 對照已安裝 SDK _client.py 的 status code 映射逐一核對過，不是憑
                # 印象猜）。註：SDK 本身對 408/409/429/5xx 已有一層透明自動重試
                # （_base_client.py _should_retry），這裡的例外代表那層也已放棄；
                # 再包一層屬於防禦性的第二道保險，不是重複無意義。
                log(f"[API 摘要] 傳輸層錯誤 {t}/{API_TRANSPORT_RETRIES}"
                    f"（{type(e).__name__}）: {e}")
                if t >= API_TRANSPORT_RETRIES:
                    raise RuntimeError(
                        f"API 呼叫連續 {API_TRANSPORT_RETRIES} 次暫時性錯誤：{type(e).__name__}: {e}"
                    ) from e
                time.sleep(min(8, 2 ** t))
            except anthropic.APIStatusError as e:
                # 4xx（key 無效/請求本身有問題）重試沒有意義，直接放棄。
                raise RuntimeError(f"API 呼叫失敗（HTTP {e.status_code}）：{e.message}") from e
            except anthropic.APIError as e:
                raise RuntimeError(f"API 呼叫失敗：{e}") from e

    last_errs = None
    for attempt in range(1, API_CONTENT_RETRIES + 1):
        log(f"[API 摘要] 第 {attempt}/{API_CONTENT_RETRIES} 次呼叫 {MODEL} ...")
        user_msg = prompt
        if last_errs:
            user_msg += (
                "\n\n---\n上一次你的輸出有以下問題，請修正後重新輸出完整 JSON：\n"
                + "\n".join(f"- {e}" for e in last_errs)
            )

        resp = _call(user_msg)

        # 截斷要先於解析判斷：被 max_tokens 砍斷的輸出解析必然失敗，但錯誤訊息
        # 會是「JSON 格式錯」，把使用者與模型都指向錯誤方向。重試也沒用——同樣
        # 的上限會產生同樣的截斷，只是多付一次錢。直接如實報錯讓它退回人工回路。
        if getattr(resp, "stop_reason", None) == "max_tokens":
            raise RuntimeError(
                f"API 回應超過輸出上限（max_tokens={API_MAX_TOKENS}）被截斷，無法解析。"
                f"這場會議的摘要比預期長，請改用手動貼上模式，或調高 summarize.API_MAX_TOKENS。"
            )

        if getattr(resp, "stop_reason", None) == "refusal":
            details = getattr(resp, "stop_details", None)
            raise RuntimeError(
                f"模型拒答（類別 {getattr(details, 'category', None)!r}），fallback 模型也未接手；請改用手動貼上模式。"
            )
        # Opus 5.5 回應開頭是 thinking block：依 type 取文字，不可用 content[0]
        text = "".join(b.text for b in (resp.content or []) if getattr(b, "type", None) == "text")
        if not text.strip():
            raise RuntimeError(f"API 回應沒有任何文字內容（stop_reason={getattr(resp, 'stop_reason', '?')}）")
        try:
            minutes = parse_pasted_json(text)
        except ValueError as e:
            last_errs = [f"回應無法解析為 JSON：{e}"]
            log(f"[API 摘要] 第 {attempt} 次解析失敗，"
                f"{'重試' if attempt < API_CONTENT_RETRIES else '放棄'}")
            continue

        errs = validate(minutes)
        if not errs:
            log(f"[API 摘要] 第 {attempt} 次通過驗證")
            return minutes
        last_errs = errs
        log(f"[API 摘要] 第 {attempt} 次驗證失敗：{errs}；"
            f"{'重試' if attempt < API_CONTENT_RETRIES else '放棄'}")

    raise RuntimeError(f"API 產生的摘要經 {API_CONTENT_RETRIES} 次嘗試仍不符規格：{last_errs}")


def normalize(minutes: dict) -> dict:
    """就地把型別修成下游一致可依賴的形式，回傳同一個 dict。

    **存在理由（不變量）**：`minutes` 通過 validate() 之後，下游所有輸出模組
    （deck / speaker_notes / excel / word，以及未來任何新格式）都應該能直接
    對 `coaching.per_slide[*].seconds` 做算術、對 `goal`/`script` 做字串操作，
    不必各自防禦。

    為什麼需要：SCHEMA 裡 `"seconds": "number"` 的值本身是字串，會誘導模型回
    `"seconds": "90"`；而 README 明文支援免費層級模型，回字串數字是常態。
    validate() 原本只檢查 key 存在與頁數對齊，不驗型別，於是一份「合法通過
    驗證」的 JSON 可以一路寫完 PPT 與 Excel，最後在 word.py 的 sum() 炸掉——
    留下半套交付物、job 標記 error，而使用者重貼同一份 JSON 會撞同一道牆。

    刻意做成單一入口的正規化而非在各輸出模組補 int()：後者是補丁，下一個
    新增的輸出格式還會再踩一次（2026-08-27 critic 明確指出這一點）。
    """
    def _num(v, default=0):
        if isinstance(v, bool):  # bool 是 int 的子類，但語義上不是數字
            return default
        if isinstance(v, (int, float)):
            return v
        try:
            return int(str(v).strip())
        except (TypeError, ValueError):
            try:
                return float(str(v).strip())
            except (TypeError, ValueError):
                return default

    def _str(v, default=""):
        return v if isinstance(v, str) else (default if v is None else str(v))

    coaching = minutes.get("coaching")
    if isinstance(coaching, dict):
        per = coaching.get("per_slide")
        if isinstance(per, list):
            for n in per:
                if not isinstance(n, dict):
                    continue
                for k in ("goal", "script", "transition", "watch_out"):
                    n[k] = _str(n.get(k))
                n["seconds"] = round(len(n["script"]) / WPM_ZH * 60)   # the script length decides, not the model
        coaching["opening_hook"] = _str(coaching.get("opening_hook"))

    if isinstance(minutes.get("attendees"), list):
        minutes["attendees"] = [_str(a) for a in minutes["attendees"]]
    minutes["title"] = _str(minutes.get("title"), "會議記錄")
    minutes["date"] = _str(minutes.get("date"))
    minutes["duration_min"] = _num(minutes.get("duration_min"), 0)
    return minutes


def validate(minutes: dict) -> list:
    """回傳錯誤訊息清單；空清單代表通過。不丟例外，讓呼叫端決定怎麼回報給使用者。

    通過（回傳空清單）時已順帶做完 normalize()，下游可直接依賴型別。"""
    from . import deck
    errs = []
    required = ("title", "tldr", "topics", "_provenance", "coaching")
    for k in required:
        if k not in minutes:
            errs.append(f"缺少必要欄位: {k}")
    if errs:
        return errs

    # 必要欄位齊全後先正規化，再做頁數比對——plan_slides 也讀 minutes，
    # 讓它看到的是已正規化的值，避免兩邊對同一份資料有不同的型別假設。
    normalize(minutes)

    plan = deck.plan_slides(minutes)
    per_slide = minutes.get("coaching", {}).get("per_slide", [])
    if len(per_slide) != len(plan):
        errs.append(
            f"講稿頁數 {len(per_slide)} 與投影片頁數 {len(plan)} 不一致"
            f"（頁面計畫：{', '.join(plan)}）；請照 prompt 規則 6 重新產生"
        )
    return errs
