# Codex User-Level Sync

This directory is the shared, git-tracked source for Codex user-level Claude compatibility setup.

Run this once per machine from the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-mcp-machine.ps1
```

The bootstrap script calls `mcp\codex-userlevel\scripts\sync-claude-to-codex.ps1`, which installs thin Codex wrappers into `%USERPROFILE%\.codex` while keeping the real Claude content in `CLAUDE.md` and `.claude` under the repo path passed with `-WorkRoot`.

Do not sync whole `%USERPROFILE%\.codex` folders between machines. They contain runtime state, logs, auth data, caches, and machine-local config.

Normal usage:

- Edit Claude-maintained sources only: `CLAUDE.md`, `.claude/agents`, `.claude/commands`, `.claude/skills`, and repo runbooks.
- Pull the repo on each machine.
- Run bootstrap only on first setup or when user-level wiring changes.
- Regular edits to existing Claude source files do not need a Codex sync because wrappers read the shared source directly.
- Do not hand-maintain a second Codex rule set for migrated Claude behavior.
