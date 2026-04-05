# Local Secrets Vault (DPAPI, Zero Cost)

## 目的
- 用 Windows 內建加密能力（DPAPI）建立本機祕密庫。
- 不需額外訂閱費用，且不把機密放進 git repo。
- 讓常用祕密可查找、可更新、可直接帶入命令執行。

## 小白操作版（去哪裡 -> 做什麼 -> 看到什麼）
1. 打開「檔案總管」
2. 到這個資料夾：`D:\Work`
3. 在空白處按右鍵，選「在終端機中開啟」
4. 第一次先貼這行，按 Enter：  
   `.\scripts\secrets-vault.ps1 -Action init`
5. 看到 `Secrets vault ready: ...` 代表保險箱已建立
6. 要新增密鑰時，貼這行（把名稱換成你的）：  
   `.\scripts\secrets-vault.ps1 -Action set-prompt -Name MY_NEW_KEY`
7. 要確認，貼這行：  
   `.\scripts\secrets-vault.ps1 -Action list`
8. 看到 key 名稱清單就完成（不會顯示明文）

## 架構與建置說明（你怕掛掉時先看這段）
- Vault 引擎：`scripts/secrets-vault.ps1`
- Root 入口：`D:\Work\scripts\secrets-vault.ps1`
- 實作入口：`D:\Work\agency-os\scripts\secrets-vault.ps1`
- 儲存檔：`%LOCALAPPDATA%\AgencyOS\secrets\vault.json`
- 加密機制：Windows DPAPI（綁「同一台機器 + 同一個 Windows 使用者」）
- 結論：檔案就算被看到也不是明文，但換機/換帳號不能直接解密

## 儲存位置
- 預設：`%LOCALAPPDATA%\AgencyOS\secrets\vault.json`
- 此檔為 DPAPI 加密內容，綁定「目前 Windows 使用者」。

## 指令入口
- monorepo 根：`.\scripts\secrets-vault.ps1`
- agency-os：`.\scripts\secrets-vault.ps1`

## 常用操作
1. 初始化
   - `.\scripts\secrets-vault.ps1 -Action init`
2. 設定（直接給值）
   - `.\scripts\secrets-vault.ps1 -Action set -Name LOBSTER_SUPABASE_URL -Value "https://<project-ref>.supabase.co"`
3. 設定（不顯示輸入）
   - `.\scripts\secrets-vault.ps1 -Action set-prompt -Name LOBSTER_SUPABASE_SERVICE_ROLE_KEY`
4. 列出可用 key（不顯示明文）
   - `.\scripts\secrets-vault.ps1 -Action list`
5. 以祕密執行命令（推薦）
   - `.\scripts\secrets-vault.ps1 -Action run -Names LOBSTER_SUPABASE_URL,LOBSTER_SUPABASE_SERVICE_ROLE_KEY -Command "node D:\Work\lobster-factory\scripts\validate-package-install-runs-flow.mjs --organizationId=... --workspaceId=... --siteId=... --environmentId=... --workflowRunId=... --execute=1"`
6. 從 `mcp.json` 一鍵匯入（完整初始化時建議先做）
   - `.\scripts\secrets-vault.ps1 -Action import-mcp -McpPath "D:\Work\mcp.json"`

## 新機／重灌復原手冊（重點）
### A) 同一台機器、同一個 Windows 使用者
- 通常不需復原，vault 會直接可用
- 驗證：
  - `.\scripts\secrets-vault.ps1 -Action list`

### B) 換機或換 Windows 使用者（最常見）
- 舊 vault 檔無法直接解密，屬於預期行為
- 正確復原流程：
1. 重建 vault：
   - `.\scripts\secrets-vault.ps1 -Action init`
2. 重新匯入基礎機密：
   - `.\scripts\secrets-vault.ps1 -Action import-mcp -McpPath "D:\Work\mcp.json"`
3. 補齊非 mcp 的手動 key（例如 Lobster/Slack）：
   - `.\scripts\secrets-vault.ps1 -Action set-prompt -Name LOBSTER_SUPABASE_SERVICE_ROLE_KEY`
   - `.\scripts\secrets-vault.ps1 -Action set-prompt -Name AGENCY_OS_SLACK_WEBHOOK_URL`
4. 驗證：
   - `.\scripts\secrets-vault.ps1 -Action list`

### C) 腳本壞掉或不見（Repo 破損）
1. 先 `git pull` 還原 repo
2. 若 `scripts/secrets-vault.ps1` 仍缺失，從 `agency-os/scripts/secrets-vault.ps1` 複本確認
3. 必要時重建：
   - `.\scripts\secrets-vault.ps1 -Action init`

## 修復版（出問題先做這 5 步）
1. 打開 `D:\Work` 資料夾的終端機
2. 貼上：  
   `.\scripts\secrets-vault.ps1 -Action init`
3. 再貼上：  
   `.\scripts\secrets-vault.ps1 -Action import-mcp -McpPath "D:\Work\mcp.json"`
4. 再貼上：  
   `.\scripts\secrets-vault.ps1 -Action list`
5. 如果清單有出來，代表修復完成；若還不行，刪除 `%LOCALAPPDATA%\AgencyOS\secrets\vault.json` 後重做 2~4 步

## 故障排除（FAQ）
- `Secret not found`：該 key 尚未 set / import，先補 `set-prompt`
- `ConvertFrom-Json` 錯誤：vault 檔可能被手動改壞，刪除 `%LOCALAPPDATA%\AgencyOS\secrets\vault.json` 後 `-Action init` 重建
- `run` 執行失敗：先獨立確認命令本身可執行，再檢查 `-Names` 是否全部存在

## 建議日常流程
1. 新密鑰一律：`set-prompt`
2. 用到密鑰執行命令時，一律：`-Action run`
3. 每週一次：`-Action list` 快速盤點缺漏

## 建議先放進去的 key
- `LOBSTER_SUPABASE_URL`
- `LOBSTER_SUPABASE_SERVICE_ROLE_KEY`
- `AGENCY_OS_SLACK_WEBHOOK_URL`
- 你常用的 MCP 相關 token（以 key 名稱分開管理）

## 安全注意
- 這是「本機使用者層級」加密，不是團隊雲端金庫。
- 若同一台機器換使用者，無法直接解密既有值。
- 若懷疑外洩，仍要輪替 token。
- 禁止把祕密值寫到 `README.md`、`WORKLOG.md`、`memory/*.md`。

## Related Documents (Auto-Synced)
- `docs/operations/security-secrets-policy.md`
- `docs/operations/mcp-secrets-hardening-runbook.md`
- `docs/overview/REMOTE_WORKSTATION_STARTUP.md`
