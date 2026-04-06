# GitHub Actions（monorepo 根）

| Workflow | 觸發（摘要） | 用途 |
|----------|----------------|------|
| **`release-gate-main.yml`** | `pull_request` → `main`、`workflow_dispatch` | 龍蝦 **`npm run validate`**（無 Trigger deploy） |
| **`lobster-workflows-validate-main.yml`** | `push` → `main` **且** 變更命中 `lobster-factory/packages/workflows/**` 或本檔；`workflow_dispatch` | **僅**龍蝦 **`npm run validate`**（**已移除** Trigger Cloud `deploy`） |

**SSOT（與 AO-CLOSE／Trigger 關係、Secrets、未來擴充 paths）**：`agency-os/docs/operations/github-actions-trigger-prod-deploy.md`
