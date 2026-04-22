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

1. Set machine-local environment variables from `user-env.template.ps1`.
2. Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sync-mcp-config.ps1
```

3. The script writes:

- repo-local `.mcp.json`
- `~/.codex/config.toml` managed MCP block
- `~/.copilot/mcp-config.json`
- `~/.gemini/settings.json`

## Design rules

- Secrets never live in git.
- Workspace and home paths are resolved per machine at sync time.
- Optional servers stay in the registry but are skipped unless enabled.
- Existing non-MCP settings in `~/.codex/config.toml` and `~/.gemini/settings.json` are preserved.
