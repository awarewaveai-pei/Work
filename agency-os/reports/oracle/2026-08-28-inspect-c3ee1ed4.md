# codex-oracle inspect -- 2026-08-28 11:40:55 +08:00

- mode: `inspect`
- scope: whole repo
- target: `working tree (staged + unstaged + untracked)`
- context: (none given)
- exit: 0 | elapsed: 499594ms | answer: 1380B
- files-reviewed: (n/a for this mode)
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

1. `PLAUSIBLE` Stale `%USERPROFILE%\.claude.json` project-state can keep the old literal `${env:...}` form live after repo `.mcp.json` is regenerated. `mcp/claude-userlevel/manifest.json:48-57` says Claude? actual local/project MCP state lives in `~/.claude.json` and stacks on top of repo `.mcp.json`; `scripts/clear-claude-project-mcp.mjs:8-11,147-152,188-192` shows the repo explicitly treats populated `mcpServers` / `enabledMcpjsonServers` / `disabledMcpjsonServers` there as drift and clears them. Scenario: the user regenerates `D:\Work\.mcp.json` to `${NAME}`, but `~/.claude.json` still contains cached project entries from the old `${env:...}` version; Claude keeps using the stale cached entries until `sync-claude-userlevel.ps1` clears them.

2. `CONFIRMED` No verified gate in these paths checks repo-root `.mcp.json` placeholder syntax, so a regression stays green until runtime. `scripts/check-claude-sync.ps1:15,24-28,141-149,164-166` shows H2 only delegates to `sync-claude-userlevel.ps1 -Mode verify` for user-level `~/.claude/mcp.json`; `mcp/claude-userlevel/manifest.json:33-38,48-57` shows that governed scope is `~/.claude/mcp.json` plus `~/.claude.json`, not repo-root `.mcp.json`. Scenario: someone reintroduces `${env:NAME}` in `D:\Work\.mcp.json`; `check-claude-sync.ps1` still passes, and the break only shows up when Claude launches the project MCP.
