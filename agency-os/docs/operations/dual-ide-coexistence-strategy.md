# Claude Code ↔ Codex Coexistence Strategy

> **Owner**: this document
> **Status**: active (2026-09-19 rewired: user-level Codex hooks + adapter, reversed oracle, parity in smoke)
> **Design goal**: Claude Code and Codex execute one human-maintained workflow without copying rules, skills, agents, commands, hooks, or MCP definitions. Either tool can lead.

## Single-source architecture

```text
Human-maintained source (git)
├── CLAUDE.md + agency-os/AGENTS.md       project workflow and governance
├── .claude/agents, commands, skills      Claude roles and workflows
├── mcp/claude-userlevel/hooks            canonical hook implementation (runner.js + rules + lib/codex-adapter.js)
└── mcp/registry.template.json            shared MCP declaration
             │
             ├─ Claude Code: reads CLAUDE.md; sync-claude-userlevel.ps1 copies hooks to ~/.claude/hooks
             └─ Codex: reads root AGENTS.md bridge → CLAUDE.md + agency-os/AGENTS.md;
                      sync-claude-to-codex.ps1 generates thin bridges + ~/.codex/hooks.json
```

`CLAUDE.md` is the only human-maintained workflow source. Codex does not natively import it, so root `AGENTS.md` is a minimal bridge that requires a full `CLAUDE.md` and `agency-os/AGENTS.md` read before task actions. It must never grow into a second rulebook.

## Runtime behaviour

| Concern | Claude Code | Codex | Source / proof |
|---|---|---|---|
| Project instructions | `CLAUDE.md` + `@agency-os/AGENTS.md` import | root `AGENTS.md` bridge → full reads of the same files | `CLAUDE.md`, `AGENTS.md` |
| User instructions | `~/.claude` memory + settings | generated `~/.codex/AGENTS.md`: hooks trust rule, `/claude-review` rule, operator memory pointer | `sync-claude-to-codex.ps1` |
| Operator memory | `~/.claude/projects/<slug>/memory/` (auto-memory) | reads the same `MEMORY.md` + linked files (single source, not copied) | `Get-ClaudeMemoryIndexPath` in `codex-bridge-lib.ps1` |
| Commands | `.claude/commands/<name>.md` | `/name` routed by `AGENTS.md`; `claude-compat` command index links the source | `.claude/commands/` |
| Skills | Claude skill discovery | repo `.agents/skills/<name>/SKILL.md` thin wrapper → Claude source (`.skill` zips read in-process) | `.claude/skills/` |
| Named agents | `.claude/agents/<name>.md` | repo `.codex/agents/<name>.toml` bridge reads source + charter; no copies in `~/.codex/agents` | `.claude/agents/` |
| Tool vocabulary | native | `claude-compat` skill maps Agent→`spawn_agent`, Edit/Write→`apply_patch`, TodoWrite→`update_plan`, … | `sync-claude-to-codex.ps1` `Write-ClaudeCompatSkill` |
| Hooks | `~/.claude/settings.json` → `~/.claude/hooks/runner.js` | generated `~/.codex/hooks.json` → canonical `runner.js … --host=codex`; `lib/codex-adapter.js` translates payloads | `mcp/claude-userlevel/hooks/` |
| AO-RESUME / post-push deploy hooks | `ao-resume-on-prompt.ps1`, `post-push-trigger-deploy.ps1` | same scripts, wired in `~/.codex/hooks.json` | same |
| Cross-model oracle | writer Claude → `/codex-review` | writer Codex → `/claude-review` (`scripts/claude-oracle.ps1`) | AGENTS.md §4 |
| MCP | project `.mcp.json` | managed block in `~/.codex/config.toml` (registry `clients.codex.exclude` honoured) | `mcp/registry.template.json` |
| Account connectors | claude.ai connectors (Gmail, Drive, …) | ChatGPT-account apps; not file-syncable | — |

## Hooks on Codex

- **Why user-level, generated**: commands must be shell-neutral (Codex on Windows has been reported to spawn hooks via cmd.exe, PowerShell and Git Bash across versions), so they carry an unquoted absolute path (`node D:/Work/mcp/claude-userlevel/hooks/runner.js <Event> --host=codex`) that only a per-machine generator can write. A repo `.codex/hooks.json` must not exist: once trusted, both files would run every rule twice.
- **Trust**: Codex stores `[hooks.state."<source>:<event>:<group>:<handler>"] trusted_hash` in `~/.codex/config.toml`, writable only by the interactive `/hooks` review; untrusted or stale hooks are **skipped silently**. The generated file changes only when the WorkRoot or wiring changes (sync reports `unchanged` otherwise), so trust is a one-time step; rule edits under `rules/` never invalidate it.
- **Proof, not configuration**: `runner.js` records every Codex invocation (event, tool names, payload key names — never values) in `~/.codex/awarewave-hook-heartbeat.json`. The parity check fails when a Codex session started after the hook file but no heartbeat followed.
- **How a block reaches Codex**: Codex ignores `exit 2` here (CLI 0.155.1, live probe 2026-09-20: a blocked `git commit --no-verify` still ran), so the runner writes the documented decision to stdout instead -- `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":...}}` for PreToolUse, `{"decision":"block","reason":...}` otherwise -- and exits 0, because a non-zero exit makes Codex treat the hook as failed and drop the decision. Claude keeps its `exit 2` contract.
- **Windows command wrapper**: Codex dispatches every shell call as `"C:\...\powershell.exe" -Command '<real command>'`. `runner.js` unwraps `powershell`/`pwsh -Command` and `cmd /c` the same way it already unwrapped `bash -c`; without it every command-position rule matched only the wrapper (found by the same live probe).
- **Adapter contract** (`learn.chatgpt.com/docs/hooks`): shell → `Bash` + `tool_input.command`; `apply_patch` → Edit with files parsed from `*** Add/Update/Delete File:` / `*** Move to:`; `spawn_agent` → Agent (`agent_type`/`message`/`task_name` → `subagent_type`/`prompt`/`description`); a PostToolUse carrying a structured non-zero `exit_code` → PostToolUseFailure (Codex has no such event). Tests: `tests/hooks/codex-adapter.test.mjs`.
- **Claude permission layer**: Claude's `permissions.deny` entries are enforced natively by Claude and, for Codex, by the `permission-deny-mirror` rule, which reads the same `settings.template.json` list at runtime (no second copy).
- **AO-RESUME on Codex**: `ao-resume-on-prompt.ps1 -HookHost codex` auto-runs only for an explicit `AO-RESUME` or a bare greeting, and never when a Claude process is an ancestor -- otherwise every `codex exec` review would stash/reset the working tree it is reviewing.
- **Known upstream gaps** (verify with the live probe below on each Codex upgrade): openai/codex#27833 — PreToolUse deny not enforced for `apply_patch` on Windows (0.133/0.138); openai/codex#23411 — the outer code-mode `exec` tool is not hooked (nested calls are: on 0.155.1 the heartbeat shows PreToolUse firing for both `Bash` and `apply_patch`); openai/codex#34289 — a shell `tool_response` is a plain string with the exit code stripped, so `repeat-failure-guard` cannot count failures on Codex (the adapter starts working the moment Codex sends a structured result).

## Synchronization contract

1. Edit only the Claude-first sources, then commit and push normally.
2. Source content edits are live to Codex wrappers; new, renamed or deleted agents/skills/commands need the generator.
3. `scripts/ao-resume.ps1` runs the generator + parity on each start; `scripts/check-smoke-tests.ps1` check `codex_parity` puts the verdict into `smoke-LATEST.json` (`overall` WARN / `blind_spots`) so a failure is never just a scrolled-past line.
4. `scripts/ao-close.ps1` reruns generator + parity; failure is a closeout gate failure.
5. `scripts/bootstrap-mcp-machine.ps1` performs the same repair/proof for a new machine.

Manual recovery is deterministic and backup-first:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\mcp\codex-userlevel\scripts\sync-claude-to-codex.ps1 -WorkRoot D:\Work -Mode linked
powershell -NoProfile -ExecutionPolicy Bypass -File .\mcp\codex-userlevel\scripts\check-claude-codex-parity.ps1 -WorkRoot D:\Work
```

Expected result: `Claude/Codex parity PASSED`. Backups land in `%USERPROFILE%/.codex/backups/claude-migration-<timestamp>/`; dirs holding only regenerable output are pruned to the newest 15, `legacy-*` dirs (pre-migration user content) are kept. Rollback = revert the source commit and rerun the generator.

## Codex takeover checklist (operator)

1. Run the two commands above; only the trust check may fail.
2. Open Codex in `D:\Work`, run `/hooks`, trust the 8 AwareWave handlers.
3. Rerun the parity check → `PASSED`. After the first real Codex session, smoke `codex_parity=ok` proves execution: the newest rollout must be followed by a heartbeat, and a tool-using session by a `PreToolUse` heartbeat.
4. Live probe (costs one Codex turn): `codex exec -C D:\Work -s workspace-write "run exactly: git clean -fd --dry-run"` must come back as `Command blocked by PreToolUse hook: [Hook] BLOCKED: matches Claude permissions.deny ...` (verified 2026-09-20 on 0.155.1, together with `git commit --no-verify`).
5. Still unverified: whether a PreToolUse deny is enforced for `apply_patch` writes (openai/codex#27833). `codex exec` rejects patches before that point ("writing is blocked by read-only sandbox"), so test it from an interactive Codex session: ask it to create a file and check whether the file appears despite the first-edit `git-log-injector` block.

## Trust and intentional limits

- The current conversation does not retroactively reload instructions, skills, agents, MCP servers or hook trust. Start a new session after configuration changes.
- Personal MCP servers outside the registry remain in the Codex config by design; parity requires every registry server for the client and never prints credentials.
- Keep generator scripts ASCII-only: Windows PowerShell 5.1 reads BOM-less `.ps1` as CP950.

## Mechanical checks

`mcp/codex-userlevel/scripts/check-claude-codex-parity.ps1` verifies agents, skill wrappers, the command index (both directions), absence of shadowing `~/.codex/agents` copies and of a repo-level hook file, byte-identity of `~/.codex/hooks.json` with the generator, hook trust count, heartbeat after the newest Codex session, the user-level instructions, and registry MCP coverage. `tests/hooks/runner-core.test.mjs`, `runner-parity.test.mjs` and `codex-adapter.test.mjs` verify runner semantics against the real rule manifest.

Run `bash scripts/test-hooks.sh` and the parity checker after changing this architecture; for source or policy code changes also run the cross-model oracle for the writer (`/codex-review` or `/claude-review`) before closeout.
