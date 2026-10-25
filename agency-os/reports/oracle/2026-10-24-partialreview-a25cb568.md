# codex-oracle review -- 2026-10-24 15:50:55 +08:00

- mode: `review`
- scope: -Path :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/make.ts, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/tick.ts, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/review.ts, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/store.ts, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/article/meta.ts, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/topics/[id]/start/route.ts, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/topics/[id]/route.ts, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/content/topics/TopicsBoard.tsx, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/__tests__/tick.test.ts, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/__tests__/review.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Re-review after fixing your previous findings on AUTO_CONTENT P4 (agency-os/reports/oracle/2026-10-24-partialreview-8f6e8db3.md): F1 meta regex now \s in the template literal; F2 dueApproved filters formats in the query (overlaps) before the limit; F3 each made part (article, social) is stored with its own checks in content_topics.artifacts, a failure throws MakeError carrying the parts made so far and the failed row keeps them, a retry skips parts already made; F4 deps.blocker checks the site before a daily slot is used (tick moves a blocked topic back to proposed with last_error; the start route answers 409); approve now clears last_error. F5 rejected: sync-host-scripts.sh:59,72 chmods every .sh on deploy. Check that the fixes are right and introduced nothing new (review pass with no checks, retry reusing a stale part, the blocked move, the UI reading artifacts.article).
- exit: 0 | elapsed: 357719ms | answer: 1109B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/content/topics/TopicsBoard.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/topics/[id]/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/topics/[id]/start/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/article/meta.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/__tests__/review.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/__tests__/tick.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/make.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/review.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/tick.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 社群-only 題目被錯誤要求文章 entitlement，無法啟動  
  file:line   -> `app/api/content/topics/[id]/start/route.ts:36` -> `lib/content/topics/make.ts:75,93-94`；`lib/portal/products.ts:73`  
  confidence  -> CONFIRMED  
  scenario    -> 客戶只有 `content.syndicate`、題目格式為 `["social"]` -> start route 先檢查 `content.article` 回 403；實際製作只需社群功能。  
  why missed  -> route gate 固定沿用文章流程，未覆蓋可由 `makesNow()` 啟動的 social-only 格式。

FINDING 2: 題目頁顯示固定的文章＋社群價格，格式選擇後仍會高估成本  
  file:line   -> `app/(shell)/tools/content/topics/TopicsBoard.tsx:284` -> `lib/content/topics/cost.ts:13-21`；`lib/content/topics/make.ts:93-94`  
  confidence  -> CONFIRMED  
  scenario    -> 題目格式為 `["article"]` -> UI 顯示文章＋社群改寫的 NT$ 價格，但實際製作只執行文章；`["social"]` 也同樣顯示文章成本。  
  why missed  -> 成本 helper 假設每題固定包含兩個部分，但格式可在 UI 中單獨選取。

TOTAL: 2 findings
