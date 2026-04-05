# n8n Workflow Architecture

## 分層
- Shared Core：共用通知、錯誤處理、日誌標準。
- Tenant Core：客戶專屬資料轉換與 API 連接。
- Project Workflow：專案流程與排程。

## 命名
- `shared-<domain>-<action>`
- `tenant-<company>-<domain>-<action>`
- `proj-<project-id>-<flow-name>`

## 治理
- 每客戶獨立 credential。
- 流程需定義 retry、告警、人工接手。
- 重大變更需版本化並記錄 CR。
- 工具與環境變數規範維護於 `docs/operations/tools-and-integrations.md`。

## Related Documents (Auto-Synced)
- `docs/operations/airtable-to-supabase-migration-playbook.md`
- `docs/operations/tools-and-integrations.md`
- `README.md`

_Last synced: 2026-04-02 09:33:58 UTC_

