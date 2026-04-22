@agency-os/AGENTS.md
@mcp/README.md
@agency-os/docs/operations/mcp-add-server-quickstart.md

# Claude Code Project Instructions

## Shared MCP Governance

- Treat `mcp/registry.template.json` and `scripts/sync-mcp-config.ps1` as the only shared source of truth for MCP server definitions in this repo.
- Project-scoped Claude MCP config lives at repo-root `.mcp.json`.
- Do not treat `~/.claude/mcp.json` as the shared project config. Claude Code project instructions and project MCP are repo-owned; user/local scope belongs in `~/.claude.json` or other machine-local settings.
- When comparing against user-level Cursor or Claude MCP files, use them only as discovery inputs. Merge useful structure back into the shared registry and docs without copying live secrets into git.
- When changing MCP setup, update these repo files first:
  1. `mcp/registry.template.json`
  2. `mcp/user-env.template.ps1` when new environment variable names are needed
  3. `mcp/README.md`
  4. `agency-os/docs/operations/mcp-add-server-quickstart.md`
- After MCP changes, run `powershell -ExecutionPolicy Bypass -File .\scripts\sync-mcp-config.ps1` from the monorepo root.
- Expected generated outputs are:
  - `.mcp.json`
  - `%USERPROFILE%\.codex\config.toml`
  - `%USERPROFILE%\.copilot\mcp-config.json`
  - `%USERPROFILE%\.gemini\settings.json`
- Never commit live tokens, JWTs, passwords, PATs, or machine-specific secrets from user-level MCP files.

