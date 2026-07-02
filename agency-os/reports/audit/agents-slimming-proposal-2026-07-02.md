# AGENTS.md 觸發規則瘦身提案（2026-07-02）

> 目的：解決稽核風險 #1（認知負載）剩餘的一半 —— 體量。
> 原則：**不減語意、只減重複**。每條變動附理由；殭屍桶為空是好消息不是遺漏。
> 基線：4 張表 101 條規則（T1 代理自動 43 / T2 自觸發 26 / T3 路由 20 / T4 runbook 12）。
> 提案結果：**101 → 72 條（-29），AGENTS.md 約 381 → ~300 行**。

## 分類結果總覽

| 桶 | 條數 | 處置 |
|---|---|---|
| A. 已機械化 → 縮為一行 | 9 | 不刪語意，把重複的操作說明縮成「機械閘 + 指標」 |
| B. 殭屍 | **0** | 全部 101 條引用經 R4 驗證存在且有效 —— 無殭屍 |
| C. 重複 → 合併 | 26 → 8 | 跨表同義規則合併（省 18 條） |
| D. 必留原樣 | 66 | 高後果、無法機械化、不重複 |

## A. 已機械化縮寫（9 條，語意零損失）

hook 已強制執行，表格裡的長篇操作說明與 hook 內建訊息重複。縮為一行「🔧 閘名 + 詳見路徑」：

| 現規則 | 機械閘 |
|---|---|
| T2：改 auth/RLS → critic（等 6 條：auth、DB schema、Supabase、n8n、nginx-docker、WP）| `file-path-router.js` 已按編輯路徑硬路由 —— **6 條合併為 1 條**「改動特殊路徑 → router 閘自動指路（7 類別，詳 rules/file-path-router.js）」 |
| T1：auto-repair 路徑攔截（那條本身就在描述 hook）| `auto-repair-guard.js` —— 縮為一行 |
| T2：.ts/.tsx 完成前跑 tsc | `batch-format.js` Stop 時自動跑 tsc —— 縮為「閘自動跑；型別錯誤不得宣告完成」 |
| T2：code 改動跑 /verify-recent | verify-gate 三件套硬擋 commit —— 縮寫 |

## C. 重複合併（26 → 8 條，省 18）

**C-1 跨表雙生（T1「使用者說」×T2「Claude 自覺」同一技能，6 對 12 條 → 6 條）**：
grill / tdd / prototype / improve-codebase / zoom-out / diagnose —— 每對合併為單條「使用者說 X **或** Claude 自覺 Y → 跑 Z skill」。

**C-2 測試三胞胎（T1 3 條 → 1 條）**：
「跑 QA」(/qa-review)、「幫我測/瀏覽器」(browser-test)、「QA/截圖/效能」(/playwright) → 一條測試路由：QA 報告→/qa-review；真瀏覽器→browser-test；smoke/截圖/perf→/playwright。

**C-3 T3 路由表（20 → 6 條）**：
T3 開頭自己就寫著「完整路由表見 TOOL_TRIGGER_MAP.md」—— 它是完整表的節錄，且 20 條中 9 條與 T1/T2 重複。保留 6 條最高頻（debugger / devops / planner / incident-responder / web-researcher / decision-intelligence）+ 指標。
**蒸發風險評估**：路由漏觸發的後果 = 主 Claude 自己做而非委派（品質折損，非危險）—— 是四張表中唯一可安全節錄的。T1 營運規則與 T4 事故路由**不外移**（漏觸發 = 危險）。

**C-4 零星（2 條）**：vault 兩條（MCP 401 已機械化 + 使用者問 vault）→ 合一；recap+tasks 狀態詢問類 → 合一。

## D. 必留（66 條，不動）

T4 全部 12 條（事故當下要在 context 裡）、T1 營運核心（theme SSOT、signals、WAF、reboot、apply-audit、tomo、provision、master-plan、wp-bridge、client-status…）、T2 判斷類（planner 拆任務、需求歧義先 grill、TDD 紀律等）。

## 不做的事（明文）

- **不把 T1/T4 外移到 TOOL_TRIGGER_MAP**：AGENTS.md 每 session 自動載入、map 不是 —— 外移 = 規則對 AI 隱形 = 加重蒸發風險。
- **不刪任何「踩坑紀錄」語意**：根因日期與禁止樣態全數保留（縮寫時併入合併條目）。

## 執行方式

批准後一個 commit 完成：4 張表按上述改寫 → `/doc-sync` 義務 → grep 驗證所有保留引用 → 60 案例測試回歸 → WORKLOG。可 `git revert` 單 commit 回滾。

**等待裁決**：全做（A+C）？只做 C-1/C-2 最安全的合併？還是指定調整？
