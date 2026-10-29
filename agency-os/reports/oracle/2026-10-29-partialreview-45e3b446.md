# codex-oracle review -- 2026-10-29 15:50:02 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/redo.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/__tests__/redo.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/publish/wp-post-core.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/topics/[id]/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/content/topics/TopicsBoard.tsx  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Human review gate send-back (redo): a reviewed topic -> its WordPress draft to WP trash (DELETE without force), its social draft to the social trash (applyAction delete, only while still draft), then move reviewed -> approved with artifacts cleared so the 5-minute pipeline makes it again. Claimed (version bump) before the outside writes. New action redo on PATCH /api/content/topics/[id]; button on the board for reviewed topics.
- exit: 0 | elapsed: 348355ms | answer: 2288B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/content/topics/TopicsBoard.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/topics/[id]/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/publish/wp-post-core.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/__tests__/redo.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/redo.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/store.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 每日上限可能阻止「重做」在下一次五分鐘排程開始
  file:line   -> D:\Work\lobster-factory\packages\db\migrations\0121_content_topics.sql:77
  confidence  -> CONFIRMED
  scenario    -> 客戶每日上限設為 1，題目今天已製作並進入 reviewed；按重做後雖回到 approved，資料庫仍把該題計入今天的開始次數，因此下一次五分鐘排程無法重新製作，要等到隔天。
  why missed  -> 差異只顯示狀態轉換；每日上限的計數規則藏在既有資料庫函式。

FINDING 2: 社群資料庫讀取失敗會被當成貼文不存在，並永久清掉草稿關聯
  file:line   -> D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\lib\content\topics\redo.ts:26
  confidence  -> CONFIRMED
  scenario    -> 社群資料庫暫時讀取失敗，但原貼文仍是 draft；`getPost` 的錯誤被轉成 `null`，流程接著將題目移回 approved 並清空 artifacts。下次製作會建立新貼文，舊草稿留在原處且失去題目關聯。
  why missed  -> 測試只覆蓋社群貼文成功讀取時的狀態，沒有覆蓋讀取錯誤。

FINDING 3: 找不到網站也被當成 WordPress 貼文已刪除
  file:line   -> D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\lib\content\topics\redo.ts:23
  confidence  -> CONFIRMED
  scenario    -> 網站暫時設為 inactive；`trashWpPost` 因無法解析網站而回傳 404，重做流程卻視為貼文已不存在並清空 artifacts。網站重新啟用後，原 WordPress 草稿仍在，題目已無法找到它。
  why missed  -> 測試把所有 404 都模擬成「貼文已消失」，但寫入函式也用 404 表示網站找不到或缺少 token。

FINDING 4: WordPress 文章已由人員發布時，重做會把正式文章送進垃圾桶
  file:line   -> D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\lib\content\topics\redo.ts:20
  confidence  -> CONFIRMED
  scenario    -> 題目仍是 reviewed，但編輯已在 WordPress 將其草稿發布；按「退回重做」會直接對該文章 ID 發送 DELETE，沒有確認它仍是 draft，導致正式文章下線。
  why missed  -> 程式只用題目狀態推定 WordPress 文章狀態；兩者可由人員分別變更。

TOTAL: 4 findings
