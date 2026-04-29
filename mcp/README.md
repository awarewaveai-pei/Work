# MCP Shared Registry

This directory is the single source of truth for MCP server definitions that need to work across:

- Codex
- GitHub Copilot CLI
- Gemini CLI
- project-scoped `.mcp.json` clients such as Claude Code
- workspace-level Cursor clients layered through `.cursor/mcp.json` and `~/.cursor/mcp.json`

## Files

- `registry.template.json`: committed MCP server registry with no secrets
- `user-env.template.ps1`: committed example for machine-local environment variables
- `SERVICE_MATRIX.md`: which services use direct MCP versus the local AwareWave wrapper
- `SHARED_MCP_API_SOP.md`: standard operating procedure for adding shared MCP/API entries safely

## Standard flow

1. Copy `user-env.template.ps1` to `user-env.ps1` on that machine.
2. Fill in the real secrets and endpoint values in `user-env.ps1`.
3. Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-mcp-machine.ps1
```

Or:

```powershell
npm run mcp:bootstrap
```

## Manual sync only

If the machine-local environment is already present, you can skip bootstrap and just run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sync-mcp-config.ps1
```

### n8n MCP smoke test（自託管）

若 **`N8N_MCP_URL`**／**`N8N_AUTH_BEARER_TOKEN`** 已設定（見 **`user-env.ps1`**），可在 monorepo 根執行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\n8n-mcp-smoke.ps1
```

或 **`npm run n8n:mcp-smoke`**。詳見 **`agency-os/docs/operations/n8n-self-hosted-mcp-troubleshooting.md`**。若 **exit 3（404）** 且出現 **`TRY_ALT_MCP_URL`**，代表可能誤用了 apex URL 而伺服器為 **`N8N_PATH=/n8n/`**——仍以該文件對照表與伺服器 **`.env`** 為準。

This writes:

- repo-local `.mcp.json`
- `.cursor/mcp.json` (**Cursor** project MCP; keep in sync with root file)
- `~/.codex/config.toml` managed MCP block
- `~/.copilot/mcp-config.json`
- `~/.gemini/settings.json`

## One-shot governance apply (recommended)

To align shared MCP + closeout collaboration baseline in one command:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\apply-shared-ai-governance.ps1
```

Or:

```powershell
npm run mcp:governance
```

This will:

- seed `agency-os/.agency-state/closeout-inbox.md` when missing
- sync shared MCP outputs (`.mcp.json`, Codex, Copilot, Gemini)
- generate startup prompt packs for non-Cursor agents:
  - `agency-os/.agency-state/agent-bootstrap-prompts.md`
  - `agency-os/.agency-state/agent-bootstrap-prompt.txt`

If a machine already has plaintext secrets in user-level Cursor or Claude MCP files, sanitize them before relying on the shared setup:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sanitize-user-mcp-config.ps1
```

This creates a timestamped backup under `Backups/`, rewrites `~/.cursor/mcp.json` to env-based placeholders derived from the shared project config, rewrites legacy `~/.claude/mcp.json` to a minimal non-secret fallback, and clears stale project-scoped MCP entries from `~/.claude.json`.

Current official config locations this repo aligns with:

- Cursor: project `.cursor/mcp.json`, global `~/.cursor/mcp.json`
- Claude Code: project `.mcp.json`, local/user scopes in `~/.claude.json`
- Codex: `~/.codex/config.toml`
- Gemini: `~/.gemini/settings.json`

## New machine checklist

1. Clone the repo.
2. Install the client CLIs you actually use on that machine.
3. Create `mcp/user-env.ps1` from the template.
4. Run `npm run mcp:bootstrap`.
5. Open a new terminal.
6. Start `codex`, `copilot`, or `gemini`.

## AwareWave Fleet Control

The shared setup now covers:

- `n8n`
- `AwareWave Supabase REST` via `awarewave-ops -> supabase_awarewave`
- `AwareWave Supabase Postgres` via `supabase-awarewave-postgres`
- `Soulful Expression Supabase`
- `Trigger.dev`
- `Cloudflare`
- `PostHog`
- `Resend`
- `GitHub`
- `api.aware-wave.com`
- `app.aware-wave.com`
- `Hetzner`
- `Uptime Kuma`
- `Grafana`
- `Netdata`
- `Slack`
- `Sentry`

See [`SERVICE_MATRIX.md`](SERVICE_MATRIX.md) for how each one is connected.

For `AwareWave Supabase` specifically, the standard paths are:

- REST: `awarewave-ops -> supabase_awarewave`
- SQL: `supabase-awarewave-postgres` after `.\scripts\open-supabase-ssh-tunnel.ps1 -Background`
- Preferred env vars: `SUPABASE_AWAREWAVE_URL`, `SUPABASE_AWAREWAVE_SERVICE_ROLE_KEY`, `SUPABASE_AWAREWAVE_POSTGRES_DSN`

For `Soulful Expression Supabase`, prefer:

- `SUPABASE_SOULFULEXPRESSION_URL`
- `SUPABASE_SOULFULEXPRESSION_SERVICE_ROLE_KEY`

Do not configure self-hosted `AwareWave Supabase` as `mcp.supabase.com` hosted MCP.

## Design rules

- Secrets never live in git.
- Workspace and home paths are resolved per machine at sync time.
- Optional servers stay in the registry but are skipped unless enabled.
- Existing non-MCP settings in `~/.codex/config.toml` and `~/.gemini/settings.json` are preserved.
- Claude's shared team config should live in project `.mcp.json`; do not treat `~/.claude/mcp.json` as the primary shared path.
