# codex-oracle review -- 2026-10-15 09:34:56 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/chatwoot/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/chatwoot/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/db.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/sweep.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/__tests__/cs-sweep.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/cs/sweep/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/cs/sweep/route.test.ts, lobster-factory/packages/db/migrations/0099_cs_ai_replies_completed_at.sql  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Second round after fixing round-1 findings (artifact 2026-10-15-partialreview-40d906e2). Invariant now: completed_at is set ONLY by completeClaim after the outcome reached Chatwoot (reply sent, or handed to a human, or suppressed / no Chatwoot config); recordReply no longer sets it. Any throw in the after() pipeline (failed delivery, failed handoff, unmatched decision) leaves the claim NULL and the 5-minute sweep (claims older than 10 min) does handoff (idempotent) -> private note -> conditional completeClaim. listUnfinishedClaims throws on error and the sweep route returns 500. Rejected round-1 items with evidence: F3 (pipeline worst case ~176 s from CS_TIMEOUTS and maxToolRounds, far below 10 min), F6/F7 (prod table has 4 rows / 64 kB, 0 un-overwritten placeholders), F8 (token is a rollout step, same pipeline as POD_INBOX_SWEEP_TOKEN). Check only for real defects in this invariant: a path that completes without delivery or handoff, a path that never completes after successful delivery, or a double customer-visible reply. If none, say so and return no findings.
- exit: 0 | elapsed: 282580ms | answer: 723B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/chatwoot/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/chatwoot/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/db.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/cs/sweep/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/cs/sweep/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/__tests__/cs-sweep.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/sweep.ts, lobster-factory/packages/db/migrations/0099_cs_ai_replies_completed_at.sql
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: A successful Chatwoot outcome can leave `completed_at` NULL indefinitely.
  file:line   -> `lib/cs/db.ts:208-216` -> `app/api/webhooks/chatwoot/route.ts:160-172` -> `lib/cs/sweep.ts:30-37`
  confidence  -> CONFIRMED
  scenario    -> Chatwoot delivery succeeds, but the Supabase `completed_at` update errors. `completeClaim` returns `false`; the webhook and sweep ignore it, so the sweep route returns 200 with `failed: 0` while the claim remains unfinished. Persistent DB failure causes every 5-minute sweep to repeat recovery without completing the claim.
  why missed  -> `false` is treated as an already-closed/concurrent claim, although `completeClaim` also returns it for database errors.

TOTAL: 1 findings
