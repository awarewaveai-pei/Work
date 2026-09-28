"""
claude_call.py
所有 Claude 呼叫的單一入口：模型、effort、classifier fallback、拒答／截斷處理只在這裡設。

踩坑：claude-opus-5-5 永遠會思考，thinking 佔 max_tokens 且回應開頭是 thinking block，
所以取文字要依 block type（claude_text），不可用 content[0]。
"""

from config import CLAUDE_MODEL

EFFORT = "medium"                                   # Opus 5.5 的 API 預設也是 medium；明設避免預設值變動
THINKING_HEADROOM = 8000                            # 呼叫端給的 max_tokens 是「答案」的量，思考另加
NO_EFFORT_MODEL_PREFIXES = ("claude-haiku-",)       # Haiku 收到 effort 會 400
FALLBACK_MODELS = ("claude-opus-5-5", "claude-opus-5", "claude-fable-5-1")


def claude_create(client, *, max_tokens, messages, **kwargs):
    """client.messages.create 的替代：同參數，加上模型設定；拒答或截斷直接丟例外（不回半截答案）。"""
    model = kwargs.pop("model", CLAUDE_MODEL)
    extra = {}
    if not model.startswith(NO_EFFORT_MODEL_PREFIXES):
        extra["output_config"] = {"effort": EFFORT}
    if model in FALLBACK_MODELS:
        extra.update(betas=["server-side-fallback-2026-07-01"], fallbacks="default")
    response = client.beta.messages.create(
        model=model, max_tokens=max_tokens + THINKING_HEADROOM, messages=messages, **extra, **kwargs,
    )
    if response.stop_reason in ("refusal", "max_tokens"):
        raise RuntimeError(f"Claude 未完成回答（stop_reason={response.stop_reason}）")
    return response


def claude_text(response):
    return "".join(block.text for block in response.content if block.type == "text")
