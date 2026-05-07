# Sites Index

| Site | Type | Stage | Staging URL | Production URL | Hosting | Region | Last Backup | Last Restore Test | Owner | Notes |
|------|------|-------|-------------|----------------|---------|--------|-------------|-------------------|-------|-------|
| example-site | Corporate / Ecom / Platform | Discovery / Build / Live |  |  |  |  | YYYY-MM-DD | YYYY-MM-DD |  |  |

## Stage 定義
- Discovery：需求釐清中
- Build：開發建置中
- Live：已上線維運中

## 維運要求
- **URL SSOT**：`Staging URL`／`Production URL` 與 **`lifecycle`** 以本租戶 `core/ENVIRONMENT_REGISTRY.md` 為準；本表僅索引，**不可**與 registry 矛盾。
- Live 站須有 **production**；staging 可為 **`lifecycle=provision_pending`**（已定 canonical、實機待 Runbook），與「未規劃」不同。
- `Last Backup` 與 `Last Restore Test` 不可留空超過 30 天（環境尚未建立時於 registry Notes 註記）。
