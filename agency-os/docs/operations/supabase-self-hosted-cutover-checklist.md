# Supabase 自託管切換清單（保留舊資料）

> **用途**：從 **Supabase Cloud（或舊自架）** 遷到 **新自架 Supabase**，並更新所有連線與憑證。  
> **原則**：SoR 仍在 **Postgres（Supabase）**；與 `[lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md](../../../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md)` 一致。

## 0) 安全（外洩視同事件）

- 若 `mcp.json` 曾含 **明文 token**、或曾貼到聊天／文件：**一律輪替**（GitHub、OpenAI、WordPress App Password、n8n、Replicate、Copilot、舊 Supabase `sbp_` 等）。
- 生效中密鑰只放在：**本機 vault**、**各平台 Secret 管理**、**Trigger／CI secrets**；**不**再寫回可分享檔案。

## 1) 資料遷移

- [ ] 舊庫 **`pg_dump`**（含 schema；若要保留登入狀態需一併評估 `auth` schema 與 **JWT secret** 策略）。
- [ ] 新庫還原後執行 **`CREATE EXTENSION IF NOT EXISTS vector;`**（若使用 RAG／pgvector）。
- [ ] **Storage**：bucket 與物件複製到新環境（權限與公開策略對齊）。
- [ ] **JWT**：若新自架 **JWT_SECRET** 與舊不同，既有使用者 **refresh／重新登入** 計畫要預先說明。

## 2) 新端點與金鑰（你「唯一要記住」的兩個值）

- **API 根網址**：自架在 **HTTPS 反代** 後的 Kong／API 根（例如 `https://supabase-api.yourdomain.com`），**不要**長期用裸 `http://IP:8000` 對外。
- **`anon` / `service_role`**：依自架 `.env` 產生；**龍蝦寫入**用 **`LOBSTER_SUPABASE_SERVICE_ROLE_KEY`**（伺服器端、受控）。

## 3) 本機與 monorepo（必做）

- [ ] **DPAPI vault**（見 `local-secrets-vault-dpapi.md`）  
  - `LOBSTER_SUPABASE_URL` → 新 **HTTPS API 根**  
  - `LOBSTER_SUPABASE_SERVICE_ROLE_KEY` → 新 **service_role**（`set-prompt`）
- [ ] **`mcp.json`**（由 **`mcp.json.template`** 複製後填入；**勿**把真值提交 git）  
  - **已移除**雲端專用 **`mcp.supabase.com?project_ref=…`** 區塊：該端點只服務 **Supabase Cloud 專案**，**不**適用自架。  
  - IDE 若要查 schema：用 **Supabase Studio**、**psql**、或 Cursor **Postgres／SQL 類 MCP**（依你環境選型）；**不**強制與舊 Cloud MCP 同款。
- [ ] 重跑（可選）：`.\scripts\secrets-vault.ps1 -Action import-mcp -McpPath "D:\Work\mcp.json"`（僅在 `mcp.json` 已填真值、且你希望同步到 vault 時）。

## 4) 執行環境（repo 外請自行盤點）

- [ ] **Trigger.dev** 專案 Secrets：`LOBSTER_SUPABASE_*` 或等同變數。
- [ ] **n8n** Credentials／HTTP 節點中的舊 URL／key。
- [ ] **Node／Edge** 應用 `.env`、Docker、主機 systemd。
- [ ] **WordPress** 外掛或自訂碼若曾打舊 Supabase API。
- [ ] **舊 Supabase Cloud**：確認無流量後 **停用專案／撤銷 key**。

## 5) 驗證

- [ ] 用 **service_role** 對 **`/rest/v1/`** 做一次 smoke（RLS 測試請改用 **anon**／使用者 JWT）。
- [ ] 龍蝦：`validate-db-write-resilience.mjs` 等（見 `lobster-factory/README.md`）在 **staging** 通過後再開 production 寫入。

## Related Documents (Auto-Synced)
- `docs/operations/hetzner-stack-rollout-index.md`

_Last synced: 2026-04-06 07:44:13 UTC_

