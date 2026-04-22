# MCP Shared Registry

This directory is the single source of truth for MCP server definitions that need to work across:

- Codex
- GitHub Copilot CLI
- Gemini CLI
- workspace-level `.mcp.json` clients such as Cursor / VS Code

## Files

- `registry.template.json`: committed MCP server registry with no secrets
- `user-env.template.ps1`: committed example for machine-local environment variables

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

This writes:

- repo-local `.mcp.json`
- `~/.codex/config.toml` managed MCP block
- `~/.copilot/mcp-config.json`
- `~/.gemini/settings.json`

## New machine checklist

1. Clone the repo.
2. Install the client CLIs you actually use on that machine.
3. Create `mcp/user-env.ps1` from the template.
4. Run `npm run mcp:bootstrap`.
5. Open a new terminal.
6. Start `codex`, `copilot`, or `gemini`.

## Design rules

- Secrets never live in git.
- Workspace and home paths are resolved per machine at sync time.
- Optional servers stay in the registry but are skipped unless enabled.
- Existing non-MCP settings in `~/.codex/config.toml` and `~/.gemini/settings.json` are preserved.
