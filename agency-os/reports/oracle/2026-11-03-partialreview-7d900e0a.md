# codex-oracle review -- 2026-11-03 08:33:24 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/mailbox-verify.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/outreach/gmail-sync/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/mailbox-verify.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/send-adapter.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Fix for the fallback-past-deadline finding: verifyWithFallback takes a deadline and starts no key whose timeoutOf(provider) would end after it; gmail-sync passes started+BUDGET_MS. Test uses a fake clock. Review; if you cannot support a real finding, return none.
- exit: 0 | elapsed: 116522ms | answer: 563B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/outreach/gmail-sync/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/mailbox-verify.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/mailbox-verify.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/send-adapter.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 90 秒的統一門檻會阻止仍可在期限內完成的驗證
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/send-adapter.ts:153
  confidence  -> CONFIRMED
  scenario    -> 本輪剩 60 秒、組織只有 Hunter 金鑰、待寄郵件需要驗證；Hunter 的逾時設定是 20 秒，但此處先以 Reoon 的 90 秒上限回傳 `verify_no_time`，郵件本輪不會寄出。
  why missed  -> 測試只驗證「剩 60 秒不足以跑 Reoon」，沒有涵蓋只有 20 秒驗證器的情況。

TOTAL: 1 findings
