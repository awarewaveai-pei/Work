# MCP Secrets Hardening Runbook

## 小白快速入口（去哪裡 -> 做什麼）
1. 打開檔案總管，進到 `D:\Work`
2. 右鍵空白處選「在終端機中開啟」
3. 貼上（把 mcp 裡的密鑰匯入保險箱）：  
   `.scriptssync-mcp-config.ps1`
4. 貼上（確認）：  
   `.\scripts\secrets-vault.ps1 -Action list`
5. 若有 key 名稱清單，表示完成

## Goal
- Keep MCP usable on each machine while preventing secret leakage.
- Standardize laptop/desktop setup without committing secrets to git.

## Scope
- Project MCP config: repo root `.mcp.json`; Codex managed MCP block: `%USERPROFILE%\.codex\config.toml`
- Local wrappers: `<WORK_ROOT>\mcp-local-wrappers\`

## Risk Level
- If API keys/tokens appear in plaintext config, treat as **potentially leaked**.
- Rotate high-privilege tokens first (GitHub, Supabase, OpenAI/Anthropic/Gemini, n8n, WordPress, Replicate, Copilot). **Airtable** 已淘汰並遷移 **Supabase**：請 **revoke** 舊 `AIRTABLE_API_KEY`（若仍存在任何本機設定）。

## Phase 1 - Immediate Containment
1. Confirm `mcp.json` is **not** in git-tracked workspace files.
2. Stop sharing screenshots/logs that include token values.
3. For each provider, revoke/rotate existing token and issue a new one.

## Phase 2 - Safe Local Configuration
1. Keep secrets only in local machine config (outside repo).
   - 推薦：`scripts/secrets-vault.ps1`（DPAPI）集中管理，再用 `-Action run` 注入執行。
2. Use path-safe values for wrappers:
   - `C:\Users\USER\Work\mcp-local-wrappers\llm-mcp.mjs`
3. After any path/token change:
    - Restart Claude Code / Codex
   - Validate one tool call per server

## Phase 3 - Operational Guardrails
1. Weekly secret hygiene check:
   - Verify no credentials in repo diffs before push.
2. If credential leakage is suspected:
   - Revoke token
   - Reissue token
   - Update local `mcp.json`
   - Record incident in `WORKLOG.md` without exposing secret values

## Verification Checklist
- [ ] `npm ci` completed in `mcp-local-wrappers`
- [ ] MCP servers with local wrappers can start
- [ ] Critical automation gates still PASS (`verify-build-gates.ps1`)
- [ ] No secrets committed in tracked files
- [ ] `secrets-vault` 可以 `list` 與 `run` 成功執行

## Related Documents (Auto-Synced)
- `docs/operations/security-secrets-policy.md`
- `docs/operations/local-secrets-vault-dpapi.md`
- `docs/operations/end-of-day-checklist.md`
- `docs/overview/REMOTE_WORKSTATION_STARTUP.md`


## Local Plaintext Scanner（每次 verify-build-gates 自動跑）

**目的**：補上 `mcp/claude-userlevel/hooks/rules/commit-quality.js` 的盲區。那個 hook 只在 `git commit` 時掃 `.js/.ts/.py`；本機 gitignored 的 config（`.claude/settings.json`、`.mcp.json`、`mcp/user-env.ps1`）它看不到，但這些檔案會在磁碟上累積明文 secret。

### 自動觸發

每次 `verify-build-gates.ps1` 都會自動跑 `scripts/scan-local-config-for-secrets.ps1`。

| 結果 | 含意 | 對 verify-build-gates 的影響 |
|------|------|------|
| **PASS** (exit 0) | 全部本機 config 乾淨 | 繼續往下跑 |
| **WARN** (exit 1) | 在 gitignored 檔案找到明文 secret | 印警告，但**不阻擋**閘道（這些檔案不會進 git） |
| **FAIL** (exit 2) | 在 git-tracked 檔案找到明文 secret | **阻擋**閘道，要求清理才能繼續 |

### 手動跑

```powershell
# 預設模式（gitignored secrets 只警告）
powershell -ExecutionPolicy Bypass -File .\scripts\scan-local-config-for-secrets.ps1

# 嚴格模式（gitignored secrets 也算 FAIL）
powershell -ExecutionPolicy Bypass -File .\scripts\scan-local-config-for-secrets.ps1 -Strict

# 指定額外掃描路徑
powershell -ExecutionPolicy Bypass -File .\scripts\scan-local-config-for-secrets.ps1 -Path "extra/file.json","another/path.ps1"
```

### 涵蓋的 token 類型（schema v1）

| 類型 | Pattern 名稱 |
|------|---------|
| Supabase service_role / 一般 JWT | `JWT (Supabase / generic)` |
| GitHub PAT (classic / fine-grained / OAuth) | `GitHub PAT` × 3 變體 |
| Anthropic | `sk-ant-*` |
| OpenAI | `sk-*` |
| Google API key | `AIza*` |
| AWS access key | `AKIA*` |
| Trigger.dev | `tr_(prod|dev)_*` |
| Uptime Kuma | `uk1_*` |
| Postgres DSN with password | `postgresql://user:pass@` |
| Google app password (4×4 字組) | `prefix:abcd efgh ijkl mnop qrst uvwx` |

### 預設掃描檔案

```
.claude/settings.json
.claude/settings.local.json
.mcp.json
.mcp.json
mcp/user-env.ps1
```

### 擴充 Pattern（30 年穩定的擴充協議）

新增 token 類型：

1. 編 `scripts/scan-local-config-for-secrets.ps1`，找 `# PATTERN REGISTRY` 區塊
2. 加一行：`@{ Name = "Provider Y token"; Regex = '<unique-prefix>[A-Za-z0-9_-]{N,}' }`
3. 跑 `scripts/scan-local-config-for-secrets.ps1` 確認沒誤判
4. 跑 `scripts/verify-build-gates.ps1` 確認沒破壞閘道

新增掃描路徑：

- 暫時：用 `-Path` 參數
- 永久：編腳本 `# DEFAULT SCAN PATHS` 區塊加入

### 移除 Pattern / 路徑

直接從清單移除即可。腳本是 stateless，不需要 migration。Schema 不變動，不必升版。

### 處置 Findings

**FAIL（tracked 檔案有明文）**：

1. 立刻 `git diff --cached <file>` 確認 secret 確實在 staged 裡
2. **不要 commit**
3. 把 secret 移進 `scripts/secrets-vault.ps1 -Action set`
4. 從原檔案移除（用環境變數 `${env:VAR_NAME}` 取代）
5. 重新跑 scanner 確認 PASS

**WARN（gitignored 檔案有明文）**：

不會阻擋，但建議定期清理：

1. 把該 secret 移進 vault：`.\scripts\secrets-vault.ps1 -Action set -Name FOO -Value <value>`
2. 從本機檔案改用環境變數
3. 跑 `.\scripts\secrets-vault.ps1 -Action sync-mcp-user-env` 注入到 Windows User env
4. **完全結束 Claude Code / Codex 後重開**（讓新 env 生效）
5. 再跑 scanner 確認

### Known-suppressed baseline (2026-06-12)

`verify-build-gates.ps1` runs this scanner with:

```powershell
agency-os/config/scan-local-config-known-suppressed.json
```

Baseline rules are value-free and match only `file + pattern + sourceKey`.
Tracked-file findings are never suppressible. With the baseline enabled:

| Result | Meaning | Gate behavior |
|---|---|---|
| PASS | No visible findings; known local findings were suppressed | Continue |
| FAIL exit 2 | Tracked secret OR baseline-miss local secret | Block `verify-build-gates` |

When adding a suppression, include only the non-secret `sourceKey` printed by
the scanner and a reason. Never add token values, redacted values, hashes, or
full config lines to the baseline.

### Related

- `scripts/scan-local-config-for-secrets.ps1`（本掃描器）
- `scripts/secrets-vault.ps1`（DPAPI vault）
- `mcp/claude-userlevel/hooks/rules/commit-quality.js`（commit-time, code-files-only）
- `agency-os/docs/operations/local-secrets-vault-dpapi.md`（vault 完整手冊）
- `agency-os/docs/operations/security-secrets-policy.md`（policy 正本）
