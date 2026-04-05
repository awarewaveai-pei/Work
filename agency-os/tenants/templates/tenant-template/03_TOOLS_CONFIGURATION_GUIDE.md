# Tools Configuration Guide

## 目的
- 定義此客戶公司可用工具、Owner、變更流程與安全邊界。

## 工具清單（每家公司各自維護）
- WordPress
- Supabase
- GitHub
- n8n
- AI tools（ChatGPT / Claude / others）
- 其他第三方工具

## 每個工具要記錄的欄位
- Tool Name
- Purpose（用途）
- Owner（誰負責）
- Environment（prod/staging）
- Access Level（權限等級）
- Last Review（上次審核）

## 變更流程
1. 提出變更（新增/移除/升級工具）
2. 影響評估（安全、成本、流程）
3. 更新 `ACCESS_REGISTER.md`
4. 更新對應 SOP 或專案文件

## 安全底線
- 不在任何 markdown 記錄密碼/token 原文
- 最小權限原則
- 每月做一次權限盤點

## Related Documents (Auto-Synced)
- `docs/operations/tools-and-integrations.md`
- `README.md`
- `tenants/company-p1-pilot/03_TOOLS_CONFIGURATION_GUIDE.md`
- `tenants/NEW_TENANT_ONBOARDING_SOP.md`
- `tenants/README.md`

_Last synced: 2026-04-02 06:26:32 UTC_

