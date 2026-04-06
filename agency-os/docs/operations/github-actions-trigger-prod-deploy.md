# GitHub Actions：`lobster-workflows-validate-main.yml`（僅 validate；已移除 Trigger Cloud deploy）

> **Owner**：本檔為 **AO / 龍蝦** 與 **CI** 交界之單一入口。  
> **檔名說明**：沿用舊檔名 `github-actions-trigger-prod-deploy.md` 以免既連結失效；**內容已改** — CI **不再**對 Trigger Cloud 執行 `deploy`。  
> **生產 Trigger**：你只使用 **自託管**；部署請在自架環境依官方文件操作（流程就緒後可補 **專用 workflow**，與本檔同步更新）。  
> **編排邊界**：Runbook 與 **Trigger vs n8n** 仍依 `lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md` 與 ADR 004。

## 這條 workflow 做什麼？

1. **`gate`**：在 `lobster-factory` 執行 **`npm run validate`**（與本機 `verify-build-gates` 龍蝦段概念對齊）。
2. **~~`deploy`~~**：已移除。過去曾對 Trigger Cloud 跑 `trigger.dev deploy`；**2026-04-06 起** repo 內 **不再**有此步驟，避免與「只自託管」決策衝突。

## 什麼時候會自動跑？

僅在 **`push` 到 `main`** 且變更命中（以 `.github/workflows/lobster-workflows-validate-main.yml` 內 **`paths`** 為準）：

| 路徑樣式 | 意義 |
|----------|------|
| `lobster-factory/packages/workflows/**` | **Trigger 任務套件**（`trigger.config.ts`、`src/**`、`package.json`、`package-lock.json` 等） |
| `.github/workflows/lobster-workflows-validate-main.yml` | 調整 **workflow 本身** 時再跑一輪 validate |

**不會**因為只改 **`agency-os/**`、monorepo 根 `scripts/`、租戶文件** 等而觸發。

**手動**：GitHub **Actions** → **Lobster workflows package — validate (main)** → **Run workflow**（`workflow_dispatch`）。

## 與 AO-CLOSE 的關係

| 項目 | 說明 |
|------|------|
| **`scripts/ao-close.ps1`** | 本機 **verify-build-gates + system-guard + commit/push**；**不**呼叫 Trigger CLI。 |
| **`push` 之後** | 僅在上述 **`paths`** 變更時跑 **validate**；**不**再 deploy。 |

## GitHub Secrets／Variables（repository）

| 名稱 | 還需要嗎？ |
|------|------------|
| `TRIGGER_ACCESS_TOKEN`、`TRIGGER_SECRET_KEY` | **CI 已不再使用**。若你確定只用自託管、且不想誤用，可在 GitHub repo **刪除或輪替**這兩個 Secrets（本機／MCP 仍可用 vault／環境變數，**勿**寫入庫內）。 |
| `TRIGGER_PROJECT_REF` | **CI 已不再使用**；可自 Variables 移除以免混淆。 |

## 失敗排查（短）

| 現象 | 先查 |
|------|------|
| Run 極短即紅 | **`npm install` / `npm run validate`** 錯誤 |
| `npm ci` 相關 | 本 workflow 目前在 **gate** 內使用 `lobster-factory` 根的 `npm install`；若日後與 PR gate 對齊再改 — 以 YAML 為準 |

## 未來擴充（務必同步改 YAML + 本檔）

若 **`packages/workflows`** 開始 **直接依賴**其他 monorepo 套件：

1. 在 **`lobster-workflows-validate-main.yml`** 的 **`paths`** 加入那些路徑。  
2. 在本檔 **§ 什麼時候會自動跑** 表格補一行。  

## 自託管-only（與舊 Cloud 敘述的單一說法）

- **Runtime**：任務只會在 **你 deploy 過去的自託管** 上跑；repo 內檔案不會自動上到 Trigger Cloud。  
- **CI**：僅 **validate**；**production deploy** 由你在自架節點執行（或日後新增 **明確標註 self-host API** 的 deploy workflow）。  
- **狀態與堆疊**：見 **`docs/operations/hetzner-stack-rollout-index.md`**、人因跳轉 **`hetzner-self-host-start-here.md`**。

## Related

- `../overview/EXECUTION_DASHBOARD.md`  
- `end-of-day-checklist.md`  
- `../../../.github/workflows/lobster-workflows-validate-main.yml`  
- `../../../lobster-factory/README.md`  
- `../../../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`

_Last updated: 2026-04-06_
