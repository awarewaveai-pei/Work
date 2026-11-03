# codex-oracle review -- 2026-11-03 08:35:45 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/send-adapter.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/mailbox-verify.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/outreach/gmail-sync/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/send-adapter.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Removed the uniform 90s pre-check in send-adapter (prior finding): the deadline is now enforced only per key inside verifyWithFallback using each provider's own timeout. Review the D25 change as a whole; if you cannot support a real finding, return none.
- exit: 0 | elapsed: 91200ms | answer: 807B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/outreach/gmail-sync/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/send-adapter.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/mailbox-verify.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/send-adapter.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Reoon 的 90 秒檢查放不進剩餘時間時，較快的備援驗證器也被跳過
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/mailbox-verify.ts:122
  confidence  -> CONFIRMED
  scenario    -> 一輪的 pipeline 在開始後 190 秒完成，寄送截止是 270 秒；金鑰依序為 Reoon、ZeroBounce。剩餘 80 秒不足 Reoon 的 90 秒，但足夠 ZeroBounce 的 20 秒。`break` 直接結束迴圈，兩家都沒有被呼叫，信件以 `no_verifier` 留置。截止時間見 `gmail-sync/route.ts:87`，各供應商逾時見 `mailbox-verify.ts:25`。
  why missed  -> 截止時間測試只涵蓋前一個金鑰已失敗、後一個也放不進剩餘時間的情境；沒有測「第一個太慢、後一個仍可執行」。

TOTAL: 1 findings
