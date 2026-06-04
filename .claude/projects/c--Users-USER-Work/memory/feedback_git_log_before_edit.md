---
name: feedback-git-log-before-edit
description: "每個 Edit 動作前必跑 `git log --oneline -10`，避免與並行 session 重工"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 637e44fc-72ed-46e9-9744-60868918cda3
---

每個 Edit / Write / 多步驟 Bash 動作前，**必跑 `git log --oneline -10`**：

- 若 commit message 含本次議題關鍵字（人或機器都行）→ 立即停下、`git show <sha>` 看內容、判定是否還需動作
- 若無 → 安全 Edit
- 成本 < 1 秒，避免重工成本可能數十分鐘

**Why（必含「為什麼」否則容易跳）**：
2026-05-22 14:38 UTC 違反 R0 「未讀現有邏輯即重寫」事件。當時：
- 14:36 commit `628b011` 由另一 session 已整合 audit-cross-machine-bom 進 R0
- 14:38 我（本 session）按既有 todo 直接 Edit，沒看 git log
- 結果：AGENTS.md 被 git 自動去重，但 WORKLOG 寫了 redundant entry → commit `f3c21cf` 改寫為 R0 violation 教材

關鍵教訓：信任現場記憶 > 信任 git ground truth = 反 R0。並行 session（包含 Cursor / Codex / auto hooks / 公司桌機 / 筆電）隨時可能 commit，靠對話記憶判斷「我還沒做」不可靠。

**How to apply**：
- TODOWrite 加 todo「git log -10 check」當每個 Edit todo 的前置
- Edit 前的 bash call 必含 `git log --oneline -10` + `grep` 關鍵字
- 若關鍵字命中近期 commit → 暫停、show、決策
- 寫進 R0 §[現況分析]「必含 git log --oneline -10 輸出」 + §禁止段「未跑 git log -10 即 Edit」（SSOT 在 agency-os/AGENTS.md，2026-05-22 已加）

**反例（不要這樣做）**：
- ❌ 看到使用者「要」/「go」/「ok」就直接 Edit
- ❌ 用「我剛剛才看過，狀態應該沒變」推理（隨時可能被並行 session 推翻）
- ❌ 寫 commit 後才發現重工，事後 revert（傷史 + 浪費 cycle）

**正本位置**：[agency-os/AGENTS.md](d:/Work/agency-os/AGENTS.md) R0 §[現況分析]（L15）+ R0 §禁止段（L33）

**相關**：[[feedback-verify-four-actions]]、[[feedback-read-before-recommend]]
