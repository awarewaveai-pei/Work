"""會議中查詢：看不懂的一段話 -> 搜尋網路，或問 AI。

兩個動作都把反白的文字送出這台電腦（搜尋 -> Serper；AI -> Anthropic），所以只在
使用者按下時才呼叫。金鑰由呼叫端傳入：搜尋用環境變數 SERPER_API_KEY，AI 用設定頁的 key。
"""
import json
import urllib.request

SERPER_URL = "https://google.serper.dev/search"
MODEL = "claude-haiku-5-5"   # 會議中要快；摘要用的模型在 lib/summarize.py
MAX_QUERY_CHARS = 200
MAX_ASK_CHARS = 2000
MAX_CONTEXT_CHARS = 3000

ASK_SYSTEM = """使用者正在開會，對方說的某一段話他沒聽懂。
用台灣的繁體中文回答，最多四句：第一句直接說這段話（或這個詞）的意思，接著補上聽懂它需要的背景。
人名、產品名、專有名詞保留原文。不知道就說不知道，不要編。不要建議使用者該怎麼回答。"""


def search(query: str, key: str, count: int = 5) -> list:
    """回傳 [{"title", "link", "snippet"}]。"""
    body = json.dumps({"q": " ".join(query.split())[:MAX_QUERY_CHARS], "num": count, "hl": "zh-tw"}).encode()
    req = urllib.request.Request(SERPER_URL, data=body,
                                 headers={"X-API-KEY": key, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.load(resp)
    return [{"title": r.get("title", ""), "link": r.get("link", ""), "snippet": r.get("snippet", "")}
            for r in data.get("organic", [])[:count]]


def ask(text: str, context: str, api_key: str) -> dict:
    """回傳 {"answer", "input_tokens", "output_tokens"}。context = 目前為止的逐字稿尾段，可為空。"""
    import anthropic

    user = f"我沒聽懂的部分：\n{text.strip()[:MAX_ASK_CHARS]}"
    if context.strip():
        user = f"會議目前為止的逐字稿（最後一段）：\n{context.strip()[-MAX_CONTEXT_CHARS:]}\n\n{user}"
    msg = anthropic.Anthropic(api_key=api_key, timeout=30).messages.create(
        model=MODEL, max_tokens=500, system=ASK_SYSTEM, messages=[{"role": "user", "content": user}])
    return {"answer": "".join(b.text for b in msg.content if b.type == "text").strip(),
            "input_tokens": msg.usage.input_tokens, "output_tokens": msg.usage.output_tokens}
