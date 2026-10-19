# codex-oracle review -- 2026-10-16 12:09:34 +08:00

- mode: `review`
- scope: -Path :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/cs/eval, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/cs-intents, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/cs-eval-cases, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/cs-config, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/CsIntentsCard.tsx, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/ClientHubTabs.tsx, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/hub-ui.tsx  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Soulful CS: intent save no longer resets unsent fields (intentColumns); PATCH cs-intents; L2 only after a passed per-intent exam (API 409 + decideAnswerAction runtime); planReply extracted from handleInbound and reused by the eval so exams grade the production path; async exam via after() writing cs_intents.metadata.graduation, dropped if the golden set was replaced mid-run; cs-eval-cases GET/PUT replace; CsIntentsCard UI. Also verify: does this change depend on something NOT visible in this diff (config, timeout, schema, upstream default)? If you cannot support a real finding, return no findings.
- exit: 0 | elapsed: 374034ms | answer: 2063B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/ClientHubTabs.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/hub-ui.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/cs-config/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/cs-config/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/cs-intents/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/cs/eval/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/__tests__/cs-core.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/__tests__/orchestrator.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/autonomy.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/db.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/eval.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/index.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/orchestrator.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/types.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Golden-set replacement can be missed, allowing an exam to certify the wrong cases  
  file:line   -> `lib/cs/db.ts:211`, `lib/cs/db.ts:215`, `lib/cs/db.ts:229`, `lib/cs/eval.ts:125`, `lib/cs/eval.ts:195`  
  confidence  -> CONFIRMED  
  scenario    -> Replacement clears graduation, then an exam starts before new cases are inserted; the exam loads old cases, replacement inserts/deletes cases, and the exam’s run-id conditional still succeeds -> old cases certify the new golden set and L2 becomes enabled incorrectly.  
  why missed  -> The run-id guard detects later replacements, but not a replacement that invalidates graduation before the exam claims the run.

FINDING 2: Deleting an intent leaves its golden cases available for a later intent with the same key  
  file:line   -> `0051_cs_core.sql:136`, `0051_cs_core.sql:137`, `cs-intents/route.ts:101`, `lib/cs/db.ts:238`, `lib/cs/db.ts:33`  
  confidence  -> CONFIRMED  
  scenario    -> Intent `courses` is deleted and recreated with a changed meaning -> old `cs_eval_cases` rows remain, are counted and loaded by the recreated key, and can graduate the new intent using stale questions and expected answers.  
  why missed  -> The schema only cascades cases on organization deletion, while the existing intent delete path removes only the `cs_intents` row.

FINDING 3: Graduation remains valid after changing safety-affecting intent settings  
  file:line   -> `cs-intents/route.ts:43`, `cs-intents/route.ts:48`, `cs-intents/route.ts:50`, `lib/cs/db.ts:69`, `lib/cs/autonomy.ts:111`  
  confidence  -> CONFIRMED  
  scenario    -> An intent passes at confidence threshold `0.8`; an admin then POSTs the same key with `answerLevel:"L2"` and `confidenceThreshold:0` -> the API accepts the old graduation, and a future low-confidence message can become `auto_sent` despite never being examined under the new threshold.  
  why missed  -> Graduation is stored as `metadata.graduation.status === "passed"` without binding it to the intent configuration used during the exam.

TOTAL: 3 findings
