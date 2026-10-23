# codex-oracle review -- 2026-10-23 20:06:51 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/spend-report.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/spend-loader.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/__tests__/spend-report.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/costs/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/costs/CostsTabs.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/log-ai-call.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/blocks/video-pipeline.ts, scripts/report-app-costs.ps1  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: /ops/costs: one cost source (ai_call_logs) for tab1 real spend, tab5 ledger and new tab6 monthly report (Asia/Taipei months, by vendor/model/feature/client, CSV). Ledger total must equal real-spend total; paged reads so the PostgREST row cap cannot truncate; dropped ai_image_jobs x rate (table never reaches completed; double-count risk). Video motion rows now tagged kind=video. Also verify: does this change depend on something NOT visible in this diff (config, schema, upstream default)? If you cannot support a real finding, return no findings.
- exit: 0 | elapsed: 211110ms | answer: 985B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/costs/CostsTabs.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/costs/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/log-ai-call.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/blocks/video-pipeline.ts, scripts/report-app-costs.ps1, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/__tests__/spend-report.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/spend-loader.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/spend-report.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The loader still truncates reports after 200,000 rows.

  `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/spend-loader.ts:11,23,37` -> `.../ops/costs/page.tsx:46`  
  confidence  -> CONFIRMED  
  scenario    -> More than 200,000 matching rows exist -> pagination stops at 200,000, and tabs 1/5/6 report incomplete totals despite the all-rows requirement.  
  why missed  -> The test covers 2,345 rows but never exceeds `MAX_ROWS`.

FINDING 2: Exactly 200,000 rows are falsely reported as truncated.

  `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/spend-loader.ts:23-37` -> `.../ops/costs/page.tsx:46`  
  confidence  -> CONFIRMED  
  scenario    -> Exactly 200,000 rows exist -> the loop exits without probing for another page, returns `truncated: true`, and the UI warns that totals are probably low even though all rows were read.  
  why missed  -> The test checks below-cap pagination but not the exact boundary.

TOTAL: 2 findings
