# Claude Code ↔ Codex Coexistence Strategy

> **Owner**: this document
> **Status**: active
> **Design goal**: Claude Code and Codex execute one human-maintained workflow without copying rules, skills, agents, commands, hooks, or MCP definitions.

## Single-source architecture

```text
Human-maintained source (git)
├── CLAUDE.md + agency-os/AGENTS.md       project workflow and governance
├── .claude/agents, commands, skills      Claude roles and workflows
├── mcp/claude-userlevel/hooks            canonical hook implementation
└── mcp/registry.template.json            shared MCP declaration
             │
             ├─ Claude Code: reads CLAUDE.md; user-level sync installs canonical hooks
             └─ Codex: reads AGENTS.md bridge → CLAUDE.md + agency-os/AGENTS.md
                      generated thin skill/agent/index bridges read the source above
```

`CLAUDE.md` is the only human-maintained workflow source. Codex does not natively import it, so root `AGENTS.md` is intentionally a minimal bridge that requires a full `CLAUDE.md` and `agency-os/AGENTS.md` read before task actions. It must never grow into a second rulebook.

## Runtime behaviour

| Concern | Claude Code | Codex | Source / proof |
|---|---|---|---|
| Project instructions | loads `CLAUDE.md` and its `@agency-os/AGENTS.md` import | loads `AGENTS.md`, then the bridge requires full reads of those same sources | `CLAUDE.md`, `AGENTS.md` |
| Commands | `.claude/commands/<name>.md` | `/name` is routed by `AGENTS.md`; `claude-compat` indexes direct sources | `.claude/commands/` |
| Skills | Claude skill discovery | repo `.agents/skills/<name>/SKILL.md` is a thin wrapper; on trigger it reads Claude `SKILL.md` | `.claude/skills/` |
| Named agents | `.claude/agents/<name>.md` | generated `.codex/agents/<name>.toml` reads matching source and charter | `.claude/agents/` |
| Subagent standard | source prompt plus governance | `SubagentStart` injects shared charter; native profile reads it too | `mcp/claude-userlevel/SUBAGENT_CHARTER.md` |
| Hooks | synced runtime under `~/.claude/hooks` | project config invokes canonical source at git root; config must be trusted | `mcp/claude-userlevel/hooks/`, `.codex/hooks.json` |
| MCP | project `.mcp.json` | managed block in `~/.codex/config.toml`; unrelated personal servers remain | `mcp/registry.template.json` |

Codex loads skill metadata first and full source only when a skill matches or is explicitly selected. Native agent profiles read the Claude prompt only when the named agent starts. Root `AGENTS.md` is loaded for a repository session, so it enforces the full project-source read before task work.

## Synchronization contract

1. Edit only the Claude-first sources, then commit and push normally.
2. Existing source content changes are live to Codex wrappers; no copied implementation needs refreshing.
3. `scripts/ao-resume.ps1` runs MCP sync, Claude user-level sync, Codex bridge discovery, then Claude/Codex parity proof on each start.
4. `scripts/ao-close.ps1` reruns Codex bridge sync and parity proof; failure is a closeout gate failure.
5. `scripts/bootstrap-mcp-machine.ps1` performs the same repair/proof for a new machine.

Manual recovery is deterministic and backup-first:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\mcp\codex-userlevel\scripts\sync-claude-to-codex.ps1 -WorkRoot D:\Work -Mode linked
powershell -NoProfile -ExecutionPolicy Bypass -File .\mcp\codex-userlevel\scripts\check-claude-codex-parity.ps1 -WorkRoot D:\Work
```

Expected result: `Claude/Codex parity PASSED`. Sync stores any replaced legacy Codex global skill/hook files below `%USERPROFILE%/.codex/backups/claude-migration-<timestamp>/`; reverting the source commit and rerunning sync is the normal rollback.

## Trust and intentional limits

- Codex hooks run only after the project and current hook configuration hash are trusted. Use Codex `/hooks` or the Desktop hook-trust UI after a hook config change; do not bypass trust permanently.
- The current conversation does not retroactively reload instructions, skill metadata, agents, MCP servers, or hook trust. Start a new session after configuration changes; source files read later by a wrapper are current at that read.
- Conversation memory remains tool-local and deliberately unsynchronized. Repo memory under `agency-os/memory/` is git-tracked; private runtime memory keeps its manual export/import procedure.
- Personal MCP servers outside the registry remain in the Codex config by design. Parity requires every registry server, never deletes a non-registry personal server, and does not print credentials.

## Mechanical checks

`mcp/codex-userlevel/scripts/check-claude-codex-parity.ps1` verifies all source agents, command index entries, skill wrappers, absence of duplicate shared runtimes, canonical hook wiring including `SubagentStart`, and client-specific registry MCP coverage. `tests/hooks/runner-core.test.mjs` and `tests/hooks/runner-parity.test.mjs` verify runner semantics and the real rule manifest.

Run `bash scripts/test-hooks.sh` and the parity checker after changing this architecture; for source or policy code changes also execute `/codex-review` before closeout.
