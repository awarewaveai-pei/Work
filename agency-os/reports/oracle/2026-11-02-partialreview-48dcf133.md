# codex-oracle review -- 2026-11-02 09:00:09 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/gmail-api.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/gmail-sync.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/gmail-sync.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Third round, C4 reply sync: fixed round-2 finding (format=minimal lacks internalDate) by asking format=metadata&metadataHeaders=Date for messages.get/threads.get and throwing when a SENT message has no internalDate. Invariant: every field the sync reads must come from a format documented to return it. Check whether any other field read in gmail-sync.ts relies on a format that does not document it (labelIds, threadId, headers, payload parts, history messagesAdded, drafts.get message ids).
- exit: 0 | elapsed: 119020ms | answer: 1279B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/gmail-sync.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/gmail-api.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/gmail-sync.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 舊草稿消失後，可能把寄給同一人的另一封信誤認為該草稿已寄出  
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/gmail-sync.ts:151  
  confidence  -> CONFIRMED  
  scenario    -> 草稿 A 被刪除；同一信箱在搜尋時間範圍內另寄出郵件 B 給同一收件人。搜尋只限定收件人與時間，`markFirst` 便可能用 B 將 A 標為已寄出。  
  why missed  -> 測試沒有「同一收件人的另一封已寄郵件」；搜尋結果沒有核對草稿身分。

FINDING 2: `format=metadata` 仍不保證提供 `internalDate`，本輪修正未滿足欄位來源不變量  
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/gmail-api.ts:33  
  confidence  -> CONFIRMED  
  scenario    -> Gmail 回傳符合[官方 `metadata` 格式定義](https://developers.google.com/workspace/gmail/api/reference/rest/v1/Format)、但沒有 `internalDate` 的 SENT 郵件。直接查詢會在 `sentAt` 報錯；對話串候選郵件則因日期為 0 被略過，可能走到 `markUnsent`，把已寄郵件標為需編輯。  
  why missed  -> 測試只驗證 URL 含 `format=metadata`，沒有以該格式文件承諾的欄位建立回應。

TOTAL: 2 findings
