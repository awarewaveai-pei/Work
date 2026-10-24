# codex-oracle review -- 2026-10-24 13:50:54 +08:00

- mode: `review`
- scope: -Path scripts/claude-account.py, scripts/sync-claude-userlevel.ps1, scripts/wire-remote-hooks.sh, mcp/claude-userlevel/settings.template.json, mcp/claude-userlevel/hooks/ao-resume-on-prompt.ps1, tests/hooks/settings-deny-parity.test.mjs, .claude/commands/account.md  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Root cause: the CLI rejected ~/.claude/settings.json (nested hooks._comment key + deny rule "Bash(:(){ *)" with empty parentheses) and skipped the whole file, so every CLI session ran with no hooks and no deny rules. Fix: sync strips _-prefixed keys at any depth; fork-bomb deny rewritten as Bash(*:|:&*); remote generator moves comments out of the JSON; test guards rule shape and generated keys. Also: headless workers set AWAREWAVE_HEADLESS_WORKER=1 so the ao-resume hook skips its per-new-session fetch/ff; claude-account.py run refuses until verify-hooks proved (canary in the audit log) per profile+folder+CLI version, and until the folder is trusted. Focus: can the strip remove a legitimate key; does the new deny pattern still block the fork bomb; can the AWAREWAVE_HEADLESS_WORKER marker be abused to skip a gate that matters; can verify-hooks pass falsely.
- exit: 0 | elapsed: 156281ms | answer: 1543B
- files-reviewed: .claude/commands/account.md, mcp/claude-userlevel/hooks/ao-resume-on-prompt.ps1, mcp/claude-userlevel/settings.template.json, scripts/claude-account.py, scripts/sync-claude-userlevel.ps1, scripts/wire-remote-hooks.sh, tests/hooks/settings-deny-parity.test.mjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Hook proof remains valid after hooks or deny rules change.
  scripts/claude-account.py:157-160 -> scripts/claude-account.py:195-198
  confidence  -> CONFIRMED
  scenario    -> `verify-hooks` succeeds, then `settings.json` disables the audit/deny hook without changing the CLI version; the old `.hooks-verified` marker still matches folder+version, so `run` proceeds with hooks disabled.
  why missed  -> The marker binds only to folder and CLI version, not settings or hook-file state.

FINDING 2: `verify-hooks` can be falsely satisfied by the worker itself.
  scripts/claude-account.py:140-142 -> scripts/claude-account.py:170-179
  confidence  -> CONFIRMED
  scenario    -> Hooks are disabled; a project instruction causes the bypass-permission worker to append the canary token directly to `bash-commands.log`; substring detection accepts it and writes the proof marker even though the audit hook never ran.
  why missed  -> The check authenticates only file content, not that the audit hook produced the entry.

FINDING 3: The canary proves only audit logging, not the safety hooks or deny rules.
  scripts/claude-account.py:170-179 -> scripts/claude-account.py:195-198
  confidence  -> CONFIRMED
  scenario    -> The audit hook remains active but `permissions.deny` or the governance runner is missing; the canary is logged, `run` is unlocked, and a worker can execute a previously denied Bash/tool action.
  why missed  -> Verification never tests a deny rule or any hook besides the audit-log side effect.

TOTAL: 3 findings
