# P1 Secrets 治理收斂手冊（Owner／輪替／演練證據）

> **對應 `TASKS`**：`（工具建置）Secrets 治理升級（從 env/mcp 到集中管控）`  
> **政策正本**：`security-secrets-policy.md`  
> **本檔**：可執行步驟 + **DoD 證據欄位**（不含任何明文祕密）

## 1) 治理基線（先寫清楚再輪替）

### 1.1 Secret Owner（填人名／角色，不填 token）

| 範圍 | Owner（角色） | 存放處（類型） | 輪替節奏 |
|------|----------------|----------------|----------|
| GitHub（PAT／Fine-grained／Actions） | | 本機 vault／GitHub 後台 | 90 天或事件驅動 |
| n8n（API／MCP Access Token） | | n8n 後台 + 本機 `mcp.json`（不入庫） | 90 天或事件驅動 |
| Trigger.dev（專案金鑰等） | | vault／託管環境 secrets | 90 天或事件驅動 |
| Supabase（service role 等） | | vault／託管環境 | 90 天或事件驅動 |

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
