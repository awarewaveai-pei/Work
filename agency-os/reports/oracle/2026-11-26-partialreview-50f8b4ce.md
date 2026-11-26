# codex-oracle review -- 2026-11-26 13:55:14 +08:00

- mode: `review`
- scope: whole repo
- target: `2cf2d1d88..b162c8146`
- context: M10 follow-up: when the WordPress source deletes a member, deleteClientAccount(sourceDeleted) now removes the account's brand roles in every brand (not only its own unit's), audits each, then deletes the auth user. Check: auth bypass left, data loss beyond intent, retry/idempotency, staff path unchanged.
- exit: 0 | elapsed: 137754ms | answer: 876B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/awarewave-wp-member/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/accounts/__tests__/client-invite-delete.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/accounts/client-invite.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 超過 PostgREST 回傳上限的品牌角色會被刪除，卻沒有逐筆稽核紀錄
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/accounts/client-invite.ts:274
  confidence  -> CONFIRMED
  scenario    -> 同一帳號持有 1,001 個品牌角色，且 PostgREST 使用已記錄的正式設定 `PGRST_DB_MAX_ROWS=1000`（agency-os/WORKLOG.md:2318）。查詢只取得 1,000 筆；程式只為這些角色寫入稽核紀錄（client-invite.ts:278），隨後卻以 `user_id` 刪除全部角色（client-invite.ts:283）。至少一個品牌的角色消失但沒有 `member_remove` 紀錄。
  why missed  -> 新測試的查詢替身回傳所有符合條件的資料，沒有模擬回傳上限（lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/accounts/__tests__/client-invite-delete.test.ts:34）。

TOTAL: 1 findings