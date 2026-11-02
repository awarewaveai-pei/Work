# codex-oracle review -- 2026-11-02 16:04:37 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/messages/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/messages/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/review/ReviewClient.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/run-jobs.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Outreach generation runs in the background (202 runKey, GET ?runKey= polls). Round-2 finding fixed: the job's organization is now recorded at start (run-jobs.ts optional organizationId) and GET checks canAccessOrg against it before revealing running/error/result. Invariant: job visibility uses data known at start. Verify the 4 files together; if you cannot support a real finding, return none.
- exit: 0 | elapsed: 99984ms | answer: 577B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/review/ReviewClient.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/messages/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/messages/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/run-jobs.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 未完成的產信工作可讓同一名單永久無法重試
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/messages/route.ts:71
  confidence  -> PLAUSIBLE
  scenario    -> AI 請求一直未結束；畫面輪詢五分鐘後停止，但工作仍是 `running`。之後每次按產信都只取得同一個 `runKey`，不會啟動新工作；須等原請求結束或程序重啟才能恢復。
  why missed  -> 新測試會主動讓模擬的 AI 請求完成，沒有測試請求持續不結束的情況。

TOTAL: 1 findings
