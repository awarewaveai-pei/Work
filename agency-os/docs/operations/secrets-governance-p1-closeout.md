# P1 Secrets 治理收斂手冊（Owner／輪替／演練證據）

> **對應 `TASKS`**：`（工具建置）Secrets 治理升級（從 env/mcp 到集中管控）`  
> **政策正本**：`security-secrets-policy.md`  
> **本檔**：可執行步驟 + **DoD 證據欄位**（不含任何明文祕密）

## 1) 治理基線（先寫清楚再輪替）

### 1.1 Secret Owner（填人名／角色，不填 token）

> **人名**：可離線維護（行事曆／Notion）；**git 內只保留角色**，避免人事變動時改歷史檔。

| 範圍 | Owner（角色） | 存放處（類型） | 輪替節奏 |
|------|----------------|----------------|----------|
| GitHub（PAT／Fine-grained／Actions） | Agency OS／龍蝦 **專案負責人（營運）** | 本機 DPAPI `secrets-vault`（鍵名見 §1.4）、GitHub 後台 token 管理；GitHub MCP 用 `mcp.json` 內 `GITHUB_PERSONAL_ACCESS_TOKEN`（**不入庫**） | 90 天或事件驅動 |
| n8n（API／MCP Access Token） | **整合／流程負責人（營運）**（可與上列同一人） | n8n 後台 Instance MCP、本機 `N8N_AUTH_BEARER_TOKEN`（vault）＋ `mcp.json` n8n `Authorization`（**不入庫**） | 90 天或事件驅動 |
| Trigger.dev（專案金鑰等） | **後端／workflow 負責人（工程）** | vault `TRIGGER_ACCESS_TOKEN`；Trigger 專案／環境 secrets；龍蝦 CI（見 `lobster-factory` Actions） | 90 天或事件驅動 |
| Supabase（service role 等） | **SoR／後端負責人（工程）** | vault `LOBSTER_SUPABASE_*`、`SUPABASE_AUTH_BEARER_TOKEN`（若用外掛 MCP）；託管環境 secrets | 90 天或事件驅動 |

### 1.4 本機 `secrets-vault` 鍵名對照（僅鍵名、不含值）

對應 `scripts/secrets-vault.ps1`（monorepo 慣用路徑：`agency-os/scripts/secrets-vault.ps1` 或根目錄同功能腳本，以你機上為準）：

| 範圍 | Vault 鍵名（`list` 可見） | 備註 |
|------|---------------------------|------|
| GitHub | `GITHUB_PERSONAL_ACCESS_TOKEN` | 與 `@modelcontextprotocol/server-github`／模板 `mcp.json.template` 一致 |
| n8n | `N8N_AUTH_BEARER_TOKEN` | MCP Bearer 另可在 `mcp.json` 覆寫；輪替後兩處策略需一致（擇一為準或雙更新） |
| Trigger | `TRIGGER_ACCESS_TOKEN` | 自託管／雲端後台輪替後同步 CI 與本機 vault |
| Supabase | `LOBSTER_SUPABASE_URL`、`LOBSTER_SUPABASE_SERVICE_ROLE_KEY` 等 | 僅列龍蝦慣用鍵；其他 Supabase 外掛鍵依實際命名 |

### 1.5 輪替後最短動作（不含祕密本身）

1. 在供應商後台建立**新**憑證 → 更新 **vault**（`set`）與／或 **`mcp.json`**（**勿** `git add`）。  
2. 適用時：`secrets-vault.ps1 -Action import-mcp`（將 MCP 環境變數回灌 vault，見 `local-secrets-vault-dpapi.md`）。  
3. 重啟 Cursor 或重載 MCP → **驗證**一筆輕量操作（例如 GitHub MCP list、n8n MCP 連線、Trigger list runs）。  
4. **撤銷舊**憑證。  
5. 於 `WORKLOG.md` 當日區塊依 **§3** 填寫（**不要**貼 token 字串）。

### 1.2 最小讀取權限原則

- **GitHub**：token 僅含必要 repo scope；禁止「萬用 admin」當日常開發 token。  
- **n8n**：MCP token 僅給內部 Cursor；流程用 credential 與 MCP token 分離。  
- **Trigger**：production／staging secret 分桶；CI 與本機不共用同一組高權限憑證（若可做到）。

### 1.3 本機與 MCP

- `mcp.json`：**僅本機**；用 `mcp.json.template` 維持 repo 範本。  
- 匯入 vault：`scripts/secrets-vault.ps1 -Action import-mcp`（見 `local-secrets-vault-dpapi.md`、`mcp-add-server-quickstart.md`）。

---

## 2) 一輪輪替演練（P1 DoD 核心）

> **DoD**：完成下列 **至少一個「高風險範圍」** 的**計畫內輪替**，且 **服務不中斷**（或僅預期內少於 5 分鐘可接受窗口，並有 rollback）。

### 2.1 建議首輪組合（三選一即可達標；愈安全愈好）

**A. GitHub PAT（影響面可控時）**

1. 在 GitHub 建立**新** token（新到期日／新 fine-grained 設定）。  
2. 更新**本機** `mcp.json` 或 Cursor 設定中的 GitHub 區塊（**勿**提交 repo）。  
3. `secrets-vault.ps1 -Action import-mcp`（若適用）。  
4. 驗證：`gh auth status` 或 Cursor GitHub MCP 一次輕量操作成功。  
5. **撤銷舊** token。  

**B. n8n MCP Access Token**

1. n8n：**Instance-level MCP** → Connection details → **Regenerate** MCP token（會作廢舊的）。  
2. 更新本機 Cursor `mcp.json` 的 `Authorization: Bearer`。  
3. 重啟 Cursor；確認 MCP 連線成功。  

**C. Trigger（若已上線）**

1. 在 Trigger 託管後台建立新 key／rotate。  
2. 更新部署環境與本機 vault 中對應名稱（與你們腳本約定一致）。  
3. 跑一次**非破壞** smoke（例如 list runs 或 dry workflow）。

### 2.2 演練中禁止事項

- 不把新舊 token **明文**寫進 `WORKLOG`、`memory`、PR 描述、聊天。  
- 不為了「過關」而降低 token 權限範圍以外的安全邊界（例如開過寬 org scope）。

---

## 3) 完成後寫入 `WORKLOG.md`（證據範本）

在當日 `## yyyy-MM-dd` 下新增一小節 **「P1 Secrets 輪替演練」**，至少包含：

- `scope`: 上述 A/B/C 哪一項（例如 `github-pat` / `n8n-mcp` / `trigger-api`）  
- `date_utc`: 演練日期（UTC 或本地 + 時區）  
- `owner`: 執行人角色  
- `rollback_note`: 無／簡述（不含祕密）  
- `verification`: 用一句話描述驗證方式（例如「Cursor GitHub MCP list repo OK」「n8n MCP 綠燈」）  
- **不要**出現 token 字串。

---

## 4) 與 `TASKS` 勾選的關係

- 僅完成 **§1 表格填寫** ≠ P1 完成。  
- **P1 DoD** = **§2 完成一輪輪替** + **§3 WORKLOG 證據** + 關鍵服務確認無非預期中斷。  
- 收工時可於 `WORKLOG` 寫 `- AUTO_TASK_DONE: Secrets 治理升級`（子字串須命中該 `- [ ]` 行）。

## Related Documents

- `docs/operations/security-secrets-policy.md`
- `docs/operations/local-secrets-vault-dpapi.md`
- `docs/operations/mcp-secrets-hardening-runbook.md`
- `docs/operations/mcp-add-server-quickstart.md`
- `docs/operations/TOOLS_DELIVERY_TRACEABILITY.md`
