# codex-oracle review -- 2026-10-15 18:56:42 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-audit.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/__tests__/supabase-builder-executed.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/job-store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[[]slug]/cognitive-os-import/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[[]slug]/collection-sources/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[[]slug]/cs-intents/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[[]slug]/cs-knowledge/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[[]slug]/cs-knowledge-folders/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[[]slug]/hci-import/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[[]slug]/schedules, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/schedules/ScheduleTable.tsx  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Operator smoke of /ops/schedules found zero client_schedule_updated audit rows after three edits. Root cause: a supabase-js builder is lazy (request sent only by then/await); seven routes audited with void getSupabaseWriteClient()?.from(ops_audit_events).insert(...), so those event types have zero rows in prod ever (collection_source_*, cs_intent_*, cs_knowledge_*, cognitive_os_import, hci_import, collection_schedule_updated). Fix: shared lib/ops-audit.ts recordOpsAudit (awaited, logs failure), all seven routes call it with await (three inside then-callbacks made async); lib/content/video/job-store.ts TTL cleanup had the same dead void builder, now then()-ed; new guard test lib/__tests__/supabase-builder-executed.test.ts scans app/ and lib/ for statement-level builder chains not awaited/returned/assigned/then-ed. Also ScheduleTable: never-ran cells showed the same green as ran-OK (theme --card-border is green); now a hollow grey circle with a title.
- exit: 0 | elapsed: 281010ms | answer: 1953B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/schedules/ScheduleTable.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/cognitive-os-import/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/collection-sources/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/cs-intents/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/cs-knowledge-folders/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/cs-knowledge/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/hci-import/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/job-store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/__tests__/supabase-builder-executed.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-audit.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Audit transport failures can turn successful mutations into failures.
  file:line   -> `lib/ops-audit.ts:15-24` -> `app/api/ops/clients/[slug]/collection-sources/route.ts:129-132`
  confidence  -> CONFIRMED
  scenario    -> The mutation succeeds, but the audit request rejects due to a transient network failure -> `recordOpsAudit` rejects before logging, so the route returns 500; background jobs are marked `error` by `run-jobs.ts:80-84`.
  why missed  -> Only fulfilled `{ error }` responses are handled; rejected promises are not caught.

FINDING 2: TTL cleanup can create unhandled promise rejections.
  file:line   -> `lib/content/video/job-store.ts:111-117`
  confidence  -> CONFIRMED
  scenario    -> The cleanup request fails at the transport level -> the ignored promise returned by `.then()` rejects, causing an unhandled rejection despite the “best-effort, non-throwing” comment.
  why missed  -> The callback handles response errors but there is no rejection handler.

FINDING 3: The builder guard misses valid bare builders after control-flow headers.
  file:line   -> `lib/__tests__/supabase-builder-executed.test.ts:43-46`
  confidence  -> CONFIRMED
  scenario    -> `if (enabled)\n  void supabase.from("t").delete();` -> `before` ends with `)`, so the scanner skips the match and the test passes although no request is sent.
  why missed  -> Statement boundaries are approximated only by `;`, `{`, and `}`.

FINDING 4: The builder guard treats unrelated `.then()` calls as executing the Supabase builder.
  file:line   -> `lib/__tests__/supabase-builder-executed.test.ts:23-31,45-46`
  confidence  -> CONFIRMED
  scenario    -> `void sb.from("t").insert({ value: getValue().then(v => v) });` -> the raw `.then(` check suppresses the finding, although the Supabase insert remains unexecuted.
  why missed  -> It searches the entire statement rather than verifying `.then()` belongs to the builder chain.

TOTAL: 4 findings
