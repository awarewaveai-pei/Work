# codex-oracle review -- 2026-09-23 16:57:15 +08:00

- mode: `review`
- scope: -Path lobster-factory/packages/workflows/src/lib/deployEnv/syncEnvVarsParity.test.ts, lobster-factory/packages/workflows/trigger.config.ts, scripts/lobster-trigger-deploy.ps1, lobster-factory/infra/trigger/TASK_REFERENCE.md, .claude/agents/trigger-deploy-agent.md  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Closes the class "trigger.config.ts syncEnvVars reads a process.env var that the only deploy path (scripts/lobster-trigger-deploy.ps1 $deployBash, run on ks-aw-01 under sudo bash with env reset) never exports, so it is silently never synced". Adds a vitest guard (dynamic read capture via mocked syncEnvVars + Proxy over process.env with two fills, plus literal regex) compared against a parser of $deployBash exports; allowlist NOT_SYNCED_BY_DEPLOY holds the 7 orchestrate-tenant-provisioning credentials (verified absent in Trigger prod, task never run in prod, wiring them = operator decision) and fails when an entry goes stale. The deploy script runs the guard fail-closed right after the vault re-entry. Removes the dead BATCH_INTERNAL_SECRET read (tarot-batch-generate takes it from its payload). Also verify: does this change depend on something NOT visible in this diff (how scripts/secrets-vault.ps1 -Action run re-invokes the script in-process, the post-push hook calling it via powershell.exe 5.1, vitest.config.ts include globs, @trigger.dev/build syncEnvVars semantics)? If that makes the gate silently skipped, unreachable, or falsely green, report it. If you cannot support a real finding, say so and return no findings; do not invent weak findings.
- exit: 0 | elapsed: 121165ms | answer: 30B
- files-reviewed: .claude/agents/trigger-deploy-agent.md, lobster-factory/infra/trigger/TASK_REFERENCE.md, lobster-factory/packages/workflows/trigger.config.ts, scripts/lobster-trigger-deploy.ps1, lobster-factory/packages/workflows/src/lib/deployEnv/syncEnvVarsParity.test.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

NO FINDINGS

TOTAL: 0 findings
