# Sites Index - Soulful Expression Art Therapy

| Site | Type | Stage | Staging URL | Production URL | Hosting | Region | Last Backup | Last Restore Test | Owner | Notes |
|------|------|-------|-------------|----------------|---------|--------|-------------|-------------------|-------|-------|
| soulfulexpression-org | Therapy / Wellness | Live | https://staging.soulfulexpression.org/（`lifecycle=provision_pending`） | https://soulfulexpression.org/ | Hostinger | APAC | 待補 | 待補 | Agency OS + Client | Staging **canonical** 與 `core/ENVIRONMENT_REGISTRY.md` 一致；實機待 Pilot A §2 |

## Stage 定義
- Discovery：需求釐清中
- Build：開發建置中
- Live：已上線維運中

## 維運要求
- **Production URL** 於 Live 站不可留白。**Staging URL** 欄須與 `core/ENVIRONMENT_REGISTRY.md` 一致；允許 **`lifecycle=provision_pending`**（已定 canonical、實機尚待 Runbook），與「未規劃 staging」不同。
- `Last Backup` 與 `Last Restore Test` 不可留空超過 30 天（試點／接手期若尚未有可備份環境，於 `ENVIRONMENT_REGISTRY` Notes 註記原因與目標日期）。
