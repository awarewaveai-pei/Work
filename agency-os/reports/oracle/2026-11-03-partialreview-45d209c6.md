# codex-oracle review -- 2026-11-03 08:25:10 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/send-adapter.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/mailbox-verify.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/leads/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/outreach/gmail-sync/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/send-adapter.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/leads/route.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Fixes for the 3 prior findings on the D25 exemption: (1) leads POST update clears consent_source when the address changes; (2) email inference uses inferenceKey = Hunter if present (only Hunter has the finder); (3) the self-published exemption requires the stored row to be the MX row (not any verifier provider), so an old risky/unknown/expired verdict is re-asked. Invariant: the exemption is bound to this exact address and only its MX check. Review the change; if you cannot support a real finding, return none.
- exit: 0 | elapsed: 141068ms | answer: 1837B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/outreach/gmail-sync/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/leads/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/leads/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/send-adapter.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/mailbox-verify.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/send-adapter.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 研究流程的兩次寫入會把 `self_published` 標記套到另一個地址
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/research.ts:187
  confidence  -> CONFIRMED
  scenario    -> 研究流程先在第 177 行寫入網站地址 A；人工 POST 隨後改成地址 B，並清除 `consent_source`；研究流程再於第 187 行只按 lead ID 寫入 A 的 `self_published` 來源。B 因而可在 `send-adapter.ts:149` 免付費驗證。
  why missed  -> 本次修正處理了人工 POST 的地址變更，卻沒有把研究流程的來源寫入與地址寫入綁在同一個條件下。

FINDING 2: 豁免條件接受任何非付費 provider，沒有要求 MX row
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/send-adapter.ts:149
  confidence  -> CONFIRMED
  scenario    -> `co_verified_emails` 有一筆自公開地址、`status='unknown'`、`provider=NULL` 的資料；資料表在 `0048_co_outreach_core.sql:300` 允許 NULL。該條件把它當作 MX 檢查通過而直接寄送，違反「只有 MX row 可豁免」。
  why missed  -> 條件用「不在付費 provider 清單」代替檢查 `provider === 'mx_syntax'`。

FINDING 3: 新的 Reoon 逾時可使排程在寄送完成前回報失敗
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/mailbox-verify.ts:76
  confidence  -> CONFIRMED
  scenario    -> 寄送回合在第 260 秒開始一筆 Reoon 驗證，請求耗時 90 秒；`send-adapter.ts:191` 只在開始前檢查截止時間。路由第 350 秒才回答，但 `scripts/poke.sh:14` 的 curl 第 310 秒已逾時，排程記錄失敗。
  why missed  -> 單次驗證的 90 秒逾時沒有與呼叫端的 270 秒回合期限及 310 秒排程期限一起核對。

TOTAL: 3 findings
