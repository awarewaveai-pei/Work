# WordPress Custom Development Guidelines

## 核心原則
- 共用能力放 plugin，專案策略放 mu-plugin。
- 主題只放展示，不放商業邏輯。
- 憑證走環境變數，不硬編碼。

## 資料策略
- 優先用 WordPress 既有資料結構。
- 僅在高頻查詢、關聯需求、報表需求下自建資料表。
- 自建資料表需有 migration、索引、回滾方案。

## 交付要求
- 每個功能要有明確驗收條件。
- 交付需包含 happy path + edge case 測試證據。
- 上線前完成備份，上線後可回滾。

## 平台定位
- WordPress 是目前預設與優先平台。
- 若專案改用其他平台，需遵循 `docs/architecture/multi-platform-delivery-architecture.md`。
- 非 WordPress 專案仍需遵守相同 QA Gate、審計與回滾要求。

## Related Documents (Auto-Synced)
- `docs/architecture/multi-platform-delivery-architecture.md`
- `README.md`

_Last synced: 2026-03-20 04:57:16 UTC_

