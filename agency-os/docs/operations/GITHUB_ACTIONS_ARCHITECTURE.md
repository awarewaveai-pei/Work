# GitHub Actions 架構與分工（長期正文）

> **Owner**：本檔是所有 GitHub Actions 設計決策的單一真相（SSOT）。  
> **邊界**：只描述 GHA 層；長流程在 Trigger.dev、輕量整合在 n8n — 不重複定義。  
> **關聯舊檔**：`github-actions-trigger-prod-deploy.md` 保留「為何移除 Trigger Cloud deploy」的歷史脈絡，本檔是架構正文。

---

## 一句話定位

> **GitHub Actions = Repo 層的品質閘門與放行閘門，不是業務自動化引擎。**

---

## 分工邊界（不可逾越）

| 層 | 工具 | 負責 |
|---|---|---|
| **Release Gate** | GitHub Actions | 程式碼品質、manifest 驗證、infra config guard、PR 放行、production 手動核准 |
| **Durable Execution** | Trigger.dev（唯一） | 長時間、可重試、可觀測的業務 workflow（onboarding、建站、repair flow）|
| **Integration** | n8n | 輕量 webhook、CRM sync、第三方通知 |
| **AI Execution** | MCP / Agents | 內容生成、診斷、開 PR — 在閘門內輔助，**不當控制面** |
| **State & Audit** | Supabase | workflow run、approval、audit log 回寫 |

### GitHub Actions **不做**的事（明確禁止）

- ❌ 直接執行 production deploy（只能 manual webhook trigger）
- ❌ 執行長時間業務流程（交 Trigger.dev）
- ❌ 執行 WordPress 建站、client onboarding、repair flow
- ❌ 使用 develop 分支假設（repo 為 main-only 文化）
- ❌ 在 CI runner 上跑本機工作站腳本（`machine-environment-audit.ps1` 是 Windows 專用，禁止在 ubuntu-latest 上呼叫）
- ❌ 直接執行 destructive DB migration
- ❌ 引入 Inngest（Trigger.dev 為唯一 durable 執行層，無雙頭馬車）
- ❌ 與 `verify-build-gates.ps1` 等本機 PowerShell 閘門重複邏輯（各守各的邊界）

---

## 現有 Workflows（目前狀態）

### Gate 1a：`release-gate-main.yml`
- **觸發**：PR → main
- **用途**：`npm run validate`（lobster manifest / 套件結構）
- **通過條件**：validate 腳本 exit 0

### Gate 1b：`lobster-workflows-validate-main.yml`
- **觸發**：push → main，路徑 `lobster-factory/packages/workflows/**`
- **用途**：workflows 套件 push 後再跑一次 validate
- **通過條件**：validate 腳本 exit 0
- **注意**：無 `package-lock.json`，使用 `npm install`（不是 `npm ci`）

### Gate 2：`trigger-infra-config-guard.yml`
- **觸發**：push / PR → main，路徑 `lobster-factory/infra/trigger/**`
- **用途**：`validate-config.ps1`（防止 ClickHouse floating tag、latency_log 殘留等）
- **通過條件**：所有 guardrail 通過

---

## 未來擴充路線圖（規劃中，現在不做）

### Gate 3：DB Migration Safety Check（規劃）
- **觸發**：PR 包含 `supabase/migrations/**` 變更
- **內容**：靜態 SQL 分析（非 dry-run）— 檢查 destructive DDL、是否缺 `organization_id`
- **不做**：連到 staging DB 執行，成本與複雜度不值得放在 PR gate

### Gate 4：Staging Deploy Trigger（規劃）
- **觸發**：`workflow_dispatch`（手動）或 tag
- **內容**：呼叫 `STAGING_DEPLOY_WEBHOOK` → Trigger.dev 接手執行，GHA 不直接部署
- **不做**：develop 分支自動觸發（違反 main-only 文化）

### Gate 5：Production Release Gate（規劃）
- **觸發**：`workflow_dispatch` only，需輸入 `release_sha` + `approval_ticket_id`
- **內容**：GitHub Environment `production` required reviewers 審核 → 才呼叫 deploy webhook
- **原則**：任何情況下 push main **不**自動 deploy production

---

## Secrets / Variables（目前需要的）

| 名稱 | 用途 | 現況 |
|---|---|---|
| 無 | 現有三個 workflow 不需要 repo secrets | — |

### 已廢棄（2026-05-01 實機驗證：GitHub 上不存在，無需處理）

| 名稱 | 說明 |
|---|---|
| `TRIGGER_ACCESS_TOKEN` | CI 已不使用；GitHub repo 已確認不存在；本機用 vault |
| `TRIGGER_SECRET_KEY` | 同上 |
| `TRIGGER_PROJECT_REF` | 同上（Variables tab 亦不存在） |

---

## 30 年維護原則

1. **GHA 只是閘門** — workflow 越短越好，複雜邏輯在獨立腳本（`.mjs` / `.ps1`），GHA 只負責呼叫
2. **不跨越邊界** — 任何「直接部署」、「直接修改生產資料」的需求，一律先建 ADR
3. **單一 durable 執行層** — Trigger.dev；若未來替換，請建 ADR 並更新本檔
4. **CI runner = Linux** — 腳本須可在 ubuntu-latest 執行；Windows 工作站腳本一律不進 GHA
5. **main-only** — 不為 develop / feature branch 建任何自動 deploy；分支策略改變前先更新本檔
6. **Secrets 最小化** — 能不用 GitHub Secret 就不用；本機用 vault，server 用環境變數
7. **人工核准 production** — 永遠需要 `workflow_dispatch` + human reviewer，不因任何理由自動化

---

## 失敗排查

| 現象 | 先查 |
|---|---|
| validate 紅燈 | `lobster-factory/scripts/bootstrap-validate.mjs` 錯誤訊息 |
| infra config guard 紅燈 | `lobster-factory/infra/trigger/validate-config.ps1` 輸出 |
| 任何 workflow 突然消失 | `git log -- .github/workflows/<name>.yml` 查是否被刪除 |

---

## Related（單句摘要，不重複內容）

- [`github-actions-trigger-prod-deploy.md`](./github-actions-trigger-prod-deploy.md) — 為何移除 Trigger Cloud CI deploy 的歷史脈絡
- [`../../../.github/workflows/`](../../../.github/workflows/) — 所有 workflow YAML
- [`../../../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`](../../../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md) — 工具邊界完整規格
- [`hetzner-stack-rollout-index.md`](./hetzner-stack-rollout-index.md) — 自託管部署全景
- [`TOOL_RESPONSIBILITY_MATRIX.md`](./TOOL_RESPONSIBILITY_MATRIX.md) — 各工具責任矩陣

_建立：2026-04-30 | 最後更新：2026-05-01 | Owner: awarewaveai-pei_
