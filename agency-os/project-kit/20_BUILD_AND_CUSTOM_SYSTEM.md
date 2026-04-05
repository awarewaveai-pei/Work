# Build and Custom System Template

## 1. 系統架構
- 前台（WordPress）
- 後台（管理流程）
- 外部服務（Supabase/n8n/API）

## 2. 客製功能清單
- 功能名稱：
- 業務規則：
- 角色權限：
- 驗收標準：

## 3. WordPress 客製策略
- 優先使用自研 plugin，避免直接改 theme 核心
- 敏感與高複雜流程可拆出獨立服務
- 所有客製碼需可版本化與回滾

## 4. 資料設計
- 使用 CPT/Meta 的項目：
- 使用自訂資料表的項目：
- 日誌與審計欄位：

## 5. 測試需求
- 單元測試：
- 流程測試：
- 權限測試：
- 回滾演練：

## 6. QA Gate
- 交付前必須對照 `docs/quality/delivery-qa-gate.md`
- 若任一關鍵檢核失敗，禁止放行到 Launch

## Related Documents (Auto-Synced)
- `docs/quality/delivery-qa-gate.md`

_Last synced: 2026-03-20 04:57:16 UTC_

