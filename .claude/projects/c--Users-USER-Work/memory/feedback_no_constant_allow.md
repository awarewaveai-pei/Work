---
name: Stop asking for allow/confirmation constantly
description: User dislikes repeated permission/allow prompts and trailing "要不要我幫你X" confirmation questions — operate autonomously
type: feedback
originSessionId: 5451ed55-49ed-47ef-b5b4-dbf735b089dd
---
不要一直要使用者按 allow / 不要一直丟「要不要我幫你 X？」這種等點頭的尾問。

**Why:** 2026-05-30 使用者明說「我不要你一直要我 allow」。摩擦來自兩處：① 工具（Bash 等）未進 allowlist 時的 harness 權限彈窗；② 我在回覆結尾用問句請求批准下一步。兩者都讓她煩。

**How to apply:**
- 把常用唯讀/安全的 Bash 與 MCP 呼叫加進 `.claude/settings.json` allowlist（用 `fewer-permission-prompts` skill），減少彈窗。
- 做完一件事後，**直接做下一個明顯合理的步驟**，不要用「要不要我…？」收尾。真有分歧再簡短列選項，但預設往前推進。
- 例外仍在：High-risk（prod deploy / 破壞性 / 金流 / 憑證）與 git push 被拒等，照 AGENTS.md R0/風險分級該停還是停 —— 但這不是「要 allow」，是真正的安全閘。
- AO-CLOSE / AO-RESUME 等預授權流程本就不該逐項問。
