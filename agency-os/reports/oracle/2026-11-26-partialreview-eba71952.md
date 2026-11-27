# codex-oracle review -- 2026-11-26 14:29:14 +08:00

- mode: `review`
- scope: whole repo
- target: `a48e5b474..86e7a3389`
- context: Batch 12: U28 payment event drops the unit's feature-list and door caches (epoch guards a racing read); U17 launcher 繼續上次 reads works+drafts server-side with the signed-in unit's org; U19 /portal/people lets a unit's manager (customer_identities) invite/resend/delete colleague client accounts via lib/accounts/client-invite.ts, org always from the caller's own unit, plus 0185 adds 'client' to ops_audit actor_role checks and a door-own-org read allowlist entry for isAccountManager. Focus: cross-unit access, privilege escalation by a non-manager, stale cache after payment, migration safety.
- exit: 0 | elapsed: 175961ms | answer: 2031B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/PlatformFrame.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/__tests__/BottomBar.render.test.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/drafts/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/payments/[provider]/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/payments/[provider]/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/bottom-items.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/portal/api/account/__tests__/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/portal/api/account/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/portal/api/people/__tests__/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/portal/api/people/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/portal/launcher/CreditsLine.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/portal/launcher/ResumeSection.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/portal/launcher/__tests__/CreditsLine.test.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/portal/launcher/__tests__/resume.test.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/portal/launcher/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/portal/people/PeopleView.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/portal/people/__tests__/PeopleView.test.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/portal/people/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/drafts-list.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/account-manager.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/former-member.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/account-manager.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/features.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/identities.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/use-paid-features.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/registry-code.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/door-access.ts, lobster-factory/packages/db/migrations/0185_audit_actor_role_client.down.sql, lobster-factory/packages/db/migrations/0185_audit_actor_role_client.sql, lobster-factory/packages/db/scripts/0185_audit_actor_role_client_down.sql, lobster-factory/packages/db/tests/test_0185_audit_actor_role_client.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 客戶邀請或刪除成功後，稽核寫入失敗仍會回傳成功
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-audit.ts:25；lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/portal/api/people/route.ts:111
  confidence  -> CONFIRMED
  scenario    -> 管理者成功刪除同事，但 `ops_audit_events` 插入遭資料庫拒絕；`recordOpsAudit` 只記警告，DELETE 仍回傳 200，該次刪除沒有稽核紀錄。
  why missed  -> 路由測試把稽核函式換成永遠成功的 mock，沒有測到既有 helper 的錯誤處理。

FINDING 2: 新稽核事件的 `actor_user_id` 欄位會是 NULL
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/portal/api/people/route.ts:46；lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-audit.ts:16
  confidence  -> CONFIRMED
  scenario    -> 管理者邀請同事後，以 `ops_audit_events.actor_user_id` 查詢該管理者的操作，查不到這筆事件；路由只把使用者 ID 放進 `payload`，插入函式未填資料表的 `actor_user_id` 欄位。
  why missed  -> 測試只檢查 mock 收到的 payload，沒有檢查實際插入的欄位。

FINDING 3: 付款後的失效呼叫無法清除 middleware 的門禁快取
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/payments/[provider]/route.ts:50；lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/door-access.ts:26；lobster-factory/infra/hetzner-phase1-core/apps/next-admin/middleware.ts:238
  confidence  -> CONFIRMED
  scenario    -> 客戶購買前在產品門被快取為 `not_held`，隨後付款成功並立即呼叫產品 API；webhook 清除的是其模組實例的快取，middleware 仍可用原有的 `not_held` 紀錄拒絕請求，直到該紀錄的 10 秒期限結束。
  why missed  -> 測試在同一測試執行環境直接呼叫 `doorAccess`，沒有涵蓋 middleware 與 webhook 的執行環境邊界。

TOTAL: 3 findings