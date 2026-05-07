# Sites Index - Scenery Travel Mongolia

| Site | Type | Stage | Staging URL | Production URL | Hosting | Region | Last Backup | Last Restore Test | Owner | Notes |
|------|------|-------|-------------|----------------|---------|--------|-------------|-------------------|-------|-------|
| scenery-travel-mn | Travel / Tourism | Build | https://staging.scenery-travel.mn/（提案；`lifecycle=provision_pending`） | 待補（上線前確認） | 待補 | APAC | 待補 | 待補 | Agency OS | Staging **canonical 提案** 與 `core/ENVIRONMENT_REGISTRY.md` 一致；網域／主機拍板後若置換須先改 registry |

## Stage 定義
- Discovery：需求釐清中
- Build：開發建置中
- Live：已上線維運中

## 維運要求
- **Production URL** 於 Live 站不可留白；Build 階段 production 欄可標「上線前確認」。**Staging URL** 須與 `core/ENVIRONMENT_REGISTRY.md` 一致（含 **提案**網域）；允許 **`lifecycle=provision_pending`** 直至實機驗收。
- `Last Backup` 與 `Last Restore Test` 不可留空超過 30 天（新站尚無環境時於 registry Notes 註記）。
