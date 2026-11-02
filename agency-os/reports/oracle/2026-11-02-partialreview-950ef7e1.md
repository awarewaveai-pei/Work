# codex-oracle review -- 2026-11-02 08:56:49 +08:00

- mode: `review`
- scope: -Path lobster-factory/packages/db/migrations/0153_co_replies.sql, lobster-factory/packages/db/migrations/0153_co_replies.down.sql, lobster-factory/packages/db/tests/test_0153_co_replies.py, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/gmail-sync.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/gmail-sync.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Second round on Outbound OS v2 card C4 after fixing your 4 findings from agency-os/reports/oracle/2026-11-02-partialreview-d83c2a9c.md: F1 pendingSends now pages all drafted/sending rows; F2 a mail in our own thread belongs to that thread's lead before address lookup; F3/F4 an AFTER INSERT trigger on co_replies stops follow-ups at claim time, including 'drafted' ones (skipped + timeline asking to delete the Gmail draft). Verify the fixes and look for anything new they introduce (trigger lock order vs co_begin_send/co_apply_reply, idempotency).
- exit: 0 | elapsed: 116639ms | answer: 812B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/gmail-sync.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/gmail-sync.ts, lobster-factory/packages/db/migrations/0153_co_replies.down.sql, lobster-factory/packages/db/migrations/0153_co_replies.sql, lobster-factory/packages/db/tests/test_0153_co_replies.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Gmail `minimal` 回應沒有寄送時間，寄件對帳會寫入錯誤日期或漏判已寄信
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/gmail-sync.ts:155`
  confidence  -> CONFIRMED
  scenario    -> 草稿已寄出時，程式以 `format=minimal` 讀信；[Gmail 官方規格](https://developers.google.com/workspace/gmail/api/reference/rest/v1/Format)指出此格式只回傳 ID 與標籤。`dateOf()` 因缺少 `internalDate` 回傳 0：原訊息 ID 仍可讀時，`co_mark_sent` 把寄送日記成 1970 年；寄出後 ID 已改時，對話串候選信全部不符合草稿建立時間，無法標為已寄。
  why missed  -> 假 Gmail 測試的 `minimal` 回應仍帶有 `internalDate`，沒有呈現真實 API 的欄位限制。

TOTAL: 1 findings
