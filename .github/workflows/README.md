# GitHub Actions（monorepo 根）

| Workflow | 觸發（摘要） | 用途 |
|----------|----------------|------|
| **`release-gate-main.yml`** | `pull_request` → `main`、`workflow_dispatch` | 龍蝦 **`npm run validate`**（無 Trigger deploy） |
| **`release-trigger-prod.yml`** | `push` → `main` **且** 變更命中 `packages/workflows/**` 或本檔；`workflow_dispatch` | **gate** 後 **Trigger.dev prod deploy** |

**SSOT（與 AO-CLOSE／Trigger 關係、Secrets、未來擴充 paths）**：`agency-os/docs/operations/github-actions-trigger-prod-deploy.md`
