# codex-oracle review -- 2026-11-03 08:20:41 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/send-adapter.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/mailbox-verify.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/outreach/gmail-sync/route.ts, scripts/outreach-verifier-keys.ps1, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/send-adapter.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/mailbox-verify.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: SPEC D25 revision (operator will not pay for verification): send-adapter.ts auto-sends a self-published address (consent_source self_published:) whose stored co_verified_emails row (MX) is not invalid without a paid check; others still need a verifier verdict. mailbox-verify.ts: Reoon provider (power mode, error body), PAID_PROVIDERS priority reoon>zerobounce>hunter, verifierKeys + verifyWithFallback (next key on failure/quota, VerifyPending stops); gmail-sync route uses them; scripts/outreach-verifier-keys.ps1 installs agency connector keys from the user env over ssh stdin (SQL tested in a rolled-back transaction). Verify the send guard cannot let an inferred/imported address go unverified. If you cannot support a real finding, return none.
- exit: 0 | elapsed: 212765ms | answer: 1740B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/outreach/gmail-sync/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/mailbox-verify.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/send-adapter.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/mailbox-verify.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/send-adapter.ts, scripts/outreach-verifier-keys.ps1
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 更換名單 email 後，舊的 `self_published:` 標記可讓新地址免付費驗證自動寄出
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/send-adapter.ts:148
  confidence  -> CONFIRMED
  scenario    -> 原地址由商家自行公開；操作員透過 `leads/route.ts:325` 將 email 改成推測或匯入的地址，但更新未清除 `consent_source`。新地址有 MX 快取列後，此守衛沿用舊標記，直接寄出。
  why missed  -> 測試只替新地址設定 `inferred`，沒有覆核地址編輯時標記是否同步失效。

FINDING 2: Reoon 優先順序使既有的 Hunter email finder 路徑失效
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/mailbox-verify.ts:111
  confidence  -> CONFIRMED
  scenario    -> Reoon 與 Hunter 都已啟用，候選地址皆未通過驗證，但 Hunter finder 知道正確地址。`leads/route.ts:147` 只取得第一把 Reoon key；`findMailbox` 在同檔第 148 行對非 Hunter key 直接回傳 null，因此找信箱操作回報沒有地址。
  why missed  -> 新 fallback 只接入 Gmail 同步；既有 email inference 仍使用單一 key。

FINDING 3: 過期的付費「risky／unknown」結果會被當成免驗證資格
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/send-adapter.ts:148
  confidence  -> CONFIRMED
  scenario    -> 自行公開地址曾被付費驗證為 `risky`，90 天後該列仍在快取。`freshPaid` 因過期回傳 null；此條件只檢查快取列存在且非 `invalid`，於是跳過驗證並自動寄出。
  why missed  -> 新測試只使用 `mx_syntax` 列，未涵蓋過期付費列。

TOTAL: 3 findings
