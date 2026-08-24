# AGENTS.md 20 年架構整理 — 第二輪（延續 2026-07-02 瘦身提案）

## Context

使用者要求把 `agency-os/AGENTS.md`（442 行、~52KB，每個 session 透過 `CLAUDE.md` 的 `@`-include 全文載入並全程佔用 context）整理到「完美」：真正被遵循、不多吃 token、最具效益與正確性、可運行 20 年。

我原本的直覺是「拆成常駐核心層 + 懶載入查閱層」（把 4 張 trigger table 搬去獨立檔案）。但讀到 `agency-os/reports/audit/agents-slimming-proposal-2026-07-02.md` 後發現：**這個確切方案 7 週前已經被考慮過並明確否決**——理由是 AGENTS.md 每 session 自動載入、獨立檔案不會，外移規則等於讓 AI 看不見它，「蒸發」風險（規則悄悄再也不會被觸發）比多花 token 更嚴重。這是有理由的既有決策，不該在沒有新資訊的情況下重新翻案。

改用同一套已被操作者核准過的方法論（A 已機械化縮寫／B 殭屍規則／C 重複合併／D 必留原樣），對「7 月之後新增的內容」做延續性整理，而不是重新發明一套架構。這樣才是真正的「20 年」思維——蕭規曹隨，只補新增的漏洞，不是每次都砍掉重練。

用 Plan agent 重新跑了一次逐條分類，並親自驗證了關鍵 finding（grep 確認重複行、確認 CHANGE_IMPACT_MATRIX.md 缺口），結論：**新增重複只有 1 對，其餘 7 週來的新增內容都已經照著 7 月的規範寫，不需要大動。真正的缺口在別處**——`docs/operations/TOOL_TRIGGER_MAP.md`（AGENTS.md 自己引用的「完整路由表」）已經 stale 7 週，且沒有機制防止它再度 stale。

## 推薦方案

### A. AGENTS.md 本身（低風險，跟今天已做的 5 項編輯同一等級）

1. **去重 1 對新發現的重複列**（今天新增的第 4 個，前 3 個已做）：
   - 刪除 `| 任何 non-trivial R0 任務完成（輸出 [已修改] 後，準備進下一個任務）| 跑 \`/checkpoint\`（mid-session git save；tree 乾淨時靜默跳過） |`（代理自動工具使用規則表）
   - 保留 `| 任何 R0 任務完成後（輸出 [已修改]）| 跑 \`/checkpoint\` 存 mid-session commit |`（Claude工作自觸發規則表），但把前者的「tree 乾淨時靜默跳過」補充細節併進這行，語意零損失
2. **補 R1-R3 編號說明**：在 R0 標題附近加一行「R1/R2 定義在 CLAUDE.md（多機同步／任務完成強制）；R3 未使用（保留）」——已用 `git log -S"R3："` 確認 R3 從未在任一檔案定義過，不是被刪除，是編號本來就沒用到。這是正確性修正，不是規則變更。

**明確不做**：不把任何 T1（代理自動工具使用規則）或 T4（問題症狀→Runbook路由表）內容搬到 `TOOL_TRIGGER_MAP.md`；不刪除任何根因/踩坑敘事；不合併真正語意不同的觸發條件（已檢查 3 組疑似重複，判斷是真的不同觸發來源，維持原樣，理由記錄在 WORKLOG）。

### B. `docs/operations/TOOL_TRIGGER_MAP.md` 補新鮮度（獨立、更低風險的第二個 commit）

這份是 AGENTS.md 自己在 T3 表宣稱的「完整路由表」，但 `Last updated: 2026-07-02`，已經 7 週沒跟上：

1. 新增 `## 跨模型 Oracle（Codex 協作）` 章節：`codex-oracle.ps1` 的 inspect/review 模式、ORACLE gate 機制、Claude/Codex 分工表——目前完全沒被收錄（grep 確認 0 命中）
2. 補 2 個漏掉的 runbook（`自動排程監控與手機Telegram警報-維護手冊.md`、`HETZNER-SERVER-MIGRATION-AND-DISASTER-RECOVERY-RUNBOOK.md`）
3. 更新 `/review` 那一列，補上今天新加的 critic→codex-oracle fallback
4. `Last updated` 改成 2026-08-24，重算「觸發統計」表尾的計數
5. **關鍵**：把 `docs/operations/TOOL_TRIGGER_MAP.md` 加進 `docs/CHANGE_IMPACT_MATRIX.md` 裡 `AGENTS.md` 那一列的「Impacted」清單（目前沒有，這正是它會悄悄 stale 7 週都沒人發現的根本原因）——不補這條，B 做完下次又會重新 stale。

## 執行順序與驗證

1. A 先做，一個 commit（跟今天已做的 5 項編輯性質一致，走同樣的 `/doc-sync` + BUGHUNT 流程）
2. B 後做，獨立一個 commit（純文件補完，風險更低，但範圍較大——新增一整個章節，值得跟 A 分開方便個別 revert）
3. 每個 commit 後：跑 `scripts/doc-sync-automation.ps1 -AutoDetect` 確認 Single Owner Policy Check PASS；grep 確認新增/刪除的字串沒有其他地方還在用舊版；WORKLOG 補 R0 四動作證據（REALTEST_WAIVED: DOC_ONLY + 具體檢查方式、REVIEW 用 codex-oracle.ps1 review 本次改動、BUGHUNT_DONE）
4. 兩個 commit 都完成後，一次跟使用者回報最終行數變化與具體改了什麼

## 關鍵檔案

- `agency-os/AGENTS.md` — 主要修改對象
- `agency-os/docs/operations/TOOL_TRIGGER_MAP.md` — 補新鮮度
- `agency-os/docs/CHANGE_IMPACT_MATRIX.md` — 補一條 impacted-file 記錄，防止再度 stale
- `agency-os/reports/audit/agents-slimming-proposal-2026-07-02.md` — 方法論依據，不重寫
