# codex-oracle review -- 2026-11-04 16:57:09 +08:00

- mode: `review`
- scope: -Path lobster-factory/packages/db/migrations/0160_co_search_cursors.sql, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/search-cursor.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/discover.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/sources/gcis.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/sources/people-search.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/inbox/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/inbox/InboxClient.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/claim-check.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/generate.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/brand-context.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/outreach/claim-consistency/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/inbox/route.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Lead searches resume: migration 0160 co_search_cursors (org, source, search_key -> next_state jsonb, null=exhausted); lib/outreach/search-cursor.ts load/save; each source (discover.ts places, sources/gcis.ts, sources/people-search.ts) takes from-cursor and returns next; inbox route saves the cursor only after inbox insert succeeds, exhausted search spends nothing, restart flag; UI shows more/exhausted + restart button. Also C16.2: generation prompt forbids guesses about the recipient; checkClaimsTwice (supported only if both runs) used for auto-approval and the consistency report. Check: lost/duplicated results at page boundaries, cursor advanced on failure paths, org scoping/tenant leaks, migration safety (nulls not distinct upsert), vote correctness.
- exit: 0 | elapsed: 158429ms | answer: 3032B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/inbox/InboxClient.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/outreach/claim-consistency/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/inbox/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/inbox/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/brand-context.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/claim-check.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/discover.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/generate.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/sources/gcis.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/sources/people-search.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/search-cursor.ts, lobster-factory/packages/db/migrations/0160_co_search_cursors.sql
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 200 封信的核對報告可能逾時，無法回傳結果
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/outreach/claim-consistency/route.ts:52
  confidence  -> CONFIRMED
  scenario    -> 200 封都有證據、每次模型呼叫平均 2 秒時，四個工作程序各需處理約 200 次呼叫，約 400 秒；app 的 `proxy_read_timeout` 是 300 秒（`nginx/default.conf:244`），請求會先逾時。
  why missed  -> 改動把每封的呼叫數加倍，但沒有對照既有的四工作程序上限（`claim-consistency.ts:17`）與代理逾時設定。

FINDING 2: 一致性報告會把原始核對的分歧算成「一致」
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/outreach/claim-consistency/route.ts:52
  confidence  -> CONFIRMED
  scenario    -> 同一封信的四次原始判定依序為「支持、不支持」和「不支持、支持」；兩組 `checkClaimsTwice` 都回「不支持」（`claim-check.ts:60`），報告遂將它計入一致（`claim-consistency.ts:26-29`），掩蓋實際翻轉。
  why missed  -> 報告原本比較單次判定；替換呼叫函式後，比較對象悄悄變成兩次判定的合併結果。

FINDING 3: 不同的人物搜尋可以共用同一個游標
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/search-cursor.ts:14
  confidence  -> CONFIRMED
  scenario    -> `role="CEO|A", company="B"` 與 `role="CEO", company="A|B"` 都產生 `ceo|a|b||`，但實際搜尋字串不同（`people-search.ts:50`）；第二組搜尋會從第一組的頁數繼續，漏掉自己的前段結果。
  why missed  -> 搜尋鍵直接以 `|` 串接，未考慮輸入本身也可含 `|`。

FINDING 4: 收件匣寫入成功而游標寫入失敗時，重試會重複匯入
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/inbox/route.ts:354
  confidence  -> CONFIRMED
  scenario    -> `co_lead_inbox` 插入成功後，`finish` 寫入游標失敗（`route.ts:362`、`search-cursor.ts:32`）；請求回錯，但游標仍在舊位置。操作者重試會再次付費搜尋並插入同批資料；收件匣表沒有來源唯一約束（`0048_co_outreach_core.sql:52-75`）。
  why missed  -> 程式確保「插入失敗不前進」，卻沒有處理反方向的部分成功。

FINDING 5: 同時執行相同搜尋會重複匯入同一頁
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/inbox/route.ts:129
  confidence  -> CONFIRMED
  scenario    -> 兩個分頁同時按相同條件搜尋，兩個請求讀到同一游標、取得同一頁，並在任一請求插入前完成既有資料檢查（`route.ts:305-307`）；兩批都可插入，最後才各自 upsert 游標（`search-cursor.ts:29-31`）。
  why missed  -> 唯一索引只限制游標列數（`0160_co_search_cursors.sql:15`），沒有鎖定「讀游標到匯入」的整段操作。

TOTAL: 5 findings
