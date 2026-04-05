# System Operation SOP (Agency OS)

## 目的
- 定義接案公司從「新客戶導入 -> 專案執行 -> 上線交付 -> 維運成長」的固定操作方式。
- 降低人治與失控風險，確保每案可複製。

## 適用範圍
- 全部 tenant（`tenants/company-*`）
- 全部專案（`tenants/<company>/projects/<project-id>/`）

## 每日操作（Daily）
1. 讀 `AGENTS.md`、`memory/CONVERSATION_MEMORY.md`、當日 `memory/daily/`
2. 檢視 `TASKS.md` 與 `WORKLOG.md`
3. 執行當日交付；超範圍需求先走 `docs/operations/scope-change-policy.md`
4. 收工前同步 `TASKS.md`、`WORKLOG.md`、`memory/daily/YYYY-MM-DD.md`

## 每週操作（Weekly）
1. 週一：里程碑與資源確認
2. 週三：風險/阻塞檢查
3. 週五：進度回報與下週計畫

## 每月操作（Monthly）
1. 毛利與收款檢視
2. 事件復盤與 SOP 更新
3. 權限與憑證盤點

## 專案生命週期
- Pre-sales -> Kickoff -> Build -> Launch -> Operate/Growth
- 每階段有 Gate；未達條件不得進下一階段

## 完成定義（DoD）
- 功能與測試通過
- 文件完整且可回滾
- 變更紀錄可追溯

## 異常處理入口
- 事件：`docs/operations/incident-response-runbook.md`
- 變更：`docs/operations/scope-change-policy.md`
- 憑證：`docs/operations/security-secrets-policy.md`

## Related Documents (Auto-Synced)
- `AGENTS.md`
- `docs/architecture/agency-command-center-v1.md`
- `docs/operations/end-to-end-linkage-checklist.md`
- `docs/overview/agency-os-complete-system-introduction.md`
- `README.md`
- `TASKS.md`
- `WORKLOG.md`

_Last synced: 2026-03-20 04:57:15 UTC_

