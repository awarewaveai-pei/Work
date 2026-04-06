# GitHub Actions：Trigger.dev 生產部署（`release-trigger-prod.yml`）

> **Owner**：本檔為 **AO / 龍蝦** 與 **CI 部署** 交界之單一入口；`AO-CLOSE` 腳本**不**內嵌 Trigger deploy——部署由 **GitHub Actions** 在 **符合路徑的 push** 或 **手動** 觸發。  
> **編排邊界**：Runbook 與 **Trigger vs n8n** 仍依 `lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md` 與 ADR 004。

## 這條 workflow 做什麼？

1. **`gate`**：在 `lobster-factory` 執行 **`npm run validate`**（與本機 `verify-build-gates` 中的龍蝦段概念對齊）。
2. **`deploy`**：在 **`lobster-factory/packages/workflows`** 執行 **`npx trigger.dev@<pin> deploy --env prod`**。

## 什麼時候會自動跑？

僅在 **`push` 到 `main`** 且變更命中（以 `.github/workflows/release-trigger-prod.yml` 內 **`paths`** 為準）：

| 路徑樣式 | 意義 |
|----------|------|
| `lobster-factory/packages/workflows/**` | **Trigger 任務套件**（`trigger.config.ts`、`src/**`、`package.json`、`package-lock.json` 等） |
| `.github/workflows/release-trigger-prod.yml` | 調整 **workflow 本身** 時也要再跑一輪驗證／部署 |

**不會**因為只改 **`agency-os/**`、monorepo 根 `scripts/`、租戶文件、`mcp.json` 模板** 等功能而自動觸發——因此 **AO-CLOSE 僅收斂治理／RAG／文件時，通常不會不必要地 deploy Trigger**。

**手動**：在 GitHub **Actions** 選 **Deploy to Trigger.dev (prod)** → **Run workflow**（`workflow_dispatch`）。

## 與 AO-CLOSE 的關係（避免誤解）

| 項目 | 說明 |
|------|------|
| **`scripts/ao-close.ps1`** | 本機 **verify-build-gates + system-guard + commit/push**；**不**呼叫 Trigger CLI。 |
| **`push` 之後** | 若該次 commit 改到上述 **`paths`**，**才**可能觸發本 workflow。 |
| **誤觸發排查** | 打開該 run → 看 **觸發類型**（`push` vs `workflow_dispatch`）與 **改動檔案列表**。 |

## Secrets／Variables（repository 設定）

| 名稱 | 類型 | 說明 |
|------|------|------|
| `TRIGGER_ACCESS_TOKEN` | Secret | PAT，前綴通常 **`tr_pat_`** |
| `TRIGGER_SECRET_KEY` | Secret | 專案 secret，前綴通常 **`tr_secret_`** |
| `TRIGGER_PROJECT_REF` | Variable（選用） | 專案 ref；workflow 內有預設占位，**建議在 repo Variables 覆寫為正式專案** |

**勿**將上述值写入 `WORKLOG`／聊天／已提交檔案。

## 失敗排查（短）

| 現象 | 先查 |
|------|------|
| Run 極短即紅 | **`gate`**：`npm install` / `npm run validate` 錯誤 |
| `gate` 綠、`deploy` 紅 | **Secrets** 未設或過期；**`trigger.dev deploy`** log（專案 ref、權限、方案） |
| `npm ci` 失敗 | **`packages/workflows/package-lock.json`** 與 `package.json` 不一致——在該目錄本機 `npm ci` 修復後再推 |

## 未來擴充（務必同步改 YAML + 本檔）

若 **`packages/workflows`** 開始 **直接依賴**其他 monorepo 套件（例如共用 `packages/*`），必須：

1. 在 **`release-trigger-prod.yml`** 的 **`paths`** 加入那些路徑，否則 **會出現 CI 綠但線上程式過舊**。  
2. 在本檔 **§ 什麼時候會自動跑** 表格補一行說明。  
3. 在 PR／釋出習慣上仍建議：`lobster-factory` 大改可走 **`release-gate-main.yml`**（PR）再 merge。

## Related

- `../overview/EXECUTION_DASHBOARD.md`（總覽節奏）  
- `end-of-day-checklist.md`（收工；與 **push 副作用**認知）  
- `../../../.github/workflows/release-trigger-prod.yml`（實際觸發條件以檔案為準）  
- `../../../lobster-factory/README.md`（龍蝦與 Trigger 任務）  
- `../../../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`

_Last updated: 2026-04-05_
