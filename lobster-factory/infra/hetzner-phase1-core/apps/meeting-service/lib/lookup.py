"""會議中查詢：看不懂的一段話 -> 搜尋網路，或問 AI。

兩個動作都把反白的文字送出這台電腦（搜尋 -> Serper；AI -> 設定頁的 Claude，沒有就用 Gemini），所以只在
使用者按下時才呼叫。問 AI 會先搜尋一次，把結果交給模型整理：2026-11-25 實測三題，模型單獨回答時
Gemini 對不認識的產品名兩次都編出答案；附上搜尋結果後 Claude／Gemini／OpenAI 都改答「查不到」。
這裡只組提示詞；模型呼叫在 lib/live/hub.py（跟翻譯共用同一個 Translator 與用量統計）。
"""
import json
import urllib.request

SERPER_URL = "https://google.serper.dev/search"
MAX_QUERY_CHARS = 200
MAX_ASK_CHARS = 2000
MAX_CONTEXT_CHARS = 3000

ASK_SYSTEM = """使用者正在開會，對方說的某一段話他沒聽懂。
用台灣的繁體中文回答，最多六句：第一句直接說這段話（或這個詞）的意思，接著補上聽懂它需要的背景。
人名、產品名、專有名詞保留原文。不要建議使用者該怎麼回答。只寫純文字，不要用 Markdown（不要粗體、不要條列符號）。
- 句子或一般詞彙的意思，用你自己的理解直接解釋，不用標來源。
- 特定產品、公司、人物、事件的事實，只能來自下面附的網路搜尋結果與會議逐字稿；用到哪一筆搜尋結果，就在那句句末用半形方括號標編號，一筆一個，例如 [1] 或 [2][5]。
- 搜尋結果與逐字稿都沒有提到，就說查不到，不要用自己的記憶補，也不要從名稱猜。"""


def search(query: str, key: str, count: int = 5) -> list:
    """回傳 [{"title", "link", "snippet"}]。"""
    body = json.dumps({"q": " ".join(query.split())[:MAX_QUERY_CHARS], "num": count, "hl": "zh-tw"}).encode()
    req = urllib.request.Request(SERPER_URL, data=body,
                                 headers={"X-API-KEY": key, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.load(resp)
    return [{"title": r.get("title", ""), "link": r.get("link", ""), "snippet": r.get("snippet", "")}
            for r in data.get("organic", [])[:count]]


def ask_user(text: str, context: str, results: list) -> str:
    """問 AI 的使用者訊息。context = 目前為止的逐字稿尾段，可為空；results = search() 的結果，可為空。"""
    user = f"我沒聽懂的部分：\n{text.strip()[:MAX_ASK_CHARS]}"
    if context.strip():
        user = f"會議目前為止的逐字稿（最後一段）：\n{context.strip()[-MAX_CONTEXT_CHARS:]}\n\n{user}"
    if results:
        user += "\n\n網路搜尋結果：\n" + "\n".join(
            f"[{i}] {r['title']}\n{r['snippet']}\n{r['link']}" for i, r in enumerate(results, 1))
    else:
        user += "\n\n網路搜尋結果：（這次沒有搜尋結果）"
    return user
