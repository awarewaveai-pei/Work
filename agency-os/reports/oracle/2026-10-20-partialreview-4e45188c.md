# codex-oracle review -- 2026-10-20 15:45:43 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/tarot, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/tarot/batch, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/__tests__/trigger-callbacks-server-to-server.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/MODULE_MANIFEST.json, lobster-factory/packages/workflows/src/trigger/tarot-batch-generate.ts, lobster-factory/packages/workflows/trigger.config.ts, scripts/lobster-trigger-deploy.ps1  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Tarot 78-card batch: the Trigger task's two callbacks to next-admin went to session-gated /api/tools/tarot/batch/* and got 401 (no browser session). Moved them to /api/internal/tarot/batch/[jobId]/{start,card} (matcher-excluded, like other Trigger callbacks) with Bearer BATCH_INTERNAL_SECRET compared via lib/security/timingSafeEqual, fail-closed when unset, no role-header fallback (middleware does not strip identity headers on /api/internal). Secret and callback URL removed from the Trigger run payload; the worker reads BATCH_INTERNAL_SECRET (synced from the running next-admin by scripts/lobster-trigger-deploy.ps1) and AWAREWAVE_WEBHOOK_BASE_URL from env. New test enforces every Trigger->next-admin callback path is matcher-excluded.
- exit: 0 | elapsed: 691477ms | answer: 835B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/MODULE_MANIFEST.json, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/tarot/batch/[jobId]/card/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/tarot/batch/[jobId]/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/tarot/batch/route.ts, lobster-factory/packages/workflows/src/trigger/tarot-batch-generate.ts, lobster-factory/packages/workflows/trigger.config.ts, scripts/lobster-trigger-deploy.ps1, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/tarot/batch/[jobId]/card/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/tarot/batch/[jobId]/start/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/__tests__/trigger-callbacks-server-to-server.test.ts
- deletions-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/tarot/batch/[jobId]/card/route.ts@25c9584f5

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The new fail-closed secret has no verified provisioning path in the checked-in fresh-install configuration.
  lobster-factory/infra/hetzner-phase1-core/.env.example:233 -> scripts/lobster-trigger-deploy.ps1:175 -> lobster-factory/packages/workflows/trigger.config.ts:85 -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/tarot/batch/[jobId]/card/route.ts:20
  confidence  -> PLAUSIBLE
  scenario    -> A fresh install copies the repository env templates without manually adding `BATCH_INTERNAL_SECRET`; Docker and the deploy script pass an empty value, so the worker fails immediately and callbacks return 401.
  why missed  -> The change moved the secret out of the payload and documents it as install-provided, but the checked-in templates contain no value or generation step.

TOTAL: 1 findings
