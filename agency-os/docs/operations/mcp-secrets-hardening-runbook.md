# MCP Secrets Hardening Runbook

## 小白快速入口（去哪裡 -> 做什麼）
1. 打開檔案總管，進到 `D:\Work`
2. 右鍵空白處選「在終端機中開啟」
3. 貼上（把 mcp 裡的密鑰匯入保險箱）：  
   `.\scripts\secrets-vault.ps1 -Action import-mcp -McpPath "D:\Work\mcp.json"`
4. 貼上（確認）：  
   `.\scripts\secrets-vault.ps1 -Action list`
5. 若有 key 名稱清單，表示完成

## Goal
- Keep MCP usable on each machine while preventing secret leakage.
- Standardize laptop/desktop setup without committing secrets to git.

## Scope
- Local Cursor MCP config: `C:\Users\USER\.cursor\mcp.json`
- Local wrappers: `<WORK_ROOT>\mcp-local-wrappers\`

## Risk Level
- If API keys/tokens appear in plaintext config, treat as **potentially leaked**.
- Rotate high-privilege tokens first (GitHub, Supabase, OpenAI/Anthropic/Gemini, n8n, WordPress, Replicate, Copilot, Perplexity). **Airtable** 已淘汰並遷移 **Supabase**：請 **revoke** 舊 `AIRTABLE_API_KEY`（若仍存在任何本機設定）。

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
   - Reload Cursor window
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
