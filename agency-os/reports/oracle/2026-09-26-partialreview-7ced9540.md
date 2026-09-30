# codex-oracle review -- 2026-09-26 21:52:28 +08:00

- mode: `review`
- scope: -Path lobster-factory/packages/workflows/trigger.config.ts, scripts/lobster-trigger-deploy.ps1, lobster-factory/packages/workflows/src/lib/collection/postResearchRunExecute.ts, lobster-factory/packages/workflows/src/trigger/collect-research-run.ts, lobster-factory/packages/workflows/src/lib/deployEnv/syncEnvVarsParity.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: WC-P1-13 gap found while deploying (RESEARCH_LINES_MASTER_PLAN 12.7 WC-P1-14 step 5): the collect-research-run task reads
COLLECT_RESEARCH_EXECUTE_TOKEN at runtime (postResearchRunExecute.ts), but nothing delivered it to the Trigger worker.
Fix = the same wiring every other next-admin-bound token uses (SITE_WATCH_INGEST_TOKEN, POD_INBOX_SWEEP_TOKEN):
trigger.config.ts syncEnvVars pushes it when non-empty; scripts/lobster-trigger-deploy.ps1 $deployBash exports it
from the RUNNING next-admin container (never .env), and echoes set: yes/no without the value.
syncEnvVarsParity.test.ts (unchanged) enforces config reads == deploy exports; mutation (export removed) turned it red.
Probe: value leaking into logs/echo; quoting inside the PowerShell here-string (backtick-dollar escapes); behaviour when
next-admin has no value; anything that differs from the two existing token lines. Files outside -Path belong to others.
- exit: 0 | elapsed: 100570ms | answer: 11B
- files-reviewed: lobster-factory/packages/workflows/trigger.config.ts, scripts/lobster-trigger-deploy.ps1
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

NO FINDINGS
