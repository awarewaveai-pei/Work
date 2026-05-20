# Repair Center Gap Fixes — Execution Plan

> 建立於 2026-05-20。跨機換機 SSOT：筆電 git pull 後直接從此檔繼續。
> R0 分析完成，批次 1 已執行並 commit。批次 2/3 等待筆電執行。

---

## 已完成（桌機）

### 批次 1 — 安全與配置修正（已 commit）

- [x] **A1 — middleware.ts bypass 精確化**
  - 檔案：`lobster-factory/infra/hetzner-phase1-core/apps/next-admin/middleware.ts`
  - 改動：`startsWith("/api/ops/inbox/")` → 精確比對 `/api/ops/inbox/health` + `/api/ops/inbox/digest`
  - 原因：舊寫法讓未來新增在 `/api/ops/inbox/` 下的路由自動繞過 proxy-auth

- [x] **A2 — GitHub Actions 移除多餘 OIDC 權限**
  - 檔案：`.github/workflows/auto-repair-claude.yml`
  - 改動：移除 `id-token: write`（此 workflow 不使用 OIDC cloud provider auth）

- [x] **A3 — user-env.ps1 填入 soulful-expression Supabase key（本機，gitignored）**
  - 桌機已填，筆電需手動同步（見下方「筆電上機後」步驟）

---

## 待執行（筆電）

### 批次 2 — 測試基礎設施

**目標**：讓 `rules.test.ts`（已存在但死掉）可以跑，並補 policy 單元測試。

**步驟：**

1. 修改 `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/package.json`
   - scripts 加入：
     ```json
     "test": "vitest run",
     "test:watch": "vitest"
     ```
   - devDependencies 加入：
     ```json
     "vitest": "^2.1.0"
     ```

2. 新建 `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/__tests__/policy.test.ts`
   - 測試項目：
     - `policyForIncident()` 全 source × severity 組合（sentry/uptime_kuma/grafana/posthog/netdata/manual × critical/high/medium/low）
     - 邊界：`manual + critical` → `triage_needed`；`netdata + *` → `human_only`
     - `canApprovePolicy()` 所有 RepairPolicy 值
     - `needsGitHubIssue()` 所有 RepairPolicy 值

3. 在 next-admin 目錄執行 `npm install && npm test` 確認全過

**驗證**：`npm test` 輸出 `rules.test.ts` 9 個 + `policy.test.ts` N 個全 pass。

---

### 批次 3 — GitHub Webhook Route（PR merge → repair_run 狀態轉換）

**背景**：repair_run 流程中，PR merge 後沒有任何機制把狀態從 `pr_ready` 轉為 `deploy_pending`，流程斷鏈。

**新增檔案**：`lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/github/route.ts`

**邏輯**：
1. 取 `x-hub-signature-256` header，用 `GITHUB_WEBHOOK_SECRET` env var 做 HMAC-SHA256 驗簽
2. 驗簽失敗 → 回 401
3. event type ≠ `pull_request` 或 action ≠ `closed` 或 `merged ≠ true` → 回 200（ignored）
4. 取 `pull_request.number`，查 `repair_runs` by `github_pr_number`
5. 若找到且狀態為 `pr_ready` → UPDATE 狀態為 `deploy_pending`，寫 audit log
6. 回 200

**需同步的環境變數**：
- `GITHUB_WEBHOOK_SECRET`（自選任意字串）
- 需加入：
  - `lobster-factory/infra/hetzner-phase1-core/docker-compose.yml`（next-admin environment block）
  - SG VPS `/root/lobster-phase1/.env`（SSH 進去加）

**GitHub 端設定**（需要手動到 GitHub Settings → Webhooks）：
- URL：`https://app.aware-wave.com/api/webhooks/github`
- Content type：`application/json`
- Events：`Pull requests`
- Secret：與 `GITHUB_WEBHOOK_SECRET` 相同值

**驗證**：
```bash
# 模擬有效 payload（需帶正確 HMAC）
# 用錯誤 secret 應回 401
# 用正確 secret + merged=true + 對應 PR number → repair_run 狀態更新為 deploy_pending
```

---

## 筆電上機後第一步

```powershell
# 1. 拉最新 code
git pull

# 2. 填入 soulful-expression Supabase key（A3，gitignored，桌機不會同步）
# 開啟 mcp/user-env.ps1，找到：
#   SUPABASE_SOULFULEXPRESSION_SERVICE_ROLE_KEY = ""
#   SUPABASE_A_SERVICE_ROLE_KEY  = ""
# 填入：
#   eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1mZmpxamlpZGJlaWJpbG14emVmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTk0MzkxMiwiZXhwIjoyMDg3NTE5OTEyfQ.W8yqjszNKxcT-KxorBXbEINhgWshVZp6-eGhLZnrimI
# 然後重跑 user-env.ps1

# 3. 跟 Claude 說「繼續 REPAIR_CENTER_GAPS_PLAN 批次 2」
```

---

## Group D — 架構性缺口（本次範圍外，記錄備查）

| 缺口 | 說明 | 何時處理 |
|------|------|---------|
| SSH key 移出 next-admin 容器 | 目前 `AUTO_REPAIR_SG_SSH_KEY_B64` 等 SSH 私鑰存在 container env，高風險 | Phase 4 |
| Basic Auth → Supabase Auth session | 整個 auth layer 替換 | 獨立大型項目 |
| Signal intake completeness（CI/GitHub/Trigger.dev → Ops Inbox） | Phase 4 scope | Phase 4 |
| `tenant_integration_bindings` fanout | Phase 5 schema change | 需 migration |
| `client_slug → organization_id` migration | 跨系統遷移 | 持續進行中 |
