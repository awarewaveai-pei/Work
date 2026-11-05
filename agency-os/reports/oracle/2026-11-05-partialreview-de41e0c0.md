# codex-oracle review -- 2026-11-05 09:57:33 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/claim-check.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/generate.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/outreach/claim-consistency/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/claim-consistency.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/claim-check.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Outbound C16.2: fact check before automatic approval was AND of two runs (checkClaimsTwice). Single-run consistency measured 0.87-0.93 on 200 emails; flips fall on different emails each measure (noise). Now checkClaimsVoted: two parallel runs; if verdicts differ a third run; majority wins; three different verdicts -> the non-supported one. Used by autoDecision (generate.ts) and by the consistency report route. Check: can an email be auto-approved with fewer than two supported runs; error handling when a run throws; whether the report still measures something honest; billing (grant) per run.
- exit: 0 | elapsed: 129501ms | answer: 751B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/outreach/claim-consistency/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/claim-check.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/claim-check.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/generate.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 預設 200 封的一致率報告可能逾時，收費後仍無結果
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/outreach/claim-consistency/route.ts:54
  confidence  -> CONFIRMED
  scenario    -> 請求採預設 200 封；每封須依序完成兩次投票，報告最多同時處理 4 封（`claim-consistency.ts:17,26`）。若每輪平行 AI 呼叫耗時 3.1 秒，總處理時間至少 310 秒，超過現行主機代理的 300 秒讀取逾時（`nginx/system-sites/sg-stack.aware-wave.com.conf:46`）。呼叫端拿不到報告，已完成的 AI 呼叫仍計費。
  why missed  -> 改動只計算每封信的呼叫次數，未對照整批報告的代理逾時設定。

TOTAL: 1 findings
