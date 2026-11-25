"""心智圖：逐字稿 -> AI 整理成樹 -> 頁面畫圖（templates/mindmap.html）。

來源一律是逐字稿（操作者 2026-11-23：「是要用逐字稿去做心智圖」），不是摘要或會議記錄。
跟會議記錄同一套兩條路：預設把 prompt 貼給任一 AI 再貼回（零費用）；有 API key 可直接產生（計費）。
節點 = {"text": str, "children": [節點]}。
"""
from .live.translate import ANTHROPIC_MODEL as MODEL   # 會議中用的快模型，與翻譯同一個
from .summarize import MAX_TRANSCRIPT_CHARS, parse_pasted_json

MAX_DEPTH = 4            # 根算第 1 層
MAX_CHILDREN = 12
MAX_TEXT_CHARS = 120

INSTRUCTIONS = """你是會議心智圖助手。把下面的逐字稿整理成一張心智圖，只輸出一個 JSON 物件，不要任何其他文字。

格式：{"text": "會議主題", "children": [{"text": "分支", "children": [...]}]}
規則：
- 用台灣的繁體中文；人名、產品名、專有名詞、數字與日期保留逐字稿的原文。
- 根節點是這場會議的主題；第二層 3 到 7 個主要分支，依討論的主題分，不要依時間順序分。
- 每個分支下面放逐字稿裡真的說過的具體內容：決定、數字、日期、誰要做什麼、還沒解決的問題。
- 每個節點一句短語，最多 30 個中文字；最多 4 層。
- 逐字稿來自語音辨識，可能有錯字；看得出原意就寫原意。逐字稿沒說的不要補。

逐字稿：
"""


def build_prompt(transcript: str) -> str:
    transcript = transcript.strip()
    if len(transcript) > MAX_TRANSCRIPT_CHARS:
        transcript = transcript[:MAX_TRANSCRIPT_CHARS] + "\n\n（逐字稿過長，已截斷）"
    return INSTRUCTIONS + transcript


def _clean(node, depth: int):
    """AI 或人貼回來的樹不可信：只留形狀對的節點，超出層數、數量、長度的裁掉。"""
    if not isinstance(node, dict):
        return None
    text = str(node.get("text") or "").strip()[:MAX_TEXT_CHARS]
    if not text:
        return None
    children = node.get("children") if depth < MAX_DEPTH else None
    kids = [c for c in (_clean(c, depth + 1) for c in (children if isinstance(children, list) else [])) if c]
    return {"text": text, "children": kids[:MAX_CHILDREN]}


def parse_tree(raw: str) -> dict:
    """貼回或 API 回傳的文字 -> 樹。沒有任何分支就拒絕（空圖不是結果）。"""
    tree = _clean(parse_pasted_json(raw), 1)
    if not tree or not tree["children"]:
        raise ValueError("這不是心智圖：需要 {\"text\": ..., \"children\": [...]} 而且至少一個分支")
    return tree


def generate(transcript: str, api_key: str) -> dict:
    import anthropic

    msg = anthropic.Anthropic(api_key=api_key, timeout=120).messages.create(
        model=MODEL, max_tokens=8000, messages=[{"role": "user", "content": build_prompt(transcript)}])
    return parse_tree("".join(b.text for b in msg.content if b.type == "text"))
