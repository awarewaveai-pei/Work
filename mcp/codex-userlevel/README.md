# Codex User-Level Sync

This directory is the shared, git-tracked source for Codex user-level Claude compatibility setup.

Run this once per machine from the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-mcp-machine.ps1
```

The bootstrap script calls `mcp\codex-userlevel\scripts\sync-claude-to-codex.ps1`. It keeps `CLAUDE.md` and `.claude` as the only human-maintained workflow source, then generates only thin bridges:

- repo `.agents\skills\<name>\SKILL.md` wrappers that read the Claude source when triggered;
- repo `.codex\agents\<name>.toml` profiles that read the matching Claude prompt and the shared subagent charter;
- `%USERPROFILE%\.codex\skills\claude-compat` indexes for commands, agents, hooks, MCP, plugins, and runbooks.

It backs up and removes same-named legacy user-level skill copies and the obsolete global/project Codex hook runtimes only after verifying they map to the canonical `mcp\claude-userlevel\hooks` source. Codex project hooks now invoke that source directly from the repository git root.

Do not sync whole `%USERPROFILE%\.codex` folders between machines. They contain runtime state, logs, auth data, caches, and machine-local config.

Normal usage:

- Edit Claude-maintained sources only: `CLAUDE.md`, `.claude/agents`, `.claude/commands`, `.claude/skills`, and repo runbooks.
- Pull the repo on each machine.
- AO-RESUME automatically runs the linked bridge sync; AO-CLOSE runs it again and proves parity. Bootstrap performs the same sync and fails if the proof does not pass.
- Regular edits to existing Claude source files do not need a Codex sync because wrappers read the shared source directly. New, renamed, or deleted agents/skills/commands are discovered by the next AO-RESUME (or run the command below immediately).
- Do not hand-maintain a second Codex rule set for migrated Claude behavior.

Manual repair and proof, both safe and backup-first:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\mcp\codex-userlevel\scripts\sync-claude-to-codex.ps1 -WorkRoot D:\Work -Mode linked
powershell -NoProfile -ExecutionPolicy Bypass -File .\mcp\codex-userlevel\scripts\check-claude-codex-parity.ps1 -WorkRoot D:\Work
```

Expected result: `Claude/Codex parity PASSED`. The verifier checks source-to-bridge agent/skill/command coverage, duplicate runtimes, canonical hook wiring including `SubagentStart`, and MCP server names without displaying credentials.
