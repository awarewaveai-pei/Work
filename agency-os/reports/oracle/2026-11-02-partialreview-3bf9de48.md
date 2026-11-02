# codex-oracle review -- 2026-11-02 12:01:20 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/send-adapter.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/gmail-sync.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/google-oauth.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/messages/gmail-draft/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/followups/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/followups/FollowupsClient.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/send-adapter.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/gmail-sync.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/google-oauth.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Outbound OS v2 card C5 follow-ups (written by a Claude SDK worker): follow-up drafts reply in the previous sent mail's thread (In-Reply-To/References, Re: subject, threadId); send-adapter now auto-sends a follow-up only when lowest unsent step, due, threaded, one per lead per tick; gmail-sync marks no_reply after the last step's delay; followups page due list + manual step done. SSOT agency-os/handoffs/2026-10-31-outbound-os/R0-PLAN.md section 6 C5, SPEC 5.7. Never-send invariant: only send-adapter sends.
- exit: 0 | elapsed: 168414ms | answer: 1173B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/followups/FollowupsClient.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/followups/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/messages/gmail-draft/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/gmail-sync.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/google-oauth.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/send-adapter.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/gmail-sync.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/google-oauth.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/send-adapter.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 信箱掃描未完成時，仍可能把已有回信的 lead 標成 `no_reply`
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/gmail-sync.ts:351
  confidence  -> CONFIRMED
  scenario    -> 到期 lead 的回信仍在掃描的下一頁（第 315 行 `page.more`），或回信分類失敗仍待重試（第 321 行 `pending`）；兩者都不會加入 `r.errors`，本輪便執行 `markNoReply`，將 lead 錯標為 `no_reply`。
  why missed  -> 新條件只檢查信箱錯誤與逾時，沒有使用既有的掃描完成及待處理回信狀態。

FINDING 2: 重複提交已完成的人工步驟會延後下一步
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/followups/route.ts:133
  confidence  -> CONFIRMED
  scenario    -> 週一完成電話步驟，下一步排定週四；週三重送相同 `step_done` 請求時，已是 `copied` 的步驟仍獲准通過第 126 行，並再次更新 `last_contact_date` 與 `next_followup_date`，使下一步延後。
  why missed  -> 程式把 `copied` 視為可重試狀態，但重試仍執行了日期更新。

TOTAL: 2 findings
