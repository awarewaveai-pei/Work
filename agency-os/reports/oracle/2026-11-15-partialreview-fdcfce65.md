# codex-oracle review -- 2026-11-15 12:15:58 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/research.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/research.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Cold-outreach research: the closing research_done/research_insufficient timeline row now carries metadata.crawl (fetched, refused, disallowed, gone, stopped_by, top_reason = most frequent dirty reason before the first colon, fetch_failed = distinct aside codes starting fetch_failed, max 5), null when the own site was not crawled or runLeadResearch returned no report. Purpose: tell 'site read but no email' apart from 'site refused us' in SQL. One test added.
- exit: 0 | elapsed: 151302ms | answer: 642B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/research.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/research.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 沒有自家網站時，結尾事件缺少承諾的 `metadata.crawl: null`
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/research.ts:95`
  confidence  -> CONFIRMED
  scenario    -> 名單的 `website` 為空、也沒有可研究的社群頁 → 程式直接寫入 `research_insufficient` 並返回；該列的 metadata 沒有 `crawl` 鍵。以 `metadata->'crawl' = 'null'::jsonb` 查詢「未爬自家網站」時，這筆資料不會命中。
  why missed  -> 新測試只檢查有報告的結尾事件；既有「沒有網站」測試只檢查狀態與事件類型。

TOTAL: 1 findings
