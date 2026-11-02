# codex-oracle review -- 2026-11-02 12:15:48 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/pipeline.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/pipeline-store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/generate.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/draft.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/messages/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/messages/gmail-draft/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/outreach/gmail-sync/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/review-queue/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/review/QueueClient.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/review/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/pipeline-tick.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Outbound OS v2 card C15 pipeline (written by a Claude SDK worker): runPipelineTick in the 10-min gmail-sync tick before auto-send: research -> generate -> sampled review policy (one variant per lead, fact check, follow-ups approved with an auto-approved first email when their gate passed) -> Gmail draft for auto mailboxes -> due follow-up drafts; per-step caps and per-org daily budget; generation and drafting moved verbatim from the two routes into lib/outreach/generate.ts and draft.ts (routes are thin shells now; check the move changed no behaviour: take-before-Gmail, give-back, billing grants, org access). Queue page with a/r/j keys. SSOT agency-os/handoffs/2026-10-31-outbound-os/R0-PLAN.md section 6 C15, SPEC 5.3-5.5, D23, D24. Nothing here may send mail.
- exit: 0 | elapsed: 144605ms | answer: 2074B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/review/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/outreach/gmail-sync/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/messages/gmail-draft/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/messages/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/review/QueueClient.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/review-queue/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/pipeline-tick.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/draft.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/generate.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/pipeline-store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/pipeline.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 自動核准的首封不會帶動追蹤信核准  
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/pipeline.ts:208  
  confidence  -> CONFIRMED  
  scenario    -> `generateForLead` 已將首封寫成 `approved`、追蹤信寫成 `draft`；管線只對仍是 `draft` 的首封執行此行，因此追蹤信始終未核准，到期也不會建 Gmail 草稿。  
  why missed  -> 測試的假資料直接放入待決首封，未走真實產信路徑。

FINDING 2: 研究中斷或失敗後，管線永久略過該 lead  
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/pipeline-store.ts:70  
  confidence  -> CONFIRMED  
  scenario    -> 研究先寫入 `research_started`，隨後程序重啟或爬取失敗且沒有證據；之後每次掃描都因這筆事件排除 lead，無法在下一 tick 重試。  
  why missed  -> 篩選條件把「曾開始」當成「已完成」，與 `research.ts:82` 記載的重試行為相反。

FINDING 3: 前 1,000 筆舊 lead 可讓後續合格 lead 永遠進不了管線  
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/pipeline-store.ts:34  
  confidence  -> CONFIRMED  
  scenario    -> 同一組織最早建立的 1,000 筆 `qualified` lead 都已研究或已有訊息，第 1,001 筆尚待處理；掃描每次固定只讀最早五頁，後者永遠不會成為候選。  
  why missed  -> 測試假 store 忽略分頁，沒有驗證長期累積的資料。

FINDING 4: 已暫停的自動信箱仍會收到新 Gmail 草稿  
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/pipeline.ts:128  
  confidence  -> CONFIRMED  
  scenario    -> 信箱因 Gmail 拒寄而變成 `health_status='paused'`，但仍是 active/auto；管線仍把它列入草稿候選，持續建立草稿，而 `send-adapter.ts:167` 會排除它，草稿無法自動寄出。  
  why missed  -> 草稿階段的信箱篩選與既有寄送池的 `inPool` 條件不一致。

TOTAL: 4 findings
