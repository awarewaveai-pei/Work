# codex-oracle review -- 2026-10-16 11:59:30 +08:00

- mode: `review`
- scope: -Path :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/cs/eval, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/cs-intents, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/cs-eval-cases, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/cs-config, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/CsIntentsCard.tsx, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/ClientHubTabs.tsx, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/hub-ui.tsx  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Soulful CS: intent save no longer resets unsent fields (intentColumns); PATCH cs-intents; L2 only after a passed per-intent exam (API 409 + decideAnswerAction runtime); planReply extracted from handleInbound and reused by the eval so exams grade the production path; async exam via after() writing cs_intents.metadata.graduation, dropped if the golden set was replaced mid-run; cs-eval-cases GET/PUT replace; CsIntentsCard UI. Also verify: does this change depend on something NOT visible in this diff (config, timeout, schema, upstream default)? If you cannot support a real finding, return no findings.
- exit: 0 | elapsed: 429124ms | answer: 3037B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/ClientHubTabs.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/hub-ui.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/cs-config/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/cs-config/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/cs-intents/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/cs/eval/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/__tests__/cs-core.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/__tests__/orchestrator.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/autonomy.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/db.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/eval.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/index.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/orchestrator.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/types.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: An old exam can overwrite a newer golden set or exam result.
  file:line   -> `lib/cs/eval.ts:169-172`; `lib/cs/db.ts:150-156`
  confidence  -> CONFIRMED
  scenario    -> Exam A passes its running check; the golden set is replaced and reset; Exam A then writes its result unconditionally, so the new set is marked graduated.
  why missed  -> The pre-write check is not an atomic compare-and-swap.

FINDING 2: Golden-set replacement is not atomic and can preserve an invalid graduation.
  file:line   -> `lib/cs/db.ts:183-201`; `app/api/ops/clients/[slug]/cs-eval-cases/route.ts:52-53`
  confidence  -> CONFIRMED
  scenario    -> New cases insert successfully but old-case deletion fails; the API returns 500, yet new rows remain and the old `passed` graduation is not cleared, so L2 continues auto-replying against unexamined cases.
  why missed  -> The comment protects only insert failures; later writes have no transaction or rollback.

FINDING 3: A failed graduation write is reported as a completed exam.
  file:line   -> `lib/cs/db.ts:155-156`; `lib/cs/eval.ts:169-172`; `app/api/ops/cs/eval/route.ts:56-60`
  confidence  -> CONFIRMED
  scenario    -> The final metadata update fails; `examIntent` ignores `false`, returns the verdict, and audits completion while metadata remains `running`, leaving L2 blocked and the UI polling indefinitely.
  why missed  -> The persistence helper returns a boolean, but the caller never checks it.

FINDING 4: A per-intent exam can graduate an intent whose cases were classified as another intent.
  file:line   -> `lib/cs/eval.ts:60-81`; `lib/cs/orchestrator.ts:123-124`
  confidence  -> CONFIRMED
  scenario    -> Cases tagged `shipping` are classified as `other`; their answers pass, so `shipping` is marked graduated even though no production `shipping` path was tested.
  why missed  -> Reusing `planReply` retained classification but added no assertion that the resolved intent equals the case’s target.

FINDING 5: Viewer-level `cs-config` responses expose golden questions and generated answers.
  file:line   -> `app/api/ops/clients/[slug]/cs-config/route.ts:35-36,61-64`; `lib/cs/eval.ts:164-166`; `lib/cs/types.ts:40-50`
  confidence  -> CONFIRMED
  scenario    -> A viewer requests `cs-config` after an exam and receives `graduation.results[].question` and `.answer`, which may contain customer/order PII.
  why missed  -> The code removes only the top-level `metadata`; `graduation` itself contains the sensitive result payload.

FINDING 6: The 15-minute stale lock can start duplicate live exams.
  file:line   -> `lib/cs/intent-config.ts:50-51`; `lib/cs/eval.ts:138-143`; `app/api/ops/cs/eval/route.ts:46-52`
  confidence  -> CONFIRMED
  scenario    -> A permitted 500-case exam is still running after 15 minutes; a second request is accepted, overwrites the running marker, duplicates LLM spend, and causes the first result to be discarded.
  why missed  -> A fixed TTL is treated as proof of process death without a heartbeat or ownership token.

TOTAL: 6 findings
