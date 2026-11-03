# codex-oracle review -- 2026-11-03 08:29:57 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/send-adapter.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/mailbox-verify.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/research.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/leads/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/send-adapter.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/research.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Round-2 fixes on the D25 exemption: research.ts writes email + consent_source self_published in ONE conditional update (no second write that could land on a typed address); the exemption now requires stored.provider === MX_PROVIDER exactly; a verifier call is not started when Date.now()+VERIFY_MAX_MS passes the send deadline (mail held 'verify_no_time', cached/self-published mails still go). Invariant: exemption bound to this address and its own MX row; every verifier call fits the tick. Review the whole change; if you cannot support a real finding, return none.
- exit: 0 | elapsed: 179915ms | answer: 714B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/leads/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/research.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/send-adapter.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/mailbox-verify.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/research.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/send-adapter.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 備援驗證可在寄送截止時間後才啟動，違反「每次驗證都在本輪內完成」的不變量  
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/mailbox-verify.ts:120`  
  confidence  -> CONFIRMED  
  scenario    -> 距截止時間剩 95 秒時，`send-adapter.ts:153` 通過一次性的 90 秒檢查；Reoon 耗時 90 秒後失敗，迴圈隨即啟動 ZeroBounce 的 20 秒呼叫，該呼叫跨過截止時間，整輪也可能超過主機 `poke.sh:14` 的 310 秒逾時。  
  why missed  -> 新增的時間檢查放在整組備援呼叫之前；備援迴圈沒有接收截止時間，也沒有在換下一把金鑰前重查。

TOTAL: 1 findings
