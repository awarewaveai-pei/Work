# GitHub Actions（monorepo 根）

| Workflow | 觸發（摘要） | 用途 |
|----------|----------------|------|
| **`release-gate-main.yml`** | `pull_request` → `main`、`workflow_dispatch` | 龍蝦 **`npm run validate`**（無 Trigger deploy） |
| **`lobster-workflows-validate-main.yml`** | `push` → `main` **且** 變更命中 `lobster-factory/packages/workflows/**` 或本檔；`workflow_dispatch` | **僅**龍蝦 **`npm run validate`**（**已移除** Trigger Cloud `deploy`） |
| **`cognitive-os-eval.yml`** | `pull_request`／`push` → `main` 且變更命中 Cognitive OS 研究彙整／eval／演化資料路徑；`workflow_dispatch` | 離線品質閘：`COS/scripts/test-eval-harness.ps1`（評分測試＋golden 過 P-c＋harness 突變）；不呼叫模型、無 secret |
| **`sg-deploy.yml`** | `workflow_dispatch`（手動，手機可觸發） | SG 生產部署：在 **self-hosted runner（住 SG VPS）** 跑既有 `sg-deploy.sh`（密鑰零外帶）。安裝/操作：`DEPLOY_ROLLBACK_RUNBOOK.md §9` |

**SSOT（與 AO-CLOSE／Trigger 關係、Secrets、未來擴充 paths）**：`agency-os/docs/operations/github-actions-trigger-prod-deploy.md`
