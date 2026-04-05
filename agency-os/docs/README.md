# Docs Index

## 目的
- 集中管理治理文件，避免根目錄文件散落

## 結構
- `docs/operations/`：系統操作與執行流程（含 **Cursor 企業級規則索引**：[`operations/cursor-enterprise-rules-index.md`](operations/cursor-enterprise-rules-index.md)）
- `docs/sales/`：報價與變更核價規則
- `docs/templates/`：合約與變更模板（**全庫各類「範本」路徑索引**：[`overview/repo-template-locations.md`](overview/repo-template-locations.md)）
- `docs/standards/`：技術與開發標準
- `docs/metrics/`：KPI 與毛利量測規格
- `docs/quality/`：交付品質門檻與放行機制
- `docs/international/`：跨時區與跨國營運政策
- `docs/product/`：可販售套件與買方交接規範
- `docs/compliance/`：合規檢核與稽核清單
- `docs/releases/`：版本發布、升級路徑、遷移清單
- `docs/architecture/`：總控中心與多平台架構設計；**輕量 ADR** 見 [`architecture/decisions/README.md`](architecture/decisions/README.md)
- `docs/overview/`：整體系統介紹與導讀（含 **四份 spec 原文整合閱讀**：[`docs/overview/company-os-four-sources-integration.md`](overview/company-os-four-sources-integration.md)；**V3 §三 20 模組跳行表**：[`docs/overview/company-os-twenty-modules.md`](overview/company-os-twenty-modules.md)；**長期營運紀律**：[`overview/LONG_TERM_OPERATING_DISCIPLINE.md`](overview/LONG_TERM_OPERATING_DISCIPLINE.md)；**30 年級 AI/coding/專案管理短憲章**：[`overview/30_YEAR_AI_CODING_EXEC_CHARTER.md`](overview/30_YEAR_AI_CODING_EXEC_CHARTER.md)；**客戶精簡鏡像**：[`overview/30_YEAR_AI_CODING_EXEC_CHARTER_CLIENT_SHORT.md`](overview/30_YEAR_AI_CODING_EXEC_CHARTER_CLIENT_SHORT.md)）
- `docs/CHANGE_IMPACT_MATRIX.md`：文件連動關係

## 使用規則
1. 先改「主文件」（single source of truth）
2. 依 `docs/CHANGE_IMPACT_MATRIX.md` 同步更新關聯文件
3. **新增或大幅改版治理／對外文件時**：照 [`docs/operations/new-doc-linkage-checklist.md`](operations/new-doc-linkage-checklist.md)（矩陣 + `change-impact-map.json` + README 入口 + doc-sync／health）
4. 完成後更新 `WORKLOG.md` 與 `TASKS.md`

## Related Documents (Auto-Synced)
- `docs/operations/cursor-enterprise-rules-index.md`
- `docs/operations/new-doc-linkage-checklist.md`
- `docs/overview/agency-os-complete-system-introduction.md`

_Last synced: 2026-04-02 06:54:36 UTC_

